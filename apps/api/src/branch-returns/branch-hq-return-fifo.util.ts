import {
  allocateLayerConsumptionCost,
  deriveDisplayUnitCost,
  roundDisplayMoney,
  sumDisplayMoneyTotals,
} from '../pricing/product-cost-precision.util';

export type BranchHqReturnFifoLayerInput = {
  batchId: string;
  remainingQuantity: number;
  reservedQuantity?: number;
  unitCostKgs: number;
  /** Authoritative layer total cost for initialQuantity when available. */
  layerTotalCostKgs?: number;
  initialQuantity?: number;
  sourceReferenceType?: string | null;
  sourceReferenceId?: string | null;
};

export type BranchHqReturnFifoConsumeLine = {
  batchId: string;
  quantity: number;
  unitCostKgs: number;
  totalCostKgs: number;
  sourceReferenceType?: string | null;
  sourceReferenceId?: string | null;
};

export type BranchHqReturnFifoConsumeResult = {
  lines: BranchHqReturnFifoConsumeLine[];
  allocatedQty: number;
  totalCostKgs: number;
  unitCostKgs: number;
};

/**
 * Preview Branch FIFO consumption for a return quantity (oldest first).
 * Uses authoritative layer cost allocation — never invents/falls back to zero cost.
 */
export function previewBranchHqReturnFifoConsumption(
  layers: BranchHqReturnFifoLayerInput[],
  quantity: number,
  options?: { subtractReserved?: boolean },
): BranchHqReturnFifoConsumeResult {
  const requested = Math.max(0, Math.floor(Number(quantity)));
  const subtractReserved = options?.subtractReserved !== false;
  if (requested <= 0) {
    return { lines: [], allocatedQty: 0, totalCostKgs: 0, unitCostKgs: 0 };
  }

  let remaining = requested;
  const lines: BranchHqReturnFifoConsumeLine[] = [];
  const lineTotals: number[] = [];

  for (const layer of layers) {
    if (remaining <= 0) break;
    const reserved = Math.max(0, Number(layer.reservedQuantity ?? 0));
    const remainingQty = Math.max(0, Math.floor(Number(layer.remainingQuantity)));
    const available = subtractReserved ? Math.max(0, remainingQty - reserved) : remainingQty;
    const take = Math.min(available, remaining);
    if (take <= 0) continue;

    const baseQty =
      Math.max(0, Math.floor(Number(layer.initialQuantity ?? 0))) || remainingQty || take;
    const layerTotal =
      Number(layer.layerTotalCostKgs ?? 0) > 0
        ? Number(layer.layerTotalCostKgs)
        : roundDisplayMoney(Number(layer.unitCostKgs) * baseQty);

    if (!(layerTotal > 0) || !(Number(layer.unitCostKgs) > 0)) {
      throw new Error(
        `Missing authoritative FIFO cost for layer ${layer.batchId}. Return shipment is blocked until inventory cost lineage is fixed.`,
      );
    }

    const totalCostKgs = allocateLayerConsumptionCost({
      layerTotalCostKgs: layerTotal,
      layerBaseQuantity: baseQty,
      remainingQuantity: remainingQty,
      takeQuantity: take,
    });
    if (!(totalCostKgs > 0)) {
      throw new Error(
        `FIFO layer ${layer.batchId} produced zero return cost. Return shipment is blocked.`,
      );
    }

    lines.push({
      batchId: layer.batchId,
      quantity: take,
      unitCostKgs: roundDisplayMoney(Number(layer.unitCostKgs)),
      totalCostKgs,
      sourceReferenceType: layer.sourceReferenceType ?? null,
      sourceReferenceId: layer.sourceReferenceId ?? null,
    });
    lineTotals.push(totalCostKgs);
    remaining -= take;
  }

  const allocatedQty = requested - remaining;
  const totalCostKgs = sumDisplayMoneyTotals(lineTotals);
  return {
    lines,
    allocatedQty,
    totalCostKgs,
    unitCostKgs: deriveDisplayUnitCost(totalCostKgs, allocatedQty),
  };
}

/**
 * Split previously consumed return FIFO allocations into HQ receive layers for a received qty.
 * Preserves per-layer costs; does not average.
 */
export function buildHqReturnedFifoLayersFromConsumedAllocations(
  allocations: Array<{
    id: string;
    fifoBatchId: string;
    quantity: number;
    unitCostKgs: number;
    totalCostKgs: number;
    sourceReferenceType?: string | null;
    sourceReferenceId?: string | null;
  }>,
  receivedQuantity: number,
): Array<{
  allocationId: string;
  sourceFifoBatchId: string;
  quantity: number;
  unitCostKgs: number;
  totalCostKgs: number;
  sourceReferenceType?: string | null;
  sourceReferenceId?: string | null;
}> {
  const safeReceived = Math.max(0, Math.floor(Number(receivedQuantity)));
  if (safeReceived <= 0 || !allocations.length) return [];

  let remaining = safeReceived;
  const lines: Array<{
    allocationId: string;
    sourceFifoBatchId: string;
    quantity: number;
    unitCostKgs: number;
    totalCostKgs: number;
    sourceReferenceType?: string | null;
    sourceReferenceId?: string | null;
  }> = [];

  for (const row of allocations) {
    if (remaining <= 0) break;
    const take = Math.min(Math.max(0, row.quantity), remaining);
    if (take <= 0) continue;

    const authoritativeTotal = Number(row.totalCostKgs);
    const totalCostKgs =
      take >= row.quantity
        ? roundDisplayMoney(authoritativeTotal)
        : roundDisplayMoney(
            allocateLayerConsumptionCost({
              layerTotalCostKgs: authoritativeTotal,
              layerBaseQuantity: row.quantity,
              remainingQuantity: row.quantity,
              takeQuantity: take,
            }),
          );

    lines.push({
      allocationId: row.id,
      sourceFifoBatchId: row.fifoBatchId,
      quantity: take,
      unitCostKgs: roundDisplayMoney(Number(row.unitCostKgs)),
      totalCostKgs,
      sourceReferenceType: row.sourceReferenceType ?? null,
      sourceReferenceId: row.sourceReferenceId ?? null,
    });
    remaining -= take;
  }

  return lines;
}

export function isNonSaleableBranchHqReturnCondition(condition: string | null | undefined) {
  return condition === 'DEFECTIVE' || condition === 'DAMAGED' || condition === 'USED';
}

export function hqStockMovementTypeForReturnCondition(condition: string | null | undefined) {
  if (condition === 'DEFECTIVE' || condition === 'DAMAGED') {
    return 'DEFECTIVE_IN' as const;
  }
  return 'IN' as const;
}

export function hqFifoReferenceTypeForReturnCondition(condition: string | null | undefined) {
  if (condition === 'DEFECTIVE') return 'BRANCH_HQ_RETURN_DEFECTIVE';
  if (condition === 'DAMAGED') return 'BRANCH_HQ_RETURN_DAMAGED';
  if (condition === 'USED') return 'BRANCH_HQ_RETURN_USED';
  return 'BRANCH_HQ_RETURN';
}
