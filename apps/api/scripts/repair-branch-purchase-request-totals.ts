import { PrismaClient } from '@prisma/client';
import {
  assertBranchPurchaseRequestTotalParity,
  repairBranchPurchaseRequestDerivedTotalsInTx,
} from '../src/operations/branch-purchase-totals-repair.util';
import {
  computeBranchPurchaseHqReviewLineAmountKgs,
  resolveBranchPurchaseHqReviewEffectiveQuantity,
} from '../src/operations/branch-purchase-review-totals.util';
import { roundDisplayMoney } from '../src/pricing/product-cost-precision.util';

const lookup = process.argv[2];
if (!lookup) {
  console.error(
    'Usage: npx tsx scripts/repair-branch-purchase-request-totals.ts <requestId|requestNumber>',
  );
  process.exit(1);
}

async function main() {
  const prisma = new PrismaClient();

  const before = await prisma.branchPurchaseRequest.findFirst({
    where: {
      deletedAt: null,
      OR: [{ id: lookup }, { requestNumber: lookup }],
    },
    include: {
      branch: { select: { id: true, name: true, code: true, branchType: true } },
      items: { orderBy: { position: 'asc' } },
    },
  });

  if (!before) {
    console.error('ORDER NOT FOUND:', lookup);
    process.exit(1);
  }

  const branchType = before.branch.branchType;
  console.log('=== BEFORE REPAIR ===');
  console.log('BPR ID:', before.id);
  console.log('BPR number:', before.requestNumber);
  console.log('Branch:', before.branch.name, `(${before.branch.code})`);
  console.log('Branch type:', branchType);
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

  let authoritativeLineSum = 0;
  let commercialLineSum = 0;
  for (const item of before.items) {
    const effectiveQty = resolveBranchPurchaseHqReviewEffectiveQuantity(item);
    const unit = item.resolvedBranchPriceKgs != null ? Number(item.resolvedBranchPriceKgs) : 0;
    const commercial = roundDisplayMoney(unit * effectiveQty);
    const authoritative = computeBranchPurchaseHqReviewLineAmountKgs({
      quantity: item.quantity,
      approvedQuantity: item.approvedQuantity,
      lineStatus: item.lineStatus,
      resolvedBranchPriceKgs: item.resolvedBranchPriceKgs,
      estimatedLineProductCostKgs: item.estimatedLineProductCostKgs,
      hasPricingPolicyAtReview: item.hasPricingPolicyAtReview ?? item.hasPricingPolicyAtSubmit,
      branchType,
    });
    authoritativeLineSum = roundDisplayMoney(authoritativeLineSum + authoritative);
    commercialLineSum = roundDisplayMoney(commercialLineSum + commercial);

    console.log('---');
    console.log('Product:', item.productName);
    console.log('Requested quantity:', item.quantity);
    console.log('Approved quantity:', item.approvedQuantity);
    console.log('Effective quantity:', effectiveQty);
    console.log('Saved order-line branch price:', unit);
    console.log('Saved FIFO line cost:', Number(item.estimatedLineProductCostKgs ?? 0));
    console.log('Branch Sales/HQ/BA authoritative line total:', authoritative);
    console.log('Wrong commercial unit×qty line total:', commercial);
    console.log('Difference:', roundDisplayMoney(authoritative - commercial));
    console.log('DB totalAmount:', Number(item.totalAmount));
    console.log(
      'DB approvedLineTotalKgs:',
      item.approvedLineTotalKgs != null ? Number(item.approvedLineTotalKgs) : null,
    );
  }
  console.log('---');
  console.log('Sum of authoritative current line totals:', authoritativeLineSum);
  console.log('Sum of wrong commercial line totals:', commercialLineSum);
  console.log(
    'Order-level commercial drift:',
    roundDisplayMoney(authoritativeLineSum - commercialLineSum),
  );

  const repair = await prisma.$transaction((tx) =>
    repairBranchPurchaseRequestDerivedTotalsInTx(tx, before.id),
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
    where: { id: before.id },
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
