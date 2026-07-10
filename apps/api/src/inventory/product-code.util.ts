const CODE_PREFIX_PATTERN = /^[A-Z]{1,3}$/;

export function normalizeCategoryCodePrefix(code: string): string {
  return code.trim().toUpperCase();
}

export function isValidCategoryCodePrefix(code: string): boolean {
  return CODE_PREFIX_PATTERN.test(normalizeCategoryCodePrefix(code));
}

export function getCategoryCodePrefix(category: { code: string }): string {
  const prefix = category.code?.trim();
  if (!prefix) {
    throw new Error('Category code prefix is required');
  }
  return normalizeCategoryCodePrefix(prefix);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function nextProductCode(prefix: string, existingSkus: string[]): string {
  const normalizedPrefix = normalizeCategoryCodePrefix(prefix);
  const pattern = new RegExp(`^${escapeRegex(normalizedPrefix)}(\\d{3})$`, 'i');

  let maxNum = 0;
  for (const sku of existingSkus) {
    const match = sku.match(pattern);
    if (match) {
      maxNum = Math.max(maxNum, Number.parseInt(match[1], 10));
    }
  }

  const next = maxNum + 1;
  if (next > 999) {
    throw new Error('Product code sequence exhausted for this category');
  }

  return `${normalizedPrefix}${String(next).padStart(3, '0')}`;
}

export function nextProductBarcode(productCode: string): string {
  return productCode;
}
