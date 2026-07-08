import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { HQ_CATALOG_BRANCH_CODE, activeHqWarehouseWhere } from '../warehouse/warehouse.util';

type PrismaLike = PrismaService | Prisma.TransactionClient;

export type HqCatalogSeedResult = {
  seeded: boolean;
  catalogCount: number;
  adoptedCount: number;
  createdCount: number;
};

export async function ensureHqCatalogBranch(prisma: PrismaLike) {
  const existing = await prisma.branch.findFirst({
    where: { code: HQ_CATALOG_BRANCH_CODE, deletedAt: null },
    select: { id: true },
  });
  if (existing) return existing;

  return prisma.branch.create({
    data: {
      code: HQ_CATALOG_BRANCH_CODE,
      name: 'EMOTORS HQ Catalog',
      city: 'Bishkek',
    },
    select: { id: true },
  });
}

function catalogDedupeKey(product: { sku: string; barcode: string | null; name: string }) {
  const sku = product.sku?.trim().toUpperCase();
  if (sku) return `sku:${sku}`;
  const barcode = product.barcode?.trim();
  if (barcode) return `barcode:${barcode}`;
  return `name:${product.name.trim().toLowerCase()}`;
}

async function findExistingCatalogProduct(
  prisma: PrismaLike,
  hqBranchId: string,
  source: { sku: string; barcode: string | null; name: string },
) {
  const sku = source.sku?.trim();
  if (sku) {
    const bySku = await prisma.product.findFirst({
      where: { branchId: hqBranchId, sku, deletedAt: null },
    });
    if (bySku) return bySku;
  }

  const barcode = source.barcode?.trim();
  if (barcode) {
    const byBarcode = await prisma.product.findFirst({
      where: { branchId: hqBranchId, barcode, deletedAt: null },
    });
    if (byBarcode) return byBarcode;
  }

  const name = source.name?.trim();
  if (name) {
    return prisma.product.findFirst({
      where: {
        branchId: hqBranchId,
        deletedAt: null,
        name: { equals: name, mode: 'insensitive' },
      },
    });
  }

  return null;
}

export async function seedHqProductCatalogFromWarehouseInventory(
  prisma: PrismaLike,
): Promise<HqCatalogSeedResult> {
  const hqBranch = await ensureHqCatalogBranch(prisma);

  const catalogCount = await prisma.product.count({
    where: { branchId: hqBranch.id, deletedAt: null, isActive: true },
  });
  if (catalogCount > 0) {
    return { seeded: false, catalogCount, adoptedCount: 0, createdCount: 0 };
  }

  const hqWarehouses = await prisma.warehouse.findMany({
    where: activeHqWarehouseWhere,
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!hqWarehouses.length) {
    return { seeded: false, catalogCount: 0, adoptedCount: 0, createdCount: 0 };
  }

  const defaultCategory = await prisma.productCategory.findFirst({
    where: { isActive: true },
    orderBy: { code: 'asc' },
    select: { id: true },
  });
  if (!defaultCategory) {
    return { seeded: false, catalogCount: 0, adoptedCount: 0, createdCount: 0 };
  }

  const balances = await prisma.inventoryBalance.findMany({
    where: { warehouseId: { in: hqWarehouses.map((warehouse) => warehouse.id) } },
    include: { product: true },
  });

  const candidates = new Map<string, (typeof balances)[number]['product']>();
  for (const balance of balances) {
    const product = balance.product;
    if (!product || product.deletedAt || !product.isActive) continue;
    const key = catalogDedupeKey(product);
    if (!candidates.has(key)) {
      candidates.set(key, product);
    }
  }

  let adoptedCount = 0;
  let createdCount = 0;
  const defaultWarehouseId = hqWarehouses[0].id;

  for (const source of candidates.values()) {
    const existingCatalog = await findExistingCatalogProduct(prisma, hqBranch.id, source);
    if (existingCatalog) continue;

    if (source.branchId !== hqBranch.id) {
      const skuConflict = source.sku?.trim()
        ? await prisma.product.findFirst({
            where: {
              branchId: hqBranch.id,
              sku: source.sku.trim(),
              deletedAt: null,
              NOT: { id: source.id },
            },
          })
        : null;

      if (!skuConflict) {
        await prisma.product.update({
          where: { id: source.id },
          data: { branchId: hqBranch.id },
        });
        adoptedCount += 1;
        continue;
      }
    }

    await prisma.product.create({
      data: {
        branchId: hqBranch.id,
        warehouseId: defaultWarehouseId,
        categoryId: source.categoryId || defaultCategory.id,
        name: source.name,
        sku: source.sku,
        barcode: source.barcode,
        category: source.category,
        photoUrl: source.photoUrl ?? null,
        description: source.description ?? null,
        unit: source.unit,
        weightKg: source.weightKg,
        purchasePriceYuan: source.purchasePriceYuan,
        latestYuanRate: source.latestYuanRate,
        purchaseCostKgs: source.purchaseCostKgs,
        transportCostKgs: source.transportCostKgs,
        finalCostKgs: source.finalCostKgs,
        costPriceKgs: source.costPriceKgs,
        sellingPriceKgs: source.sellingPriceKgs,
        wholesalePriceKgs: source.wholesalePriceKgs,
        hqBranchWholesalePriceKgs: source.hqBranchWholesalePriceKgs,
        recommendedRetailPriceKgs: source.recommendedRetailPriceKgs,
        minimumSellingPriceKgs: source.minimumSellingPriceKgs,
        pricingMode: source.pricingMode as any,
        isActive: source.isActive,
      },
    });
    createdCount += 1;
  }

  const nextCatalogCount = await prisma.product.count({
    where: { branchId: hqBranch.id, deletedAt: null, isActive: true },
  });

  return {
    seeded: adoptedCount + createdCount > 0,
    catalogCount: nextCatalogCount,
    adoptedCount,
    createdCount,
  };
}
