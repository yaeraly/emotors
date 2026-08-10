/**
 * Repair HQ Branch BPR totals that drifted via rounded display unit × quantity.
 *
 * Examples:
 *   BPR-1786271735303  914369.08 → 914369.80 (−0.72)
 *   BPR-1786370094023  822036.39 → 822036.20 (+0.19)
 *
 * Usage:
 *   cd apps/api && npx tsx scripts/repair-hq-branch-china-batch-totals.ts BPR-1786271735303 BPR-1786370094023
 *   cd apps/api && npx tsx scripts/repair-hq-branch-china-batch-totals.ts --apply BPR-1786271735303
 */
import { PrismaClient } from '@prisma/client';
import {
  deriveDisplayUnitCost,
  roundDisplayMoney,
  sumDisplayMoneyTotals,
} from '../src/pricing/product-cost-precision.util';
import { resolveBranchPurchaseFifoLineCost } from '../src/operations/branch-purchase-fifo-cost.util';
import {
  resolveBranchPurchaseLinePayableAmount,
  shouldTransferBranchPurchaseAtCost,
} from '../src/operations/branch-purchase-estimated-amount.util';
import { computeBranchPurchaseHqReviewLineAmountKgs } from '../src/operations/branch-purchase-review-totals.util';
import { PricingFifoService } from '../src/pricing/pricing-fifo.service';
import type { PrismaService } from '../src/prisma/prisma.service';

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
  const pricingFifoService = new PricingFifoService(prisma as unknown as PrismaService);

  for (const lookup of lookups) {
    const bpr = await prisma.branchPurchaseRequest.findFirst({
      where: {
        deletedAt: null,
        OR: [{ requestNumber: lookup }, { id: lookup }],
      },
      include: {
        branch: { select: { name: true, code: true, branchType: true, hqToBranchMarkupPercent: true } },
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
    console.log('--- STEP 1 forensics headers printed after line scan ---');

    if (!shouldTransferBranchPurchaseAtCost(branchType)) {
      console.log('SKIP: not HQ_BRANCH');
      continue;
    }

    const warehouseId = bpr.assignedHqWarehouseId;
    if (!warehouseId) {
      console.error('No assigned HQ warehouse');
      continue;
    }

    await pricingFifoService.syncFifoBatchesFromHqStockMovements();

    let sumFifo = 0;
    let sumStoredLine = 0;
    let sumUnitTimesQty = 0;
    const linePatches: Array<{
      itemId: string;
      productName: string;
      quantity: number;
      oldLine: number;
      newLine: number;
      unitTimesQty: number;
      difference: number;
    }> = [];

    for (const item of bpr.items) {
      const qty = item.approvedQuantity ?? item.quantity;
      if (qty <= 0) continue;

      const fifoCost = await resolveBranchPurchaseFifoLineCost(pricingFifoService, prisma, {
        productId: item.productId,
        warehouseId,
        quantity: qty,
        branchType,
        hqToBranchMarkupPercent: Number(bpr.branch.hqToBranchMarkupPercent ?? 0),
        fallbackUnitCost: Number(item.estimatedUnitCost ?? 0),
        fallbackUnitPrice: Number(item.resolvedBranchPriceKgs ?? 0),
      });

      const authoritative = resolveBranchPurchaseLinePayableAmount({
        branchType,
        quantity: qty,
        estimatedLineProductCostKgs: fifoCost.estimatedLineProductCostKgs,
        unitPriceKgs: Number(item.resolvedBranchPriceKgs ?? 0),
        hasPricingPolicy: true,
      });
      const fromReviewUtil = computeBranchPurchaseHqReviewLineAmountKgs({
        quantity: item.quantity,
        approvedQuantity: item.approvedQuantity,
        lineStatus: item.lineStatus,
        resolvedBranchPriceKgs: item.resolvedBranchPriceKgs,
        totalAmount: item.totalAmount,
        approvedLineTotalKgs: item.approvedLineTotalKgs,
        estimatedLineProductCostKgs: fifoCost.estimatedLineProductCostKgs,
        branchType,
      });
      const oldLine = roundDisplayMoney(Number(item.totalAmount ?? 0));
      const displayUnit = deriveDisplayUnitCost(authoritative, qty);
      const unitTimesQty = roundDisplayMoney(displayUnit * qty);

      sumFifo = roundDisplayMoney(sumFifo + authoritative);
      sumStoredLine = roundDisplayMoney(sumStoredLine + oldLine);
      sumUnitTimesQty = roundDisplayMoney(sumUnitTimesQty + unitTimesQty);

      console.log('---');
      console.log('Product:', item.productName);
      console.log('Qty transferred:', qty);
      console.log('Raw FIFO/inventory cost:', fifoCost.estimatedLineProductCostKgs);
      console.log('Authoritative transfer cost:', authoritative);
      console.log('Review util cost:', fromReviewUtil);
      console.log('Displayed unit price:', displayUnit);
      console.log('BPR line total (stored):', oldLine);
      console.log('unit×qty (forbidden):', unitTimesQty);
      console.log('Difference (stored - authoritative):', roundDisplayMoney(oldLine - authoritative));

      if (Math.abs(oldLine - authoritative) > 0.009 || Math.abs(fromReviewUtil - authoritative) > 0.009) {
        linePatches.push({
          itemId: item.id,
          productName: item.productName,
          quantity: qty,
          oldLine,
          newLine: authoritative,
          unitTimesQty,
          difference: roundDisplayMoney(oldLine - authoritative),
        });
      }
    }

    console.log('SUM FIFO/inventory costs:', sumFifo);
    console.log('SUM stored BPR line costs:', sumStoredLine);
    console.log('SUM unit×qty (drift source):', sumUnitTimesQty);
    console.log('Stored BPR total:', Number(bpr.totalEstimatedAmount));
    console.log('Difference (stored header - FIFO):', roundDisplayMoney(Number(bpr.totalEstimatedAmount) - sumFifo));

    if (!apply) {
      console.log('Dry-run only. Re-run with --apply to persist.');
      continue;
    }

    await prisma.$transaction(async (tx) => {
      for (const patch of linePatches) {
        const unit = deriveDisplayUnitCost(patch.newLine, patch.quantity);
        await tx.branchPurchaseRequestItem.update({
          where: { id: patch.itemId },
          data: {
            estimatedLineProductCostKgs: patch.newLine,
            estimatedUnitCost: unit,
            totalAmount: patch.newLine,
            approvedLineTotalKgs: patch.newLine,
            resolvedBranchPriceKgs: unit,
          },
        });
      }
      await tx.branchPurchaseRequest.update({
        where: { id: bpr.id },
        data: { totalEstimatedAmount: sumFifo },
      });

      if (bpr.convertedOrderId) {
        const orderItems = await tx.branchDistributionOrderItem.findMany({
          where: { orderId: bpr.convertedOrderId },
        });
        for (const orderItem of orderItems) {
          const bprItem = bpr.items.find((row) => row.productId === orderItem.productId);
          if (!bprItem) continue;
          const qty = bprItem.approvedQuantity ?? bprItem.quantity;
          const patch = linePatches.find((row) => row.itemId === bprItem.id);
          const lineTotal = patch?.newLine ?? roundDisplayMoney(Number(bprItem.totalAmount ?? 0));
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
        const orderTotal = sumFifo;
        await tx.branchDistributionOrder.update({
          where: { id: bpr.convertedOrderId },
          data: { totalAmount: orderTotal, totalCost: orderTotal, totalProfit: 0 },
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
              totalAmount: orderTotal,
              debtAmount: roundDisplayMoney(Math.max(orderTotal - paid, 0)),
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
            oldTotal: Number(bpr.totalEstimatedAmount),
            newTotal: sumFifo,
            difference: roundDisplayMoney(sumFifo - Number(bpr.totalEstimatedAmount)),
            linePatchCount: linePatches.length,
            timestamp: new Date().toISOString(),
          },
        },
      });
    });

    console.log('APPLIED. New BPR total:', sumFifo);
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
