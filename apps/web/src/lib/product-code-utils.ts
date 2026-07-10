import type { ProductCategory } from '@/lib/types';

const DEFAULT_UNITS = ['pcs', 'kg', 'set', 'pair', 'box', 'pack', 'unit'];
const CODE_PREFIX_PATTERN = /^[A-Z]{1,3}$/;

export function slugifyCategoryName(name: string): string {
  const slug = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 3);
  return slug || 'CAT';
}

export function isValidCategoryCodePrefix(code: string): boolean {
  return CODE_PREFIX_PATTERN.test(code.trim().toUpperCase());
}

export function getCategoryPrefix(category: ProductCategory, language: string): string {
  if (category.code?.trim()) {
    return category.code.trim().toUpperCase();
  }
  const name =
    language === 'ky'
      ? category.nameKy
      : language === 'ru'
        ? category.nameRu
        : category.nameEn;
  return slugifyCategoryName(name);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function nextProductCodes(
  prefix: string,
  existingSkus: string[],
  existingBarcodes: Array<string | null | undefined> = [],
): { sku: string; barcode: string } {
  const normalizedPrefix = prefix.trim().toUpperCase();
  const codePattern = new RegExp(`^${escapeRegex(normalizedPrefix)}(\\d{3})$`, 'i');

  let maxNum = 0;
  for (const sku of existingSkus) {
    const match = sku.match(codePattern);
    if (match) maxNum = Math.max(maxNum, Number.parseInt(match[1], 10));
  }
  for (const barcode of existingBarcodes) {
    if (!barcode) continue;
    const match = barcode.match(codePattern);
    if (match) maxNum = Math.max(maxNum, Number.parseInt(match[1], 10));
  }

  const next = maxNum + 1;
  const productCode = `${normalizedPrefix}${String(next).padStart(3, '0')}`;
  return {
    sku: productCode,
    barcode: productCode,
  };
}

export function collectInventoryUnits(productUnits: Array<string | null | undefined>): string[] {
  const units = new Set(DEFAULT_UNITS);
  for (const unit of productUnits) {
    const normalized = unit?.trim();
    if (normalized) units.add(normalized);
  }
  return [...units].sort((a, b) => a.localeCompare(b));
}
