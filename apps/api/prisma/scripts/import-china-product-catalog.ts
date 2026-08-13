/**
 * Idempotent China product catalog import.
 *
 * Usage:
 *   npm run products:import-china -w @emotors/api
 *
 * Safe to re-run. Does not create inventory / FIFO / selling-price changes.
 */
import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { ensureHqCatalogBranch } from '../../src/product-catalog/hq-product-catalog.util';
import {
  nextProductBarcode,
  nextProductCode,
  resolveCategoryProductCodePrefix,
} from '../../src/inventory/product-code.util';
import {
  catalogFieldsNeedUpdate,
  CHINA_PRODUCT_CATALOG_ROWS,
  emptyImportSummary,
  findExactProductMatch,
  formatImportSummary,
  matchExistingCategory,
  type ChinaCatalogImportSummary,
  validateChinaCatalogRows,
} from '../../src/inventory/china-product-catalog.util';
import { activeHqWarehouseWhere } from '../../src/warehouse/warehouse.util';

const prisma = new PrismaClient();

async function writeAudit(
  db: PrismaClient | Prisma.TransactionClient,
  action: string,
  entity: string,
  entityId: string,
  metadata: Record<string, unknown>,
) {
  await db.auditLog.create({
    data: {
      userId: null,
      role: 'SYSTEM_ADMINISTRATOR',
      action,
      entity,
      entityId,
      metadata: {
        ...metadata,
        source: 'import-china-product-catalog',
        timestamp: new Date().toISOString(),
      },
    },
  });
}

