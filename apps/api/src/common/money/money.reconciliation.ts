import {
  assertAllocationReconciles,
  assertMoneyEqual,
  consumeFifoLayerSequence,
  distributeMoneyToTarget,
  isMoneyEqual,
  multiplyCnyByRate,
  remainingFifoLayerMoney,
  roundMoneyKgs,
  subtractMoney,
  sumMoney,
  toMoneyDecimal,
  toStoredMoneyKgs,
  type MoneyInput,
} from './money';

export type MoneyChainSnapshot = {
  procurementFinalCostKgs: number;
  allocatedItemCostsKgs: number;
  hqFifoCreatedKgs: number;
  hqFifoConsumedKgs: number;
  hqBranchTransferKgs: number;
  branchFifoCreatedKgs: number;
  branchInventoryValueKgs: number;
};

export type MoneyChainReconciliation = {
  ok: boolean;
  differences: Array<{ stage: string; expected: number; actual: number }>;
  snapshot: MoneyChainSnapshot;
};

/** Detect-only: never mutates. Fails closed when any stage differs. */
export function reconcileMoneyChain(snapshot: MoneyChainSnapshot): MoneyChainReconciliation {
  const differences: MoneyChainReconciliation['differences'] = [];
  const pairs: Array<[string, number, number]> = [
    ['procurement.allocated', snapshot.procurementFinalCostKgs, snapshot.allocatedItemCostsKgs],
    ['hqFifo.created', snapshot.allocatedItemCostsKgs, snapshot.hqFifoCreatedKgs],
    ['hqFifo.consumed', snapshot.hqFifoConsumedKgs, snapshot.hqBranchTransferKgs],
    ['branchFifo.created', snapshot.hqBranchTransferKgs, snapshot.branchFifoCreatedKgs],
    ['branchInventory.value', snapshot.branchFifoCreatedKgs, snapshot.branchInventoryValueKgs],
  ];
  for (const [stage, expected, actual] of pairs) {
    if (!isMoneyEqual(expected, actual)) {
      differences.push({
        stage,
        expected: toStoredMoneyKgs(expected),
        actual: toStoredMoneyKgs(actual),
      });
    }
  }
  return { ok: differences.length === 0, differences, snapshot };
}

export function assertMoneyChainReconciles(snapshot: MoneyChainSnapshot): void {
  const result = reconcileMoneyChain(snapshot);
  if (!result.ok) {
    const detail = result.differences
      .map((row) => `${row.stage}: ${row.expected} != ${row.actual}`)
      .join('; ');
    throw new Error(`Money chain reconciliation failed: ${detail}`);
  }
}

/** Detect-only: procurement landed total vs allocated item costs. */
export function reconcileProcurement(input: {
  procurementId?: string;
  procurementFinalCostKgs: MoneyInput;
  allocatedItemCostsKgs: MoneyInput[];
}): { ok: boolean; differenceKgs: number; procurementId?: string } {
  const allocated = sumMoney(input.allocatedItemCostsKgs);
  return {
    ok: isMoneyEqual(input.procurementFinalCostKgs, allocated),
    differenceKgs: toStoredMoneyKgs(subtractMoney(input.procurementFinalCostKgs, allocated)),
    procurementId: input.procurementId,
  };
}

/** Detect-only: HQ FIFO consumed vs HQ→Branch transfer vs distribution snapshot. */
export function reconcileDistribution(input: {
  orderId?: string;
  hqFifoConsumedKgs: MoneyInput;
  hqBranchTransferKgs: MoneyInput;
  distributionOrderTransferKgs?: MoneyInput;
}): { ok: boolean; differenceKgs: number; orderId?: string } {
  const transfer = input.distributionOrderTransferKgs ?? input.hqBranchTransferKgs;
  const ok =
    isMoneyEqual(input.hqFifoConsumedKgs, input.hqBranchTransferKgs) &&
    isMoneyEqual(input.hqBranchTransferKgs, transfer);
  return {
    ok,
    differenceKgs: toStoredMoneyKgs(subtractMoney(input.hqFifoConsumedKgs, transfer)),
    orderId: input.orderId,
  };
}

export function reconcileHqBranchBprToFifo(input: {
  fifoLineCostsKgs: MoneyInput[];
  bprLineTotalsKgs: MoneyInput[];
  bprHeaderTotalKgs: MoneyInput;
}): { ok: boolean; differenceKgs: number } {
  const fifo = sumMoney(input.fifoLineCostsKgs);
  const lines = sumMoney(input.bprLineTotalsKgs);
  const header = toMoneyDecimal(input.bprHeaderTotalKgs);
  const ok = isMoneyEqual(fifo, lines) && isMoneyEqual(lines, header);
  return {
    ok,
    differenceKgs: toStoredMoneyKgs(subtractMoney(fifo, header)),
  };
}

export function reconcileBranchInventory(input: {
  branchId?: string;
  hqBranchTransferKgs: MoneyInput;
  branchFifoCreatedKgs: MoneyInput;
  branchInventoryValueKgs: MoneyInput;
}): { ok: boolean; differenceKgs: number; branchId?: string } {
  const ok =
    isMoneyEqual(input.hqBranchTransferKgs, input.branchFifoCreatedKgs) &&
    isMoneyEqual(input.branchFifoCreatedKgs, input.branchInventoryValueKgs);
  return {
    ok,
    differenceKgs: toStoredMoneyKgs(
      subtractMoney(input.hqBranchTransferKgs, input.branchInventoryValueKgs),
    ),
    branchId: input.branchId,
  };
}

export {
  assertAllocationReconciles,
  assertMoneyEqual,
  consumeFifoLayerSequence,
  distributeMoneyToTarget,
  multiplyCnyByRate,
  remainingFifoLayerMoney,
  roundMoneyKgs,
  sumMoney,
};
