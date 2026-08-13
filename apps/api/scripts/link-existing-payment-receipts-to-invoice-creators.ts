/**
 * Idempotent backfill: link existing payment receipts to invoice creators and
 * create missing creator notifications/audit events for historical payments.
 *
 * Usage:
 *   cd apps/api && npx tsx scripts/link-existing-payment-receipts-to-invoice-creators.ts
 *   npx tsx scripts/link-existing-payment-receipts-to-invoice-creators.ts --apply
 */
import { FileAttachmentEntityType, NotificationModule, PrismaClient } from '@prisma/client';
import {
  deliverReceiptsToCreatorInTx,
  findAlreadyDeliveredAttachmentIds,
  findReceiptAttachmentsForContext,
  resolveInvoiceCreatorUserId,
} from '../src/procurement/receipt-delivery.util';
import { NotificationsService } from '../src/notifications/notifications.service';

const apply = process.argv.includes('--apply');

async function main() {
  const prisma = new PrismaClient();
  const notifications = new NotificationsService(prisma as never);
  const summary = {
    scannedPayments: 0,
    pendingDeliveries: 0,
    appliedDeliveries: 0,
    missingCreators: 0,
  };

  const supplierPayments = await prisma.procurementSupplierPayment.findMany({
    where: { status: 'ACTIVE', paidAt: { not: null } },
    include: {
      procurementOrder: {
        select: { id: true, orderNumber: true, createdById: true, invoiceSentById: true },
      },
    },
  });

  for (const payment of supplierPayments) {
    const order = payment.procurementOrder;
    if (!order) continue;
    summary.scannedPayments += 1;
    const receipts = await findReceiptAttachmentsForContext(prisma, 'SUPPLIER_PAYMENT', payment.id);
    if (!receipts.length) continue;
    const delivered = await findAlreadyDeliveredAttachmentIds(prisma, order.id);
    const pending = receipts.filter((receipt) => !delivered.has(receipt.id));
    if (!pending.length) continue;
    summary.pendingDeliveries += pending.length;

    const creatorUserId = resolveInvoiceCreatorUserId({
      orderCreatedById: order.createdById,
      invoiceSentById: order.invoiceSentById,
      paymentCreatedById: payment.createdById,
    });
    if (!creatorUserId) {
      summary.missingCreators += pending.length;
      console.log(
        `[dry-run] missing creator for order ${order.orderNumber}, payment ${payment.id}, receipts ${pending.length}`,
      );
      continue;
    }

    if (apply) {
      await prisma.$transaction(async (tx) => {
        await deliverReceiptsToCreatorInTx(tx, notifications, {
          id: 'system-repair',
          role: 'OWNER' as never,
          roles: ['OWNER'] as never,
          branchId: null,
        }, {
          source: 'SUPPLIER_PAYMENT',
          invoiceId: order.id,
          paymentId: payment.id,
          invoiceNumber: order.orderNumber,
          invoiceStatus: payment.status,
          processedAt: payment.paidAt ?? new Date(),
          creatorUserId,
          notificationEntityType: 'ProcurementOrder',
          notificationEntityId: order.id,
          module: NotificationModule.SUPPLIER_PAYMENT,
          paymentAmount: Number(payment.approvedAmountKgs),
          paymentCurrency: 'KGS',
          paymentMethod: payment.paymentMethod,
          isFullyPaid: true,
        });
      });
      summary.appliedDeliveries += pending.length;
    } else {
      console.log(
        `[dry-run] would deliver ${pending.length} receipt(s) for order ${order.orderNumber} to ${creatorUserId}`,
      );
    }
  }

  const transportExpenses = await prisma.procurementTransportExpense.findMany({
    where: {
      status: { in: ['PAID', 'PARTIALLY_PAID'] },
      paidAt: { not: null },
    },
    include: {
      procurementOrder: {
        select: { id: true, orderNumber: true, createdById: true, invoiceSentById: true },
      },
    },
  });

  for (const expense of transportExpenses) {
    summary.scannedPayments += 1;
    const receipts = await prisma.fileAttachment.findMany({
      where: {
        entityId: expense.id,
        entityType: FileAttachmentEntityType.TRANSPORT_EXPENSE_RECEIPT,
        deletedAt: null,
      },
    });
    if (!receipts.length) continue;
    const invoiceId = expense.procurementOrder?.id ?? expense.id;
    const delivered = await findAlreadyDeliveredAttachmentIds(prisma, invoiceId);
    const pending = receipts.filter((receipt) => !delivered.has(receipt.id));
    if (!pending.length) continue;
    summary.pendingDeliveries += pending.length;

    const creatorUserId = resolveInvoiceCreatorUserId({
      orderCreatedById: expense.procurementOrder?.createdById,
      expenseCreatedById: expense.createdById,
      invoiceSentById: expense.procurementOrder?.invoiceSentById,
    });
    if (!creatorUserId) {
      summary.missingCreators += pending.length;
      continue;
    }

    if (apply) {
      await prisma.$transaction(async (tx) => {
        await deliverReceiptsToCreatorInTx(tx, notifications, {
          id: 'system-repair',
          role: 'OWNER' as never,
          roles: ['OWNER'] as never,
          branchId: null,
        }, {
          source: 'TRANSPORT_EXPENSE',
          invoiceId,
          paymentId: expense.id,
          invoiceNumber: expense.expenseNumber,
          invoiceStatus: expense.status,
          processedAt: expense.paidAt ?? new Date(),
          creatorUserId,
          notificationEntityType: 'ProcurementTransportExpense',
          notificationEntityId: expense.id,
          module: NotificationModule.SUPPLIER_PAYMENT,
          paymentAmount: Number(expense.paidAmountKgs ?? 0),
          paymentCurrency: 'KGS',
          paymentMethod: expense.paymentMethod,
          isPartialPayment: expense.status === 'PARTIALLY_PAID',
          isFullyPaid: expense.status === 'PAID',
        });
      });
      summary.appliedDeliveries += pending.length;
    }
  }

  console.log(JSON.stringify({ apply, ...summary }, null, 2));
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
