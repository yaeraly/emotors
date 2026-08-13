/**
 * Russian customer-facing product unit labels.
 * Keep in sync with apps/web/src/lib/product-unit.ts UNIT_LABELS (ru values).
 */
const UNIT_LABELS_RU: Record<string, string> = {
  pcs: 'шт.',
  piece: 'шт.',
  unit: 'шт.',
  pair: 'пара',
  set: 'комплект',
  kg: 'кг',
  kilogram: 'кг',
  g: 'г',
  gram: 'г',
  m: 'м',
  meter: 'м',
  cm: 'см',
  centimeter: 'см',
  mm: 'мм',
  millimeter: 'мм',
  l: 'л',
  liter: 'л',
  ml: 'мл',
  milliliter: 'мл',
  pack: 'упаковка',
  package: 'упаковка',
  box: 'коробка',
  roll: 'рулон',
  шт: 'шт.',
  'шт.': 'шт.',
  ед: 'ед.',
  'ед.': 'ед.',
};

function normalizeUnitKey(unit: string): string {
  return unit.trim().toLowerCase().replace(/\.+$/g, '');
}

/** Customer-facing Russian unit label for price lists and PDFs. */
export function formatProductUnitRu(unit: string | null | undefined): string {
  if (!unit?.trim()) return '—';
  const trimmed = unit.trim();
  const lower = trimmed.toLowerCase();
  const withoutTrailingDot = normalizeUnitKey(trimmed);

  return (
    UNIT_LABELS_RU[lower] ??
    UNIT_LABELS_RU[withoutTrailingDot] ??
    UNIT_LABELS_RU[lower.replace(/\./g, '')] ??
    '—'
  );
}
