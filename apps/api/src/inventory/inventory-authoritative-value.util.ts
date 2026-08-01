import { Prisma, type WarehouseType } from '@prisma/client';
import {
  allocateProportionalCost,
  computeLayerRemainingCostKgs,
  deriveDisplayUnitCost,
  roundDisplayMoney,
  sumDisplayMoneyTotals,
} from '../pricing/product-cost-precision.util';
import type { PricingFifoService } from '../pricing/pricing-fifo.service';

type PrismaTx = Prisma.TransactionClient;

export const INVENTORY_VALUATION_MISMATCH_MESSAGE =
  'Складдын себестоимосту FIFO партиялары менен дал келбейт. Инвентаризацияны аяктоодон мурун себестоимостьту текшериңиз.';

type FifoBatchRow = {
  id: string;
  remainingQuantity: number;
  initialQuantity: number;
  unitCostKgs: unknown;
  stockMovementId?: string | null;
};

async function mapFifoLayerTotals(
  tx: PrismaTx,
  batches: FifoBatchRow[],
): Promise<Array<{ remainingQuantity: number; layerTotalCostKgs: number; layerBaseQuantity: number }>> {
  const movementIds = batches
    .map((batch) => batch.stockMovementId)
    .filter((id): id is string => Boolean(id));
  const movements = movementIds.length
    ? await tx.stockMovement.findMany({
        where: { id: { in: movementIds } },
        select: { id: true, quantity: true, totalCostKgs: true },
      })
    : [];
  const movementById = new Map(movements.map((movement) => [movement.id, movement]));

  return batches.map((batch) => {
    const movement = batch.stockMovementId ? movementById.get(batch.stockMovementId) : null;
    const remainingQuantity = Math.max(0, Math.floor(Number(batch.remainingQuantity)));
    const layerBaseQuantity =
      batch.initialQuantity > 0
        ? Math.floor(Number(batch.initialQuantity))
        : movement
          ? Math.abs(Math.floor(Number(movement.quantity)))
          : remainingQuantity;
    const movementTotal = movement ? roundDisplayMoney(movement.totalCostKgs ?? 0) : 0;
    const fallbackTotal =
      layerBaseQuantity > 0
        ? roundDisplayMoney(
            new Prisma.Decimal(Number(batch.unitCostKgs ?? 0)).mul(layerBaseQuantity),
          )
        : 0;
    // Fully consumed layers contribute zero remaining warehouse value.
    const layerTotalCostKgs = remainingQuantity <= 0 ? 0 : movementTotal > 0 ? movementTotal : fallbackTotal;
    return {
      remainingQuantity,
      layerTotalCostKgs,
      layerBaseQuantity,
    };
  });
}

/** Pure helper: remaining HQ FIFO value excludes fully consumed / zero-remaining layers. */
export function sumActiveRemainingFifoLayerValues(
  layers: Array<{
    remainingQuantity: number;
    originalLayerValueKgs: number;
    layerBaseQuantity: number;
  }>,
): number {
  const values = layers.map((layer) => {
    const remaining = Math.max(0, Math.floor(Number(layer.remainingQuantity)));
    if (remaining <= 0) return 0;
    return computeLayerRemainingCostKgs(
      layer.originalLayerValueKgs,
      layer.layerBaseQuantity,
      remaining,
    );
  });
  return sumDisplayMoneyTotals(values);
}

/** Authoritative remaining FIFO inventory value for one product in a warehouse. */
export async function sumProductFifoRemainingValueKgs(
  tx: PrismaTx,
  warehouseId: string,
  productId: string,
): Promise<number> {
  const batches = await tx.fifoInventoryBatch.findMany({
    where: {
      warehouseId,
      productId,
      remainingQuantity: { gt: 0 },
    },
    select: {
      id: true,
      remainingQuantity: true,
      initialQuantity: true,
      unitCostKgs: true,
      stockMovementId: true,
    },
  });
  if (!batches.length) return 0;

  const layers = await mapFifoLayerTotals(tx, batches);
  const lineValues = layers.map((layer) =>
    computeLayerRemainingCostKgs(
      layer.layerTotalCostKgs,
      layer.layerBaseQuantity,
      layer.remainingQuantity,
    ),
  );
  return sumDisplayMoneyTotals(lineValues);
}

