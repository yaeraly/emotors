import { PrismaClient } from '@prisma/client';
import { resolveBranchDisplayStatus } from '../src/operations/branch-purchase-request.presenter';
import { shouldRepairBprStatusForRejectedInstallment } from '../src/distribution/branch-purchase-payment-status-sync.util';
import {
  findStaleBprInstallmentRejections,
  repairAllStaleBprInstallmentRejectionsInTx,
} from '../src/distribution/branch-purchase-installment-rejection-repair.util';

const args = process.argv.slice(2);
if (!args.length) {
  console.error(
    'Usage: npx tsx scripts/repair-bpr-installment-rejection-status.ts [--all | <requestNumber|requestId> ...]',
  );
  process.exit(1);
}

async function main() {
  const prisma = new PrismaClient();
  const repairAll = args.includes('--all');
  const lookups = repairAll ? [] : args.filter((arg) => arg !== '--all');

  if (repairAll) {
    const stale = await findStaleBprInstallmentRejections(prisma);
    console.log(`Found ${stale.length} stale BPR(s) with rejected HQ CEO installment decision.`);
    for (const row of stale) {
      console.log('---');
      console.log('BPR number:', row.requestNumber);
      console.log('BPR ID:', row.bprId);
      console.log('Current status:', row.bprStatus);
      console.log('Installment status:', row.installmentStatus);
      console.log('Branch display (before):', resolveBranchDisplayStatus(row.bprStatus, []));
    }

    if (!stale.length) {
      await prisma.$disconnect();
      return;
    }

    const results = await prisma.$transaction((tx) =>
      repairAllStaleBprInstallmentRejectionsInTx(tx, stale),
    );

    console.log('');
    console.log('=== REPAIR COMPLETE ===');
    for (const result of results) {
      console.log(
        `${result.requestNumber}: ${result.oldStatus} → ${result.newStatus} (display: ${resolveBranchDisplayStatus(result.newStatus, [])})`,
      );
    }
    await prisma.$disconnect();
    return;
  }

  for (const lookup of lookups) {
    const bpr = await prisma.branchPurchaseRequest.findFirst({
      where: {
        deletedAt: null,
        OR: [{ requestNumber: lookup }, { id: lookup }],
      },
      include: {
        branch: { select: { name: true, branchType: true } },
      },
    });

    if (!bpr) {
      console.error('BPR NOT FOUND:', lookup);
      continue;
    }

    const order = bpr.convertedOrderId
      ? await prisma.branchDistributionOrder.findFirst({
          where: { id: bpr.convertedOrderId, deletedAt: null },
          include: {
            branchInvoices: {
              where: { deletedAt: null },
              include: { branchOrderInstallment: true },
            },
          },
        })
      : null;

    const productInvoice = order?.branchInvoices?.find(
      (row) => !row.invoiceCategory || row.invoiceCategory === 'PRODUCT_ORDER',
    );
    const installment = productInvoice?.branchOrderInstallment ?? null;

    console.log('=== BEFORE REPAIR ===');
    console.log('BPR ID:', bpr.id);
    console.log('BPR number:', bpr.requestNumber);
    console.log('Branch:', bpr.branch.name, bpr.branch.branchType);
    console.log('BPR status:', bpr.status);
    console.log('Branch display status:', resolveBranchDisplayStatus(bpr.status, []));
    console.log('Installment status:', installment?.status ?? null);
    console.log('Installment ID:', installment?.id ?? null);
    console.log('Invoice status:', productInvoice?.status ?? null);

    const needsRepair = shouldRepairBprStatusForRejectedInstallment({
      bprStatus: bpr.status,
      installmentStatus: installment?.status ?? null,
    });
    console.log('Needs repair:', needsRepair);

    if (!needsRepair) {
      console.log('No repair required.');
      continue;
    }

    const stale = await findStaleBprInstallmentRejections(prisma, { requestIds: [bpr.id] });
    const [result] = await prisma.$transaction((tx) =>
      repairAllStaleBprInstallmentRejectionsInTx(tx, stale),
    );

    console.log('');
    console.log('=== AFTER REPAIR ===');
    console.log('BPR status:', result?.newStatus ?? bpr.status);
    console.log(
      'Branch display status:',
      resolveBranchDisplayStatus(result?.newStatus ?? bpr.status, []),
    );
    console.log('Expected Branch Sales label: branchRequest.status.REJECTED → Отклонён');
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
