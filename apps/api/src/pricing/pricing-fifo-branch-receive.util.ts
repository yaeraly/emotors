export type HqAllocationReceiveLine = {
  allocationId: string;
  hqFifoLayerId: string;
  quantity: number;
  transferUnitCostKgs: number;
  transportCostPerUnit: number;
  finalBranchUnitCostKgs: number;
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

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

    const transferUnitCostKgs = roundMoney(Number(row.unitCostKgs));
    const transport = roundMoney(Number(transportCostPerUnit));
    lines.push({
      allocationId: row.id,
      hqFifoLayerId: row.fifoBatchId,
      quantity: take,
      transferUnitCostKgs,
      transportCostPerUnit: transport,
      finalBranchUnitCostKgs: roundMoney(transferUnitCostKgs + transport),
    });
    remaining -= take;
  }

  return lines;
}