/** Sum remaining FIFO layer values for an entire warehouse (only layers with qty > 0). */
export async function sumWarehouseFifoRemainingValueKgs(tx: PrismaTx, warehouseId: string): Promise<number> {
  const batches = await tx.fifoInventoryBatch.findMany({
    where: {
      warehouseId,
      remainingQuantity: { gt: 0 },
    },
    select: {
      id: true,
      remainingQuantity: true,
      initialQuantity: true,
      unitCostKgs: true,
      stockMovementId: true,
    },
  });
  if (!batches.length) return 0;

  const layers = await mapFifoLayerTotals(tx, batches);
  const lineValues = layers.map((layer) =>
    computeLayerRemainingCostKgs(
      layer.layerTotalCostKgs,
      layer.layerBaseQuantity,
      layer.remainingQuantity,
    ),
  );
  return sumDisplayMoneyTotals(lineValues);
}

/** Sum balance totalValueKgs for rows with positive quantity only (excludes ghost zero-qty value). */
export async function sumWarehouseBalanceInventoryValueKgs(tx: PrismaTx, warehouseId: string): Promise<number> {
  const balances = await tx.inventoryBalance.findMany({
    where: { warehouseId, quantity: { gt: 0 } },
    select: { totalValueKgs: true },
  });
  return sumDisplayMoneyTotals(balances.map((row) => Number(row.totalValueKgs ?? 0)));
}

export type InventoryCountDifferenceInput = {
  warehouseId: string;
  productId: string;
  systemQuantity: number;
  actualQuantity: number;
  unitCostKgs: number;
  isHqWarehouse: boolean;
};

/**
 * Authoritative FIFO unit cost for inventory-count display and fallback allocation.
 * HQ: oldest active FIFO layer unit landed cost (never average/markup/catalog price).
 */
export async function resolveInventoryCountUnitCostKgs(
  tx: PrismaTx,
  pricingFifoService: PricingFifoService,
  warehouseId: string,
  productId: string,
  isHqWarehouse: boolean,
  balanceFallback: {
    totalValueKgs?: unknown;
    landedCostKgs?: unknown;
    averageCostKgs?: unknown;
    finalCostKgs?: unknown;
  },
  systemQuantity: number,
): Promise<{ unitCostKgs: number; authoritativeSystemValueKgs: number }> {
  const qty = Math.max(0, Math.floor(systemQuantity));
  const fifoValue = await sumProductFifoRemainingValueKgs(tx, warehouseId, productId);
  const authoritativeSystemValueKgs =
    fifoValue > 0 ? fifoValue : roundDisplayMoney(Number(balanceFallback.totalValueKgs ?? 0));

  if (isHqWarehouse) {
    const oldest = await pricingFifoService.getOldestActiveHqFifoCost(
      { productId, warehouseId },
      tx,
    );
    return {
      unitCostKgs: oldest.costPriceKgs > 0 ? roundDisplayMoney(oldest.costPriceKgs) : 0,
      authoritativeSystemValueKgs,
    };
  } else if (qty > 0 && authoritativeSystemValueKgs > 0) {
    const preview = await pricingFifoService.previewFifoAllocation(tx, {
      productId,
      warehouseId,
      quantity: 1,
      isHqOwnedBranch: false,
      subtractReserved: false,
      preferPerLayerMarkup: false,
      fallbackUnitCost: Number(
        balanceFallback.landedCostKgs ?? balanceFallback.averageCostKgs ?? 0,
      ),
    });
    if (preview.unitCost > 0) {
      return {
        unitCostKgs: roundDisplayMoney(preview.unitCost),
        authoritativeSystemValueKgs,
      };
    }
  }

  if (qty <= 0) {
    return { unitCostKgs: 0, authoritativeSystemValueKgs };
  }

  const unitCostKgs =
    authoritativeSystemValueKgs > 0
      ? deriveDisplayUnitCost(authoritativeSystemValueKgs, qty)
      : roundDisplayMoney(
          Number(
            balanceFallback.landedCostKgs ??
              balanceFallback.averageCostKgs ??
              balanceFallback.finalCostKgs ??
              0,
          ),
        );

  return { unitCostKgs, authoritativeSystemValueKgs };
}

/**
 * Surplus/shortage value for inventory count using authoritative FIFO layer costs
 * for the difference quantity only (never physical qty, system qty, or warehouse total).
 */
