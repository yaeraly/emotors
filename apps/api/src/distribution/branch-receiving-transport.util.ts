export type BranchReceivingTransportLineInput = {
  productId: string;
  receivedQuantity: number;
  weightKg: number;
  unitCostKgs: number;
};

export type BranchReceivingTransportLineCost = {
  productId: string;
  transportExpenseAllocation: number;
  transportCostPerUnit: number;
  finalUnitCostKgs: number;
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function allocateBranchReceivingTransportCost(
  items: BranchReceivingTransportLineInput[],
  transportCostKgs: number,
): BranchReceivingTransportLineCost[] {
  const receivedLines = items.filter((item) => item.receivedQuantity > 0);
  if (!receivedLines.length) return [];

  const safeTransport = Math.max(Number(transportCostKgs) || 0, 0);
  const lineWeights = receivedLines.map((item) => {
    const unitWeight = Number(item.weightKg) > 0 ? Number(item.weightKg) : 0;
    const lineWeight = unitWeight > 0 ? unitWeight * item.receivedQuantity : 0;
    return { productId: item.productId, lineWeight, receivedQuantity: item.receivedQuantity };
  });
  const totalWeight = lineWeights.reduce((sum, row) => sum + row.lineWeight, 0);
  const totalQuantity = receivedLines.reduce((sum, item) => sum + item.receivedQuantity, 0);

  return receivedLines.map((item) => {
    const weightRow = lineWeights.find((row) => row.productId === item.productId);
    const lineWeight = weightRow?.lineWeight ?? 0;
    let share = 0;
    if (safeTransport > 0) {
      if (totalWeight > 0 && lineWeight > 0) {
        share = lineWeight / totalWeight;
      } else if (totalQuantity > 0) {
        share = item.receivedQuantity / totalQuantity;
      }
    }

    const transportExpenseAllocation = roundMoney(safeTransport * share);
    const transportCostPerUnit =
      item.receivedQuantity > 0 ? transportExpenseAllocation / item.receivedQuantity : 0;
    const finalUnitCostKgs = roundMoney(Number(item.unitCostKgs) + transportCostPerUnit);

    return {
      productId: item.productId,
      transportExpenseAllocation,
      transportCostPerUnit: roundMoney(transportCostPerUnit),
      finalUnitCostKgs,
    };
  });
}
