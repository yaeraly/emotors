import type { ProductCategory } from '@/lib/types';

const DEFAULT_UNITS = ['pcs', 'kg', 'set', 'pair', 'box', 'pack', 'unit'];

export function slugifyCategoryName(name: string): string {
  const slug = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 12);
  return slug || 'CAT';
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
  existingBarcodes: Array<string | null | undefined>,
): { sku: string; barcode: string } {
  const skuPattern = new RegExp(`^${escapeRegex(prefix)}-(\\d+)$`, 'i');
  const barcodePattern = new RegExp(`^${escapeRegex(prefix)}(\\d+)$`, 'i');

  let maxNum = 0;
  for (const sku of existingSkus) {
    const match = sku.match(skuPattern);
    if (match) maxNum = Math.max(maxNum, Number.parseInt(match[1], 10));
  }
  for (const barcode of existingBarcodes) {
    if (!barcode) continue;
    const match = barcode.match(barcodePattern);
    if (match) maxNum = Math.max(maxNum, Number.parseInt(match[1], 10));
  }

  const next = maxNum + 1;
  const sequence = String(next).padStart(6, '0');
  return {
    sku: `${prefix}-${sequence}`,
    barcode: `${prefix}${sequence}`,
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
