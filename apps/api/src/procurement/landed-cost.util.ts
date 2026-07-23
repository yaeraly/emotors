import {
  allocateExpenseAmount,
  buildAllocationTotals,
  DEFAULT_EXPENSE_ALLOCATION,
  distributeRoundedAmounts,
  ExpenseAllocationKey,
  ExpenseAllocationMethod,
  hasPendingWeightForExpense,
  type AllocationLineContext,
} from './landed-cost-allocation.util';

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
  weightKg?: number | null;
  hasKnownWeight?: boolean;
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
  basePurchaseCostKgs: number;
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
  hasKnownWeight: boolean;
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
  isProvisional: boolean;
  pendingWeight: boolean;
  landedCostStatus: 'PENDING_WEIGHT' | 'READY_TO_CALCULATE' | 'CALCULATED';
};

export type LandedCostCalculationOptions = {
  cargo?: CargoConfig;
  allocationMethods?: Partial<Record<ExpenseAllocationKey, ExpenseAllocationMethod>>;
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
  // Rate×weight cargo and confirmed cargo payment describe the same bucket.
  // Never overwrite a higher confirmed/manual cargo amount with a lower rate calc.
  if (totalCargoCostKgs > 0) {
    resolved.chinaExportTransportKgs = Math.max(
      Number(resolved.chinaExportTransportKgs || 0),
      totalCargoCostKgs,
    );
  }

  return { logistics: resolved, totalCargoCostUsd, totalCargoCostKgs };
}

export function resolveItemUnitWeightKg(item: {
  unitWeightKg?: number | string | { toString(): string } | null;
  netWeightKg?: number | string | { toString(): string } | null;
  weightKg?: number | string | { toString(): string } | null;
  weightStatus?: string | null;
}): { weightKg: number | null; hasKnownWeight: boolean } {
  const status = item.weightStatus ?? null;
  if (item.unitWeightKg != null && Number(item.unitWeightKg) > 0) {
    return { weightKg: Number(item.unitWeightKg), hasKnownWeight: true };
  }
  if (status === 'NOT_SET') {
    return { weightKg: null, hasKnownWeight: false };
  }
  const legacy = Number(item.netWeightKg ?? item.weightKg ?? 0);
  if (legacy > 0) {
    return {
      weightKg: legacy,
      hasKnownWeight: status === 'CONFIRMED' || status === 'PRELIMINARY' || !status,
    };
  }
  return { weightKg: null, hasKnownWeight: false };
}

