export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function applyMarkup(costPrice: number, markupPercent: number) {
  if (costPrice <= 0) return 0;
  return roundMoney(costPrice * (1 + markupPercent / 100));
}

export function deriveMarkupPercent(costPrice: number, sellingPrice: number) {
  if (costPrice <= 0) return 0;
  return roundMoney(((sellingPrice - costPrice) / costPrice) * 100);
}
