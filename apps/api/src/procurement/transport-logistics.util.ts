import { extractCargoConfig, extractLogisticsCosts } from './landed-cost.util';
import { roundMoney } from './supplier-payment.util';

export const WEIGHTED_YUAN_RATE_REQUIRED_MESSAGE =
  'Weighted average yuan rate or estimated yuan rate is required when China domestic transport cost in yuan is greater than zero';

export function resolveEffectiveYuanRate(
  weightedAverageYuanRate: number | null | undefined,
  totalPaidYuan: number,
  defaultYuanRate: number,
) {
  if (weightedAverageYuanRate && totalPaidYuan > 0) {
    return Number(weightedAverageYuanRate);
  }
  return Number(defaultYuanRate);
}

export function convertChinaDomesticTransportYuanToKgs(yuan: number, effectiveYuanRate: number) {
  return roundMoney(yuan * effectiveYuanRate);
}

export function resolveChinaDomesticTransport(params: {
  chinaDomesticTransportYuan?: number | null;
  chinaDomesticTransportKgs?: number | null;
  effectiveYuanRate: number;
}) {
  const yuan = Math.max(0, Number(params.chinaDomesticTransportYuan ?? 0));
  if (yuan > 0) {
    if (!params.effectiveYuanRate || params.effectiveYuanRate <= 0) {
      throw new Error('WEIGHTED_YUAN_RATE_REQUIRED');
    }
    return {
      yuan,
      kgs: convertChinaDomesticTransportYuanToKgs(yuan, params.effectiveYuanRate),
    };
  }

  return {
    yuan: 0,
    kgs: Math.max(0, Number(params.chinaDomesticTransportKgs ?? 0)),
  };
}

export function effectiveLocalTransportKgs(
  localTransportKgs: number,
  svhTransportCostKgs?: number | null,
) {
  const local = Math.max(0, Number(localTransportKgs ?? 0));
  const svh = Math.max(0, Number(svhTransportCostKgs ?? 0));
  if (svh > 0 && local === svh) {
    return local;
  }
  return local + svh;
}

export function resolveSvhTransportCostKgs(
  dto: Record<string, unknown>,
  existing?: Record<string, unknown> | null,
) {
  const svhTransport = (dto.svhToHqTransport ?? existing?.svhToHqTransport) as
    | { transportCostKgs?: number | string | null }
    | null
    | undefined;
  return Number(svhTransport?.transportCostKgs ?? 0);
}

export function resolveProcurementLogisticsInput(
  dto: Record<string, unknown>,
  existing: Record<string, unknown> | undefined,
  effectiveYuanRate: number,
) {
  const storedLocalTransportKgs = Math.max(0, Number(dto.localTransportKgs ?? existing?.localTransportKgs ?? 0));
  if (Number(dto.localTransportKgs ?? existing?.localTransportKgs ?? 0) < 0) {
    throw new Error('NEGATIVE_LOCAL_TRANSPORT');
  }
  const svhTransportCostKgs = resolveSvhTransportCostKgs(dto, existing);
  const localTransportKgs = effectiveLocalTransportKgs(storedLocalTransportKgs, svhTransportCostKgs);

  const chinaDomestic = resolveChinaDomesticTransport({
    chinaDomesticTransportYuan: Number(dto.chinaDomesticTransportYuan ?? existing?.chinaDomesticTransportYuan ?? 0),
    chinaDomesticTransportKgs: Number(dto.chinaDomesticTransportKgs ?? existing?.chinaDomesticTransportKgs ?? 0),
    effectiveYuanRate,
  });

  const logistics = extractLogisticsCosts({
    chinaDomesticTransportKgs: chinaDomestic.kgs,
    chinaExportTransportKgs: dto.chinaExportTransportKgs ?? existing?.chinaExportTransportKgs,
    localTransportKgs,
    packagingCostKgs: dto.packagingCostKgs ?? existing?.packagingCostKgs,
    customsCostKgs: dto.customsCostKgs ?? existing?.customsCostKgs,
    insuranceCostKgs: dto.insuranceCostKgs ?? existing?.insuranceCostKgs,
    bankFeeCostKgs: dto.bankFeeCostKgs ?? existing?.bankFeeCostKgs,
    otherExpenseKgs: dto.otherExpenseKgs ?? existing?.otherExpenseKgs,
  });

  const cargo = extractCargoConfig({
    defaultUsdRate: dto.defaultUsdRate ?? existing?.defaultUsdRate,
    cargoRateUsdPerKg: dto.cargoRateUsdPerKg ?? existing?.cargoRateUsdPerKg,
    cargoTotalWeightKg: dto.cargoTotalWeightKg ?? existing?.cargoTotalWeightKg,
  });

  return {
    logistics,
    cargo,
    chinaDomesticTransportYuan: chinaDomestic.yuan,
    chinaDomesticTransportKgs: chinaDomestic.kgs,
    localTransportKgs: storedLocalTransportKgs,
  };
}

export function buildProcurementLandedCostInputs(
  order: Record<string, unknown>,
  effectiveYuanRate: number,
) {
  const resolved = resolveProcurementLogisticsInput(order, order, effectiveYuanRate);
  return {
    logistics: resolved.logistics,
    cargo: resolved.cargo,
  };
}
