/**
 * Verify Product Catalog FIFO costs against expected landed unit costs.
 *
 * Usage:
 *   cd apps/api && npx tsx scripts/verify-product-catalog-cost-table.ts
 *   npx tsx scripts/verify-product-catalog-cost-table.ts --sku=GEN001
 */
import { PrismaClient, WarehouseType } from '@prisma/client';
import { mapProductCatalogFifoCost } from '../src/inventory/product-catalog-fifo-cost.util';
import { resolveCurrentProductCatalogUnitCost } from '../src/inventory/product-catalog-current-cost.util';

const EXPECTED_COSTS: Array<{ sku: string; name: string; expectedKgs: number }> = [
  { sku: 'AXL004', name: 'Полуось шляпка 18зуб 58.5см', expectedKgs: 517.8 },
  { sku: 'WIR001', name: 'Основной кабель 12В', expectedKgs: 574.58 },
  { sku: 'BRK005', name: 'Тормозной барабан 180-63', expectedKgs: 452.79 },
  { sku: 'AXL003', name: 'Полуось шляпка 6зуб 58.5см', expectedKgs: 517.79 },
  { sku: 'TRA004', name: 'Редуктор 23 зуб 5 кг', expectedKgs: 2854.22 },
  { sku: 'TRA005', name: 'Редуктор 18 зуб 4.3 кг', expectedKgs: 1944.21 },
  { sku: 'MT002', name: 'Желмаян Мотор 1.8кВт 70H', expectedKgs: 5085.33 },
  { sku: 'MT001', name: 'Желмаян Мотор 2.2кВт 80H', expectedKgs: 5817.44 },
  { sku: 'GEN001', name: 'Генератор 5,5 кВт', expectedKgs: 13801.15 },
  { sku: 'CHA001', name: 'Зарядка 60В 58Ач', expectedKgs: 741.19 },
  { sku: 'CHA002', name: 'Зарядка 72В 58Ач', expectedKgs: 862.11 },
  { sku: 'TRA001', name: 'Трансмиссионное масло', expectedKgs: 34.69 },
  { sku: 'TRA002', name: 'Редуктор 20 зуб 5 кг', expectedKgs: 1944.22 },
  { sku: 'TRA003', name: 'Редуктор 22 зуб 5 кг', expectedKgs: 2854.22 },
  { sku: 'WHL003', name: 'Камера 5.00-12', expectedKgs: 200.71 },
  { sku: 'SUS001', name: 'Амортизатор 43×72 (Ø1,5 см)', expectedKgs: 1636.13 },
  { sku: 'MAN001', name: 'Ручка газа 3 скорости + задний ход', expectedKgs: 77.85 },
  { sku: 'MAN002', name: 'Напольная педаль газа', expectedKgs: 157.09 },
  { sku: 'WHL001', name: 'Камера 4.00-12', expectedKgs: 152.79 },
  { sku: 'WHL002', name: 'Камера 4.50-12', expectedKgs: 172.45 },
  { sku: 'TRA006', name: 'Редуктор 6 зуб 4.3 кг (большой)', expectedKgs: 2007.28 },
  { sku: 'TRA007', name: 'Редуктор 6 зуб 7.4 кг (большой)', expectedKgs: 2848.01 },
  { sku: 'BRK001', name: 'Колодки 160', expectedKgs: 110.89 },
  { sku: 'BRK002', name: 'Колодки 180', expectedKgs: 140.79 },
  { sku: 'SUS002', name: 'Амортизатор 43×72 (Ø2 см)', expectedKgs: 1636.13 },
  { sku: 'FAS001', name: 'Кронштейн 43мм 25,5 см', expectedKgs: 572.92 },
  { sku: 'LIG004', name: 'Круглый боковой фонарь', expectedKgs: 202.81 },
  { sku: 'MAN005', name: 'Переключатели на руль', expectedKgs: 137.29 },
  { sku: 'AXL002', name: 'Полуось 18зуб 9см 50см', expectedKgs: 166.79 },
  { sku: 'BRK004', name: 'Тормозной барабан 160 маленький', expectedKgs: 166.79 },
  { sku: 'MAN003', name: 'Замок зажигания с ключами', expectedKgs: 31.89 },
  { sku: 'MAN004', name: 'Замок зажигания самосвала с ключами', expectedKgs: 29.86 },
  { sku: 'MON002', name: 'Стандартный дисплей', expectedKgs: 149.85 },
  { sku: 'LIG002', name: 'Задний фонарь 23 см', expectedKgs: 64.08 },
  { sku: 'LIG003', name: 'Задний фонарь 28 см', expectedKgs: 77.08 },
  { sku: 'TRA008', name: 'Трос повышенной/пониженной 150см', expectedKgs: 84.8 },
  { sku: 'CTR001', name: 'Желмаян Контроллер 1,8 кВт 70H', expectedKgs: 2458.55 },
  { sku: 'CTR002', name: 'Желмаян Контроллер 2,2 кВт 80H', expectedKgs: 3371.17 },
  { sku: 'ALA002', name: 'Сигнал 60В', expectedKgs: 62.14 },
  { sku: 'AXL001', name: 'Ось переднего колеса 32 см, 1,5 см', expectedKgs: 151.34 },
  { sku: 'BRK003', name: 'Ручник с тросом 50 см', expectedKgs: 105.09 },
  { sku: 'ELE001', name: 'Преобразователь 48–72В 15А', expectedKgs: 143.04 },
  { sku: 'LIG001', name: 'Круглая фара', expectedKgs: 151.3 },
  { sku: 'ALA001', name: 'Сигнал 12В', expectedKgs: 62.14 },
];

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function parseSkuFilter(argv: string[]) {
  const skuArg = argv.find((arg) => arg.startsWith('--sku='));
  return skuArg ? skuArg.slice('--sku='.length).trim().toUpperCase() : undefined;
}

