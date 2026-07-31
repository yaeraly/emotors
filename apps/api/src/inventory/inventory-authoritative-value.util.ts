import type { Prisma } from '@prisma/client';
import {
  allocateProportionalCost,
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
    const layerBaseQuantity =
      batch.initialQuantity > 0
        ? batch.initialQuantity
        : movement
          ? Math.abs(Number(movement.quantity))
          : batch.remainingQuantity;
    const layerTotalCostKgs =
      movement && Number(movement.totalCostKgs) > 0
        ? Number(movement.totalCostKgs)
        : Number(batch.unitCostKgs) * layerBaseQuantity;
    return {
      remainingQuantity: batch.remainingQuantity,
      layerTotalCostKgs,
      layerBaseQuantity,
    };
  });
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
    allocateProportionalCost(
      layer.layerTotalCostKgs,
      layer.layerBaseQuantity,
      layer.remainingQuantity,
    ),
  );
  return sumDisplayMoneyTotals(lineValues.map((value) => roundDisplayMoney(value)));
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
    allocateProportionalCost(
      layer.layerTotalCostKgs,
      layer.layerBaseQuantity,
      layer.remainingQuantity,
    ),
  );
  return sumDisplayMoneyTotals(lineValues.map((value) => roundDisplayMoney(value)));
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
    if (oldest.costPriceKgs > 0) {
      return {
        unitCostKgs: roundDisplayMoney(oldest.costPriceKgs),
        authoritativeSystemValueKgs,
      };
    }
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
  const differenceValue = roundDisplayMoney(fifoPreview.totalCostKgs);
  return diffQty > 0 ? differenceValue : roundDisplayMoney(-differenceValue);
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
