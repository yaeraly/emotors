export function roundMoney(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function convertChinaDomesticTransportYuanToKgs(yuan: number, effectiveYuanRate: number) {
  return roundMoney(yuan * effectiveYuanRate);
}

export function resolveChinaDomesticTransportKgs(params: {
  chinaDomesticTransportYuan: number;
  chinaDomesticTransportKgs: number;
  effectiveYuanRate: number;
}) {
  const yuan = Math.max(0, Number(params.chinaDomesticTransportYuan || 0));
  if (yuan > 0 && params.effectiveYuanRate > 0) {
    return convertChinaDomesticTransportYuanToKgs(yuan, params.effectiveYuanRate);
  }
  return Math.max(0, Number(params.chinaDomesticTransportKgs || 0));
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

export function storedLocalTransportKgsFromOrder(
  localTransportKgs: number | string | null | undefined,
  svhTransportCostKgs?: number | string | null,
) {
  const local = Number(localTransportKgs ?? 0);
  const svh = Number(svhTransportCostKgs ?? 0);
  if (svh > 0 && local === svh) {
    return 0;
  }
  return local;
}
