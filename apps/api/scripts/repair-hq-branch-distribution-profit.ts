/**
 * Repair HQ Branch distribution order profit (HQ Office → HQ Branch internal transfer = 0 profit).
 *
 * Usage:
 *   cd apps/api && npx tsx scripts/repair-hq-branch-distribution-profit.ts DO-BPR-1786458007921
 *   cd apps/api && npx tsx scripts/repair-hq-branch-distribution-profit.ts --apply DO-BPR-1786458007921
 */
import { PrismaClient } from '@prisma/client';
import {
  applyHqBranchInternalDistributionProfit,
  sumHqBranchDistributionOrderTotals,
} from '../src/distribution/hq-branch-distribution-profit.util';
import { shouldTransferBranchPurchaseAtCost } from '../src/operations/branch-purchase-estimated-amount.util';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const lookups = args.filter((arg) => arg !== '--apply');

if (!lookups.length) {
  console.error(
    'Usage: npx tsx scripts/repair-hq-branch-distribution-profit.ts [--apply] <orderNumber|orderId>...',
  );
  process.exit(1);
}

async function main() {
  const prisma = new PrismaClient();

  for (const lookup of lookups) {
    const order = await prisma.branchDistributionOrder.findFirst({
      where: {
        deletedAt: null,
        OR: [{ orderNumber: lookup }, { id: lookup }],
      },
      include: {
        branch: { select: { name: true, code: true, branchType: true } },
        items: true,
      },
    });

    if (!order) {
      console.error('NOT FOUND:', lookup);
      continue;
    }

    const branchType = order.branch.branchType;
    console.log('\n==========', order.orderNumber, '==========');
    console.log('Order ID:', order.id);
    console.log('Branch:', order.branch.name, branchType);
    console.log('Status:', order.status);
    console.log('Before totalAmount:', Number(order.totalAmount));
    console.log('Before totalCost:', Number(order.totalCost));
    console.log('Before totalProfit:', Number(order.totalProfit));

    if (!shouldTransferBranchPurchaseAtCost(branchType)) {
      console.log('SKIP: receiving branch is not HQ_BRANCH');
      continue;
    }

    const normalizedLines = order.items.map((item) =>
      applyHqBranchInternalDistributionProfit(
        {
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          unitCost: Number(item.unitCost),
          totalPrice: Number(item.totalPrice),
          totalCost: Number(item.totalCost),
          profit: Number(item.profit),
        },
        branchType,
      ),
    );

    const totals = sumHqBranchDistributionOrderTotals(normalizedLines, branchType);
    console.log('After totalAmount:', totals.totalAmount);
    console.log('After totalCost:', totals.totalCost);
    console.log('After totalProfit:', totals.totalProfit);

    if (!apply) {
      console.log('DRY RUN — pass --apply to persist');
      continue;
    }

    await prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        const normalized = applyHqBranchInternalDistributionProfit(
          {
            quantity: item.quantity,
            unitPrice: Number(item.unitPrice),
            unitCost: Number(item.unitCost),
            totalPrice: Number(item.totalPrice),
            totalCost: Number(item.totalCost),
            profit: Number(item.profit),
          },
          branchType,
        );
        await tx.branchDistributionOrderItem.update({
          where: { id: item.id },
          data: {
            unitPrice: normalized.unitPrice,
            unitCost: normalized.unitCost,
            totalPrice: normalized.totalPrice,
            totalCost: normalized.totalCost,
            profit: normalized.profit,
          },
        });
      }

      await tx.branchDistributionOrder.update({
        where: { id: order.id },
        data: {
          totalAmount: totals.totalAmount,
          totalCost: totals.totalCost,
          totalProfit: totals.totalProfit,
        },
      });
    });

    console.log('REPAIRED');
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
