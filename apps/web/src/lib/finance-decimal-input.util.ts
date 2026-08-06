/** Format a money amount for editable text inputs (no grouping separators). */
export function formatEditableDecimal(value: number): string {
  if (!Number.isFinite(value)) return '';
  return (Math.round((value + Number.EPSILON) * 100) / 100).toString();
}

/** Keep only valid decimal characters while the user types. */
export function sanitizeEditableDecimalInput(raw: string): string {
  let value = raw.replace(/[^\d.,]/g, '').replace(',', '.');
  const parts = value.split('.');
  if (parts.length > 2) {
    value = `${parts[0]}.${parts.slice(1).join('')}`;
  }
  const [whole, fraction] = value.split('.');
  if (fraction != null && fraction.length > 2) {
    value = `${whole}.${fraction.slice(0, 2)}`;
  }
  return value;
}

/** Parse user-entered decimal text; returns null when empty or invalid. */
export function parseEditableDecimal(input: string): number | null {
  const trimmed = input.trim().replace(',', '.');
  if (!trimmed) return null;
  if (!/^\d+(\.\d{0,2})?$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
}

/** Difference = actual − system (positive means counted balance is higher). */
export function calculateReconciliationDifference(actualBalance: number, systemBalance: number): number {
  return Math.round((actualBalance - systemBalance + Number.EPSILON) * 100) / 100;
}