export function calculateLandedCosts(
  items: LandedCostItemInput[],
  logistics: LogisticsCosts,
  options?: LandedCostCalculationOptions,
): LandedCostOrderResult {
  const cargo = options?.cargo;
  const allocationMethods = {
    ...DEFAULT_EXPENSE_ALLOCATION,
    ...(options?.allocationMethods ?? {}),
  };
  const cargoTotalWeightKg = Number(cargo?.cargoTotalWeightKg ?? 0);

  const prepared = items.map((item) => {
    const effectiveQuantity = Math.max(
      0,
      item.receivedQuantity != null && item.receivedQuantity >= 0
        ? item.receivedQuantity
        : item.quantity,
    );
    const resolvedWeight =
      item.hasKnownWeight === false
        ? { weightKg: null, hasKnownWeight: false }
        : item.hasKnownWeight === true
          ? { weightKg: Number(item.weightKg ?? 0) || null, hasKnownWeight: Number(item.weightKg ?? 0) > 0 }
          : resolveItemUnitWeightKg({
              unitWeightKg: item.weightKg,
              netWeightKg: item.weightKg,
              weightKg: item.weightKg,
            });
    const netWeightKg = resolvedWeight.weightKg ?? 0;
    const lineNetWeightKg = resolvedWeight.hasKnownWeight
      ? roundWeight(effectiveQuantity * netWeightKg)
      : 0;
    const costKgs = roundMoney(Number(item.purchasePriceYuan || 0) * Number(item.yuanRate || 0));
    const basePurchaseCostKgs = roundMoney(costKgs * effectiveQuantity);
    return {
      ...item,
      effectiveQuantity,
      netWeightKg,
      lineNetWeightKg,
      costKgs,
      basePurchaseCostKgs,
      hasKnownWeight: resolvedWeight.hasKnownWeight,
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
      item.hasKnownWeight && totalNetWeightKg > 0 && totalPackagingWeightKg > 0
        ? roundWeight((item.lineNetWeightKg / totalNetWeightKg) * totalPackagingWeightKg)
        : 0;
    const lineShipmentWeightKg = item.hasKnownWeight
      ? roundWeight(item.lineNetWeightKg + linePackagingWeightKg)
      : 0;
    const effectiveQty = item.effectiveQuantity > 0 ? item.effectiveQuantity : 1;
    const packagingWeightKg = roundWeight(linePackagingWeightKg / effectiveQty);
    const unitShipmentWeightKg = lineShipmentWeightKg > 0 ? roundWeight(lineShipmentWeightKg / effectiveQty) : 0;
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

  const allocationLines: AllocationLineContext[] = withShipment.map((item) => ({
    lineShipmentWeightKg: item.lineShipmentWeightKg,
    effectiveQuantity: item.effectiveQuantity,
    basePurchaseCostKgs: item.basePurchaseCostKgs,
    hasKnownWeight: item.hasKnownWeight,
  }));
  const allocationTotals = buildAllocationTotals(allocationLines);

  const pendingWeight = (Object.keys(DEFAULT_EXPENSE_ALLOCATION) as ExpenseAllocationKey[]).some((key) =>
    hasPendingWeightForExpense(key, allocationMethods, Number(resolvedLogistics[key] ?? 0), allocationLines),
  );

  const expenseAllocations: Record<ExpenseAllocationKey, number[]> = {
    chinaDomesticTransportKgs: [],
    chinaExportTransportKgs: [],
    localTransportKgs: [],
    packagingCostKgs: [],
    customsCostKgs: [],
    insuranceCostKgs: [],
    bankFeeCostKgs: [],
    otherExpenseKgs: [],
  };

  for (const key of Object.keys(expenseAllocations) as ExpenseAllocationKey[]) {
    const amount = Number(resolvedLogistics[key] ?? 0);
    const method = allocationMethods[key] ?? DEFAULT_EXPENSE_ALLOCATION[key];
    expenseAllocations[key] = distributeRoundedAmounts(
      allocationLines.map((line) => allocateExpenseAmount(method, amount, line, allocationTotals)),
      amount,
    );
  }

  const calculatedItems: LandedCostItemResult[] = withShipment.map((item, index) => {
    const chinaDomesticAllocKgs = expenseAllocations.chinaDomesticTransportKgs[index];
    const chinaExportAllocKgs = expenseAllocations.chinaExportTransportKgs[index];
    const localTransportAllocKgs = expenseAllocations.localTransportKgs[index];
    const packagingAllocKgs = expenseAllocations.packagingCostKgs[index];
    const customsAllocKgs = expenseAllocations.customsCostKgs[index];
    const insuranceAllocKgs = expenseAllocations.insuranceCostKgs[index];
    const bankFeeAllocKgs = expenseAllocations.bankFeeCostKgs[index];
    const otherAllocKgs = expenseAllocations.otherExpenseKgs[index];
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
    const transportCostKgs =
      effectiveQty > 0 ? totalLineLogistics / effectiveQty : 0;
    const finalCostKgs =
      effectiveQty > 0 ? roundMoney(item.costKgs + transportCostKgs) : 0;
    const totalYuan = roundMoney(item.quantity * Number(item.purchasePriceYuan || 0));
    const totalCostKgs =
      effectiveQty > 0 ? roundMoney(totalLineLogistics + item.basePurchaseCostKgs) : 0;

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
      transportCostKgs: effectiveQty > 0 ? roundMoney(transportCostKgs) : 0,
      finalCostKgs,
      totalYuan,
      totalCostKgs,
    };
  });

  const rawLineTotals = calculatedItems.map((item) => item.totalCostKgs);
  const reconciledLineTotals = distributeRoundedAmounts(
    rawLineTotals,
    roundMoney(rawLineTotals.reduce((sum, amount) => sum + amount, 0)),
  );
  const reconciledItems = calculatedItems.map((item, index) => {
    const totalCostKgs = reconciledLineTotals[index];
    const effectiveQty = item.effectiveQuantity > 0 ? item.effectiveQuantity : 0;
    const transportCostKgs =
      effectiveQty > 0
        ? roundMoney(totalCostKgs - item.basePurchaseCostKgs)
        : 0;
    const finalCostKgs =
      effectiveQty > 0 ? roundMoney(item.costKgs + transportCostKgs / effectiveQty) : 0;
    return {
      ...item,
      transportCostKgs: effectiveQty > 0 ? roundMoney(transportCostKgs / effectiveQty) : 0,
      finalCostKgs,
      totalCostKgs,
    };
  });

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
  const totalCostKgs = roundMoney(reconciledItems.reduce((sum, item) => sum + item.totalCostKgs, 0));
  const isProvisional = pendingWeight;
  const landedCostStatus: LandedCostOrderResult['landedCostStatus'] = pendingWeight
    ? 'PENDING_WEIGHT'
    : totalCostKgs > 0
      ? 'CALCULATED'
      : 'READY_TO_CALCULATE';

  return {
    items: reconciledItems,
    totalYuan: roundMoney(reconciledItems.reduce((sum, item) => sum + item.totalYuan, 0)),
    totalTransportCostKgs: totalLogisticsCost,
    totalCostKgs,
    totalNetWeightKg,
    totalPackagingWeightKg,
    totalShipmentWeightKg: allocationBaseWeight,
    totalWeightKg: allocationBaseWeight,
    totalCargoCostUsd,
    totalCargoCostKgs,
    costPerKg,
    isEstimated,
    isProvisional,
    pendingWeight,
    landedCostStatus,
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
  weightKg?: number | string | { toString(): string } | null;
  netWeightKg?: number | string | { toString(): string } | null;
  unitWeightKg?: number | string | { toString(): string } | null;
  weightStatus?: string | null;
}): LandedCostItemInput {
  const resolved = resolveItemUnitWeightKg(item);
  return {
    quantity: item.quantity,
    receivedQuantity: item.receivedQuantity,
    purchasePriceYuan: Number(item.purchasePriceYuan),
    yuanRate: Number(item.yuanRate),
    weightKg: resolved.weightKg,
    hasKnownWeight: resolved.hasKnownWeight,
  };
}