export async function resolveInventoryCountDifferenceValueKgs(
  tx: PrismaTx,
  pricingFifoService: PricingFifoService,
  input: InventoryCountDifferenceInput,
): Promise<number> {
  const systemQty = Math.max(0, Math.floor(input.systemQuantity));
  const actualQty = Math.max(0, Math.floor(input.actualQuantity));
  const diffQty = actualQty - systemQty;
  if (diffQty === 0) return 0;

  const allocationQty = Math.abs(diffQty);
  const fifoPreview = await pricingFifoService.previewFifoAllocation(tx, {
    productId: input.productId,
    warehouseId: input.warehouseId,
    quantity: allocationQty,
    isHqOwnedBranch: input.isHqWarehouse,
    subtractReserved: false,
    preferPerLayerMarkup: false,
    fallbackUnitCost: input.unitCostKgs,
  });

  let differenceValue = roundDisplayMoney(fifoPreview.totalCostKgs);
  const allocatedQty = Number(fifoPreview.allocatedQty ?? 0);
  if (allocatedQty < allocationQty && input.unitCostKgs > 0) {
    const remainderQty = allocationQty - allocatedQty;
    differenceValue = roundDisplayMoney(differenceValue + remainderQty * input.unitCostKgs);
  }

  return diffQty > 0 ? differenceValue : roundDisplayMoney(-differenceValue);
}

export type InventoryCountLineInput = {
  productId: string;
  systemQuantity: number;
  actualQuantity: number;
  balanceFallback?: {
    totalValueKgs?: unknown;
    landedCostKgs?: unknown;
    averageCostKgs?: unknown;
    finalCostKgs?: unknown;
  };
};

/** Recompute one inventory-count line from authoritative FIFO (preview = final). */
export async function recomputeInventoryCountLineValuation(
  tx: PrismaTx,
  pricingFifoService: PricingFifoService,
  warehouse: { id: string; warehouseType: WarehouseType; branchId: string | null },
  item: InventoryCountLineInput,
  isHqWarehouse: boolean,
): Promise<{
  unitCostKgs: number;
  differenceQuantity: number;
  differenceValueKgs: number;
}> {
  const systemQty = Math.max(0, Math.floor(item.systemQuantity));
  const actualQty = Math.max(0, Math.floor(item.actualQuantity));
  const differenceQuantity = actualQty - systemQty;
  const fallback = item.balanceFallback ?? {};
  const { unitCostKgs } = await resolveInventoryCountUnitCostKgs(
    tx,
    pricingFifoService,
    warehouse.id,
    item.productId,
    isHqWarehouse,
    fallback,
    systemQty,
  );
  const differenceValueKgs = await resolveInventoryCountDifferenceValueKgs(
    tx,
    pricingFifoService,
    {
      warehouseId: warehouse.id,
      productId: item.productId,
      systemQuantity: systemQty,
      actualQuantity: actualQty,
      unitCostKgs,
      isHqWarehouse,
    },
  );
  return { unitCostKgs, differenceQuantity, differenceValueKgs };
}

/** Ensure stored line values match authoritative FIFO recomputation. */
export async function assertInventoryCountLinesMatchAuthoritativeValuation(
  tx: PrismaTx,
  pricingFifoService: PricingFifoService,
  warehouse: { id: string; warehouseType: WarehouseType; branchId: string | null },
  items: Array<{
    id: string;
    productId: string;
    systemQuantity: number;
    actualQuantity: number | null;
    differenceQuantity: number;
    differenceValueKgs: unknown;
    unitCostKgs: unknown;
  }>,
  isHqWarehouse: boolean,
  toleranceKgs = 0.01,
): Promise<{ ok: boolean; mismatches: Array<{ itemId: string; productId: string; expected: number; actual: number }> }> {
  const mismatches: Array<{ itemId: string; productId: string; expected: number; actual: number }> = [];

  for (const item of items) {
    if (item.actualQuantity === null) continue;
    const recomputed = await recomputeInventoryCountLineValuation(
      tx,
      pricingFifoService,
      warehouse,
      {
        productId: item.productId,
        systemQuantity: item.systemQuantity,
        actualQuantity: item.actualQuantity,
      },
      isHqWarehouse,
    );
    const stored = roundDisplayMoney(Number(item.differenceValueKgs));
    const expected = recomputed.differenceValueKgs;
    if (Math.abs(stored - expected) > toleranceKgs) {
      mismatches.push({
        itemId: item.id,
        productId: item.productId,
        expected,
        actual: stored,
      });
    }
  }

  return { ok: mismatches.length === 0, mismatches };
}

