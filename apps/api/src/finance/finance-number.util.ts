export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function buildFinanceDocumentNumber(prefix: string) {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const random = Math.floor(Math.random() * 9000 + 1000);
  return `${prefix}-${stamp}-${random}`;
}
