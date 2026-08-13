export function formatOperationsProductSummary(
  t: (key: string) => string,
  positions: number,
  units: number,
  key: 'operations.reservationProductSummary' | 'operations.returnProductSummary' = 'operations.reservationProductSummary',
) {
  return t(key).replace('{positions}', String(positions)).replace('{units}', String(units));
}

export function formatOperationsMoney(value: number | string | null | undefined) {
  const amount = Number(value ?? 0);
  const rounded = Math.round((amount + Number.EPSILON) * 100) / 100;
  const hasFraction = Math.abs(rounded % 1) > 0.001;
  return `${rounded.toLocaleString('ru-RU', {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: hasFraction ? 2 : 0,
  })} сом`;
}

export function formatOperationsDate(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
