type AppLanguage = 'ru' | 'ky' | 'en';

const UNIT_LABELS: Record<string, Partial<Record<AppLanguage, string>>> = {
  pcs: { ru: 'шт', ky: 'даана', en: 'pcs' },
  pair: { ru: 'пара', ky: 'жуп', en: 'pair' },
  set: { ru: 'комплект', ky: 'комплект', en: 'set' },
  kg: { ru: 'кг', ky: 'кг', en: 'kg' },
  meter: { ru: 'м', ky: 'м', en: 'meter' },
  m: { ru: 'м', ky: 'м', en: 'm' },
  pack: { ru: 'упаковка', ky: 'таңгак', en: 'pack' },
  box: { ru: 'коробка', ky: 'куту', en: 'box' },
  unit: { ru: 'ед.', ky: 'бирдик', en: 'unit' },
};

function resolveLanguage(language: string): AppLanguage {
  if (language === 'ky' || language === 'ru' || language === 'en') return language;
  return 'en';
}

export function formatProductUnit(
  unit: string | null | undefined,
  language: string,
  t?: (key: string) => string,
): string {
  if (!unit?.trim()) {
    return t ? t('inventory.unitNotSpecified') : 'Not specified';
  }

  const normalized = unit.trim().toLowerCase();
  const lang = resolveLanguage(language);
  const mapped = UNIT_LABELS[normalized]?.[lang];
  if (mapped) return mapped;
  if (lang === 'en') return unit.trim();
  return unit.trim();
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
