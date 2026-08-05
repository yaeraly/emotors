import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { CHINA_PRODUCT_CATALOG_ROWS } from '../../src/inventory/china-product-catalog.util';

const prisma = new PrismaClient();

async function main() {
  const hq = await prisma.branch.findUnique({ where: { code: 'EMOTORS-HQ' } });
  if (!hq) throw new Error('HQ catalog branch missing');

  const products = await prisma.product.findMany({
    where: { branchId: hq.id, deletedAt: null },
    include: { productCategory: true },
  });

  let missing = 0;
  let mismatches = 0;
  for (const row of CHINA_PRODUCT_CATALOG_ROWS) {
    const matches = products.filter((product) => product.name === row.name);
    if (matches.length !== 1) {
      console.error(`COUNT ${matches.length}: ${row.name}`);
      missing += 1;
      continue;
    }
    const product = matches[0];
    if (Number(product.weightKg).toFixed(3) !== Number(row.weightKg).toFixed(3)) {
      console.error(`WEIGHT mismatch ${row.name}: ${product.weightKg} != ${row.weightKg}`);
      mismatches += 1;
    }
    if (Number(product.purchasePriceYuan).toFixed(2) !== Number(row.purchasePriceYuan).toFixed(2)) {
      console.error(`PRICE mismatch ${row.name}: ${product.purchasePriceYuan} != ${row.purchasePriceYuan}`);
      mismatches += 1;
    }
  }

  const ids = products.map((product) => product.id);
  const inventory = await prisma.inventoryBalance.count({ where: { productId: { in: ids } } });
  const fifo = await prisma.fifoInventoryBatch.count({ where: { productId: { in: ids } } });
  const shaft = products.find((product) => product.name === 'Желмаян вал двигателя 227 1800В');

  console.log(
    JSON.stringify(
      {
        hqProductCount: products.length,
        catalogRows: CHINA_PRODUCT_CATALOG_ROWS.length,
        missingOrDuplicate: missing,
        fieldMismatches: mismatches,
        inventoryBalances: inventory,
        fifoLayers: fifo,
        price1512Exact: shaft ? String(shaft.purchasePriceYuan) === '15.12' : false,
        sellingPricesAllZero: products.every((product) => Number(product.sellingPriceKgs) === 0),
      },
      null,
      2,
    ),
  );

  if (missing || mismatches || inventory || fifo) {
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
