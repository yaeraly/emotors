import { Injectable } from '@nestjs/common';
import { Prisma, StockMovementType, WarehouseType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { HQ_CATALOG_BRANCH_CODE } from '../warehouse/warehouse.util';

type PrismaTx = Prisma.TransactionClient;

@Injectable()
export class PricingFifoService {
  constructor(private readonly prisma: PrismaService) {}

  async syncFifoBatchesFromHqStockMovements(tx?: PrismaTx) {
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

      await client.fifoInventoryBatch.create({
        data: {
          productId: movement.productId,
          warehouseId: movement.warehouseId,
          stockMovementId: movement.id,
          receivedAt: movement.createdAt,
          unitCostKgs: movement.unitCostKgs,
          initialQuantity: movement.quantity,
          remainingQuantity: remaining,
          referenceType: movement.referenceType,
          referenceId: movement.referenceId,
        },
      });
      created += 1;
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
}
