export type BranchProductRequestLineInput = {
  productId: string;
  quantity: number;
  weightKg: number;
};

export type BranchProductRequestLineCost = {
  productId: string;
  transportExpenseAllocation: number;
  estimatedUnitCost: number;
  totalAmount: number;
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function allocateBranchRequestTransportCost(
  items: BranchProductRequestLineInput[],
  wholesalePrices: Map<string, number>,
  transportCostKgs: number,
): BranchProductRequestLineCost[] {
  const safeTransport = Math.max(Number(transportCostKgs) || 0, 0);
  if (!items.length) return [];

  const lineWeights = items.map((item) => {
    const unitWeight = Number(item.weightKg) > 0 ? Number(item.weightKg) : 0;
    const lineWeight = unitWeight > 0 ? unitWeight * item.quantity : 0;
    return { productId: item.productId, lineWeight, quantity: item.quantity };
  });

  const totalWeight = lineWeights.reduce((sum, row) => sum + row.lineWeight, 0);
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

  return items.map((item) => {
    const weightRow = lineWeights.find((row) => row.productId === item.productId);
    const lineWeight = weightRow?.lineWeight ?? 0;
    let share = 0;
    if (safeTransport > 0) {
      if (totalWeight > 0 && lineWeight > 0) {
        share = lineWeight / totalWeight;
      } else if (totalQuantity > 0) {
        share = item.quantity / totalQuantity;
      }
    }

    const transportExpenseAllocation = roundMoney(safeTransport * share);
    const wholesalePrice = wholesalePrices.get(item.productId) ?? 0;
    const allocatedPerUnit = item.quantity > 0 ? transportExpenseAllocation / item.quantity : 0;
    const estimatedUnitCost = roundMoney(wholesalePrice + allocatedPerUnit);
    const totalAmount = roundMoney(estimatedUnitCost * item.quantity);

    return {
      productId: item.productId,
      transportExpenseAllocation,
      estimatedUnitCost,
      totalAmount,
    };
  });
}

export function isSubmittedBranchPurchaseStatus(status: string) {
  return status === 'SUBMITTED' || status === 'SUBMITTED_TO_HQ';
}
