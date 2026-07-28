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

export type CargoConfig = {
  usdRate: number;
  cargoRateUsdPerKg: number;
  cargoTotalWeightKg?: number | null;
};

export type LandedCostItemInput = {
  quantity: number;
  receivedQuantity?: number | null;
  purchasePriceYuan: number;
  yuanRate: number;
  weightKg: number;
};

export type LandedCostItemResult = LandedCostItemInput & {
  effectiveQuantity: number;
  netWeightKg: number;
  packagingWeightKg: number;
  unitShipmentWeightKg: number;
  lineNetWeightKg: number;
  linePackagingWeightKg: number;
  lineShipmentWeightKg: number;
  costKgs: number;
  totalWeightKg: number;
  chinaDomesticAllocKgs: number;
  chinaExportAllocKgs: number;
  localTransportAllocKgs: number;
  packagingAllocKgs: number;
  customsAllocKgs: number;
  insuranceAllocKgs: number;
  bankFeeAllocKgs: number;
  otherAllocKgs: number;
  transportCostKgs: number;
  finalCostKgs: number;
  totalYuan: number;
  totalCostKgs: number;
};

export type LandedCostOrderResult = {
  items: LandedCostItemResult[];
  totalYuan: number;
  totalTransportCostKgs: number;
  totalCostKgs: number;
  totalNetWeightKg: number;
  totalPackagingWeightKg: number;
  totalShipmentWeightKg: number;
  totalWeightKg: number;
  totalCargoCostUsd: number;
  totalCargoCostKgs: number;
  costPerKg: number;
  isEstimated: boolean;
};

export type LandedCostCalculationOptions = {
  cargo?: CargoConfig;
};

export const CARGO_WEIGHT_LESS_THAN_NET = 'CARGO_WEIGHT_LESS_THAN_NET';

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

function distributeRoundedAmounts(rawAmounts: number[], targetTotal: number): number[] {
  if (rawAmounts.length === 0) return [];
  const rounded = rawAmounts.map((amount) => roundMoney(amount));
  const sum = roundMoney(rounded.reduce((total, amount) => total + amount, 0));
  const remainder = roundMoney(targetTotal - sum);
  if (remainder === 0) return rounded;

  for (let index = rounded.length - 1; index >= 0; index -= 1) {
    if (rawAmounts[index] > 0 || rounded[index] > 0) {
      rounded[index] = roundMoney(rounded[index] + remainder);
      break;
    }
  }

  return rounded;
}

function sumRoundedMoney(values: number[]) {
  return roundMoney(values.reduce((sum, value) => sum + value, 0));
}

export function extractCargoConfig(source: Partial<CargoConfig> | Record<string, unknown>): CargoConfig {
  return {
    usdRate: Number((source as CargoConfig).usdRate ?? (source as Record<string, unknown>).defaultUsdRate ?? 0),
    cargoRateUsdPerKg: Number((source as CargoConfig).cargoRateUsdPerKg ?? 0),
    cargoTotalWeightKg: Number((source as Record<string, unknown>).cargoTotalWeightKg ?? 0) || null,
  };
}

export function validateCargoTotalWeight(cargoTotalWeightKg: number, totalNetWeightKg: number): string | null {
  if (cargoTotalWeightKg > 0 && totalNetWeightKg > 0 && cargoTotalWeightKg < totalNetWeightKg) {
    return CARGO_WEIGHT_LESS_THAN_NET;
  }
  return null;
}

export function buildLogisticsWithCargo(
  logistics: LogisticsCosts,
  cargoTotalWeightKg: number,
  cargo?: CargoConfig,
) {
  const usdRate = Number(cargo?.usdRate ?? 0);
  const cargoRateUsdPerKg = Number(cargo?.cargoRateUsdPerKg ?? 0);
  const billingWeight = cargoTotalWeightKg > 0 ? cargoTotalWeightKg : 0;
  const totalCargoCostUsd =
    cargoRateUsdPerKg > 0 && billingWeight > 0
      ? roundMoney(billingWeight * cargoRateUsdPerKg)
      : 0;
  const totalCargoCostKgs =
    totalCargoCostUsd > 0 && usdRate > 0 ? roundMoney(totalCargoCostUsd * usdRate) : 0;

  const resolved: LogisticsCosts = { ...logistics };
  // Rate×weight and confirmed/persisted cargo describe the same bucket — never overwrite lower.
  if (totalCargoCostKgs > 0) {
    resolved.chinaExportTransportKgs = Math.max(
      Number(resolved.chinaExportTransportKgs || 0),
      totalCargoCostKgs,
    );
  }

  return {
    logistics: resolved,
    totalCargoCostUsd,
    totalCargoCostKgs: Math.max(totalCargoCostKgs, Number(logistics.chinaExportTransportKgs || 0)),
  };
}

