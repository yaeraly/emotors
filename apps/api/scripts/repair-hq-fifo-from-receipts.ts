/**
 * Generic idempotent repair: backfill HQ FIFO layers from completed China receipts
 * and business StockMovement IN records for all products.
 *
 * Usage:
 *   cd apps/api && npm run repair:hq-fifo-from-receipts -- --dry-run
 *   npm run repair:hq-fifo-from-receipts -- --apply
 *   npm run repair:hq-fifo-from-receipts -- --dry-run --sku=ABC123
 *   npm run repair:hq-fifo-from-receipts -- --apply --product-id=<id>
 */
import { PrismaClient } from '@prisma/client';
import {
  auditHqFifoInventory,
  parseHqFifoScriptArgs,
  repairHqFifoFromReceipts,
} from '../src/pricing/hq-fifo-audit.util';
import { PricingFifoService } from '../src/pricing/pricing-fifo.service';

async function main() {
  const args = parseHqFifoScriptArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  const fifoService = new PricingFifoService(prisma as any);

  const beforeAudit = await auditHqFifoInventory(prisma, args);

  let repairResults: Awaited<ReturnType<typeof repairHqFifoFromReceipts>> = [];
  if (args.apply) {
    await prisma.$transaction(async (tx) => {
      repairResults = await repairHqFifoFromReceipts(tx, args, true);
    });
  } else {
    repairResults = await repairHqFifoFromReceipts(prisma, args, false);
  }

  if (args.apply) {
    await fifoService.syncFifoBatchesFromHqStockMovements();
  }

  const afterAudit = args.apply ? await auditHqFifoInventory(prisma, args) : beforeAudit;

  const actionable = repairResults.filter((row) =>
    [
      'would_create_movement',
      'would_create_fifo',
      'would_repair_fifo',
      'would_repair_movement',
      'created_movement',
      'created_fifo',
      'repaired_fifo',
      'repaired_movement',
    ].includes(row.action),
  );

  console.log(
    JSON.stringify(
      {
        mode: args.apply ? 'APPLY' : 'DRY_RUN',
        filters: {
          sku: args.sku ?? null,
          productId: args.productId ?? null,
          warehouseId: args.warehouseId ?? null,
          receiptId: args.receiptId ?? null,
        },
        auditBefore: beforeAudit.summary,
        auditAfter: afterAudit.summary,
        repairSummary: {
          totalActions: repairResults.length,
          wouldCreateOrRepair: actionable.length,
          createdMovements: repairResults.filter((r) => r.action === 'created_movement').length,
          repairedMovements: repairResults.filter((r) => r.action === 'repaired_movement').length,
          createdFifoLayers: repairResults.filter((r) => r.action === 'created_fifo').length,
          repairedFifoLayers: repairResults.filter((r) => r.action === 'repaired_fifo').length,
          skippedExisting: repairResults.filter((r) => r.action === 'skipped_existing').length,
          skippedSeed: repairResults.filter((r) => r.action === 'skipped_seed').length,
          skippedAmbiguous: repairResults.filter((r) => r.action === 'skipped_ambiguous').length,
          errors: repairResults.filter((r) => r.action === 'error'),
        },
        repairActions: actionable.slice(0, 200),
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
