import {
  FileAttachmentEntityType,
  NotificationModule,
  Prisma,
} from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import {
  canConfirmSupplierPayment,
  hasAnyFullAccessRole,
  resolveUserRoles,
} from '../rbac/rbac';
import { canConfirmFinanceTransfer } from '../finance/finance-access.util';
import { NotificationsService } from '../notifications/notifications.service';
import { AlertType } from '@prisma/client';

type PrismaTx = Prisma.TransactionClient;

export type InvoiceReceiptSource = 'SUPPLIER_PAYMENT' | 'TRANSPORT_EXPENSE' | 'FINANCE_TRANSFER';

export type ReceiptDeliveryContext = {
  source: InvoiceReceiptSource;
  invoiceId: string;
  paymentId: string;
  invoiceNumber: string;
  invoiceStatus: string;
  processedAt: Date;
  creatorUserId: string;
  notificationEntityType: string;
  notificationEntityId: string;
  module: NotificationModule;
};

export type InvoiceReceiptRow = {
  id: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  uploadedAt: string;
  uploadedBy: { id: string; fullName: string } | null;
  processedAt: string | null;
  invoiceStatus: string;
  paymentId: string;
};

export function resolveInvoiceCreatorUserId(input: {
  invoiceSentById?: string | null;
  orderCreatedById?: string | null;
  paymentCreatedById?: string | null;
  expenseCreatedById?: string | null;
  transferCreatedById?: string | null;
}): string | null {
  return (
    input.invoiceSentById ||
    input.orderCreatedById ||
    input.expenseCreatedById ||
    input.transferCreatedById ||
    input.paymentCreatedById ||
    null
  );
}

export function canViewInvoiceReceipts(
  user: AuthUser,
  creatorUserId: string | null | undefined,
): boolean {
  const roles = resolveUserRoles(user);
  if (hasAnyFullAccessRole(roles)) return true;
  if (canConfirmSupplierPayment(user) || canConfirmFinanceTransfer(user)) return true;
  return Boolean(creatorUserId && user.id === creatorUserId);
}

export function buildReceiptDeliveryMessage(invoiceNumber: string): {
  title: string;
  message: string;
} {
  return {
    title: 'Квитанция загружена.',
    message: `Счет №${invoiceNumber} успешно обработан HQ Cashier.`,
  };
}

export async function findReceiptAttachmentsForContext(
  tx: PrismaTx,
  source: InvoiceReceiptSource,
  paymentId: string,
) {
  if (source === 'SUPPLIER_PAYMENT') {
    return tx.fileAttachment.findMany({
      where: {
        supplierPaymentId: paymentId,
        entityType: FileAttachmentEntityType.SUPPLIER_PAYMENT,
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
      include: { uploadedBy: { select: { id: true, fullName: true } } },
    });
  }
  if (source === 'TRANSPORT_EXPENSE') {
    return tx.fileAttachment.findMany({
      where: {
        entityId: paymentId,
        entityType: FileAttachmentEntityType.TRANSPORT_EXPENSE_RECEIPT,
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
      include: { uploadedBy: { select: { id: true, fullName: true } } },
    });
  }
  return tx.fileAttachment.findMany({
    where: {
      entityId: paymentId,
      entityType: FileAttachmentEntityType.FINANCE_TRANSFER_RECEIPT,
      deletedAt: null,
    },
    orderBy: { createdAt: 'asc' },
    include: { uploadedBy: { select: { id: true, fullName: true } } },
  });
}

export function mapReceiptRows(
  receipts: Array<{
    id: string;
    fileName: string;
    fileUrl: string;
    mimeType: string;
    createdAt: Date;
    uploadedBy: { id: string; fullName: string } | null;
  }>,
  paymentId: string,
  processedAt: Date | null,
  invoiceStatus: string,
): InvoiceReceiptRow[] {
  return receipts.map((receipt) => ({
    id: receipt.id,
    fileName: receipt.fileName,
    fileUrl: receipt.fileUrl,
    mimeType: receipt.mimeType,
    uploadedAt: receipt.createdAt.toISOString(),
    uploadedBy: receipt.uploadedBy,
    processedAt: processedAt?.toISOString() ?? null,
    invoiceStatus,
    paymentId,
  }));
}

export async function auditReceiptEvent(
  tx: PrismaTx,
  user: AuthUser,
  action: 'RECEIPT_UPLOADED' | 'RECEIPT_SENT_TO_CREATOR' | 'RECEIPT_VIEWED',
  entityId: string,
  metadata: Record<string, unknown>,
) {
  return tx.auditLog.create({
    data: {
      userId: user.id,
      role: user.role,
      action,
      entity: 'InvoiceReceipt',
      entityId,
      metadata: { roles: user.roles ?? [user.role], ...metadata },
    },
  });
}

export async function deliverReceiptsToCreatorInTx(
  tx: PrismaTx,
  notifications: NotificationsService,
  cashier: AuthUser,
  ctx: ReceiptDeliveryContext,
) {
  if (!ctx.creatorUserId) return;

  const receipts = await findReceiptAttachmentsForContext(tx, ctx.source, ctx.paymentId);
  if (!receipts.length) return;

  for (const receipt of receipts) {
    await auditReceiptEvent(tx, cashier, 'RECEIPT_SENT_TO_CREATOR', ctx.invoiceId, {
      invoiceId: ctx.invoiceId,
      paymentId: ctx.paymentId,
      uploadedBy: receipt.uploadedById,
      creatorUserId: ctx.creatorUserId,
      uploadedAt: receipt.createdAt.toISOString(),
      filename: receipt.fileName,
      attachmentId: receipt.id,
    });
  }

  const copy = buildReceiptDeliveryMessage(ctx.invoiceNumber);
  await notifications.notifyInTx(tx, cashier, {
    type: AlertType.RECEIPT_SENT_TO_CREATOR,
    recipientUserId: ctx.creatorUserId,
    entityType: ctx.notificationEntityType,
    entityId: ctx.notificationEntityId,
    referenceNumber: ctx.invoiceNumber,
    title: copy.title,
    message: copy.message,
    module: ctx.module,
  });
}
