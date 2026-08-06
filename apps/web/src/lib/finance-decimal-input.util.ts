const MONEY_FRACTION_DIGITS = 2;

/** Format a money amount for editable text inputs (no grouping separators). */
export function toEditableMoney(value: number | string | null | undefined): string {
  if (value == null || value === '') return '';
  const numeric =
    typeof value === 'string'
      ? Number(value.replace(/\s/g, '').replace(',', '.'))
      : value;
  if (!Number.isFinite(numeric)) return '';
  return (
    Math.round((numeric + Number.EPSILON) * 10 ** MONEY_FRACTION_DIGITS) /
    10 ** MONEY_FRACTION_DIGITS
  ).toString();
}

/** @deprecated Use {@link toEditableMoney} */
export const formatEditableDecimal = toEditableMoney;

/**
 * Normalize money text while the user types.
 * Allows digits, spaces as thousand separators, and one decimal separator (`,` or `.`).
 */
export function normalizeMoneyInput(raw: string): string {
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
    isTrailingSep || (afterSep.length <= MONEY_FRACTION_DIGITS && !/[.,]/.test(afterSep));

  if (!isDecimal) {
    return cleaned.replace(/[.,]/g, '');
  }

  const whole = cleaned.slice(0, lastSepIndex).replace(/[.,]/g, '');
  const fraction = afterSep.slice(0, MONEY_FRACTION_DIGITS);

  if (isTrailingSep) {
    return `${whole}.`;
  }
  return fraction.length > 0 ? `${whole}.${fraction}` : whole;
}

/** @deprecated Use {@link normalizeMoneyInput} */
export const sanitizeEditableDecimalInput = normalizeMoneyInput;

/** True when the text is a complete, parseable money amount (not empty or trailing `.`). */
export function isCompleteMoneyDecimal(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  if (trimmed.endsWith('.') || trimmed.endsWith(',')) return false;
  return parseMoneyDecimal(trimmed) != null;
}

/** Parse user-entered money text at submit time; returns null when empty or invalid. */
export function parseMoneyDecimal(input: string): number | null {
  const normalized = normalizeMoneyInput(input.trim());
  if (!normalized || normalized.endsWith('.')) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return (
    Math.round((parsed + Number.EPSILON) * 10 ** MONEY_FRACTION_DIGITS) /
    10 ** MONEY_FRACTION_DIGITS
  );
}

/** @deprecated Use {@link parseMoneyDecimal} */
export const parseEditableDecimal = parseMoneyDecimal;

/** Difference = actual − system (positive means counted balance is higher). */
export function calculateReconciliationDifference(
  actualBalance: number,
  systemBalance: number,
): number {
  return (
    Math.round((actualBalance - systemBalance + Number.EPSILON) * 100) / 100
  );
}

/** Preview difference from raw input; null when input is empty or incomplete. */
export function previewReconciliationDifference(
  actualBalanceInput: string,
  systemBalance: number,
): number | null {
  if (!isCompleteMoneyDecimal(actualBalanceInput)) return null;
  const actual = parseMoneyDecimal(actualBalanceInput);
  if (actual == null) return null;
  return calculateReconciliationDifference(actual, systemBalance);
}