async function main() {
  const skuFilter = parseSkuFilter(process.argv.slice(2));
  const prisma = new PrismaClient();

  const hqWarehouse = await prisma.warehouse.findFirst({
    where: { warehouseType: WarehouseType.HQ, deletedAt: null, isActive: true },
    select: { id: true, name: true },
  });

  const targets = skuFilter
    ? EXPECTED_COSTS.filter((row) => row.sku.toUpperCase() === skuFilter)
    : EXPECTED_COSTS;

  const report = [];
  let matchCount = 0;
  let mismatchCount = 0;
  let missingCount = 0;

  for (const expected of targets) {
    const product = await prisma.product.findFirst({
      where: { sku: { equals: expected.sku, mode: 'insensitive' }, deletedAt: null },
      select: {
        id: true,
        sku: true,
        name: true,
        finalCostKgs: true,
        costPriceKgs: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (!product) {
      missingCount += 1;
      report.push({
        productCode: expected.sku,
        productName: expected.name,
        currentCatalogCost: null,
        expectedFifoCost: expected.expectedKgs,
        difference: null,
        result: 'MISSING_PRODUCT',
      });
      continue;
    }

    const fifo = await resolveCurrentProductCatalogUnitCost(prisma, {
      productId: product.id,
    });
    const catalogFields = mapProductCatalogFifoCost({ fifo });
    const currentCatalogCost = catalogFields.currentFifoUnitCost;
    const difference =
      currentCatalogCost != null ? roundMoney(currentCatalogCost - expected.expectedKgs) : null;
    const matched =
      currentCatalogCost != null && Math.abs(currentCatalogCost - expected.expectedKgs) <= 0.01;

    if (matched) matchCount += 1;
    else mismatchCount += 1;

    report.push({
      productCode: product.sku,
      productName: product.name,
      currentCatalogCost,
      storedProductFinalCostKgs: roundMoney(Number(product.finalCostKgs)),
      storedProductCostPriceKgs: roundMoney(Number(product.costPriceKgs)),
      expectedFifoCost: expected.expectedKgs,
      difference,
      costSource: catalogFields.costSource,
      costBatchId: catalogFields.costBatchId,
      result: matched ? 'MATCH' : 'MISMATCH',
    });
  }

  console.log(
    JSON.stringify(
      {
        hqWarehouse,
        productsChecked: targets.length,
        summary: {
          matchCount,
          mismatchCount,
          missingCount,
        },
        verificationTable: report,
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();

  if (mismatchCount > 0 || missingCount > 0) {
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
