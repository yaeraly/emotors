/**
 * Repair HQ Branch BPR totals that drifted via rounded display unit × quantity.
 *
 * Uses the stored FIFO snapshot (`estimatedLineProductCostKgs`) — never live FIFO
 * (layers may already be consumed) and never unit × qty reconstruction.
 *
 * Examples:
 *   BPR-1785478341861  914368.98 → 914369.80 (−0.82)
 *   BPR-1786271735303  914369.08 → 914369.80 (−0.72)
 *   BPR-1786370094023  822036.39 → 822036.20 (+0.19)
 *
 * Usage:
 *   cd apps/api && npx tsx scripts/repair-hq-branch-china-batch-totals.ts BPR-1785478341861
 *   cd apps/api && npx tsx scripts/repair-hq-branch-china-batch-totals.ts --apply BPR-1785478341861
 */
import { PrismaClient } from '@prisma/client';
import { deriveDisplayUnitCost, roundDisplayMoney } from '../src/pricing/product-cost-precision.util';
import { shouldTransferBranchPurchaseAtCost } from '../src/operations/branch-purchase-estimated-amount.util';
import {
  planHqBranchBprRepairFromStoredFifo,
  sumHqBranchStoredFifoSnapshots,
} from '../src/operations/repair-hq-branch-stored-fifo.util';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const lookups = args.filter((arg) => arg !== '--apply');

if (!lookups.length) {
  console.error(
    'Usage: npx tsx scripts/repair-hq-branch-china-batch-totals.ts [--apply] <requestNumber|requestId>...',
  );
  process.exit(1);
}

async function main() {
  const prisma = new PrismaClient();

  for (const lookup of lookups) {
    const bpr = await prisma.branchPurchaseRequest.findFirst({
      where: {
        deletedAt: null,
        OR: [{ requestNumber: lookup }, { id: lookup }],
      },
      include: {
        branch: { select: { name: true, code: true, branchType: true } },
        items: { orderBy: { position: 'asc' } },
      },
    });

    if (!bpr) {
      console.error('NOT FOUND:', lookup);
      continue;
    }

    const branchType = bpr.branch.branchType;
    console.log('\n==========', bpr.requestNumber, '==========');
    console.log('Branch:', bpr.branch.name, branchType);
    console.log('Stored BPR total:', Number(bpr.totalEstimatedAmount));
    console.log('HQ Branch at-cost:', shouldTransferBranchPurchaseAtCost(branchType));

    if (!shouldTransferBranchPurchaseAtCost(branchType)) {
      console.log('SKIP: not HQ_BRANCH');
      continue;
    }

    const plan = planHqBranchBprRepairFromStoredFifo({
      branchType,
      storedHeaderTotalKgs: bpr.totalEstimatedAmount,
      items: bpr.items,
    });
    const sumFifo = sumHqBranchStoredFifoSnapshots(bpr.items);

    console.log('SUM stored FIFO snapshots (estimatedLineProductCostKgs):', sumFifo);
    console.log('Authoritative BPR total after repair:', plan.newHeaderTotalKgs);
    console.log('Stored BPR total before repair:', plan.oldHeaderTotalKgs);
    console.log(
      'Difference (stored header - FIFO):',
      roundDisplayMoney(plan.oldHeaderTotalKgs - plan.newHeaderTotalKgs),
    );

    for (const patch of plan.linePatches) {
      console.log('---');
      console.log('Product:', patch.productName);
      console.log('SKU:', patch.sku);
      console.log('Qty transferred:', patch.quantity);
      console.log('Stored FIFO snapshot:', patch.fifoSnapshotKgs);
      console.log('BPR line total (stored):', patch.oldLineKgs);
      console.log('unit×qty (forbidden):', patch.unitTimesQtyKgs);
      console.log('Authoritative line total:', patch.newLineKgs);
      console.log('Difference (stored - FIFO):', patch.differenceKgs);
    }

    if (!apply) {
      console.log('Dry-run only. Re-run with --apply to persist.');
      continue;
    }

    await prisma.$transaction(async (tx) => {
      for (const patch of plan.linePatches) {
        const unit = deriveDisplayUnitCost(patch.newLineKgs, patch.quantity);
        await tx.branchPurchaseRequestItem.update({
          where: { id: patch.itemId },
          data: {
            totalAmount: patch.newLineKgs,
            approvedLineTotalKgs: patch.newLineKgs,
            resolvedBranchPriceKgs: unit,
          },
        });
      }
      await tx.branchPurchaseRequest.update({
        where: { id: bpr.id },
        data: { totalEstimatedAmount: plan.newHeaderTotalKgs },
      });

      if (bpr.convertedOrderId) {
        const orderItems = await tx.branchDistributionOrderItem.findMany({
          where: { orderId: bpr.convertedOrderId },
        });
        for (const orderItem of orderItems) {
          const bprItem = bpr.items.find((row) => row.productId === orderItem.productId);
          if (!bprItem) continue;
          const qty = bprItem.approvedQuantity ?? bprItem.quantity;
          const patch = plan.linePatches.find((row) => row.itemId === bprItem.id);
          const lineTotal = patch?.newLineKgs ?? roundDisplayMoney(Number(bprItem.estimatedLineProductCostKgs ?? 0));
          const unit = deriveDisplayUnitCost(lineTotal, qty);
          await tx.branchDistributionOrderItem.update({
            where: { id: orderItem.id },
            data: {
              unitPrice: unit,
              totalPrice: lineTotal,
              unitCost: unit,
              totalCost: lineTotal,
              profit: 0,
            },
          });
        }
        await tx.branchDistributionOrder.update({
          where: { id: bpr.convertedOrderId },
          data: {
            totalAmount: plan.newHeaderTotalKgs,
            totalCost: plan.newHeaderTotalKgs,
            totalProfit: 0,
          },
        });
        const invoice = await tx.branchInvoice.findFirst({
          where: {
            distributionOrderId: bpr.convertedOrderId,
            deletedAt: null,
            invoiceCategory: 'PRODUCT_ORDER',
          },
        });
        if (invoice) {
          const paid = roundDisplayMoney(Number(invoice.paidAmount ?? 0));
          await tx.branchInvoice.update({
            where: { id: invoice.id },
            data: {
              totalAmount: plan.newHeaderTotalKgs,
              debtAmount: roundDisplayMoney(Math.max(plan.newHeaderTotalKgs - paid, 0)),
            },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          userId: 'system-repair',
          role: 'SYSTEM',
          action: 'HQ_BRANCH_TRANSFER_COST_REPAIRED',
          entity: 'BranchPurchaseRequest',
          entityId: bpr.id,
          metadata: {
            requestNumber: bpr.requestNumber,
            oldTotal: plan.oldHeaderTotalKgs,
            newTotal: plan.newHeaderTotalKgs,
            difference: roundDisplayMoney(plan.newHeaderTotalKgs - plan.oldHeaderTotalKgs),
            linePatchCount: plan.linePatches.length,
            source: 'stored_estimatedLineProductCostKgs',
            timestamp: new Date().toISOString(),
          },
        },
      });
    });

    console.log('APPLIED. New BPR total:', plan.newHeaderTotalKgs);
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
