/**
 * Presentation-only money formatting. Never feed formatted strings back into calculations.
 */
export function formatDecimalMoney(
  value: string | number | null | undefined,
  currency = 'KGS',
): string {
  const numeric = typeof value === 'number' ? value : Number(String(value ?? '').replace(/\s/g, '').replace(',', '.'));
  const amount = Number.isFinite(numeric) ? numeric : 0;
  const formatted = amount.toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${formatted} ${currency}`;
}

export function formatMoney(value: string | number | null | undefined): string {
  return formatDecimalMoney(value, 'KGS');
}
