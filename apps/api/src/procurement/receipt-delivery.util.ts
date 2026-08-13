import {
  AlertType,
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

type PrismaTx = Prisma.TransactionClient;

export type InvoiceReceiptSource = 'SUPPLIER_PAYMENT' | 'TRANSPORT_EXPENSE' | 'FINANCE_TRANSFER';

export type ReceiptDeliveryContext = {
  source: InvoiceReceiptSource;
  invoiceId: string;
  paymentId: string;
  invoiceNumber: string;
  invoiceStatus: string;
  processedAt: Date;
  creatorUserId: string | null;
  notificationEntityType: string;
  notificationEntityId: string;
  module: NotificationModule;
  paymentAmount?: number;
  paymentCurrency?: string;
  paymentMethod?: string | null;
  isPartialPayment?: boolean;
  isFullyPaid?: boolean;
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
  paymentAmount: number | null;
  paymentCurrency: string | null;
  paymentMethod: string | null;
};

export type ReceiptDeliveryResult = {
  deliveredAttachmentIds: string[];
  receiptAttachments: Array<{ id: string; fileName: string; fileUrl: string }>;
  creatorNotification: { id: string } | null;
  creatorUserId: string | null;
};

const RECEIPT_SENT_ACTIONS = [
  'RECEIPT_SENT_TO_CREATOR',
  'PAYMENT_RECEIPT_SENT_TO_CREATOR',
] as const;

export type ReceiptAuditAction =
  | 'RECEIPT_UPLOADED'
  | 'RECEIPT_SENT_TO_CREATOR'
  | 'RECEIPT_VIEWED'
  | 'PAYMENT_RECEIPT_UPLOADED'
  | 'PAYMENT_RECEIPT_LINKED_TO_INVOICE'
  | 'PAYMENT_RECEIPT_SENT_TO_CREATOR'
  | 'INVOICE_RECEIPT_CREATOR_NOT_FOUND'
  | 'PAYMENT_RECEIPT_VIEWED'
  | 'PAYMENT_RECEIPT_DOWNLOADED';

/**
 * Resolve the employee who originally created the invoice.
 * Prefer authoritative creator fields over workflow actors (forwarders, approvers, cashiers).
 */
export function resolveInvoiceCreatorUserId(input: {
  invoiceSentById?: string | null;
  orderCreatedById?: string | null;
  paymentCreatedById?: string | null;
  expenseCreatedById?: string | null;
  transferCreatedById?: string | null;
}): string | null {
  return (
    input.orderCreatedById ||
    input.expenseCreatedById ||
    input.transferCreatedById ||
    input.paymentCreatedById ||
    input.invoiceSentById ||
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

export function buildReceiptDeliveryMessage(input: {
  invoiceNumber: string;
  paymentAmount?: number;
  paymentCurrency?: string;
  paymentStatus?: string;
  isPartialPayment?: boolean;
  isFullyPaid?: boolean;
}): { title: string; message: string } {
  const amountLine =
    input.paymentAmount != null
      ? `\n\nПлатёж: ${input.paymentAmount} ${input.paymentCurrency ?? 'KGS'}`
      : '';
  const statusLine = input.paymentStatus ? `\nСтатус: ${input.paymentStatus}` : '';
  const closingLine =
    input.isPartialPayment && !input.isFullyPaid
      ? '\n\nЧастичный платёж принят.'
      : input.isFullyPaid
        ? '\n\nСчёт полностью оплачен.'
        : '';

  return {
    title: 'Квитанция загружена.',
    message: `Квитанция по счёту №${input.invoiceNumber} загружена.${amountLine}${statusLine}${closingLine}`,
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
      orderBy: { createdAt: 'desc' },
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
      orderBy: { createdAt: 'desc' },
      include: { uploadedBy: { select: { id: true, fullName: true } } },
    });
  }
  return tx.fileAttachment.findMany({
    where: {
      entityId: paymentId,
      entityType: FileAttachmentEntityType.FINANCE_TRANSFER_RECEIPT,
      deletedAt: null,
    },
    orderBy: { createdAt: 'desc' },
    include: { uploadedBy: { select: { id: true, fullName: true } } },
  });
}

export async function findAlreadyDeliveredAttachmentIds(
  tx: PrismaTx,
  invoiceId: string,
): Promise<Set<string>> {
  const logs = await tx.auditLog.findMany({
    where: {
      entity: 'InvoiceReceipt',
      entityId: invoiceId,
      action: { in: [...RECEIPT_SENT_ACTIONS] },
    },
    select: { metadata: true },
  });
  const delivered = new Set<string>();
  for (const log of logs) {
    const metadata = log.metadata as Record<string, unknown> | null;
    const attachmentId = metadata?.attachmentId;
    if (typeof attachmentId === 'string') delivered.add(attachmentId);
  }
  return delivered;
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
  extras?: Partial<Pick<InvoiceReceiptRow, 'paymentAmount' | 'paymentCurrency' | 'paymentMethod'>>,
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
    paymentAmount: extras?.paymentAmount ?? null,
    paymentCurrency: extras?.paymentCurrency ?? null,
    paymentMethod: extras?.paymentMethod ?? null,
  }));
}