export async function resolveAuthoritativeSystemUnitCostKgs(
  tx: PrismaTx,
  warehouseId: string,
  productId: string,
  systemQuantity: number,
  balanceFallback: {
    totalValueKgs?: unknown;
    landedCostKgs?: unknown;
    averageCostKgs?: unknown;
    finalCostKgs?: unknown;
  },
): Promise<{ unitCostKgs: number; authoritativeSystemValueKgs: number }> {
  const qty = Math.max(0, Math.floor(systemQuantity));
  const fifoValue = await sumProductFifoRemainingValueKgs(tx, warehouseId, productId);
  const authoritativeSystemValueKgs =
    fifoValue > 0 ? fifoValue : roundDisplayMoney(Number(balanceFallback.totalValueKgs ?? 0));

  if (qty <= 0) {
    return { unitCostKgs: 0, authoritativeSystemValueKgs };
  }

  const unitCostKgs =
    authoritativeSystemValueKgs > 0
      ? deriveDisplayUnitCost(authoritativeSystemValueKgs, qty)
      : roundDisplayMoney(
          Number(
            balanceFallback.landedCostKgs ??
              balanceFallback.averageCostKgs ??
              balanceFallback.finalCostKgs ??
              0,
          ),
        );

  return { unitCostKgs, authoritativeSystemValueKgs };
}

export async function compareWarehouseInventoryValuation(
  tx: PrismaTx,
  warehouseId: string,
  toleranceKgs = 0,
): Promise<{
  ok: boolean;
  fifoTotalKgs: number;
  balanceTotalKgs: number;
  differenceKgs: number;
}> {
  const fifoTotalKgs = await sumWarehouseFifoRemainingValueKgs(tx, warehouseId);
  const balanceTotalKgs = await sumWarehouseBalanceInventoryValueKgs(tx, warehouseId);
  const differenceKgs = roundDisplayMoney(balanceTotalKgs - fifoTotalKgs);
  const ok = Math.abs(differenceKgs) <= toleranceKgs;
  return { ok, fifoTotalKgs, balanceTotalKgs, differenceKgs };
}

export type FifoBalanceParityIssue = {
  productId: string;
  balanceQuantity: number;
  fifoRemainingQuantity: number;
  balanceValueKgs: number;
  fifoRemainingValueKgs: number;
  reason:
    | 'QUANTITY_MISMATCH'
    | 'INVENTORY_WITHOUT_FIFO'
    | 'FIFO_WITHOUT_INVENTORY'
    | 'STALE_BALANCE_VALUE';
};

