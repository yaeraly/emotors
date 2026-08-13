import { PrismaClient } from '@prisma/client';
import { repairBranchPurchaseLinkedInvoicePricesInTx } from '../src/operations/branch-purchase-invoice-repair.util';
import {
  buildBranchPurchaseApprovedInvoiceLines,
  sumBranchPurchaseApprovedInvoiceTotalKgs,
} from '../src/operations/branch-purchase-invoice-lines.util';
import { resolveBranchPurchaseHqReviewEffectiveQuantity } from '../src/operations/branch-purchase-review-totals.util';

const lookup = process.argv[2];
if (!lookup) {
  console.error(
    'Usage: npx tsx scripts/repair-branch-purchase-invoice-prices.ts <requestId|requestNumber>',
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
  const bprItems = before.items.map((item) => ({ ...item, branchType }));

  let invoice = before.convertedOrderId
    ? await prisma.branchInvoice.findFirst({
        where: {
          distributionOrderId: before.convertedOrderId,
          deletedAt: null,
          invoiceCategory: 'PRODUCT_ORDER',
        },
      })
    : null;

  let orderItems = before.convertedOrderId
    ? await prisma.branchDistributionOrderItem.findMany({
        where: { orderId: before.convertedOrderId },
      })
    : [];

  console.log('=== BEFORE REPAIR ===');
  console.log('BPR ID:', before.id);
  console.log('BPR number:', before.requestNumber);
  console.log('Invoice ID:', invoice?.id ?? 'n/a');
  console.log('Branch:', before.branch.name, `(${before.branch.code})`);
  console.log('Branch type:', branchType);
  console.log('BPR approved total:', sumBranchPurchaseApprovedInvoiceTotalKgs(bprItems));
  console.log('Invoice stored total:', invoice ? Number(invoice.totalAmount) : 'n/a');

  const approvedLines = buildBranchPurchaseApprovedInvoiceLines(bprItems);
  console.log('Branch Accountant expected total:', sumBranchPurchaseApprovedInvoiceTotalKgs(bprItems));

  for (const item of before.items) {
    const effectiveQty = resolveBranchPurchaseHqReviewEffectiveQuantity(item);
    const approved = approvedLines.find((line) => line.productId === item.productId);
    const orderItem = orderItems.find((row) => row.productId === item.productId);
    console.log('---');
    console.log('Product:', item.productName);
    console.log('Approved quantity:', effectiveQty);
    console.log('BPR saved unit price:', Number(item.resolvedBranchPriceKgs ?? item.branchPurchasePriceKgs ?? 0));
    console.log('BPR approved line total:', approved?.lineTotal ?? 0);
    console.log('Invoice unit price:', orderItem ? Number(orderItem.unitPrice) : 'n/a');
    console.log('Invoice line total:', orderItem ? Number(orderItem.totalPrice) : 'n/a');
    console.log('Expected line total:', approved?.lineTotal ?? 0);
    console.log(
      'Difference:',
      orderItem && approved
        ? Number(orderItem.totalPrice) - approved.lineTotal
        : 'n/a',
    );
  }

  const result = await prisma.$transaction((tx) =>
    repairBranchPurchaseLinkedInvoicePricesInTx(tx, { requestId: before.id }),
  );

  orderItems = before.convertedOrderId
    ? await prisma.branchDistributionOrderItem.findMany({
        where: { orderId: before.convertedOrderId },
      })
    : [];
  invoice = before.convertedOrderId
    ? await prisma.branchInvoice.findFirst({
        where: {
          distributionOrderId: before.convertedOrderId,
          deletedAt: null,
          invoiceCategory: 'PRODUCT_ORDER',
        },
      })
    : null;

  console.log('\n=== AFTER REPAIR ===');
  console.log('Line repairs:', result.lineRepairs.length);
  console.log('Invoice total:', invoice ? Number(invoice.totalAmount) : 'n/a');
  for (const repair of result.lineRepairs) {
    console.log(
      `Product ${repair.productId}: ${repair.previousUnitPrice} → ${repair.repairedUnitPrice}, line ${repair.previousLineTotal} → ${repair.repairedLineTotal}`,
    );
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
