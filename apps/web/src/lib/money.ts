/**
 * Client display helpers — mirror API roundDisplayMoney (2dp half-up).
 * Authoritative totals must come from the backend; use these only for display/formatting.
 */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Format KGS with exactly 2 decimal places (no thousands separator). */
export function formatKgs(value: number | null | undefined): string {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return '0.00';
  return roundMoney(numeric).toFixed(2);
}

/** Locale-aware KGS label for Kyrgyz/Russian UI (space thousands, comma decimals). */
export function formatKgsLocalized(value: number | null | undefined): string {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return '0,00';
  return roundMoney(numeric).toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatKgsWithSuffix(value: number | null | undefined, suffix = 'KGS'): string {
  return `${formatKgs(value)} ${suffix}`;
}
