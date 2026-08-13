const CODE_PREFIX_PATTERN = /^[A-Z]{1,3}$/;
const PRODUCT_CODE_PATTERN = /^[A-Z0-9]{1,12}$/;

/** Known long category codes / names mapped to short product-code prefixes. */
const CATEGORY_PREFIX_ALIASES: Record<string, string> = {
  MOTORS: 'MT',
  MOTOR: 'MT',
  CONTROLLERS: 'CTR',
  CONTROLLER: 'CTR',
  BATTERIES: 'BAT',
  BATTERY: 'BAT',
  BRAKE_SYSTEM: 'BRK',
  BRAKES: 'BRK',
  BRAKE: 'BRK',
  WHEELS: 'WHL',
  WHEEL: 'WHL',
  AXLES: 'AXL',
  AXLE: 'AXL',
};

export function normalizeCategoryCodePrefix(code: string): string {
  return code.trim().toUpperCase();
}

export function normalizeProductCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, '');
}

export function isValidCategoryCodePrefix(code: string): boolean {
  return CODE_PREFIX_PATTERN.test(normalizeCategoryCodePrefix(code));
}

export function isValidProductCode(code: string): boolean {
  const normalized = normalizeProductCode(code);
  if (!normalized) return false;
  return PRODUCT_CODE_PATTERN.test(normalized);
}

function slugifyCategoryName(name: string): string {
  const slug = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 3);
  return slug || 'CAT';
}

export function resolveCategoryProductCodePrefix(category: {
  code: string;
  nameEn?: string | null;
  nameRu?: string | null;
  nameKy?: string | null;
}): string {
  const rawCode = normalizeCategoryCodePrefix(category.code ?? '');
  if (rawCode && CATEGORY_PREFIX_ALIASES[rawCode]) {
    return CATEGORY_PREFIX_ALIASES[rawCode];
  }
  if (rawCode && isValidCategoryCodePrefix(rawCode)) {
    return rawCode;
  }

  for (const name of [category.nameEn, category.nameRu, category.nameKy]) {
    if (!name?.trim()) continue;
    const slug = slugifyCategoryName(name);
    if (CATEGORY_PREFIX_ALIASES[slug]) {
      return CATEGORY_PREFIX_ALIASES[slug];
    }
    const normalizedName = normalizeCategoryCodePrefix(name.replace(/[^A-Za-z0-9]+/g, '_'));
    if (CATEGORY_PREFIX_ALIASES[normalizedName]) {
      return CATEGORY_PREFIX_ALIASES[normalizedName];
    }
  }

  const fallbackName = category.nameEn || category.nameRu || category.nameKy || rawCode || 'CAT';
  return slugifyCategoryName(fallbackName);
}

/** @deprecated Use resolveCategoryProductCodePrefix for product SKU generation. */
export function getCategoryCodePrefix(category: { code: string }): string {
  return resolveCategoryProductCodePrefix(category);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function extractProductCodeSequence(prefix: string, code: string): number | null {
  const normalizedPrefix = normalizeCategoryCodePrefix(prefix);
  const normalizedCode = normalizeProductCode(code);
  const pattern = new RegExp(`^${escapeRegex(normalizedPrefix)}(\\d+)$`, 'i');
  const match = normalizedCode.match(pattern);
  if (!match) return null;
  const sequence = Number.parseInt(match[1], 10);
  return Number.isFinite(sequence) ? sequence : null;
}

export function nextProductCode(prefix: string, existingCodes: string[]): string {
  const normalizedPrefix = normalizeCategoryCodePrefix(prefix);
  if (!isValidCategoryCodePrefix(normalizedPrefix)) {
    throw new Error('Product code prefix must be 1-3 uppercase Latin letters');
  }

  let maxNum = 0;
  for (const code of existingCodes) {
    const sequence = extractProductCodeSequence(normalizedPrefix, code);
    if (sequence != null) {
      maxNum = Math.max(maxNum, sequence);
    }
  }

  const next = maxNum + 1;
  if (next > 999) {
    throw new Error('Product code sequence exhausted for this category');
  }

  return `${normalizedPrefix}${String(next).padStart(3, '0')}`;
}

export function nextProductBarcode(productCode: string): string {
  return normalizeProductCode(productCode);
}

export function collectPrefixUsageCodes(
  prefix: string,
  codes: Array<string | null | undefined>,
): string[] {
  const normalizedPrefix = normalizeCategoryCodePrefix(prefix);
  return codes
    .map((code) => (code ? normalizeProductCode(code) : ''))
    .filter((code) => extractProductCodeSequence(normalizedPrefix, code) != null);
}
