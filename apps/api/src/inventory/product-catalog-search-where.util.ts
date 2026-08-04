import { Prisma } from '@prisma/client';

/**
 * Combines product-catalog scope with text search without letting search OR
 * overwrite catalog OR (e.g. HQ-only scope for Supply Manager).
 */
export function mergeProductCatalogSearchWhere(
  baseWhere: Prisma.ProductWhereInput,
  search: string | undefined | null,
): Prisma.ProductWhereInput {
  const trimmed = search?.trim();
  if (!trimmed) {
    return baseWhere;
  }

  const searchOr: Prisma.ProductWhereInput[] = [
    { name: { contains: trimmed, mode: 'insensitive' } },
    { sku: { contains: trimmed, mode: 'insensitive' } },
    { barcode: { contains: trimmed, mode: 'insensitive' } },
    { category: { contains: trimmed, mode: 'insensitive' } },
    { productCategory: { nameKy: { contains: trimmed, mode: 'insensitive' } } },
    { productCategory: { nameRu: { contains: trimmed, mode: 'insensitive' } } },
    { productCategory: { nameEn: { contains: trimmed, mode: 'insensitive' } } },
    { codeMigrations: { some: { oldCode: { contains: trimmed, mode: 'insensitive' } } } },
  ];

  const { OR: catalogOr, AND: existingAnd, ...rest } = baseWhere;
  const andParts: Prisma.ProductWhereInput[] = [];

  if (Array.isArray(existingAnd)) {
    andParts.push(...existingAnd);
  } else if (existingAnd) {
    andParts.push(existingAnd);
  }

  if (catalogOr?.length) {
    andParts.push({ OR: catalogOr });
  }

  andParts.push({ OR: searchOr });

  return {
    ...rest,
    AND: andParts,
  };
}

/** Keep one product per id (authoritative catalog key). */
export function uniqueProductsById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
  }
  return unique;
}
