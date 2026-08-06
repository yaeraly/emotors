/**
 * Idempotent repair: include HQ Accountant-approved postponed Supplier Payment
 * amounts in procurement себестоимость when estimatedSupplierCostKgs is still zero.
 *
 * Usage:
 *   npx tsx apps/api/scripts/repair-approved-postponed-supplier-cost.ts
 *   npx tsx apps/api/scripts/repair-approved-postponed-supplier-cost.ts --apply
 */
import { PrismaClient } from '@prisma/client';
import {
  isSupplierPaymentApprovedForLandedCost,
  resolveApprovedSupplierAmountKgs,
} from '../src/procurement/procurement-cost.util';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');

async function main() {
  const orders = await prisma.procurementOrder.findMany({
    where: {
      deletedAt: null,
      invoiceSentToAccountantAt: { not: null },
      OR: [
        { supplierPaymentStatus: 'PAYMENT_POSTPONED' },
        { invoiceReviewStatus: 'APPROVED' },
      ],
    },
    select: {
      id: true,
      orderNumber: true,
      defaultYuanRate: true,
      weightedAverageYuanRate: true,
      totalYuan: true,
      requestedPaymentYuan: true,
      totalPaidYuan: true,
      remainingYuan: true,
      estimatedSupplierCostKgs: true,
      supplierInvoiceNumber: true,
      invoiceReviewStatus: true,
      supplierPaymentStatus: true,
      invoiceSentToAccountantAt: true,
    },
  });

  let affected = 0;
  for (const order of orders) {
    const eligible = isSupplierPaymentApprovedForLandedCost({
      invoiceSentToAccountantAt: order.invoiceSentToAccountantAt,
      supplierInvoiceNumber: order.supplierInvoiceNumber,
      invoiceReviewStatus: order.invoiceReviewStatus,
      supplierPaymentStatus: order.supplierPaymentStatus,
    });
    if (!eligible) continue;

    const rate = Number(order.weightedAverageYuanRate ?? order.defaultYuanRate ?? 0);
    const expectedSupplierCostKgs = resolveApprovedSupplierAmountKgs({
      totalYuan: Number(order.totalYuan ?? 0),
      requestedPaymentYuan:
        order.requestedPaymentYuan != null ? Number(order.requestedPaymentYuan) : null,
      estimatedYuanRate: rate,
    });
    if (!(expectedSupplierCostKgs > 0)) continue;

    const current = Number(order.estimatedSupplierCostKgs ?? 0);
    if (Math.abs(current - expectedSupplierCostKgs) <= 0.05) continue;

    affected += 1;
    console.log(
      JSON.stringify({
        orderId: order.id,
        orderNumber: order.orderNumber,
        invoiceReviewStatus: order.invoiceReviewStatus,
        supplierPaymentStatus: order.supplierPaymentStatus,
        approvedSupplierCostKgs: expectedSupplierCostKgs,
        oldEstimatedSupplierCostKgs: current,
        newEstimatedSupplierCostKgs: expectedSupplierCostKgs,
        paidYuan: Number(order.totalPaidYuan ?? 0),
        remainingYuan: Number(order.remainingYuan ?? 0),
      }),
    );

    if (!apply) continue;

    await prisma.procurementOrder.update({
      where: { id: order.id },
      data: { estimatedSupplierCostKgs: expectedSupplierCostKgs },
    });
    await prisma.auditLog.create({
      data: {
        userId: 'system-repair',
        role: 'SYSTEM',
        action: 'SUPPLIER_COST_RECALCULATED',
        entity: 'ProcurementOrder',
        entityId: order.id,
        metadata: {
          procurementOrderId: order.id,
          supplierInvoiceId: order.id,
          approvedAmount: expectedSupplierCostKgs,
          paidAmount: Number(order.totalPaidYuan ?? 0),
          remainingAmount: Number(order.remainingYuan ?? 0),
          paymentStatus: order.supplierPaymentStatus,
          oldSupplierCost: current,
          newSupplierCost: expectedSupplierCostKgs,
          actorUserId: 'system-repair',
          timestamp: new Date().toISOString(),
          repairScript: 'repair-approved-postponed-supplier-cost.ts',
        },
      },
    });
  }

  console.log(
    JSON.stringify({
      mode: apply ? 'apply' : 'dry-run',
      affectedOrders: affected,
    }),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
