import { toExactMoney, toMoneyDecimal, type MoneyInput } from '../common/money/money';
import {
  allocateProportionalCostExact,
  deriveExactUnitCost,
  roundDisplayMoney,
} from './product-cost-precision.util';

export type HqAllocationReceiveLine = {
  allocationId: string;
  hqFifoLayerId: string;
  quantity: number;
  transferUnitCostKgs: number;
  transportCostPerUnit: number;
  finalBranchUnitCostKgs: number;
  /** Authoritative branch receive line total (transfer + transport), not unit×qty. */
  lineTotalCostKgs: number;
  authoritativeLineTotal: ReturnType<typeof toExactMoney>;
};

/**
 * Build branch receive lines from HQ distribution FIFO allocations (oldest first).
 * When accepted quantity is less than dispatched, depletes allocations in FIFO order.
 */
export function buildBranchReceiveLinesFromHqAllocations(
  allocations: Array<{
    id: string;
    fifoBatchId: string;
    quantity: number;
    unitCostKgs: number | MoneyInput;
    totalCostKgs?: MoneyInput;
  }>,
  acceptedQuantity: number,
  transportCostPerUnit = 0,
): HqAllocationReceiveLine[] {
  const safeAccepted = Math.max(0, acceptedQuantity);
  if (safeAccepted <= 0 || !allocations.length) return [];

  let remaining = safeAccepted;
  const lines: HqAllocationReceiveLine[] = [];

  for (const row of allocations) {
    if (remaining <= 0) break;
    const take = Math.min(Math.max(0, row.quantity), remaining);
    if (take <= 0) continue;

    const transferUnitCostKgs = Number(toExactMoney(row.unitCostKgs).toFixed(15));
    const transport = roundDisplayMoney(Number(transportCostPerUnit));
    const authoritativeAllocationTotal = toMoneyDecimal(row.totalCostKgs ?? 0);
    // Full remaining allocation: keep exact HQ consumed total (preserves layer remainders).
    // Partial take: proportional Decimal share of that authoritative total.
    const allocationLineTotal = authoritativeAllocationTotal.gt(0)
      ? take >= row.quantity
        ? authoritativeAllocationTotal
        : allocateProportionalCostExact(authoritativeAllocationTotal, row.quantity, take)
      : toMoneyDecimal(row.unitCostKgs).mul(take);
    const transportLineTotal = toMoneyDecimal(transport).mul(take);
    const lineTotalExact = toExactMoney(allocationLineTotal.plus(transportLineTotal));
    const lineTotalCostKgs = Number(lineTotalExact.toFixed(15));
    const finalBranchUnitCostKgs = Number(deriveExactUnitCost(lineTotalExact, take).toFixed(15));

    lines.push({
      allocationId: row.id,
      hqFifoLayerId: row.fifoBatchId,
      quantity: take,
      transferUnitCostKgs,
      transportCostPerUnit: transport,
      finalBranchUnitCostKgs,
      lineTotalCostKgs,
      authoritativeLineTotal: lineTotalExact,
    });
    remaining -= take;
  }

  return lines;
}
