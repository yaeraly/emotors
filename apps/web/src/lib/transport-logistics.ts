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