export async function inspectWarehouseFifoBalanceParity(
  tx: PrismaTx,
  warehouseId: string,
  toleranceKgs = 0,
): Promise<{
  ok: boolean;
  fifoTotalKgs: number;
  balanceTotalKgs: number;
  differenceKgs: number;
  issues: FifoBalanceParityIssue[];
}> {
  const balances = await tx.inventoryBalance.findMany({
    where: { warehouseId },
    select: {
      productId: true,
      quantity: true,
      totalValueKgs: true,
    },
  });
  const batches = await tx.fifoInventoryBatch.findMany({
    where: { warehouseId, remainingQuantity: { gt: 0 } },
    select: {
      id: true,
      productId: true,
      remainingQuantity: true,
      initialQuantity: true,
      unitCostKgs: true,
      stockMovementId: true,
    },
  });

  const fifoByProduct = new Map<string, FifoBatchRow[]>();
  for (const batch of batches) {
    const list = fifoByProduct.get(batch.productId) ?? [];
    list.push(batch);
    fifoByProduct.set(batch.productId, list);
  }

  const productIds = new Set<string>([
    ...balances.map((row) => row.productId),
    ...fifoByProduct.keys(),
  ]);
  const issues: FifoBalanceParityIssue[] = [];
  let fifoTotal = new Prisma.Decimal(0);
  let balanceTotal = new Prisma.Decimal(0);

  for (const productId of productIds) {
    const balance = balances.find((row) => row.productId === productId);
    const balanceQuantity = Math.max(0, Math.floor(Number(balance?.quantity ?? 0)));
    const balanceValueKgs =
      balanceQuantity > 0 ? roundDisplayMoney(balance?.totalValueKgs ?? 0) : 0;
    const productBatches = fifoByProduct.get(productId) ?? [];
    const fifoRemainingQuantity = productBatches.reduce(
      (sum, batch) => sum + Math.max(0, Math.floor(Number(batch.remainingQuantity))),
      0,
    );
    const layerTotals = await mapFifoLayerTotals(tx, productBatches);
    const fifoRemainingValueKgs = sumDisplayMoneyTotals(
      layerTotals.map((layer) =>
        computeLayerRemainingCostKgs(
          layer.layerTotalCostKgs,
          layer.layerBaseQuantity,
          layer.remainingQuantity,
        ),
      ),
    );

    if (balanceQuantity > 0) {
      balanceTotal = balanceTotal.plus(balanceValueKgs);
    }
    if (fifoRemainingQuantity > 0) {
      fifoTotal = fifoTotal.plus(fifoRemainingValueKgs);
    }

    if (balanceQuantity > 0 && fifoRemainingQuantity === 0) {
      issues.push({
        productId,
        balanceQuantity,
        fifoRemainingQuantity,
        balanceValueKgs,
        fifoRemainingValueKgs,
        reason: 'INVENTORY_WITHOUT_FIFO',
      });
      continue;
    }
    if (fifoRemainingQuantity > 0 && balanceQuantity === 0) {
      issues.push({
        productId,
        balanceQuantity,
        fifoRemainingQuantity,
        balanceValueKgs,
        fifoRemainingValueKgs,
        reason: 'FIFO_WITHOUT_INVENTORY',
      });
      continue;
    }
    if (balanceQuantity !== fifoRemainingQuantity) {
      issues.push({
        productId,
        balanceQuantity,
        fifoRemainingQuantity,
        balanceValueKgs,
        fifoRemainingValueKgs,
        reason: 'QUANTITY_MISMATCH',
      });
      continue;
    }
    if (Math.abs(roundDisplayMoney(balanceValueKgs - fifoRemainingValueKgs)) > toleranceKgs) {
      issues.push({
        productId,
        balanceQuantity,
        fifoRemainingQuantity,
        balanceValueKgs,
        fifoRemainingValueKgs,
        reason: 'STALE_BALANCE_VALUE',
      });
    }
  }

  const fifoTotalKgs = roundDisplayMoney(fifoTotal);
  const balanceTotalKgs = roundDisplayMoney(balanceTotal);
  const differenceKgs = roundDisplayMoney(balanceTotalKgs - fifoTotalKgs);
  return {
    ok: issues.length === 0 && Math.abs(differenceKgs) <= toleranceKgs,
    fifoTotalKgs,
    balanceTotalKgs,
    differenceKgs,
    issues,
  };
}

/**
 * Align cached InventoryBalance valuation with remaining active FIFO layers.
 * Does not change quantities, movements, receipts, transfers, or FIFO layers.
 */
export async function syncInventoryBalanceValuationFromFifoRemainingInTx(
  tx: PrismaTx,
  input: {
    warehouseId: string;
    productId: string;
    branchId: string;
  },
): Promise<{
  balanceId: string;
  quantity: number;
  oldTotalValueKgs: number;
  newTotalValueKgs: number;
  oldAverageCostKgs: number;
  newAverageCostKgs: number;
  changed: boolean;
} | null> {
  const balance = await tx.inventoryBalance.findUnique({
    where: {
      branchId_warehouseId_productId: {
        branchId: input.branchId,
        warehouseId: input.warehouseId,
        productId: input.productId,
      },
    },
    select: {
      id: true,
      quantity: true,
      totalValueKgs: true,
      averageCostKgs: true,
      landedCostKgs: true,
    },
  });
  if (!balance) return null;

  const quantity = Math.max(0, Math.floor(Number(balance.quantity)));
  const newTotalValueKgs =
    quantity > 0
      ? await sumProductFifoRemainingValueKgs(tx, input.warehouseId, input.productId)
      : 0;
  const newAverageCostKgs =
    quantity > 0 ? deriveDisplayUnitCost(newTotalValueKgs, quantity) : 0;
  const oldTotalValueKgs = roundDisplayMoney(balance.totalValueKgs ?? 0);
  const oldAverageCostKgs = roundDisplayMoney(balance.averageCostKgs ?? 0);
  const changed =
    oldTotalValueKgs !== newTotalValueKgs ||
    (quantity > 0 && oldAverageCostKgs !== newAverageCostKgs) ||
    (quantity === 0 && oldTotalValueKgs !== 0);

  if (changed) {
    await tx.inventoryBalance.update({
      where: { id: balance.id },
      data: {
        totalValueKgs: newTotalValueKgs,
        averageCostKgs: newAverageCostKgs,
        ...(quantity > 0 ? { landedCostKgs: newAverageCostKgs } : {}),
      },
    });
  }

  return {
    balanceId: balance.id,
    quantity,
    oldTotalValueKgs,
    newTotalValueKgs,
    oldAverageCostKgs,
    newAverageCostKgs,
    changed,
  };
}

