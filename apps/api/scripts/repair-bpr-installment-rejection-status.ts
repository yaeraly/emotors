import { PrismaClient, BranchPurchaseRequestStatus } from '@prisma/client';
import { resolveBranchDisplayStatus } from '../src/operations/branch-purchase-request.presenter';
import { shouldRepairBprStatusForRejectedInstallment } from '../src/distribution/branch-purchase-payment-status-sync.util';

const lookup = process.argv[2];
if (!lookup) {
  console.error(
    'Usage: npx tsx scripts/repair-bpr-installment-rejection-status.ts <requestNumber|requestId>',
  );
  process.exit(1);
}

async function main() {
  const prisma = new PrismaClient();

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
    process.exit(1);
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
    await prisma.$disconnect();
    return;
  }

  const oldStatus = bpr.status;
  const updated = await prisma.branchPurchaseRequest.update({
    where: { id: bpr.id },
    data: { status: BranchPurchaseRequestStatus.REJECTED },
  });

  await prisma.auditLog.create({
    data: {
      userId: 'system-repair',
      role: 'SYSTEM',
      action: 'BRANCH_ORDER_REJECTED',
      entity: 'BranchPurchaseRequest',
      entityId: bpr.id,
      metadata: {
        bprId: bpr.id,
        installmentId: installment?.id ?? null,
        oldBprStatus: oldStatus,
        newBprStatus: BranchPurchaseRequestStatus.REJECTED,
        decisionBy: 'system-repair',
        timestamp: new Date().toISOString(),
        trigger: 'INSTALLMENT_REJECTED_REPAIR',
        requestNumber: bpr.requestNumber,
      },
    },
  });

  console.log('');
  console.log('=== AFTER REPAIR ===');
  console.log('BPR status:', updated.status);
  console.log('Branch display status:', resolveBranchDisplayStatus(updated.status, []));
  console.log('Expected Branch Sales label: branchRequest.status.REJECTED → Отклонён');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
