type AppLanguage = 'ru' | 'ky' | 'en';

const UNIT_LABELS: Record<string, Partial<Record<AppLanguage, string>>> = {
  pcs: { ru: 'шт.', ky: 'даана', en: 'pcs' },
  piece: { ru: 'шт.', ky: 'даана', en: 'pcs' },
  unit: { ru: 'шт.', ky: 'бирдик', en: 'unit' },
  pair: { ru: 'пара', ky: 'жуп', en: 'pair' },
  set: { ru: 'комплект', ky: 'комплект', en: 'set' },
  kg: { ru: 'кг', ky: 'кг', en: 'kg' },
  kilogram: { ru: 'кг', ky: 'кг', en: 'kg' },
  g: { ru: 'г', ky: 'г', en: 'g' },
  gram: { ru: 'г', ky: 'г', en: 'gram' },
  meter: { ru: 'м', ky: 'м', en: 'm' },
  m: { ru: 'м', ky: 'м', en: 'm' },
  cm: { ru: 'см', ky: 'см', en: 'cm' },
  centimeter: { ru: 'см', ky: 'см', en: 'centimeter' },
  mm: { ru: 'мм', ky: 'мм', en: 'mm' },
  millimeter: { ru: 'мм', ky: 'мм', en: 'millimeter' },
  l: { ru: 'л', ky: 'л', en: 'L' },
  liter: { ru: 'л', ky: 'л', en: 'L' },
  ml: { ru: 'мл', ky: 'мл', en: 'ml' },
  milliliter: { ru: 'мл', ky: 'мл', en: 'milliliter' },
  pack: { ru: 'упаковка', ky: 'таңгак', en: 'pack' },
  package: { ru: 'упаковка', ky: 'таңгак', en: 'package' },
  box: { ru: 'коробка', ky: 'куту', en: 'box' },
  roll: { ru: 'рулон', ky: 'рулон', en: 'roll' },
  шт: { ru: 'шт.', ky: 'даана', en: 'pcs' },
  'шт.': { ru: 'шт.', ky: 'даана', en: 'pcs' },
  ед: { ru: 'ед.', ky: 'бирдик', en: 'unit' },
  'ед.': { ru: 'ед.', ky: 'бирдик', en: 'unit' },
};

function resolveLanguage(language: string): AppLanguage {
  if (language === 'ky' || language === 'ru' || language === 'en') return language;
  return 'en';
}

function lookupUnitLabel(unit: string, lang: AppLanguage): string | undefined {
  const lower = unit.trim().toLowerCase();
  const withoutTrailingDot = lower.replace(/\.+$/g, '');
  return (
    UNIT_LABELS[lower]?.[lang] ??
    UNIT_LABELS[withoutTrailingDot]?.[lang] ??
    UNIT_LABELS[lower.replace(/\./g, '')]?.[lang]
  );
}

export function formatProductUnit(
  unit: string | null | undefined,
  language: string,
  t?: (key: string) => string,
): string {
  if (!unit?.trim()) {
    return t ? t('inventory.unitNotSpecified') : 'Not specified';
  }

  const lang = resolveLanguage(language);
  const mapped = lookupUnitLabel(unit, lang);
  if (mapped) return mapped;
  if (lang === 'en') return unit.trim();
  return unit.trim();
}

/** Russian unit label for customer-facing branch price lists. */
export function formatCustomerPriceListUnit(unit: string | null | undefined): string {
  if (!unit?.trim()) return '—';
  const mapped = lookupUnitLabel(unit, 'ru');
  return mapped ?? '—';
}

export function productUnitOptions(
  units: string[],
  language: string,
  t: (key: string) => string,
): Array<{ value: string; label: string }> {
  return units.map((unit) => ({
    value: unit,
    label: formatProductUnit(unit, language, t),
  }));
}