export async function auditReceiptEvent(
  tx: PrismaTx,
  user: AuthUser,
  action: ReceiptAuditAction,
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
): Promise<ReceiptDeliveryResult> {
  const receipts = await findReceiptAttachmentsForContext(tx, ctx.source, ctx.paymentId);
  const alreadyDelivered = await findAlreadyDeliveredAttachmentIds(tx, ctx.invoiceId);
  const pendingReceipts = receipts.filter((receipt) => !alreadyDelivered.has(receipt.id));

  const emptyResult: ReceiptDeliveryResult = {
    deliveredAttachmentIds: [],
    receiptAttachments: [],
    creatorNotification: null,
    creatorUserId: ctx.creatorUserId,
  };

  if (!pendingReceipts.length) {
    return emptyResult;
  }

  if (!ctx.creatorUserId) {
    for (const receipt of pendingReceipts) {
      await auditReceiptEvent(tx, cashier, 'INVOICE_RECEIPT_CREATOR_NOT_FOUND', ctx.invoiceId, {
        invoiceId: ctx.invoiceId,
        invoiceNumber: ctx.invoiceNumber,
        paymentId: ctx.paymentId,
        attachmentId: receipt.id,
        uploadedByUserId: receipt.uploadedById,
        paymentAmount: ctx.paymentAmount,
        paymentStatus: ctx.invoiceStatus,
        timestamp: new Date().toISOString(),
      });
    }
    return emptyResult;
  }

  const deliveredAttachmentIds: string[] = [];
  for (const receipt of pendingReceipts) {
    await auditReceiptEvent(tx, cashier, 'PAYMENT_RECEIPT_LINKED_TO_INVOICE', ctx.invoiceId, {
      invoiceId: ctx.invoiceId,
      invoiceNumber: ctx.invoiceNumber,
      paymentId: ctx.paymentId,
      attachmentId: receipt.id,
      creatorUserId: ctx.creatorUserId,
      uploadedByUserId: receipt.uploadedById,
      paymentAmount: ctx.paymentAmount,
      paymentStatus: ctx.invoiceStatus,
      timestamp: new Date().toISOString(),
    });
    await auditReceiptEvent(tx, cashier, 'PAYMENT_RECEIPT_SENT_TO_CREATOR', ctx.invoiceId, {
      invoiceId: ctx.invoiceId,
      invoiceNumber: ctx.invoiceNumber,
      paymentId: ctx.paymentId,
      attachmentId: receipt.id,
      creatorUserId: ctx.creatorUserId,
      uploadedByUserId: receipt.uploadedById,
      paymentAmount: ctx.paymentAmount,
      paymentStatus: ctx.invoiceStatus,
      paymentMethod: ctx.paymentMethod,
      timestamp: new Date().toISOString(),
    });
    deliveredAttachmentIds.push(receipt.id);
  }

  const copy = buildReceiptDeliveryMessage({
    invoiceNumber: ctx.invoiceNumber,
    paymentAmount: ctx.paymentAmount,
    paymentCurrency: ctx.paymentCurrency,
    paymentStatus: ctx.invoiceStatus,
    isPartialPayment: ctx.isPartialPayment,
    isFullyPaid: ctx.isFullyPaid,
  });
  const alerts = await notifications.notifyInTx(tx, cashier, {
    type: AlertType.RECEIPT_SENT_TO_CREATOR,
    recipientUserId: ctx.creatorUserId,
    entityType: ctx.notificationEntityType,
    entityId: ctx.notificationEntityId,
    referenceNumber: ctx.invoiceNumber,
    title: copy.title,
    message: copy.message,
    module: ctx.module,
  });

  return {
    deliveredAttachmentIds,
    receiptAttachments: pendingReceipts.map((receipt) => ({
      id: receipt.id,
      fileName: receipt.fileName,
      fileUrl: receipt.fileUrl,
    })),
    creatorNotification: alerts[0] ? { id: alerts[0].id } : null,
    creatorUserId: ctx.creatorUserId,
  };
}