export function calculateLandedCosts(
  items: LandedCostItemInput[],
  logistics: LogisticsCosts,
  options?: LandedCostCalculationOptions,
): LandedCostOrderResult {
  const cargo = options?.cargo;
  const cargoTotalWeightKg = Number(cargo?.cargoTotalWeightKg ?? 0);

  const prepared = items.map((item) => {
    const effectiveQuantity = Math.max(
      0,
      item.receivedQuantity != null && item.receivedQuantity >= 0
        ? item.receivedQuantity
        : item.quantity,
    );
    const netWeightKg = Number(item.weightKg || 0);
    const lineNetWeightKg = roundWeight(effectiveQuantity * netWeightKg);
    const costKgs = roundMoney(Number(item.purchasePriceYuan || 0) * Number(item.yuanRate || 0));
    const basePurchaseCostKgs = roundMoney(costKgs * effectiveQuantity);
    return {
      ...item,
      effectiveQuantity,
      netWeightKg,
      lineNetWeightKg,
      costKgs,
      basePurchaseCostKgs,
    };
  });

  const totalNetWeightKg = roundWeight(prepared.reduce((sum, item) => sum + item.lineNetWeightKg, 0));
  const cargoWeightError = validateCargoTotalWeight(cargoTotalWeightKg, totalNetWeightKg);
  if (cargoWeightError) {
    throw new Error(cargoWeightError);
  }

  let totalPackagingWeightKg = 0;
  let totalShipmentWeightKg = totalNetWeightKg;
  let isEstimated = true;

  if (cargoTotalWeightKg > 0) {
    totalPackagingWeightKg = roundWeight(cargoTotalWeightKg - totalNetWeightKg);
    totalShipmentWeightKg = roundWeight(cargoTotalWeightKg);
    isEstimated = false;
  }

  const withShipment = prepared.map((item) => {
    const linePackagingWeightKg =
      totalNetWeightKg > 0 && totalPackagingWeightKg > 0
        ? roundWeight((item.lineNetWeightKg / totalNetWeightKg) * totalPackagingWeightKg)
        : 0;
    const lineShipmentWeightKg = roundWeight(item.lineNetWeightKg + linePackagingWeightKg);
    const effectiveQty = item.effectiveQuantity > 0 ? item.effectiveQuantity : 0;
    const packagingWeightKg =
      effectiveQty > 0 ? roundWeight(linePackagingWeightKg / effectiveQty) : 0;
    const unitShipmentWeightKg =
      effectiveQty > 0 ? roundWeight(lineShipmentWeightKg / effectiveQty) : 0;
    return {
      ...item,
      packagingWeightKg,
      linePackagingWeightKg,
      lineShipmentWeightKg,
      unitShipmentWeightKg,
      totalWeightKg: lineShipmentWeightKg,
    };
  });

  const allocationBaseWeight =
    totalShipmentWeightKg > 0
      ? totalShipmentWeightKg
      : roundWeight(withShipment.reduce((sum, item) => sum + item.lineShipmentWeightKg, 0));

  const { logistics: resolvedLogistics, totalCargoCostUsd, totalCargoCostKgs } = buildLogisticsWithCargo(
    logistics,
    cargoTotalWeightKg,
    cargo,
  );

  const totalLogisticsCost = roundMoney(
    Number(resolvedLogistics.chinaDomesticTransportKgs || 0) +
      Number(resolvedLogistics.chinaExportTransportKgs || 0) +
      Number(resolvedLogistics.localTransportKgs || 0) +
      Number(resolvedLogistics.packagingCostKgs || 0) +
      Number(resolvedLogistics.customsCostKgs || 0) +
      Number(resolvedLogistics.insuranceCostKgs || 0) +
      Number(resolvedLogistics.bankFeeCostKgs || 0) +
      Number(resolvedLogistics.otherExpenseKgs || 0),
  );
  const costPerKg = allocationBaseWeight > 0 ? roundRate(totalLogisticsCost / allocationBaseWeight) : 0;

  const calculatedItems: LandedCostItemResult[] = withShipment.map((item) => {
    const chinaDomesticAllocKgs = allocateByWeight(
      resolvedLogistics.chinaDomesticTransportKgs,
      item.lineShipmentWeightKg,
      allocationBaseWeight,
    );
    const chinaExportAllocKgs = allocateByWeight(
      resolvedLogistics.chinaExportTransportKgs,
      item.lineShipmentWeightKg,
      allocationBaseWeight,
    );
    const localTransportAllocKgs = allocateByWeight(
      resolvedLogistics.localTransportKgs,
      item.lineShipmentWeightKg,
      allocationBaseWeight,
    );
    const packagingAllocKgs = allocateByWeight(
      resolvedLogistics.packagingCostKgs,
      item.lineShipmentWeightKg,
      allocationBaseWeight,
    );
    const customsAllocKgs = allocateByWeight(
      resolvedLogistics.customsCostKgs,
      item.lineShipmentWeightKg,
      allocationBaseWeight,
    );
    const insuranceAllocKgs = allocateByWeight(
      resolvedLogistics.insuranceCostKgs,
      item.lineShipmentWeightKg,
      allocationBaseWeight,
    );
    const bankFeeAllocKgs = allocateByWeight(
      resolvedLogistics.bankFeeCostKgs,
      item.lineShipmentWeightKg,
      allocationBaseWeight,
    );
    const otherAllocKgs = allocateByWeight(
      resolvedLogistics.otherExpenseKgs,
      item.lineShipmentWeightKg,
      allocationBaseWeight,
    );
    const totalLineLogistics = roundMoney(
      chinaDomesticAllocKgs +
        chinaExportAllocKgs +
        localTransportAllocKgs +
        packagingAllocKgs +
        customsAllocKgs +
        insuranceAllocKgs +
        bankFeeAllocKgs +
        otherAllocKgs,
    );
    const effectiveQty = item.effectiveQuantity > 0 ? item.effectiveQuantity : 0;
    const totalYuan = roundMoney(item.quantity * Number(item.purchasePriceYuan || 0));
    const totalCostKgs =
      effectiveQty > 0 ? roundMoney(item.basePurchaseCostKgs + totalLineLogistics) : 0;
    const transportCostKgs = effectiveQty > 0 ? roundMoney(totalLineLogistics / effectiveQty) : 0;
    const finalCostKgs = effectiveQty > 0 ? roundMoney(item.costKgs + transportCostKgs) : 0;

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
      totalYuan,
      totalCostKgs,
    };
  });

  const totalPurchaseKgs = sumRoundedMoney(prepared.map((item) => item.basePurchaseCostKgs));
  const authoritativeOrderTotal = sumRoundedMoney([totalPurchaseKgs, totalLogisticsCost]);
  const rawLineTotals = calculatedItems.map((item) => item.totalCostKgs);
  const reconciledLineTotals = distributeRoundedAmounts(rawLineTotals, authoritativeOrderTotal);
  const reconciledItems = calculatedItems.map((item, index) => {
    const totalCostKgs = reconciledLineTotals[index] ?? 0;
    const effectiveQty = item.effectiveQuantity > 0 ? item.effectiveQuantity : 0;
    const transportCostKgs =
      effectiveQty > 0 ? roundMoney(totalCostKgs - item.basePurchaseCostKgs) : 0;
    const finalCostKgs =
      effectiveQty > 0 ? roundMoney(item.costKgs + transportCostKgs / effectiveQty) : 0;
    return {
      ...item,
      transportCostKgs: effectiveQty > 0 ? roundMoney(transportCostKgs / effectiveQty) : 0,
      finalCostKgs,
      totalCostKgs,
    };
  });

  return {
    items: reconciledItems,
    totalYuan: roundMoney(reconciledItems.reduce((sum, item) => sum + item.totalYuan, 0)),
    totalTransportCostKgs: totalLogisticsCost,
    totalCostKgs: authoritativeOrderTotal,
    totalNetWeightKg,
    totalPackagingWeightKg,
    totalShipmentWeightKg: allocationBaseWeight,
    totalWeightKg: allocationBaseWeight,
    totalCargoCostUsd,
    totalCargoCostKgs,
    costPerKg,
    isEstimated,
  };
}

export function extractLogisticsCosts(source: Partial<LogisticsCosts> | Record<string, unknown>): LogisticsCosts {
  return {
    chinaDomesticTransportKgs: Number(source.chinaDomesticTransportKgs ?? 0),
    chinaExportTransportKgs: Number(source.chinaExportTransportKgs ?? 0),
    localTransportKgs: Number(source.localTransportKgs ?? 0),
    packagingCostKgs: Number(source.packagingCostKgs ?? 0),
    customsCostKgs: Number(source.customsCostKgs ?? 0),
    insuranceCostKgs: Number(source.insuranceCostKgs ?? 0),
    bankFeeCostKgs: Number(source.bankFeeCostKgs ?? 0),
    otherExpenseKgs: Number(source.otherExpenseKgs ?? 0),
  };
}
