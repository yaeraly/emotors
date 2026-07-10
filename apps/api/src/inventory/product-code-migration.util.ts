import { isValidCategoryCodePrefix, nextProductCode, normalizeCategoryCodePrefix } from './product-code.util';

export const PRODUCT_CODE_MIGRATION_NAME = 'short_code_v1';

export type ProductCodeMigrationPreviewRow = {
  productId: string;
  productName: string;
  categoryId: string;
  categoryName: string;
  categoryPrefix: string;
  oldCode: string;
  newCode: string;
  conflictStatus: 'OK' | 'DUPLICATE_NEW_CODE' | 'MISSING_CATEGORY' | 'MISSING_PREFIX' | 'PREFIX_CONFLICT';
};

export type ProductCodeMigrationPreview = {
  migrationName: string;
  rows: ProductCodeMigrationPreviewRow[];
  canApply: boolean;
  errors: string[];
};

type CategoryLike = {
  id: string;
  code: string;
  nameEn: string;
  nameRu: string;
};

type ProductLike = {
  id: string;
  name: string;
  sku: string;
  categoryId: string;
  createdAt: Date;
  productCategory?: CategoryLike | null;
};

function slugifyCategoryName(name: string): string {
  const slug = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 3);
  return slug || 'CAT';
}

export function resolveCategoryPrefix(category: CategoryLike, reservedPrefixes: Set<string>): string {
  const raw = category.code?.trim();
  if (raw && isValidCategoryCodePrefix(raw)) {
    return normalizeCategoryCodePrefix(raw);
  }
  let candidate = slugifyCategoryName(category.nameEn || category.nameRu || category.code || 'CAT');
  if (candidate.length < 2) candidate = `${candidate}X`.slice(0, 2);
  let suffix = 0;
  let resolved = candidate;
  while (reservedPrefixes.has(resolved)) {
    suffix += 1;
    resolved = `${candidate.slice(0, 2)}${suffix}`.slice(0, 3);
  }
  reservedPrefixes.add(resolved);
  return resolved;
}

export function buildProductCodeMigrationPreview(
  products: ProductLike[],
  categories: CategoryLike[],
): ProductCodeMigrationPreview {
  const errors: string[] = [];
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const reservedPrefixes = new Set<string>();
  const validCategoryPrefixes = new Map<string, string>();

  for (const category of categories) {
    if (!category.code?.trim()) {
      errors.push(`Category "${category.nameEn}" (${category.id}) is missing a code prefix`);
      continue;
    }
    if (!isValidCategoryCodePrefix(category.code)) {
      errors.push(`Category "${category.nameEn}" has invalid prefix "${category.code}"`);
      continue;
    }
    const normalized = normalizeCategoryCodePrefix(category.code);
    if (reservedPrefixes.has(normalized)) {
      errors.push(`Duplicate category prefix "${normalized}"`);
      continue;
    }
    reservedPrefixes.add(normalized);
    validCategoryPrefixes.set(category.id, normalized);
  }

  const grouped = new Map<string, ProductLike[]>();
  for (const product of products) {
    if (!product.categoryId || !categoryMap.has(product.categoryId)) {
      errors.push(`Product "${product.name}" (${product.id}) has missing category`);
      continue;
    }
    const bucket = grouped.get(product.categoryId) ?? [];
    bucket.push(product);
    grouped.set(product.categoryId, bucket);
  }

  const rows: ProductCodeMigrationPreviewRow[] = [];
  const newCodeOwners = new Map<string, string>();

  for (const [categoryId, categoryProducts] of grouped.entries()) {
    const category = categoryMap.get(categoryId)!;
    let prefix = validCategoryPrefixes.get(categoryId);
    if (!prefix) {
      prefix = resolveCategoryPrefix(category, reservedPrefixes);
    }

    const sorted = [...categoryProducts].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
    );

    const assignedCodes: string[] = [];
    let sequence = 0;
    for (const product of sorted) {
      sequence += 1;
      let newCode = `${prefix}${String(sequence).padStart(3, '0')}`;
      while (assignedCodes.includes(newCode) || newCodeOwners.has(newCode)) {
        sequence += 1;
        newCode = `${prefix}${String(sequence).padStart(3, '0')}`;
      }
      if (sequence > 999) {
        errors.push(`Category "${category.nameEn}" exceeded 999 products`);
      }
      assignedCodes.push(newCode);

      let conflictStatus: ProductCodeMigrationPreviewRow['conflictStatus'] = 'OK';
      if (!categoryMap.has(product.categoryId)) conflictStatus = 'MISSING_CATEGORY';
      else if (!prefix) conflictStatus = 'MISSING_PREFIX';
      else if (newCodeOwners.has(newCode) && newCodeOwners.get(newCode) !== product.id) {
        conflictStatus = 'DUPLICATE_NEW_CODE';
        errors.push(`Duplicate new code "${newCode}" for products ${newCodeOwners.get(newCode)} and ${product.id}`);
      }

      newCodeOwners.set(newCode, product.id);
      rows.push({
        productId: product.id,
        productName: product.name,
        categoryId,
        categoryName: category.nameEn,
        categoryPrefix: prefix,
        oldCode: product.sku,
        newCode,
        conflictStatus,
      });
    }
  }

  const canApply = errors.length === 0 && rows.length > 0 && rows.every((row) => row.conflictStatus === 'OK');

  return {
    migrationName: PRODUCT_CODE_MIGRATION_NAME,
    rows,
    canApply,
    errors,
  };
}

export function nextShortProductCodeForCategory(prefix: string, existingSkus: string[]) {
  return nextProductCode(prefix, existingSkus);
}
