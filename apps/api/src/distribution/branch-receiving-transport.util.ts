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

  const rawAllocations = receivedLines.map((item) => {
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
      lineWeight,
    };
  });

  if (safeTransport <= 0) {
    return rawAllocations.map(({ lineWeight: _lineWeight, ...row }) => row);
  }

  const allocatedTotal = rawAllocations.reduce((sum, row) => sum + row.transportExpenseAllocation, 0);
  const remainder = roundMoney(safeTransport - allocatedTotal);
  if (remainder !== 0) {
    const largestLine = [...rawAllocations].sort((a, b) => {
      if (b.lineWeight !== a.lineWeight) return b.lineWeight - a.lineWeight;
      return a.productId.localeCompare(b.productId);
    })[0];
    if (largestLine) {
      const sourceLine = receivedLines.find((line) => line.productId === largestLine.productId);
      largestLine.transportExpenseAllocation = roundMoney(
        largestLine.transportExpenseAllocation + remainder,
      );
      largestLine.transportCostPerUnit = roundMoney(
        sourceLine && sourceLine.receivedQuantity > 0
          ? largestLine.transportExpenseAllocation / sourceLine.receivedQuantity
          : 0,
      );
      largestLine.finalUnitCostKgs = roundMoney(
        Number(sourceLine?.unitCostKgs ?? 0) + largestLine.transportCostPerUnit,
      );
    }
  }

  return rawAllocations.map(({ lineWeight: _lineWeight, ...row }) => row);
}
