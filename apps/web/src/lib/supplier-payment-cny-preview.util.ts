const RATE_FRACTION_DIGITS = 4;

export function normalizeExchangeRateInput(raw: string): string {
  const cleaned = raw.replace(/\s/g, '').replace(/[^\d.,]/g, '');
  if (!cleaned) return '';

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  const lastSepIndex = Math.max(lastComma, lastDot);

  if (lastSepIndex === -1) {
    return cleaned;
  }

  const afterSep = cleaned.slice(lastSepIndex + 1);
  const isTrailingSep = afterSep === '';
  const isDecimal =
    isTrailingSep || (afterSep.length <= RATE_FRACTION_DIGITS && !/[.,]/.test(afterSep));

  if (!isDecimal) {
    return cleaned.replace(/[.,]/g, '');
  }

  const whole = cleaned.slice(0, lastSepIndex).replace(/[.,]/g, '');
  const fraction = afterSep.slice(0, RATE_FRACTION_DIGITS);

  if (isTrailingSep) {
    return `${whole}.`;
  }
  return fraction.length > 0 ? `${whole}.${fraction}` : whole;
}

export function parseExchangeRateInput(input: string): number | null {
  const normalized = normalizeExchangeRateInput(input.trim());
  if (!normalized || normalized.endsWith('.')) return null;
  if (!/^\d+(\.\d{1,4})?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

export function previewCnyToKgs(cny: number, rateInput: string): number | null {
  const rate = parseExchangeRateInput(rateInput);
  if (rate == null || !(cny > 0)) return null;
  return Math.round(cny * rate * 100) / 100;
}

export function formatKgsPreview(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(2)} сом`;
}