async function importChinaProductCatalog(): Promise<ChinaCatalogImportSummary> {
  const summary = emptyImportSummary(CHINA_PRODUCT_CATALOG_ROWS.length);
  const { valid, errors } = validateChinaCatalogRows(CHINA_PRODUCT_CATALOG_ROWS);
  summary.validationErrors = errors.length;
  summary.failedRows.push(...errors);

  if (valid.length === 0) {
    return summary;
  }

  const hqBranch = await ensureHqCatalogBranch(prisma);
  const hqWarehouse = await prisma.warehouse.findFirst({
    where: activeHqWarehouseWhere,
    orderBy: { createdAt: 'asc' },
  });
  if (!hqWarehouse) {
    throw new Error('No active HQ warehouse found. Run prisma seed before importing the catalog.');
  }

  // Resolve / create categories once (idempotent).
  const categoryIdByCode = new Map<string, { id: string; code: string; nameEn: string }>();
  const uniqueTranslations = new Map(
    valid.map((row) => [row.categoryTranslation.code, row.categoryTranslation]),
  );

  const existingCategories = await prisma.productCategory.findMany({
    select: { id: true, code: true, nameRu: true, nameEn: true, nameKy: true, isActive: true },
  });

  for (const translation of uniqueTranslations.values()) {
    const matched = matchExistingCategory(existingCategories, translation);
    if (matched) {
      if (!matched.isActive) {
        await prisma.productCategory.update({
          where: { id: matched.id },
          data: { isActive: true },
        });
      }
      categoryIdByCode.set(translation.code, {
        id: matched.id,
        code: matched.code,
        nameEn: matched.nameEn,
      });
      summary.categoriesReused += 1;
      summary.reusedCategoryCodes.push(matched.code);
      continue;
    }

    const created = await prisma.productCategory.create({
      data: {
        code: translation.code,
        nameRu: translation.nameRu,
        nameKy: translation.nameKy,
        nameEn: translation.nameEn,
        isActive: true,
      },
      select: { id: true, code: true, nameEn: true },
    });
    existingCategories.push({
      id: created.id,
      code: created.code,
      nameRu: translation.nameRu,
      nameEn: created.nameEn,
      nameKy: translation.nameKy,
      isActive: true,
    });
    categoryIdByCode.set(translation.code, created);
    summary.categoriesCreated += 1;
    summary.createdCategoryCodes.push(created.code);
    await writeAudit(prisma, 'PRODUCT_CATEGORY_CREATED', 'ProductCategory', created.id, {
      code: created.code,
      nameRu: translation.nameRu,
      nameKy: translation.nameKy,
      nameEn: translation.nameEn,
      reason: 'China product catalog import',
    });
  }

  const existingProducts = await prisma.product.findMany({
    where: { branchId: hqBranch.id, deletedAt: null },
    select: {
      id: true,
      name: true,
      sku: true,
      categoryId: true,
      weightKg: true,
      purchasePriceYuan: true,
      sellingPriceKgs: true,
      costPriceKgs: true,
      finalCostKgs: true,
    },
  });

  const usedCodesByPrefix = new Map<string, string[]>();

  await prisma.$transaction(async (tx) => {
    for (const row of valid) {
      const category = categoryIdByCode.get(row.categoryTranslation.code);
      if (!category) {
        summary.failedRows.push({
          name: row.name,
          reason: `resolved category missing for ${row.categoryTranslation.code}`,
        });
        continue;
      }

      const { match, ambiguous } = findExactProductMatch(
        existingProducts.map((product) => ({
          id: product.id,
          name: product.name,
          sku: product.sku,
          categoryId: product.categoryId,
          weightKg: product.weightKg.toString(),
          purchasePriceYuan: product.purchasePriceYuan.toString(),
          sellingPriceKgs: product.sellingPriceKgs.toString(),
        })),
        row.name,
      );

      if (ambiguous.length > 0) {
        summary.ambiguousDuplicates += 1;
        summary.failedRows.push({
          name: row.name,
          reason: `ambiguous duplicate matches: ${ambiguous.map((item) => item.sku).join(', ')}`,
        });
        continue;
      }

      const weight = new Prisma.Decimal(row.weightKg);
      const purchasePriceYuan = new Prisma.Decimal(row.purchasePriceYuan);

      if (match) {
        const needsUpdate = catalogFieldsNeedUpdate(match, {
          categoryId: category.id,
          weightKg: row.weightKg,
          purchasePriceYuan: row.purchasePriceYuan,
        });
        if (!needsUpdate) {
          summary.productsSkippedUnchanged += 1;
          summary.skippedProductNames.push(row.name);
          continue;
        }

        // Update only allowed catalog fields. Do not touch stock, FIFO, selling prices, or cost history.
        await tx.product.update({
          where: { id: match.id },
          data: {
            categoryId: category.id,
            category: category.nameEn,
            weightKg: weight,
            purchasePriceYuan,
            purchasePriceUpdatedAt: new Date(),
            isActive: true,
          },
        });
        summary.productsUpdated += 1;
        summary.updatedProductNames.push(row.name);
        await writeAudit(tx, 'CHINA_CATALOG_PRODUCT_UPDATED', 'Product', match.id, {
          name: row.name,
          sku: match.sku,
          categoryId: category.id,
          weightKg: row.weightKg,
          purchasePriceYuan: row.purchasePriceYuan,
          previous: {
            categoryId: match.categoryId,
            weightKg: match.weightKg,
            purchasePriceYuan: match.purchasePriceYuan,
          },
        });
        const idx = existingProducts.findIndex((product) => product.id === match.id);
        if (idx >= 0) {
          existingProducts[idx] = {
            ...existingProducts[idx],
            categoryId: category.id,
            weightKg: weight,
            purchasePriceYuan,
          };
        }
        continue;
      }

      const fullCategory = await tx.productCategory.findUniqueOrThrow({
        where: { id: category.id },
        select: { id: true, code: true, nameEn: true, nameRu: true, nameKy: true },
      });
      const prefix = resolveCategoryProductCodePrefix(fullCategory);
      if (!usedCodesByPrefix.has(prefix)) {
        const categoryProducts = await tx.product.findMany({
          where: { categoryId: category.id, deletedAt: null },
          select: { sku: true, barcode: true },
        });
        const codes = categoryProducts.flatMap((product) =>
          [product.sku, product.barcode].filter((value): value is string => Boolean(value)),
        );
        const branchCodes = await tx.product.findMany({
          where: {
            branchId: hqBranch.id,
            deletedAt: null,
            sku: { startsWith: prefix },
          },
          select: { sku: true },
        });
        usedCodesByPrefix.set(
          prefix,
          Array.from(new Set([...codes, ...branchCodes.map((item) => item.sku)])),
        );
      }
      const used = usedCodesByPrefix.get(prefix) ?? [];
      const sku = nextProductCode(prefix, used);
      used.push(sku);
      usedCodesByPrefix.set(prefix, used);
      const barcode = nextProductBarcode(sku);

      const created = await tx.product.create({
        data: {
          branchId: hqBranch.id,
          warehouseId: hqWarehouse.id,
          categoryId: category.id,
          category: category.nameEn,
          name: row.name,
          sku,
          barcode,
          unit: 'pcs',
          weightKg: weight,
          purchasePriceYuan,
          purchasePriceUpdatedAt: new Date(),
          // Catalog-only: leave selling/cost fields at defaults; do not invent landing/FIFO costs.
          latestYuanRate: 0,
          purchaseCostKgs: 0,
          transportCostKgs: 0,
          finalCostKgs: 0,
          costPriceKgs: 0,
          sellingPriceKgs: 0,
          wholesalePriceKgs: 0,
          hqBranchWholesalePriceKgs: 0,
          masterPriceKgs: 0,
          recommendedRetailPriceKgs: 0,
          minimumSellingPriceKgs: 0,
          minStockLevel: 0,
          isActive: true,
        },
      });

      existingProducts.push({
        id: created.id,
        name: created.name,
        sku: created.sku,
        categoryId: created.categoryId,
        weightKg: created.weightKg,
        purchasePriceYuan: created.purchasePriceYuan,
        sellingPriceKgs: created.sellingPriceKgs,
        costPriceKgs: created.costPriceKgs,
        finalCostKgs: created.finalCostKgs,
      });

      summary.productsCreated += 1;
      summary.createdProductNames.push(row.name);
      await writeAudit(tx, 'CHINA_CATALOG_PRODUCT_CREATED', 'Product', created.id, {
        name: row.name,
        sku: created.sku,
        categoryId: category.id,
        weightKg: row.weightKg,
        purchasePriceYuan: row.purchasePriceYuan,
        unit: 'pcs',
      });
    }
  });

  await writeAudit(prisma, 'CHINA_CATALOG_IMPORT_COMPLETED', 'ProductCatalog', 'china-import', {
    totalRows: summary.totalRows,
    categoriesCreated: summary.categoriesCreated,
    categoriesReused: summary.categoriesReused,
    productsCreated: summary.productsCreated,
    productsUpdated: summary.productsUpdated,
    productsSkippedUnchanged: summary.productsSkippedUnchanged,
    ambiguousDuplicates: summary.ambiguousDuplicates,
    validationErrors: summary.validationErrors,
  });

  return summary;
}

async function main() {
  console.log('Importing China product catalog...');
  const summary = await importChinaProductCatalog();
  console.log('\n' + formatImportSummary(summary));

  if (summary.validationErrors > 0 || summary.ambiguousDuplicates > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
