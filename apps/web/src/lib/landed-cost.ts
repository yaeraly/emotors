export type LogisticsCosts = {
  chinaDomesticTransportKgs: number;
  chinaExportTransportKgs: number;
  localTransportKgs: number;
  packagingCostKgs: number;
  customsCostKgs: number;
  insuranceCostKgs: number;
  bankFeeCostKgs: number;
  otherExpenseKgs: number;
};

export type LandedCostItemInput = {
  quantity: number;
  receivedQuantity?: number | null;
  purchasePriceYuan: number;
  yuanRate: number;
  weightKg: number;
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundWeight(value: number) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

function roundRate(value: number) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

function allocateByWeight(totalCost: number, itemWeight: number, totalWeight: number) {
  if (totalCost <= 0 || itemWeight <= 0 || totalWeight <= 0) return 0;
  return roundMoney((totalCost * itemWeight) / totalWeight);
}

export function calculateLandedCosts(items: LandedCostItemInput[], logistics: LogisticsCosts) {
  const prepared = items.map((item) => {
    const effectiveQuantity = Math.max(
      0,
      item.receivedQuantity != null && item.receivedQuantity >= 0 ? item.receivedQuantity : item.quantity,
    );
    const totalWeightKg = roundWeight(effectiveQuantity * Number(item.weightKg || 0));
    const costKgs = roundMoney(Number(item.purchasePriceYuan || 0) * Number(item.yuanRate || 0));
    return { ...item, effectiveQuantity, totalWeightKg, costKgs };
  });
  const totalWeightKg = roundWeight(prepared.reduce((sum, item) => sum + item.totalWeightKg, 0));
  const totalLogisticsCost = roundMoney(
    Number(logistics.chinaDomesticTransportKgs || 0) +
      Number(logistics.chinaExportTransportKgs || 0) +
      Number(logistics.localTransportKgs || 0) +
      Number(logistics.packagingCostKgs || 0) +
      Number(logistics.customsCostKgs || 0) +
      Number(logistics.insuranceCostKgs || 0) +
      Number(logistics.bankFeeCostKgs || 0) +
      Number(logistics.otherExpenseKgs || 0),
  );
  const costPerKg = totalWeightKg > 0 ? roundRate(totalLogisticsCost / totalWeightKg) : 0;
  const calculatedItems = prepared.map((item) => {
    const chinaDomesticAllocKgs = allocateByWeight(logistics.chinaDomesticTransportKgs, item.totalWeightKg, totalWeightKg);
    const chinaExportAllocKgs = allocateByWeight(logistics.chinaExportTransportKgs, item.totalWeightKg, totalWeightKg);
    const localTransportAllocKgs = allocateByWeight(logistics.localTransportKgs, item.totalWeightKg, totalWeightKg);
    const packagingAllocKgs = allocateByWeight(logistics.packagingCostKgs, item.totalWeightKg, totalWeightKg);
    const customsAllocKgs = allocateByWeight(logistics.customsCostKgs, item.totalWeightKg, totalWeightKg);
    const insuranceAllocKgs = allocateByWeight(logistics.insuranceCostKgs, item.totalWeightKg, totalWeightKg);
    const bankFeeAllocKgs = allocateByWeight(logistics.bankFeeCostKgs, item.totalWeightKg, totalWeightKg);
    const otherAllocKgs = allocateByWeight(logistics.otherExpenseKgs, item.totalWeightKg, totalWeightKg);
    const totalLineLogistics = roundMoney(
      chinaDomesticAllocKgs + chinaExportAllocKgs + localTransportAllocKgs + packagingAllocKgs +
      customsAllocKgs + insuranceAllocKgs + bankFeeAllocKgs + otherAllocKgs,
    );
    const effectiveQty = item.effectiveQuantity > 0 ? item.effectiveQuantity : 1;
    const transportCostKgs = roundMoney(totalLineLogistics / effectiveQty);
    const finalCostKgs = roundMoney(item.costKgs + transportCostKgs);
    return {
      ...item,
      chinaDomesticAllocKgs,
      chinaExportAllocKgs,
      localTransportAllocKgs,
      packagingAllocKgs,
      customsAllocKgs,
      insuranceAllocKgs,
      bankFeeAllocKgs,
      otherAllocKgs,
      transportCostKgs,
      finalCostKgs,
      totalYuan: roundMoney(item.quantity * Number(item.purchasePriceYuan || 0)),
      totalCostKgs: roundMoney(finalCostKgs * effectiveQty),
    };
  });
  return {
    items: calculatedItems,
    totalYuan: roundMoney(calculatedItems.reduce((sum, item) => sum + item.totalYuan, 0)),
    totalTransportCostKgs: totalLogisticsCost,
    totalCostKgs: roundMoney(calculatedItems.reduce((sum, item) => sum + item.totalCostKgs, 0)),
    totalWeightKg,
    costPerKg,
  };
}
