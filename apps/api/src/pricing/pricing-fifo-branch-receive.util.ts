import {
  allocateProportionalCost,
  deriveDisplayUnitCost,
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
    unitCostKgs: number;
    totalCostKgs?: number;
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

    const transferUnitCostKgs = roundDisplayMoney(Number(row.unitCostKgs));
    const transport = roundDisplayMoney(Number(transportCostPerUnit));
    const authoritativeAllocationTotal = Number(row.totalCostKgs ?? 0);
    // Full remaining allocation: keep exact HQ consumed total (preserves layer remainders).
    // Partial take: proportional Decimal share of that authoritative total.
    const allocationLineTotal =
      authoritativeAllocationTotal > 0
        ? take >= row.quantity
          ? roundDisplayMoney(authoritativeAllocationTotal)
          : roundDisplayMoney(
              allocateProportionalCost(authoritativeAllocationTotal, row.quantity, take),
            )
        : roundDisplayMoney(transferUnitCostKgs * take);
    const transportLineTotal = roundDisplayMoney(transport * take);
    const lineTotalCostKgs = roundDisplayMoney(allocationLineTotal + transportLineTotal);
    const finalBranchUnitCostKgs = deriveDisplayUnitCost(lineTotalCostKgs, take);

    lines.push({
      allocationId: row.id,
      hqFifoLayerId: row.fifoBatchId,
      quantity: take,
      transferUnitCostKgs,
      transportCostPerUnit: transport,
      finalBranchUnitCostKgs,
      lineTotalCostKgs,
    });
    remaining -= take;
  }

  return lines;
}
