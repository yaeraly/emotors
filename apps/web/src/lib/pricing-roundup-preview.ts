/** Mirrors backend applyMarkupRoundUp for optimistic UI preview only. */
export function applyMarkupRoundUpPreview(costPrice: number, markupPercent: number) {
  if (!Number.isFinite(costPrice) || costPrice <= 0) return 0;
  if (!Number.isFinite(markupPercent) || markupPercent < 0) return 0;
  const raw = costPrice * (1 + markupPercent / 100);
  if (raw <= 0) return 0;
  return Math.ceil(raw / 10) * 10;
}

export function parseMarkupInput(raw: string): number | null {
  const trimmed = raw.trim().replace(',', '.');
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

export function formatMarkupInputValue(value: number | null | undefined) {
  if (value === null || value === undefined) return '';
  return String(value);
}
