import { PrismaClient } from '@prisma/client';
import { repairBranchPurchaseRequestDerivedTotalsInTx } from '../src/operations/branch-purchase-totals-repair.util';
import {
  assertBranchPurchaseRequestTotalParity,
} from '../src/operations/branch-purchase-totals-repair.util';

const requestId = process.argv[2];
if (!requestId) {
  console.error('Usage: npx tsx scripts/repair-branch-purchase-request-totals.ts <requestId>');
  process.exit(1);
}

async function main() {
  const prisma = new PrismaClient();

  const before = await prisma.branchPurchaseRequest.findUnique({
    where: { id: requestId },
    include: {
      branch: { select: { id: true, name: true, code: true, branchType: true } },
      items: { orderBy: { position: 'asc' } },
    },
  });

  if (!before) {
    console.error('ORDER NOT FOUND:', requestId);
    process.exit(1);
  }

  console.log('=== BEFORE REPAIR ===');
  console.log('Order ID:', before.id);
  console.log('Order number:', before.requestNumber);
  console.log('Branch:', before.branch.name, `(${before.branch.code})`, before.branch.branchType);
  console.log('Status:', before.status);
  console.log('Stored order total:', Number(before.totalEstimatedAmount));

  const parityBefore = assertBranchPurchaseRequestTotalParity({
    ...before,
    items: before.items,
    branch: before.branch,
  });
  console.log('HQ Sales presenter total:', parityBefore.hqSalesTotalKgs);
  console.log('Branch Manager presenter total:', parityBefore.branchManagerTotalKgs);
  console.log('Sum sanitized line totals:', parityBefore.lineSumKgs);
  console.log('Presenter parity diff:', parityBefore.hqSalesTotalKgs - parityBefore.branchManagerTotalKgs);

  for (const item of before.items) {
    console.log('---');
    console.log('Product:', item.productName);
    console.log('Requested qty:', item.quantity);
    console.log('Approved qty:', item.approvedQuantity);
    console.log('Line status:', item.lineStatus);
    console.log('resolvedBranchPriceKgs:', item.resolvedBranchPriceKgs != null ? Number(item.resolvedBranchPriceKgs) : null);
    console.log('estimatedLineProductCostKgs:', Number(item.estimatedLineProductCostKgs));
    console.log('DB totalAmount:', Number(item.totalAmount));
    console.log('DB approvedLineTotalKgs:', item.approvedLineTotalKgs != null ? Number(item.approvedLineTotalKgs) : null);
  }

  const repair = await prisma.$transaction((tx) =>
    repairBranchPurchaseRequestDerivedTotalsInTx(tx, requestId),
  );

  console.log('');
  console.log('=== REPAIR RESULT ===');
  console.log('Previous order total:', repair.previousOrderTotalKgs);
  console.log('Repaired order total:', repair.repairedOrderTotalKgs);
  console.log('Lines repaired:', repair.lineRepairs.length);
  for (const line of repair.lineRepairs) {
    console.log(`  ${line.itemId}: ${line.previousKgs} → ${line.repairedKgs}`);
  }

  const after = await prisma.branchPurchaseRequest.findUnique({
    where: { id: requestId },
    include: {
      branch: { select: { branchType: true } },
      items: { orderBy: { position: 'asc' } },
    },
  });

  if (after) {
    const parityAfter = assertBranchPurchaseRequestTotalParity({
      ...after,
      items: after.items,
      branch: after.branch,
    });
    console.log('');
    console.log('=== AFTER REPAIR ===');
    console.log('Stored order total:', Number(after.totalEstimatedAmount));
    console.log('HQ Sales presenter total:', parityAfter.hqSalesTotalKgs);
    console.log('Branch Manager presenter total:', parityAfter.branchManagerTotalKgs);
    console.log('Sum sanitized line totals:', parityAfter.lineSumKgs);
    console.log(
      'Parity OK:',
      parityAfter.hqSalesTotalKgs === parityAfter.branchManagerTotalKgs &&
        parityAfter.branchManagerTotalKgs === parityAfter.lineSumKgs,
    );
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
