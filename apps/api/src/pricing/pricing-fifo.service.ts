import { Injectable } from '@nestjs/common';
import { BranchType, Prisma, StockMovementType, WarehouseType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { HQ_CATALOG_BRANCH_CODE } from '../warehouse/warehouse.util';
import { pricesFromMarkups, resolveHqToBranchPrice } from './pricing-calculator.util';

type PrismaTx = Prisma.TransactionClient;

export type BatchMarkups = {
  wholesaleMarkupPercent: number;
  hqBranchWholesaleMarkupPercent: number;
  recommendedRetailMarkupPercent: number;
  minimumSellingMarkupPercent: number;
};

export type BranchPricingConfig = {
  branchType: BranchType;
  hqToBranchMarkupPercent: number;
};

function resolveDistributionUnitPrice(
  unitCostKgs: number,
  wholesalePriceKgs: number,
  hqBranchWholesalePriceKgs: number,
  branchPricing?: BranchPricingConfig,
  legacyIsHqOwnedBranch?: boolean,
  overrideUnitPriceKgs?: number | null,
) {
  if (overrideUnitPriceKgs != null && overrideUnitPriceKgs >= 0) {
    return overrideUnitPriceKgs;
  }
  if (branchPricing) {
    return resolveHqToBranchPrice(unitCostKgs, branchPricing.branchType, branchPricing.hqToBranchMarkupPercent);
  }
  if (legacyIsHqOwnedBranch) return hqBranchWholesalePriceKgs;
  return wholesalePriceKgs;
}

type FifoPreviewLine = {
  batchId: string;
  quantity: number;
  unitCostKgs: number;
  unitPriceKgs: number;
  wholesalePriceKgs: number;
  hqBranchWholesalePriceKgs: number;
  totalCostKgs: number;
  totalPriceKgs: number;
};

@Injectable()
export class PricingFifoService {
  constructor(private readonly prisma: PrismaService) {}

  calculateBatchPrices(unitCostKgs: number, markups: BatchMarkups) {
    return {
      unitCostKgs,
      ...markups,
      ...pricesFromMarkups(unitCostKgs, markups),
    };
  }

  async syncFifoBatchesFromHqStockMovements(tx?: PrismaTx, userId?: string) {
    const client = tx ?? this.prisma;
    const hqWarehouses = await client.warehouse.findMany({
      where: { warehouseType: WarehouseType.HQ, deletedAt: null, isActive: true },
      select: { id: true },
    });
    const warehouseIds = hqWarehouses.map((row) => row.id);
    if (!warehouseIds.length) return { created: 0 };

    const movements = await client.stockMovement.findMany({
      where: {
        warehouseId: { in: warehouseIds },
        type: StockMovementType.IN,
        status: 'ACTIVE',
        quantity: { gt: 0 },
      },
      orderBy: { createdAt: 'asc' },
    });

    let created = 0;
    for (const movement of movements) {
      const existing = await client.fifoInventoryBatch.findFirst({
        where: { stockMovementId: movement.id },
      });
      if (existing) continue;

      const consumed = await client.saleFifoAllocation.aggregate({
        where: { fifoBatch: { stockMovementId: movement.id } },
        _sum: { quantity: true },
      });
      const consumedQty = consumed._sum.quantity ?? 0;
      const remaining = Math.max(movement.quantity - consumedQty, 0);

      const product = await client.product.findFirst({
        where: { id: movement.productId, deletedAt: null },
        select: {
          id: true,
          sku: true,
          wholesaleMarkupPercent: true,
          hqBranchWholesaleMarkupPercent: true,
          recommendedRetailMarkupPercent: true,
          minimumSellingMarkupPercent: true,
        },
      });
      const markups: BatchMarkups = {
        wholesaleMarkupPercent: Number(product?.wholesaleMarkupPercent ?? 0),
        hqBranchWholesaleMarkupPercent: Number(product?.hqBranchWholesaleMarkupPercent ?? 0),
        recommendedRetailMarkupPercent: Number(product?.recommendedRetailMarkupPercent ?? 0),
        minimumSellingMarkupPercent: Number(product?.minimumSellingMarkupPercent ?? 0),
      };
      const unitCostKgs = Number(movement.unitCostKgs);
      const batchPrices = this.calculateBatchPrices(unitCostKgs, markups);

      const batch = await client.fifoInventoryBatch.create({
        data: {
          productId: movement.productId,
          warehouseId: movement.warehouseId,
          stockMovementId: movement.id,
          receivedAt: movement.createdAt,
          unitCostKgs,
          wholesaleMarkupPercent: markups.wholesaleMarkupPercent,
          wholesalePriceKgs: batchPrices.wholesalePriceKgs,
          hqBranchWholesaleMarkupPercent: markups.hqBranchWholesaleMarkupPercent,
          hqBranchWholesalePriceKgs: batchPrices.hqBranchWholesalePriceKgs,
          recommendedRetailMarkupPercent: markups.recommendedRetailMarkupPercent,
          recommendedRetailPriceKgs: batchPrices.recommendedRetailPriceKgs,
          minimumSellingMarkupPercent: markups.minimumSellingMarkupPercent,
          minimumSellingPriceKgs: batchPrices.minimumSellingPriceKgs,
          initialQuantity: movement.quantity,
          remainingQuantity: remaining,
          referenceType: movement.referenceType,
          referenceId: movement.referenceId,
        },
      });
      created += 1;

      if (userId) {
        await client.auditLog.create({
          data: {
            userId,
            action: 'BATCH_PRICE_CALCULATED',
            entity: 'FifoInventoryBatch',
            entityId: batch.id,
            metadata: {
              productId: movement.productId,
              batchId: batch.id,
              costPrice: unitCostKgs,
              markups,
              prices: {
                wholesalePriceKgs: batchPrices.wholesalePriceKgs,
                hqBranchWholesalePriceKgs: batchPrices.hqBranchWholesalePriceKgs,
                recommendedRetailPriceKgs: batchPrices.recommendedRetailPriceKgs,
                minimumSellingPriceKgs: batchPrices.minimumSellingPriceKgs,
              },
              timestamp: new Date().toISOString(),
            } as Prisma.InputJsonValue,
          },
        });
      }
    }

    return { created };
  }

  async getLatestHqCostPrice(productId: string, tx?: PrismaTx) {
    const client = tx ?? this.prisma;
    await this.syncFifoBatchesFromHqStockMovements(client);

    const batch = await client.fifoInventoryBatch.findFirst({
      where: {
        productId,
        remainingQuantity: { gt: 0 },
        warehouse: { warehouseType: WarehouseType.HQ, deletedAt: null },
      },
      orderBy: { receivedAt: 'asc' },
    });

    if (batch) {
      return {
        costPriceKgs: Number(batch.unitCostKgs),
        source: 'HQ_WAREHOUSE_FIFO_BATCH',
        batchId: batch.id,
        receivedAt: batch.receivedAt,
      };
    }

    const product = await client.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { finalCostKgs: true },
    });

    return {
      costPriceKgs: Number(product?.finalCostKgs ?? 0),
      source: 'PRODUCT_FINAL_COST_FALLBACK',
      batchId: null,
      receivedAt: null,
    };
  }

  async previewFifoAllocation(
    tx: PrismaTx,
    input: {
      productId: string;
      warehouseId: string;
      quantity: number;
      isHqOwnedBranch: boolean;
      branchPricing?: BranchPricingConfig;
      fallbackUnitCost?: number;
      fallbackUnitPrice?: number;
      overrideUnitPriceKgs?: number | null;
    },
  ) {
    const batches = await tx.fifoInventoryBatch.findMany({
      where: {
        productId: input.productId,
        warehouseId: input.warehouseId,
        remainingQuantity: { gt: 0 },
      },
      orderBy: { receivedAt: 'asc' },
    });

    let remainingToAllocate = input.quantity;
    let totalCost = 0;
    let totalPrice = 0;
    const lines: FifoPreviewLine[] = [];

    for (const batch of batches) {
      if (remainingToAllocate <= 0) break;
      const take = Math.min(batch.remainingQuantity, remainingToAllocate);
      if (take <= 0) continue;

      const unitCostKgs = Number(batch.unitCostKgs);
      const wholesalePriceKgs = Number(batch.wholesalePriceKgs);
      const hqBranchWholesalePriceKgs = Number(batch.hqBranchWholesalePriceKgs);
      const unitPriceKgs = resolveDistributionUnitPrice(
        unitCostKgs,
        wholesalePriceKgs,
        hqBranchWholesalePriceKgs,
        input.branchPricing,
        input.isHqOwnedBranch,
        input.overrideUnitPriceKgs,
      );
      const lineCost = unitCostKgs * take;
      const linePrice = unitPriceKgs * take;

      totalCost += lineCost;
      totalPrice += linePrice;
      remainingToAllocate -= take;

      lines.push({
        batchId: batch.id,
        quantity: take,
        unitCostKgs,
        unitPriceKgs,
        wholesalePriceKgs,
        hqBranchWholesalePriceKgs,
        totalCostKgs: Math.round((lineCost + Number.EPSILON) * 100) / 100,
        totalPriceKgs: Math.round((linePrice + Number.EPSILON) * 100) / 100,
      });
    }

    const allocatedQty = input.quantity - remainingToAllocate;
    if (allocatedQty <= 0) {
      return {
        unitCost: input.fallbackUnitCost ?? 0,
        unitPrice: input.fallbackUnitPrice ?? 0,
        lines: [] as FifoPreviewLine[],
        allocatedQty: 0,
      };
    }

    return {
      unitCost: Math.round((totalCost / allocatedQty + Number.EPSILON) * 100) / 100,
      unitPrice: Math.round((totalPrice / allocatedQty + Number.EPSILON) * 100) / 100,
      lines,
      allocatedQty,
    };
  }

  async consumeFifoForDistribution(
    tx: PrismaTx,
    input: {
      productId: string;
      warehouseId: string;
      quantity: number;
      isHqOwnedBranch: boolean;
      branchPricing?: BranchPricingConfig;
      distributionOrderId: string;
      distributionOrderItemId: string;
      userId: string;
      userRole: string;
      overrideUnitPriceKgs?: number | null;
    },
  ) {
    const preview = await this.previewFifoAllocation(tx, {
      productId: input.productId,
      warehouseId: input.warehouseId,
      quantity: input.quantity,
      isHqOwnedBranch: input.isHqOwnedBranch,
      branchPricing: input.branchPricing,
      overrideUnitPriceKgs: input.overrideUnitPriceKgs,
    });

    for (const line of preview.lines) {
      await tx.fifoInventoryBatch.update({
        where: { id: line.batchId },
        data: { remainingQuantity: { decrement: line.quantity } },
      });

      await tx.distributionFifoAllocation.create({
        data: {
          distributionOrderId: input.distributionOrderId,
          distributionOrderItemId: input.distributionOrderItemId,
          fifoBatchId: line.batchId,
          productId: input.productId,
          quantity: line.quantity,
          unitCostKgs: line.unitCostKgs,
          unitPriceKgs: line.unitPriceKgs,
          wholesalePriceKgs: line.wholesalePriceKgs,
          hqBranchWholesalePriceKgs: line.hqBranchWholesalePriceKgs,
          totalCostKgs: line.totalCostKgs,
          totalPriceKgs: line.totalPriceKgs,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: input.userId,
          role: input.userRole,
          action: 'FIFO_BATCH_PRICE_USED',
          entity: 'FifoInventoryBatch',
          entityId: line.batchId,
          metadata: {
            userId: input.userId,
            role: input.userRole,
            productId: input.productId,
            batchId: line.batchId,
            distributionOrderId: input.distributionOrderId,
            distributionOrderItemId: input.distributionOrderItemId,
            quantity: line.quantity,
            unitCostKgs: line.unitCostKgs,
            unitPriceKgs: line.unitPriceKgs,
            timestamp: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      });
    }

    return preview;
  }

  async consumeFifo(
    tx: PrismaTx,
    input: {
      productId: string;
      warehouseId: string;
      quantity: number;
      saleId?: string;
      saleItemId?: string;
      userId: string;
    },
  ) {
    let remainingToConsume = input.quantity;
    let totalCost = 0;

    const batches = await tx.fifoInventoryBatch.findMany({
      where: {
        productId: input.productId,
        warehouseId: input.warehouseId,
        remainingQuantity: { gt: 0 },
      },
      orderBy: { receivedAt: 'asc' },
    });

    for (const batch of batches) {
      if (remainingToConsume <= 0) break;
      const take = Math.min(batch.remainingQuantity, remainingToConsume);
      if (take <= 0) continue;

      const lineCost = Number(batch.unitCostKgs) * take;
      totalCost += lineCost;
      remainingToConsume -= take;

      await tx.fifoInventoryBatch.update({
        where: { id: batch.id },
        data: { remainingQuantity: batch.remainingQuantity - take },
      });

      await tx.saleFifoAllocation.create({
        data: {
          saleId: input.saleId,
          saleItemId: input.saleItemId,
          fifoBatchId: batch.id,
          productId: input.productId,
          quantity: take,
          unitCostKgs: batch.unitCostKgs,
          totalCostKgs: lineCost,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: input.userId,
          action: 'FIFO_BATCH_USED',
          entity: 'FifoInventoryBatch',
          entityId: batch.id,
          metadata: {
            productId: input.productId,
            saleId: input.saleId,
            saleItemId: input.saleItemId,
            quantity: take,
            unitCostKgs: Number(batch.unitCostKgs),
            timestamp: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      });
    }

    const consumedQty = input.quantity - remainingToConsume;
    const unitCost =
      consumedQty > 0 ? Math.round((totalCost / consumedQty + Number.EPSILON) * 100) / 100 : 0;

    return { unitCost, consumedQty, totalCost: Math.round((totalCost + Number.EPSILON) * 100) / 100 };
  }

  isHqBranchType(branchType: BranchType | null | undefined) {
    return branchType === BranchType.HQ_BRANCH;
  }

  isHqOwnedBranch(branchCode: string | null | undefined) {
    return branchCode === HQ_CATALOG_BRANCH_CODE;
  }

  async resolveHqCatalogProductIds(tx?: PrismaTx) {
    const client = tx ?? this.prisma;
    const hqBranch = await client.branch.findFirst({
      where: { code: HQ_CATALOG_BRANCH_CODE },
      select: { id: true },
    });
    if (!hqBranch) return [];
    const products = await client.product.findMany({
      where: { branchId: hqBranch.id, deletedAt: null },
      select: { id: true },
    });
    return products.map((row) => row.id);
  }

  async ensureBranchFifoBatchFromMovementInTx(
    tx: PrismaTx,
    movement: {
      id: string;
      productId: string;
      warehouseId: string;
      quantity: number;
      unitCostKgs: Prisma.Decimal | number;
      createdAt: Date;
      referenceType?: string | null;
      referenceId?: string | null;
    },
  ) {
    const existing = await tx.fifoInventoryBatch.findFirst({
      where: { stockMovementId: movement.id },
      select: { id: true },
    });
    if (existing) {
      return { batchId: existing.id, created: false };
    }

    const product = await tx.product.findFirst({
      where: { id: movement.productId, deletedAt: null },
      select: {
        id: true,
        wholesaleMarkupPercent: true,
        hqBranchWholesaleMarkupPercent: true,
        recommendedRetailMarkupPercent: true,
        minimumSellingMarkupPercent: true,
      },
    });
    const markups: BatchMarkups = {
      wholesaleMarkupPercent: Number(product?.wholesaleMarkupPercent ?? 0),
      hqBranchWholesaleMarkupPercent: Number(product?.hqBranchWholesaleMarkupPercent ?? 0),
      recommendedRetailMarkupPercent: Number(product?.recommendedRetailMarkupPercent ?? 0),
      minimumSellingMarkupPercent: Number(product?.minimumSellingMarkupPercent ?? 0),
    };
    const unitCostKgs = Number(movement.unitCostKgs);
    const batchPrices = this.calculateBatchPrices(unitCostKgs, markups);
    const quantity = Math.max(movement.quantity, 0);

    const batch = await tx.fifoInventoryBatch.create({
      data: {
        productId: movement.productId,
        warehouseId: movement.warehouseId,
        stockMovementId: movement.id,
        receivedAt: movement.createdAt,
        unitCostKgs,
        wholesaleMarkupPercent: markups.wholesaleMarkupPercent,
        wholesalePriceKgs: batchPrices.wholesalePriceKgs,
        hqBranchWholesaleMarkupPercent: markups.hqBranchWholesaleMarkupPercent,
        hqBranchWholesalePriceKgs: batchPrices.hqBranchWholesalePriceKgs,
        recommendedRetailMarkupPercent: markups.recommendedRetailMarkupPercent,
        recommendedRetailPriceKgs: batchPrices.recommendedRetailPriceKgs,
        minimumSellingMarkupPercent: markups.minimumSellingMarkupPercent,
        minimumSellingPriceKgs: batchPrices.minimumSellingPriceKgs,
        initialQuantity: quantity,
        remainingQuantity: quantity,
        referenceType: movement.referenceType,
        referenceId: movement.referenceId,
      },
      select: { id: true },
    });

    return { batchId: batch.id, created: true };
  }
}
