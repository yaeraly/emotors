/**
 * Read-only HQ FIFO inventory audit for all products.
 *
 * Usage:
 *   cd apps/api && npx tsx scripts/audit-hq-fifo-inventory.ts
 *   npx tsx scripts/audit-hq-fifo-inventory.ts --sku=ABC123
 *   npx tsx scripts/audit-hq-fifo-inventory.ts --product-id=<id> --warehouse-id=<id>
 */
import { PrismaClient } from '@prisma/client';
import { auditHqFifoInventory, parseHqFifoScriptArgs } from '../src/pricing/hq-fifo-audit.util';

async function main() {
  const args = parseHqFifoScriptArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  const { summary, rows } = await auditHqFifoInventory(prisma, args);

  const problemRows = rows.filter((row) => row.problemTypes.length > 0);

  console.log(
    JSON.stringify(
      {
        mode: 'AUDIT_READ_ONLY',
        filters: {
          sku: args.sku ?? null,
          productId: args.productId ?? null,
          warehouseId: args.warehouseId ?? null,
          receiptId: args.receiptId ?? null,
        },
        summary,
        problemProducts: problemRows,
        cleanProductsSample: rows.filter((row) => row.problemTypes.length === 0).slice(0, 10),
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
