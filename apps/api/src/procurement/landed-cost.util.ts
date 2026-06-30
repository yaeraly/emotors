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
};

export type LandedCostItemInput = {
  quantity: number;
  receivedQuantity?: number | null;
  purchasePriceYuan: number;
  yuanRate: number;
  weightKg: number;
  packagingWeightKg?: number;
  directPackagingCostKgs?: number;
};

export type LandedCostItemResult = LandedCostItemInput & {
  effectiveQuantity: number;
  netWeightKg: number;
  unitShipmentWeightKg: number;
  lineNetWeightKg: number;
  linePackagingWeightKg: number;
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
  directPackagingPerUnitKgs: number;
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
};

export type LandedCostCalculationOptions = {
  cargo?: CargoConfig;
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

export function extractCargoConfig(source: Partial<CargoConfig> | Record<string, unknown>): CargoConfig {
  return {
    usdRate: Number((source as CargoConfig).usdRate ?? (source as Record<string, unknown>).defaultUsdRate ?? 0),
    cargoRateUsdPerKg: Number((source as CargoConfig).cargoRateUsdPerKg ?? 0),
  };
}

export function buildLogisticsWithCargo(
  logistics: LogisticsCosts,
  totalShipmentWeightKg: number,
  cargo?: CargoConfig,
) {
  const usdRate = Number(cargo?.usdRate ?? 0);
  const cargoRateUsdPerKg = Number(cargo?.cargoRateUsdPerKg ?? 0);
  const totalCargoCostUsd =
    cargoRateUsdPerKg > 0 && totalShipmentWeightKg > 0
      ? roundMoney(totalShipmentWeightKg * cargoRateUsdPerKg)
      : 0;
  const totalCargoCostKgs =
    totalCargoCostUsd > 0 && usdRate > 0 ? roundMoney(totalCargoCostUsd * usdRate) : 0;

  const resolved: LogisticsCosts = { ...logistics };
  if (totalCargoCostKgs > 0) {
    resolved.chinaExportTransportKgs = totalCargoCostKgs;
  }

  return { logistics: resolved, totalCargoCostUsd, totalCargoCostKgs };
}

export function calculateLandedCosts(
  items: LandedCostItemInput[],
  logistics: LogisticsCosts,
  options?: LandedCostCalculationOptions,
): LandedCostOrderResult {
  const prepared = items.map((item) => {
    const effectiveQuantity = Math.max(
      0,
      item.receivedQuantity != null && item.receivedQuantity >= 0
        ? item.receivedQuantity
        : item.quantity,
    );
    const netWeightKg = Number(item.weightKg || 0);
    const packagingWeightKg = Number(item.packagingWeightKg || 0);
    const unitShipmentWeightKg = roundWeight(netWeightKg + packagingWeightKg);
    const lineNetWeightKg = roundWeight(effectiveQuantity * netWeightKg);
    const linePackagingWeightKg = roundWeight(effectiveQuantity * packagingWeightKg);
    const totalWeightKg = roundWeight(effectiveQuantity * unitShipmentWeightKg);
    const costKgs = roundMoney(Number(item.purchasePriceYuan || 0) * Number(item.yuanRate || 0));
    return {
      ...item,
      effectiveQuantity,
      netWeightKg,
      packagingWeightKg,
      unitShipmentWeightKg,
      lineNetWeightKg,
      linePackagingWeightKg,
      totalWeightKg,
      costKgs,
    };
  });

  const totalNetWeightKg = roundWeight(prepared.reduce((sum, item) => sum + item.lineNetWeightKg, 0));
  const totalPackagingWeightKg = roundWeight(
    prepared.reduce((sum, item) => sum + item.linePackagingWeightKg, 0),
  );
  const totalShipmentWeightKg = roundWeight(prepared.reduce((sum, item) => sum + item.totalWeightKg, 0));
  const { logistics: resolvedLogistics, totalCargoCostUsd, totalCargoCostKgs } = buildLogisticsWithCargo(
    logistics,
    totalShipmentWeightKg,
    options?.cargo,
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
  const costPerKg = totalShipmentWeightKg > 0 ? roundRate(totalLogisticsCost / totalShipmentWeightKg) : 0;

  const calculatedItems: LandedCostItemResult[] = prepared.map((item) => {
    const chinaDomesticAllocKgs = allocateByWeight(
      resolvedLogistics.chinaDomesticTransportKgs,
      item.totalWeightKg,
      totalShipmentWeightKg,
    );
    const chinaExportAllocKgs = allocateByWeight(
      resolvedLogistics.chinaExportTransportKgs,
      item.totalWeightKg,
      totalShipmentWeightKg,
    );
    const localTransportAllocKgs = allocateByWeight(
      resolvedLogistics.localTransportKgs,
      item.totalWeightKg,
      totalShipmentWeightKg,
    );
    const packagingAllocKgs = allocateByWeight(
      resolvedLogistics.packagingCostKgs,
      item.totalWeightKg,
      totalShipmentWeightKg,
    );
    const customsAllocKgs = allocateByWeight(
      resolvedLogistics.customsCostKgs,
      item.totalWeightKg,
      totalShipmentWeightKg,
    );
    const insuranceAllocKgs = allocateByWeight(
      resolvedLogistics.insuranceCostKgs,
      item.totalWeightKg,
      totalShipmentWeightKg,
    );
    const bankFeeAllocKgs = allocateByWeight(
      resolvedLogistics.bankFeeCostKgs,
      item.totalWeightKg,
      totalShipmentWeightKg,
    );
    const otherAllocKgs = allocateByWeight(
      resolvedLogistics.otherExpenseKgs,
      item.totalWeightKg,
      totalShipmentWeightKg,
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
    const effectiveQty = item.effectiveQuantity > 0 ? item.effectiveQuantity : 1;
    const transportCostKgs = roundMoney(totalLineLogistics / effectiveQty);
    const directPackagingPerUnitKgs = roundMoney(
      Number(item.directPackagingCostKgs || 0) / effectiveQty,
    );
    const finalCostKgs = roundMoney(item.costKgs + transportCostKgs + directPackagingPerUnitKgs);
    const totalYuan = roundMoney(item.quantity * Number(item.purchasePriceYuan || 0));
    const totalCostKgs = roundMoney(finalCostKgs * effectiveQty);

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
      directPackagingPerUnitKgs,
      finalCostKgs,
      totalYuan,
      totalCostKgs,
    };
  });

  return {
    items: calculatedItems,
    totalYuan: roundMoney(calculatedItems.reduce((sum, item) => sum + item.totalYuan, 0)),
    totalTransportCostKgs: totalLogisticsCost,
    totalCostKgs: roundMoney(calculatedItems.reduce((sum, item) => sum + item.totalCostKgs, 0)),
    totalNetWeightKg,
    totalPackagingWeightKg,
    totalShipmentWeightKg,
    totalWeightKg: totalShipmentWeightKg,
    totalCargoCostUsd,
    totalCargoCostKgs,
    costPerKg,
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

export function mapStoredProcurementItemToLandedCostInput(item: {
  quantity: number;
  receivedQuantity?: number | null;
  purchasePriceYuan: number | string | { toString(): string };
  yuanRate: number | string | { toString(): string };
  weightKg: number | string | { toString(): string };
  netWeightKg?: number | string | { toString(): string } | null;
  packagingWeightKg?: number | string | { toString(): string } | null;
  directPackagingCostKgs?: number | string | { toString(): string } | null;
}): LandedCostItemInput {
  return {
    quantity: item.quantity,
    receivedQuantity: item.receivedQuantity,
    purchasePriceYuan: Number(item.purchasePriceYuan),
    yuanRate: Number(item.yuanRate),
    weightKg: Number(item.netWeightKg ?? item.weightKg),
    packagingWeightKg: Number(item.packagingWeightKg ?? 0),
    directPackagingCostKgs: Number(item.directPackagingCostKgs ?? 0),
  };
}
