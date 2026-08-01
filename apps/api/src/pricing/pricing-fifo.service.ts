import { Injectable } from '@nestjs/common';
import { BranchType, Prisma, StockMovementType, WarehouseType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { HQ_CATALOG_BRANCH_CODE } from '../warehouse/warehouse.util';
import { pricesFromMarkups } from './pricing-calculator.util';
import { buildFifoAllocationLines } from './pricing-fifo-allocation.util';
import {
  allocateLayerConsumptionCost,
  allocateProportionalCost,
  deriveDisplayUnitCost,
  roundDisplayMoney,
  sumDisplayMoneyTotals,
} from './product-cost-precision.util';
import { buildBranchReceiveLinesFromHqAllocations } from './pricing-fifo-branch-receive.util';
import {
  isBusinessProcurementReceiptReference,
  isSeedStockMovementReference,
  SEED_FIFO_REFERENCE_TYPE,
} from './pricing-fifo-business-layer.util';
import { resolveFifoLayerCatalogUnitCost } from '../inventory/product-catalog-current-cost.util';
import { resolveAuthoritativeFifoLayerUnitCost, resolveUnitCostFromInventoryLayer } from './pricing-fifo-unit-cost.util';

export { resolveUnitCostFromInventoryLayer } from './pricing-fifo-unit-cost.util';
export { buildFifoAllocationLines } from './pricing-fifo-allocation.util';

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

export type OldestActiveHqFifoCostResult = {
  costPriceKgs: number;
  available: boolean;
  source: 'HQ_FIFO_ACTIVE_LAYER' | 'NO_FIFO_LAYER';
  batchId: string | null;
  receivedAt: Date | null;
  warehouseId?: string | null;
};

export type OldestActiveHqFifoCostInput =
  | string
  | {
      productId: string;
      warehouseId?: string;
      /** Branch scope when organization/tenant is modeled via branch. */
      branchId?: string;
      /**
       * Product catalog: derive unit cost from movement landed total ÷ received qty.
       * Never mutates FifoInventoryBatch on read.
       */
      catalogReadOnly?: boolean;
    };

type FifoPreviewLine = {
  batchId: string;
  quantity: number;
  unitCostKgs: number;
  unitPriceKgs: number;
  wholesalePriceKgs: number;
  hqBranchWholesalePriceKgs: number;
  totalCostKgs: number;
  totalPriceKgs: number;
  markupPercent: number;
  profitKgs: number;
};

function roundMoney(value: number) {
  return roundDisplayMoney(value);
}

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
    if (!warehouseIds.length) return { created: 0, repaired: 0 };

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
    let repaired = 0;
    for (const movement of movements) {
      if (
        isSeedStockMovementReference({
          referenceType: movement.referenceType,
          referenceId: movement.referenceId,
          note: movement.note,
        })
      ) {
        continue;
      }

      const unitCostKgs =
        Number(movement.totalCostKgs) > 0
          ? resolveUnitCostFromInventoryLayer({
              quantity: movement.quantity,
              unitCostKgs: Number(movement.unitCostKgs),
              totalCostKgs: Number(movement.totalCostKgs),
            })
          : await resolveFifoLayerCatalogUnitCost(
              client,
              {
                referenceType: movement.referenceType,
                referenceId: movement.referenceId,
                productId: movement.productId,
                unitCostKgs: Number(movement.unitCostKgs),
              },
              {
                id: movement.id,
                quantity: movement.quantity,
                unitCostKgs: movement.unitCostKgs,
                totalCostKgs: movement.totalCostKgs,
                referenceType: movement.referenceType,
                referenceId: movement.referenceId,
                note: movement.note,
              },
            );

      const existing = await client.fifoInventoryBatch.findFirst({
        where: { stockMovementId: movement.id },
      });

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
      const batchPrices = this.calculateBatchPrices(unitCostKgs, markups);

      if (existing) {
        if (Math.abs(Number(existing.unitCostKgs) - unitCostKgs) > 0.009 && unitCostKgs > 0) {
          await client.fifoInventoryBatch.update({
            where: { id: existing.id },
            data: {
              unitCostKgs,
              wholesalePriceKgs: batchPrices.wholesalePriceKgs,
              hqBranchWholesalePriceKgs: batchPrices.hqBranchWholesalePriceKgs,
              recommendedRetailPriceKgs: batchPrices.recommendedRetailPriceKgs,
              minimumSellingPriceKgs: batchPrices.minimumSellingPriceKgs,
            },
          });
          repaired += 1;
        }
        continue;
      }

      const saleConsumed = await client.saleFifoAllocation.aggregate({
        where: { fifoBatch: { stockMovementId: movement.id } },
        _sum: { quantity: true },
      });
      const distributionConsumed = await client.distributionFifoAllocation.aggregate({
        where: {
          fifoBatch: { stockMovementId: movement.id },
          status: 'CONSUMED',
        },
        _sum: { quantity: true },
      });
      const consumedQty =
        Number(saleConsumed._sum.quantity ?? 0) + Number(distributionConsumed._sum.quantity ?? 0);
      const receivedQty = Math.abs(Number(movement.quantity));
      const remaining = Math.max(receivedQty - consumedQty, 0);

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
          initialQuantity: receivedQty,
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

    return { created, repaired };
  }

  /**
   * FIFO Dynamic Cost for HQ catalog / Branch Sales pricing.
   * Always returns the unit landed cost of the current active HQ FIFO layer
   * (oldest remaining batch). Never averages, never uses product/supplier snapshots
   * or inventory-balance totals. When the active layer is depleted, the next
   * remaining layer is selected automatically on the next read.
   *
   * Looks up layers by productId and, if needed, by the same SKU across HQ
   * inventory product rows so catalog vs warehouse product ID drift cannot hide
   * the active FIFO layer.
   */
  /**
   * Shared resolver: oldest active HQ FIFO unit landed cost.
   * Never InventoryBalance.averageCostKgs, Product.costPriceKgs, or weighted averages.
   *
   * Alias: `getOldestActiveHqFifoCost` — use in catalog, franchise sales, HQ warehouse, branch orders.
   */
  async getOldestActiveHqFifoCost(
    input: OldestActiveHqFifoCostInput,
    tx?: PrismaTx,
  ): Promise<OldestActiveHqFifoCostResult> {
    return this.getLatestHqCostPrice(input, tx);
  }

  /**
   * Does not sync FIFO layers. Callers that list many products must call
   * `syncFifoBatchesFromHqStockMovements` once before looping — syncing here
   * per product previously caused franchise-sales timeouts (empty UI).
   */
  async getLatestHqCostPrice(
    input: OldestActiveHqFifoCostInput,
    tx?: PrismaTx,
  ): Promise<OldestActiveHqFifoCostResult> {
    const productId = typeof input === 'string' ? input : input.productId;
    const warehouseId = typeof input === 'string' ? undefined : input.warehouseId;
    const branchId = typeof input === 'string' ? undefined : input.branchId;
    const catalogReadOnly =
      typeof input === 'string' ? false : Boolean(input.catalogReadOnly);
    const client = tx ?? this.prisma;

    const productIds = await this.resolveHqFifoProductIds(client, productId);
    const batches = await client.fifoInventoryBatch.findMany({
      where: {
        productId: { in: productIds },
        remainingQuantity: { gt: 0 },
        ...(warehouseId ? { warehouseId } : {}),
        warehouse: {
          warehouseType: WarehouseType.HQ,
          deletedAt: null,
          isActive: true,
          ...(branchId ? { branchId } : {}),
        },
      },
      orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });

    const movementIds = batches
      .map((batch) => batch.stockMovementId)
      .filter((id): id is string => Boolean(id));
    const movements = movementIds.length
      ? await client.stockMovement.findMany({
          where: { id: { in: movementIds } },
          select: {
            id: true,
            quantity: true,
            unitCostKgs: true,
            totalCostKgs: true,
            referenceType: true,
            referenceId: true,
            note: true,
          },
        })
      : [];
    const movementById = new Map(movements.map((movement) => [movement.id, movement]));

    const activeLayers: Array<{
      batch: (typeof batches)[number];
      unitCostKgs: number;
    }> = [];

    for (const batch of batches) {
      if (batch.referenceType === SEED_FIFO_REFERENCE_TYPE) {
        continue;
      }

      const movement = batch.stockMovementId ? movementById.get(batch.stockMovementId) : null;
      if (
        isSeedStockMovementReference({
          referenceType: batch.referenceType,
          referenceId: batch.referenceId,
          note: movement?.note,
        }) ||
        (movement &&
          isSeedStockMovementReference({
            referenceType: movement.referenceType,
            referenceId: movement.referenceId,
            note: movement.note,
          }))
      ) {
        continue;
      }

      const unitCostKgs = await resolveFifoLayerCatalogUnitCost(client, batch, movement ?? null);

      if (!catalogReadOnly && unitCostKgs > 0) {
        if (Math.abs(unitCostKgs - Number(batch.unitCostKgs)) > 0.009) {
          const product = await client.product.findFirst({
            where: { id: batch.productId, deletedAt: null },
            select: {
              wholesaleMarkupPercent: true,
              hqBranchWholesaleMarkupPercent: true,
              recommendedRetailMarkupPercent: true,
              minimumSellingMarkupPercent: true,
            },
          });
          const prices = this.calculateBatchPrices(unitCostKgs, {
            wholesaleMarkupPercent: Number(product?.wholesaleMarkupPercent ?? 0),
            hqBranchWholesaleMarkupPercent: Number(product?.hqBranchWholesaleMarkupPercent ?? 0),
            recommendedRetailMarkupPercent: Number(product?.recommendedRetailMarkupPercent ?? 0),
            minimumSellingMarkupPercent: Number(product?.minimumSellingMarkupPercent ?? 0),
          });
          await client.fifoInventoryBatch.update({
            where: { id: batch.id },
            data: {
              unitCostKgs,
              wholesalePriceKgs: prices.wholesalePriceKgs,
              hqBranchWholesalePriceKgs: prices.hqBranchWholesalePriceKgs,
              recommendedRetailPriceKgs: prices.recommendedRetailPriceKgs,
              minimumSellingPriceKgs: prices.minimumSellingPriceKgs,
            },
          });
        }
      }

      if (unitCostKgs > 0) {
        activeLayers.push({ batch, unitCostKgs });
      }
    }

    const selected = activeLayers[0];
    if (selected) {
      return {
        costPriceKgs: selected.unitCostKgs,
        available: true,
        source: 'HQ_FIFO_ACTIVE_LAYER',
        batchId: selected.batch.id,
        receivedAt: selected.batch.receivedAt,
        warehouseId: selected.batch.warehouseId,
      };
    }

    // No active HQ FIFO layer — do not use average, balance, supplier, or product snapshots.
    return {
      costPriceKgs: 0,
      available: false,
      source: 'NO_FIFO_LAYER',
      batchId: null,
      receivedAt: null,
      warehouseId: warehouseId ?? null,
    };
  }

  /** Catalog product ID plus any same-SKU product IDs that hold HQ FIFO layers. */
  private async resolveHqFifoProductIds(client: PrismaTx | PrismaService, productId: string) {
    const ids = new Set<string>([productId]);
    const product = await client.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { id: true, sku: true },
    });
    const sku = product?.sku?.trim();
    if (!sku) return [...ids];

    const siblings = await client.product.findMany({
      where: { sku, deletedAt: null },
      select: { id: true },
    });
    for (const row of siblings) ids.add(row.id);
    return [...ids];
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
      /** @deprecated Flat override flattens multi-layer prices — ignored when preferPerLayerMarkup is true (default). */
      overrideUnitPriceKgs?: number | null;
      /** Apply configured markup independently to each FIFO layer (default true). */
      preferPerLayerMarkup?: boolean;
      /** When true (default), respect reservedQuantity so other orders cannot oversell. */
      subtractReserved?: boolean;
    },
  ) {
    const preferPerLayerMarkup = input.preferPerLayerMarkup !== false;
    const subtractReserved = input.subtractReserved !== false;

    const batches = await tx.fifoInventoryBatch.findMany({
      where: {
        productId: input.productId,
        warehouseId: input.warehouseId,
        remainingQuantity: { gt: 0 },
      },
      orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    const businessBatches = await this.filterOutSeedFifoBatches(tx, batches);
    const allocationLayers = await this.mapBatchesToAllocationLayers(tx, businessBatches);

    const markupPercent = input.isHqOwnedBranch
      ? 0
      : Number(input.branchPricing?.hqToBranchMarkupPercent ?? 0);
    const branchType = input.isHqOwnedBranch
      ? 'HQ_BRANCH'
      : ((input.branchPricing?.branchType as 'FRANCHISE' | 'DEALER' | 'DISTRIBUTOR' | undefined) ??
        'FRANCHISE');

    // Flat override only for legacy single-layer / non-per-layer mode.
    if (!preferPerLayerMarkup && input.overrideUnitPriceKgs != null && input.overrideUnitPriceKgs >= 0) {
      const layerByBatchId = new Map(allocationLayers.map((layer) => [layer.batchId, layer]));
      let remainingToAllocate = input.quantity;
      const lineCosts: number[] = [];
      const linePrices: number[] = [];
      const lines: FifoPreviewLine[] = [];
      for (const batch of businessBatches) {
        if (remainingToAllocate <= 0) break;
        const reserved = Number((batch as { reservedQuantity?: number }).reservedQuantity ?? 0);
        const available = subtractReserved
          ? Math.max(0, batch.remainingQuantity - reserved)
          : batch.remainingQuantity;
        const take = Math.min(available, remainingToAllocate);
        if (take <= 0) continue;
        const mappedLayer = layerByBatchId.get(batch.id);
        const unitCostKgs = Number(batch.unitCostKgs);
        const unitPriceKgs = Number(input.overrideUnitPriceKgs);
        const layerBaseQty =
          mappedLayer?.layerBaseQuantity ??
          (batch.initialQuantity > 0 ? batch.initialQuantity : take);
        const layerTotalCostKgs =
          mappedLayer?.layerTotalCostKgs ?? Number(batch.unitCostKgs) * layerBaseQty;
        const lineCost = allocateLayerConsumptionCost({
          layerTotalCostKgs,
          layerBaseQuantity: layerBaseQty,
          remainingQuantity: batch.remainingQuantity,
          takeQuantity: take,
        });
        const linePrice = roundMoney(unitPriceKgs * take);
        lineCosts.push(lineCost);
        linePrices.push(linePrice);
        remainingToAllocate -= take;
        lines.push({
          batchId: batch.id,
          quantity: take,
          unitCostKgs,
          unitPriceKgs,
          wholesalePriceKgs: Number(batch.wholesalePriceKgs),
          hqBranchWholesalePriceKgs: Number(batch.hqBranchWholesalePriceKgs),
          totalCostKgs: lineCost,
          totalPriceKgs: linePrice,
          markupPercent,
          profitKgs: roundMoney(linePrice - lineCost),
        });
      }
      const allocatedQty = input.quantity - remainingToAllocate;
      if (allocatedQty <= 0) {
        return {
          unitCost: input.fallbackUnitCost ?? 0,
          unitPrice: input.fallbackUnitPrice ?? 0,
          activeUnitCost: input.fallbackUnitCost ?? 0,
          activeUnitPrice: input.fallbackUnitPrice ?? 0,
          totalCostKgs: 0,
          totalPriceKgs: 0,
          profitKgs: 0,
          lines: [] as FifoPreviewLine[],
          allocatedQty: 0,
        };
      }
      const totalCost = sumDisplayMoneyTotals(lineCosts);
      const totalPrice = sumDisplayMoneyTotals(linePrices);
      return {
        unitCost: deriveDisplayUnitCost(totalCost, allocatedQty),
        unitPrice: deriveDisplayUnitCost(totalPrice, allocatedQty),
        activeUnitCost: lines[0]?.unitCostKgs ?? 0,
        activeUnitPrice: lines[0]?.unitPriceKgs ?? 0,
        totalCostKgs: totalCost,
        totalPriceKgs: totalPrice,
        profitKgs: roundMoney(totalPrice - totalCost),
        lines,
        allocatedQty,
      };
    }

    const built = buildFifoAllocationLines(
      allocationLayers,
      input.quantity,
      { markupPercent, branchType, subtractReserved },
    );

    if (built.allocatedQty <= 0) {
      return {
        unitCost: input.fallbackUnitCost ?? 0,
        unitPrice: input.fallbackUnitPrice ?? 0,
        activeUnitCost: input.fallbackUnitCost ?? 0,
        activeUnitPrice: input.fallbackUnitPrice ?? 0,
        totalCostKgs: 0,
        totalPriceKgs: 0,
        profitKgs: 0,
        lines: [] as FifoPreviewLine[],
        allocatedQty: 0,
      };
    }

    return {
      // Blended averages kept for backward-compatible unit fields on order lines.
      unitCost: deriveDisplayUnitCost(built.totalCostKgs, built.allocatedQty),
      unitPrice: deriveDisplayUnitCost(built.totalPriceKgs, built.allocatedQty),
      // Active (first) FIFO layer — matches Продажа филиалам starting cost.
      activeUnitCost: built.activeUnitCostKgs,
      activeUnitPrice: built.activeUnitPriceKgs,
      totalCostKgs: built.totalCostKgs,
      totalPriceKgs: built.totalPriceKgs,
      profitKgs: built.profitKgs,
      lines: built.lines.map((line) => ({
        batchId: line.batchId,
        quantity: line.quantity,
        unitCostKgs: line.unitCostKgs,
        unitPriceKgs: line.unitPriceKgs,
        wholesalePriceKgs: line.wholesalePriceKgs ?? line.unitPriceKgs,
        hqBranchWholesalePriceKgs: line.hqBranchWholesalePriceKgs ?? line.unitPriceKgs,
        totalCostKgs: line.totalCostKgs,
        totalPriceKgs: line.totalPriceKgs,
        markupPercent: line.markupPercent ?? markupPercent,
        profitKgs: line.profitKgs,
      })),
      allocatedQty: built.allocatedQty,
    };
  }

  /**
   * Reserve FIFO layers for an approved branch order (oldest first).
   * Creates DistributionFifoAllocation rows with status=RESERVED.
   */
  async reserveFifoForDistribution(
    tx: PrismaTx,
    input: {
      productId: string;
      warehouseId: string;
      quantity: number;
      isHqOwnedBranch: boolean;
      branchPricing?: BranchPricingConfig;
      distributionOrderId: string;
      distributionOrderItemId: string;
      userId: string | null;
      userRole: string;
    },
  ) {
    const existing = await tx.distributionFifoAllocation.findMany({
      where: {
        distributionOrderItemId: input.distributionOrderItemId,
        status: 'RESERVED',
      },
    });
    if (existing.length) {
      const totalCostKgs = sumDisplayMoneyTotals(existing.map((row) => Number(row.totalCostKgs)));
      const totalPriceKgs = sumDisplayMoneyTotals(existing.map((row) => Number(row.totalPriceKgs)));
      const allocatedQty = existing.reduce((sum, row) => sum + row.quantity, 0);
      return {
        lines: existing.map((row) => ({
          batchId: row.fifoBatchId,
          quantity: row.quantity,
          unitCostKgs: Number(row.unitCostKgs),
          unitPriceKgs: Number(row.unitPriceKgs),
          totalCostKgs: Number(row.totalCostKgs),
          totalPriceKgs: Number(row.totalPriceKgs),
          profitKgs: Number(row.profitKgs),
        })),
        alreadyReserved: true,
        totalCostKgs,
        totalPriceKgs,
        profitKgs: roundMoney(totalPriceKgs - totalCostKgs),
        allocatedQty,
        unitCost: deriveDisplayUnitCost(totalCostKgs, allocatedQty),
        unitPrice: deriveDisplayUnitCost(totalPriceKgs, allocatedQty),
        activeUnitCost: Number(existing[0]?.unitCostKgs ?? 0),
        activeUnitPrice: Number(existing[0]?.unitPriceKgs ?? 0),
      };
    }

    const preview = await this.previewFifoAllocation(tx, {
      productId: input.productId,
      warehouseId: input.warehouseId,
      quantity: input.quantity,
      isHqOwnedBranch: input.isHqOwnedBranch,
      branchPricing: input.branchPricing,
      preferPerLayerMarkup: true,
      subtractReserved: true,
    });

    if (preview.allocatedQty < input.quantity) {
      throw new Error(
        `Insufficient FIFO stock for product ${input.productId}. Requested: ${input.quantity}, available: ${preview.allocatedQty}`,
      );
    }

    for (const line of preview.lines) {
      const updated = await tx.fifoInventoryBatch.updateMany({
        where: {
          id: line.batchId,
          // Prevent oversell under concurrency: remaining - reserved >= take
          remainingQuantity: { gte: line.quantity },
        },
        data: { reservedQuantity: { increment: line.quantity } },
      });
      if (updated.count !== 1) {
        throw new Error(`FIFO layer ${line.batchId} could not be reserved (concurrent oversell)`);
      }

      // Re-check available after increment
      const batch = await tx.fifoInventoryBatch.findUnique({ where: { id: line.batchId } });
      if (!batch || batch.reservedQuantity > batch.remainingQuantity) {
        throw new Error(`FIFO layer ${line.batchId} reserved beyond remaining quantity`);
      }

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
          markupPercent: line.markupPercent,
          profitKgs: line.profitKgs,
          status: 'RESERVED',
        },
      });

      await tx.auditLog.create({
        data: {
          userId: input.userId,
          role: input.userRole,
          action: 'FIFO_LAYER_RESERVED',
          entity: 'FifoInventoryBatch',
          entityId: line.batchId,
          metadata: {
            productId: input.productId,
            inventoryLayerId: line.batchId,
            distributionOrderId: input.distributionOrderId,
            distributionOrderItemId: input.distributionOrderItemId,
            quantity: line.quantity,
            unitCost: line.unitCostKgs,
            unitSellingPrice: line.unitPriceKgs,
            markup: line.markupPercent,
            profitKgs: line.profitKgs,
            userId: input.userId,
            timestamp: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      });
    }

    return { alreadyReserved: false, ...preview };
  }

  async releaseFifoReservationsForOrder(
    tx: PrismaTx,
    input: { distributionOrderId: string; userId: string; userRole: string },
  ) {
    const reserved = await tx.distributionFifoAllocation.findMany({
      where: {
        distributionOrderId: input.distributionOrderId,
        status: 'RESERVED',
      },
    });

    for (const row of reserved) {
      const batch = await tx.fifoInventoryBatch.findUnique({
        where: { id: row.fifoBatchId },
        select: { reservedQuantity: true },
      });
      const releaseQty = Math.min(row.quantity, Math.max(0, batch?.reservedQuantity ?? 0));
      if (releaseQty > 0) {
        await tx.fifoInventoryBatch.update({
          where: { id: row.fifoBatchId },
          data: { reservedQuantity: { decrement: releaseQty } },
        });
      }

      await tx.distributionFifoAllocation.delete({ where: { id: row.id } });

      await tx.auditLog.create({
        data: {
          userId: input.userId,
          role: input.userRole,
          action: 'FIFO_RESERVATION_RELEASED',
          entity: 'FifoInventoryBatch',
          entityId: row.fifoBatchId,
          metadata: {
            productId: row.productId,
            inventoryLayerId: row.fifoBatchId,
            distributionOrderId: input.distributionOrderId,
            distributionOrderItemId: row.distributionOrderItemId,
            quantity: row.quantity,
            unitCost: Number(row.unitCostKgs),
            unitSellingPrice: Number(row.unitPriceKgs),
            userId: input.userId,
            timestamp: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      });
    }

    return { released: reserved.length };
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
    const reserved = await tx.distributionFifoAllocation.findMany({
      where: {
        distributionOrderItemId: input.distributionOrderItemId,
        status: 'RESERVED',
      },
      orderBy: { createdAt: 'asc' },
    });

    if (reserved.length) {
      const lineCosts: number[] = [];
      const linePrices: number[] = [];
      const lines: FifoPreviewLine[] = [];

      for (const row of reserved) {
        await tx.fifoInventoryBatch.update({
          where: { id: row.fifoBatchId },
          data: {
            remainingQuantity: { decrement: row.quantity },
            reservedQuantity: { decrement: row.quantity },
          },
        });

        const profitKgs = Number(row.profitKgs) || roundMoney(Number(row.totalPriceKgs) - Number(row.totalCostKgs));
        await tx.distributionFifoAllocation.update({
          where: { id: row.id },
          data: { status: 'CONSUMED', profitKgs },
        });

        lineCosts.push(Number(row.totalCostKgs));
        linePrices.push(Number(row.totalPriceKgs));
        lines.push({
          batchId: row.fifoBatchId,
          quantity: row.quantity,
          unitCostKgs: Number(row.unitCostKgs),
          unitPriceKgs: Number(row.unitPriceKgs),
          wholesalePriceKgs: Number(row.wholesalePriceKgs),
          hqBranchWholesalePriceKgs: Number(row.hqBranchWholesalePriceKgs),
          totalCostKgs: Number(row.totalCostKgs),
          totalPriceKgs: Number(row.totalPriceKgs),
          markupPercent: Number(row.markupPercent),
          profitKgs,
        });

        await tx.auditLog.create({
          data: {
            userId: input.userId,
            role: input.userRole,
            action: 'FIFO_LAYER_DEDUCTED',
            entity: 'FifoInventoryBatch',
            entityId: row.fifoBatchId,
            metadata: {
              productId: input.productId,
              inventoryLayerId: row.fifoBatchId,
              distributionOrderId: input.distributionOrderId,
              distributionOrderItemId: input.distributionOrderItemId,
              quantity: row.quantity,
              unitCost: Number(row.unitCostKgs),
              unitSellingPrice: Number(row.unitPriceKgs),
              markup: Number(row.markupPercent),
              profitKgs,
              userId: input.userId,
              timestamp: new Date().toISOString(),
            } as Prisma.InputJsonValue,
          },
        });
      }

      const allocatedQty = lines.reduce((sum, line) => sum + line.quantity, 0);
      const totalCostKgs = sumDisplayMoneyTotals(lineCosts);
      const totalPriceKgs = sumDisplayMoneyTotals(linePrices);
      return {
        unitCost: deriveDisplayUnitCost(totalCostKgs, allocatedQty),
        unitPrice: deriveDisplayUnitCost(totalPriceKgs, allocatedQty),
        activeUnitCost: lines[0]?.unitCostKgs ?? 0,
        activeUnitPrice: lines[0]?.unitPriceKgs ?? 0,
        totalCostKgs,
        totalPriceKgs,
        profitKgs: roundMoney(totalPriceKgs - totalCostKgs),
        lines,
        allocatedQty,
      };
    }

    // No prior reservation — allocate and consume immediately (legacy path).
    const preview = await this.previewFifoAllocation(tx, {
      productId: input.productId,
      warehouseId: input.warehouseId,
      quantity: input.quantity,
      isHqOwnedBranch: input.isHqOwnedBranch,
      branchPricing: input.branchPricing,
      preferPerLayerMarkup: true,
      subtractReserved: true,
    });

    if (preview.allocatedQty < input.quantity) {
      throw new Error(
        `Insufficient FIFO stock for product ${input.productId}. Requested: ${input.quantity}, available: ${preview.allocatedQty}`,
      );
    }

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
          markupPercent: line.markupPercent,
          profitKgs: line.profitKgs,
          status: 'CONSUMED',
        },
      });

      await tx.auditLog.create({
        data: {
          userId: input.userId,
          role: input.userRole,
          action: 'FIFO_ALLOCATION_CREATED',
          entity: 'FifoInventoryBatch',
          entityId: line.batchId,
          metadata: {
            productId: input.productId,
            inventoryLayerId: line.batchId,
            distributionOrderId: input.distributionOrderId,
            distributionOrderItemId: input.distributionOrderItemId,
            quantity: line.quantity,
            unitCost: line.unitCostKgs,
            unitSellingPrice: line.unitPriceKgs,
            markup: line.markupPercent,
            profitKgs: line.profitKgs,
            userId: input.userId,
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
      orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
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

  private async mapBatchesToAllocationLayers(
    tx: PrismaTx,
    batches: Array<{
      id: string;
      remainingQuantity: number;
      initialQuantity: number;
      unitCostKgs: unknown;
      stockMovementId?: string | null;
      productId?: string;
      referenceType?: string | null;
      referenceId?: string | null;
      wholesalePriceKgs: unknown;
      hqBranchWholesalePriceKgs: unknown;
      reservedQuantity?: number;
    }>,
  ) {
    const movementIds = batches
      .map((batch) => batch.stockMovementId)
      .filter((id): id is string => Boolean(id));
    const movements = movementIds.length
      ? await tx.stockMovement.findMany({
          where: { id: { in: movementIds } },
          select: { id: true, quantity: true, totalCostKgs: true, unitCostKgs: true },
        })
      : [];
    const movementById = new Map(movements.map((movement) => [movement.id, movement]));

    const receiptIds = batches
      .filter(
        (batch) =>
          isBusinessProcurementReceiptReference(batch.referenceType) && Boolean(batch.referenceId),
      )
      .map((batch) => batch.referenceId as string);
    const receivingItems = receiptIds.length
      ? await tx.procurementGoodsReceivingItem.findMany({
          where: { receivingId: { in: receiptIds } },
          select: { receivingId: true, productId: true, procurementItemId: true },
        })
      : [];
    const procurementItemIds = receivingItems
      .map((row) => row.procurementItemId)
      .filter((id): id is string => Boolean(id));
    const orderItems = procurementItemIds.length
      ? await tx.procurementOrderItem.findMany({
          where: { id: { in: procurementItemIds } },
          select: { id: true, totalCostKgs: true, quantity: true },
        })
      : [];
    const orderItemById = new Map(orderItems.map((row) => [row.id, row]));
    const procurementLineByReceiptProduct = new Map<string, { totalCostKgs: number; quantity: number }>();
    for (const receivingItem of receivingItems) {
      if (!receivingItem.procurementItemId) continue;
      const orderLine = orderItemById.get(receivingItem.procurementItemId);
      if (!orderLine || Number(orderLine.totalCostKgs) <= 0) continue;
      procurementLineByReceiptProduct.set(
        `${receivingItem.receivingId}:${receivingItem.productId}`,
        {
          totalCostKgs: Number(orderLine.totalCostKgs),
          quantity: Number(orderLine.quantity),
        },
      );
    }

    return batches.map((batch) => {
      const movement = batch.stockMovementId ? movementById.get(batch.stockMovementId) : null;
      const layerBaseQuantity =
        batch.initialQuantity > 0
          ? batch.initialQuantity
          : movement
            ? Math.abs(Number(movement.quantity))
            : batch.remainingQuantity;

      let layerTotalCostKgs = 0;
      if (movement && Number(movement.totalCostKgs) > 0) {
        layerTotalCostKgs = Number(movement.totalCostKgs);
      } else if (
        batch.referenceId &&
        batch.productId &&
        isBusinessProcurementReceiptReference(batch.referenceType)
      ) {
        const orderLine = procurementLineByReceiptProduct.get(`${batch.referenceId}:${batch.productId}`);
        if (orderLine) {
          layerTotalCostKgs = roundDisplayMoney(orderLine.totalCostKgs);
        }
      }

      if (layerTotalCostKgs <= 0) {
        const unitCostKgs = resolveAuthoritativeFifoLayerUnitCost({
          initialQuantity: batch.initialQuantity,
          batchUnitCostKgs: Number(batch.unitCostKgs),
          movementQuantity: movement?.quantity,
          movementUnitCostKgs: movement ? Number(movement.unitCostKgs) : null,
          movementTotalCostKgs: movement?.totalCostKgs != null ? Number(movement.totalCostKgs) : null,
        });
        layerTotalCostKgs = roundDisplayMoney(unitCostKgs * layerBaseQuantity);
      }

      return {
        batchId: batch.id,
        remainingQuantity: batch.remainingQuantity,
        reservedQuantity: Number(batch.reservedQuantity ?? 0),
        unitCostKgs: Number(batch.unitCostKgs),
        layerTotalCostKgs,
        layerBaseQuantity,
        wholesalePriceKgs: Number(batch.wholesalePriceKgs),
        hqBranchWholesalePriceKgs: Number(batch.hqBranchWholesalePriceKgs),
      };
    });
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
      totalCostKgs?: Prisma.Decimal | number | null;
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
    const unitCostKgs = resolveUnitCostFromInventoryLayer({
      quantity: movement.quantity,
      unitCostKgs: Number(movement.unitCostKgs),
      totalCostKgs: movement.totalCostKgs != null ? Number(movement.totalCostKgs) : null,
    });
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

  /**
   * Branch receiving: one branch FIFO layer per HQ distribution allocation.
   * Never merges different HQ unit costs into a single branch layer.
   */
  async ensureBranchFifoLayersFromHqAllocationsInTx(
    tx: PrismaTx,
    input: {
      distributionOrderItemId: string;
      branchProductId: string;
      branchWarehouseId: string;
      acceptedQuantity: number;
      transportCostPerUnit?: number;
      receivingNote: string;
      createMovement: (line: {
        quantity: number;
        unitCostKgs: number;
        totalCostKgs: number;
        referenceType: string;
        referenceId: string;
        note: string;
      }) => Promise<{
        id: string;
        productId: string;
        warehouseId: string;
        quantity: number;
        unitCostKgs: Prisma.Decimal | number;
        totalCostKgs?: Prisma.Decimal | number | null;
        createdAt: Date;
        referenceType?: string | null;
        referenceId?: string | null;
      }>;
    },
  ) {
    const allocations = await tx.distributionFifoAllocation.findMany({
      where: {
        distributionOrderItemId: input.distributionOrderItemId,
        status: 'CONSUMED',
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        fifoBatchId: true,
        quantity: true,
        unitCostKgs: true,
        totalCostKgs: true,
      },
    });
    if (!allocations.length) {
      return { layers: [], usedAllocations: false };
    }

    const receiveLines = buildBranchReceiveLinesFromHqAllocations(
      allocations.map((row) => ({
        id: row.id,
        fifoBatchId: row.fifoBatchId,
        quantity: row.quantity,
        unitCostKgs: Number(row.unitCostKgs),
      })),
      input.acceptedQuantity,
      Number(input.transportCostPerUnit ?? 0),
    );

    const layers: Array<{
      allocationId: string;
      hqFifoLayerId: string;
      branchFifoLayerId: string;
      quantity: number;
      transferUnitCostKgs: number;
      transportCostPerUnit: number;
      finalBranchUnitCostKgs: number;
      created: boolean;
    }> = [];

    for (const line of receiveLines) {
      const existingMovement = await tx.stockMovement.findFirst({
        where: {
          referenceType: 'DISTRIBUTION_FIFO_ALLOCATION',
          referenceId: line.allocationId,
          productId: input.branchProductId,
          warehouseId: input.branchWarehouseId,
          type: StockMovementType.IN,
        },
        select: { id: true },
      });
      if (existingMovement) {
        const existingBatch = await tx.fifoInventoryBatch.findFirst({
          where: { stockMovementId: existingMovement.id },
          select: { id: true },
        });
        layers.push({
          allocationId: line.allocationId,
          hqFifoLayerId: line.hqFifoLayerId,
          branchFifoLayerId: existingBatch?.id ?? existingMovement.id,
          quantity: line.quantity,
          transferUnitCostKgs: line.transferUnitCostKgs,
          transportCostPerUnit: line.transportCostPerUnit,
          finalBranchUnitCostKgs: line.finalBranchUnitCostKgs,
          created: false,
        });
        continue;
      }

      const totalCostKgs = line.lineTotalCostKgs;
      const movement = await input.createMovement({
        quantity: line.quantity,
        unitCostKgs: line.finalBranchUnitCostKgs,
        totalCostKgs,
        referenceType: 'DISTRIBUTION_FIFO_ALLOCATION',
        referenceId: line.allocationId,
        note: input.receivingNote,
      });

      const fifoBatch = await this.ensureBranchFifoBatchFromMovementInTx(tx, {
        id: movement.id,
        productId: movement.productId,
        warehouseId: movement.warehouseId,
        quantity: line.quantity,
        unitCostKgs: line.finalBranchUnitCostKgs,
        totalCostKgs,
        createdAt: movement.createdAt,
        referenceType: 'HQ_FIFO_LAYER',
        referenceId: line.hqFifoLayerId,
      });

      layers.push({
        allocationId: line.allocationId,
        hqFifoLayerId: line.hqFifoLayerId,
        branchFifoLayerId: fifoBatch.batchId,
        quantity: line.quantity,
        transferUnitCostKgs: line.transferUnitCostKgs,
        transportCostPerUnit: line.transportCostPerUnit,
        finalBranchUnitCostKgs: line.finalBranchUnitCostKgs,
        created: fifoBatch.created,
      });
    }

    return { layers, usedAllocations: true };
  }

  private async filterOutSeedFifoBatches<T extends { id: string; referenceType: string | null; stockMovementId: string | null }>(
    client: PrismaTx,
    batches: T[],
  ): Promise<T[]> {
    const business: T[] = [];
    for (const batch of batches) {
      if (batch.referenceType === SEED_FIFO_REFERENCE_TYPE) continue;
      if (!batch.stockMovementId) {
        business.push(batch);
        continue;
      }
      const movement = await client.stockMovement.findUnique({
        where: { id: batch.stockMovementId },
        select: { referenceType: true, referenceId: true, note: true },
      });
      if (
        movement &&
        isSeedStockMovementReference({
          referenceType: movement.referenceType,
          referenceId: movement.referenceId,
          note: movement.note,
        })
      ) {
        continue;
      }
      business.push(batch);
    }
    return business;
  }
}