/**
 * Repair stale cached HQ inventory values when quantity parity with active FIFO holds.
 * Hard-fails real structural mismatches (qty without FIFO, qty mismatch, etc.).
 */
export async function reconcileWarehouseInventoryFifoParityInTx(
  tx: PrismaTx,
  input: {
    warehouseId: string;
    userId?: string;
    userRole?: string;
    entity?: string;
    entityId?: string;
    reason?: string;
  },
): Promise<{
  ok: boolean;
  fifoTotalKgs: number;
  balanceTotalKgs: number;
  differenceKgs: number;
  repaired: Array<{
    productId: string;
    oldTotalValueKgs: number;
    newTotalValueKgs: number;
    differenceKgs: number;
  }>;
  blockingIssues: FifoBalanceParityIssue[];
}> {
  const inspection = await inspectWarehouseFifoBalanceParity(tx, input.warehouseId);
  const blockingIssues = inspection.issues.filter((issue) => issue.reason !== 'STALE_BALANCE_VALUE');
  if (blockingIssues.length > 0) {
    return {
      ok: false,
      fifoTotalKgs: inspection.fifoTotalKgs,
      balanceTotalKgs: inspection.balanceTotalKgs,
      differenceKgs: inspection.differenceKgs,
      repaired: [],
      blockingIssues,
    };
  }

  const staleIssues = inspection.issues.filter((issue) => issue.reason === 'STALE_BALANCE_VALUE');
  const repaired: Array<{
    productId: string;
    oldTotalValueKgs: number;
    newTotalValueKgs: number;
    differenceKgs: number;
  }> = [];

  for (const issue of staleIssues) {
    const balance = await tx.inventoryBalance.findFirst({
      where: { warehouseId: input.warehouseId, productId: issue.productId },
      select: { branchId: true },
    });
    if (!balance) continue;
    const synced = await syncInventoryBalanceValuationFromFifoRemainingInTx(tx, {
      warehouseId: input.warehouseId,
      productId: issue.productId,
      branchId: balance.branchId,
    });
    if (!synced?.changed) continue;

    const differenceKgs = roundDisplayMoney(synced.newTotalValueKgs - synced.oldTotalValueKgs);
    repaired.push({
      productId: issue.productId,
      oldTotalValueKgs: synced.oldTotalValueKgs,
      newTotalValueKgs: synced.newTotalValueKgs,
      differenceKgs,
    });

    if (input.userId) {
      await tx.auditLog.create({
        data: {
          userId: input.userId,
          role: input.userRole ?? 'SYSTEM',
          action: 'FIFO_REMAINING_VALUE_RECONCILED',
          entity: input.entity ?? 'InventoryBalance',
          entityId: synced.balanceId,
          metadata: {
            warehouseId: input.warehouseId,
            productId: issue.productId,
            fifoLayerRepair: true,
            oldRemainingValue: synced.oldTotalValueKgs,
            correctedRemainingValue: synced.newTotalValueKgs,
            difference: differenceKgs,
            reason: input.reason ?? 'stale_balance_value_after_fifo_consumption',
            repairedBy: input.userId,
            repairedAt: new Date().toISOString(),
          },
        },
      });
      await tx.auditLog.create({
        data: {
          userId: input.userId,
          role: input.userRole ?? 'SYSTEM',
          action: 'HQ_INVENTORY_FIFO_PARITY_REPAIRED',
          entity: input.entity ?? 'Warehouse',
          entityId: input.entityId ?? input.warehouseId,
          metadata: {
            warehouseId: input.warehouseId,
            productId: issue.productId,
            balanceId: synced.balanceId,
            oldRemainingValue: synced.oldTotalValueKgs,
            correctedRemainingValue: synced.newTotalValueKgs,
            difference: differenceKgs,
            reason: input.reason ?? 'stale_balance_value_after_fifo_consumption',
            repairedBy: input.userId,
            repairedAt: new Date().toISOString(),
          },
        },
      });
    }
  }

  const after = await compareWarehouseInventoryValuation(tx, input.warehouseId);
  return {
    ok: after.ok,
    fifoTotalKgs: after.fifoTotalKgs,
    balanceTotalKgs: after.balanceTotalKgs,
    differenceKgs: after.differenceKgs,
    repaired,
    blockingIssues: [],
  };
}
