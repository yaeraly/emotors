import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { FileAttachmentEntityType } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  auditReceiptEvent,
  canViewInvoiceReceipts,
  findReceiptAttachmentsForContext,
  InvoiceReceiptRow,
  InvoiceReceiptSource,
  mapReceiptRows,
  resolveInvoiceCreatorUserId,
} from './receipt-delivery.util';

type ListReceiptsQuery = {
  source: InvoiceReceiptSource;
  entityId: string;
  paymentId?: string;
};

@Injectable()
export class ReceiptDeliveryService {
  constructor(private readonly prisma: PrismaService) {}

  async listInvoiceReceipts(user: AuthUser, query: ListReceiptsQuery) {
    if (query.source === 'SUPPLIER_PAYMENT' && !query.paymentId) {
      return this.listSupplierPaymentReceiptsForOrder(user, query.entityId);
    }

    const context = await this.resolveContext(query);
    if (!canViewInvoiceReceipts(user, context.creatorUserId)) {
      throw new ForbiddenException('You do not have permission to view these receipts');
    }

    const receipts = await findReceiptAttachmentsForContext(
      this.prisma,
      query.source,
      context.paymentId,
    );
    const deliveryMeta = await this.loadDeliveryMetadata(context.invoiceId);

    return {
      source: query.source,
      entityId: query.entityId,
      paymentId: context.paymentId,
      invoiceNumber: context.invoiceNumber,
      invoiceStatus: context.invoiceStatus,
      processedAt: context.processedAt?.toISOString() ?? null,
      creatorUserId: context.creatorUserId,
      receipts: this.mapReceiptsWithMetadata(
        receipts,
        context.paymentId,
        context.processedAt,
        context.invoiceStatus,
        context.paymentAmount,
        context.paymentCurrency,
        context.paymentMethod,
        deliveryMeta,
      ),
    };
  }

  private async listSupplierPaymentReceiptsForOrder(user: AuthUser, orderId: string) {
    const order = await this.prisma.procurementOrder.findFirst({
      where: { id: orderId, deletedAt: null },
      select: {
        id: true,
        orderNumber: true,
        createdById: true,
        invoiceSentById: true,
        supplierPaymentStatus: true,
      },
    });
    if (!order) throw new NotFoundException('Procurement order not found');

    const creatorUserId = resolveInvoiceCreatorUserId({
      invoiceSentById: order.invoiceSentById,
      orderCreatedById: order.createdById,
    });
    if (!canViewInvoiceReceipts(user, creatorUserId)) {
      throw new ForbiddenException('You do not have permission to view these receipts');
    }

    const payments = await this.prisma.procurementSupplierPayment.findMany({
      where: {
        procurementOrderId: orderId,
        status: 'ACTIVE',
      },
      orderBy: [{ sequenceNumber: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        status: true,
        paidAt: true,
        sequenceNumber: true,
        approvedAmountKgs: true,
        paymentMethod: true,
      },
    });

    const deliveryMeta = await this.loadDeliveryMetadata(order.id);
    const receiptGroups = await Promise.all(
      payments.map(async (payment) => {
        const receipts = await findReceiptAttachmentsForContext(
          this.prisma,
          'SUPPLIER_PAYMENT',
          payment.id,
        );
        return this.mapReceiptsWithMetadata(
          receipts,
          payment.id,
          payment.paidAt,
          payment.status,
          Number(payment.approvedAmountKgs),
          'KGS',
          payment.paymentMethod,
          deliveryMeta,
        );
      }),
    );

    return {
      source: 'SUPPLIER_PAYMENT' as const,
      entityId: order.id,
      paymentId: null,
      invoiceNumber: order.orderNumber,
      invoiceStatus: order.supplierPaymentStatus,
      processedAt: null,
      creatorUserId,
      receipts: receiptGroups
        .flat()
        .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()),
    };
  }

  async recordReceiptView(user: AuthUser, attachmentId: string) {
    return this.recordReceiptAccess(user, attachmentId, 'PAYMENT_RECEIPT_VIEWED');
  }

  async recordReceiptDownload(user: AuthUser, attachmentId: string) {
    return this.recordReceiptAccess(user, attachmentId, 'PAYMENT_RECEIPT_DOWNLOADED');
  }

  private async recordReceiptAccess(
    user: AuthUser,
    attachmentId: string,
    action: 'PAYMENT_RECEIPT_VIEWED' | 'PAYMENT_RECEIPT_DOWNLOADED',
  ) {
    const attachment = await this.prisma.fileAttachment.findFirst({
      where: { id: attachmentId, deletedAt: null },
    });
    if (!attachment) throw new NotFoundException('Receipt not found');

    const context = await this.resolveContextFromAttachment(attachment);
    if (!canViewInvoiceReceipts(user, context.creatorUserId)) {
      throw new ForbiddenException('You do not have permission to view this receipt');
    }

    await auditReceiptEvent(this.prisma, user, action, context.invoiceId, {
      invoiceId: context.invoiceId,
      paymentId: context.paymentId,
      uploadedBy: attachment.uploadedById,
      creatorUserId: context.creatorUserId,
      uploadedAt: attachment.createdAt.toISOString(),
      filename: attachment.fileName,
      attachmentId: attachment.id,
      timestamp: new Date().toISOString(),
    });

    return { ok: true, fileUrl: attachment.fileUrl };
  }

  private async loadDeliveryMetadata(invoiceId: string) {
    const logs = await this.prisma.auditLog.findMany({
      where: {
        entity: 'InvoiceReceipt',
        entityId: invoiceId,
        action: { in: ['PAYMENT_RECEIPT_SENT_TO_CREATOR', 'RECEIPT_SENT_TO_CREATOR'] },
      },
      select: { metadata: true },
    });
    const byAttachment = new Map<
      string,
      { paymentAmount?: number; paymentCurrency?: string; paymentMethod?: string | null }
    >();
    for (const log of logs) {
      const metadata = log.metadata as Record<string, unknown> | null;
      const attachmentId = metadata?.attachmentId;
      if (typeof attachmentId !== 'string') continue;
      byAttachment.set(attachmentId, {
        paymentAmount:
          typeof metadata?.paymentAmount === 'number' ? metadata.paymentAmount : undefined,
        paymentCurrency:
          typeof metadata?.paymentCurrency === 'string' ? metadata.paymentCurrency : undefined,
        paymentMethod:
          typeof metadata?.paymentMethod === 'string' ? metadata.paymentMethod : null,
      });
    }
    return byAttachment;
  }

  private mapReceiptsWithMetadata(
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
    paymentAmount: number | null | undefined,
    paymentCurrency: string | null | undefined,
    paymentMethod: string | null | undefined,
    deliveryMeta: Map<
      string,
      { paymentAmount?: number; paymentCurrency?: string; paymentMethod?: string | null }
    >,
  ): InvoiceReceiptRow[] {
    return receipts.map((receipt) => {
      const meta = deliveryMeta.get(receipt.id);
      return mapReceiptRows([receipt], paymentId, processedAt, invoiceStatus, {
        paymentAmount: meta?.paymentAmount ?? paymentAmount ?? null,
        paymentCurrency: meta?.paymentCurrency ?? paymentCurrency ?? null,
        paymentMethod: meta?.paymentMethod ?? paymentMethod ?? null,
      })[0];
    });
  }

  private async resolveContext(query: ListReceiptsQuery) {
    if (query.source === 'SUPPLIER_PAYMENT') {
      const payment = await this.prisma.procurementSupplierPayment.findFirst({
        where: {
          procurementOrderId: query.entityId,
          ...(query.paymentId ? { id: query.paymentId } : {}),
        },
        include: {
          procurementOrder: {
            select: {
              id: true,
              orderNumber: true,
              createdById: true,
              invoiceSentById: true,
              supplierPaymentStatus: true,
            },
          },
        },
        orderBy: { sequenceNumber: 'desc' },
      });
      if (!payment?.procurementOrder) {
        throw new NotFoundException('Supplier payment not found');
      }
      const order = payment.procurementOrder;
      return {
        paymentId: payment.id,
        invoiceId: order.id,
        invoiceNumber: order.orderNumber,
        invoiceStatus: payment.status,
        processedAt: payment.paidAt,
        paymentAmount: Number(payment.approvedAmountKgs),
        paymentCurrency: 'KGS',
        paymentMethod: payment.paymentMethod,
        creatorUserId: resolveInvoiceCreatorUserId({
          invoiceSentById: order.invoiceSentById,
          orderCreatedById: order.createdById,
          paymentCreatedById: payment.createdById,
        }),
      };
    }

    if (query.source === 'TRANSPORT_EXPENSE') {
      const expense = await this.prisma.procurementTransportExpense.findFirst({
        where: { id: query.entityId },
        select: {
          id: true,
          expenseNumber: true,
          status: true,
          paidAt: true,
          createdById: true,
          paidAmountKgs: true,
          paymentMethod: true,
          procurementOrder: {
            select: { id: true, orderNumber: true, createdById: true, invoiceSentById: true },
          },
        },
      });
      if (!expense) throw new NotFoundException('Transport expense not found');
      return {
        paymentId: expense.id,
        invoiceId: expense.procurementOrder?.id ?? expense.id,
        invoiceNumber: expense.expenseNumber,
        invoiceStatus: expense.status,
        processedAt: expense.paidAt,
        paymentAmount: expense.paidAmountKgs != null ? Number(expense.paidAmountKgs) : null,
        paymentCurrency: 'KGS',
        paymentMethod: expense.paymentMethod,
        creatorUserId: resolveInvoiceCreatorUserId({
          expenseCreatedById: expense.createdById,
          orderCreatedById: expense.procurementOrder?.createdById,
          invoiceSentById: expense.procurementOrder?.invoiceSentById,
        }),
      };
    }

    const transfer = await this.prisma.financeTransfer.findFirst({
      where: { id: query.entityId },
      select: {
        id: true,
        transferNumber: true,
        status: true,
        completedAt: true,
        createdById: true,
        amount: true,
        currency: true,
      },
    });
    if (!transfer) throw new NotFoundException('Finance transfer not found');
    return {
      paymentId: transfer.id,
      invoiceId: transfer.id,
      invoiceNumber: transfer.transferNumber,
      invoiceStatus: transfer.status,
      processedAt: transfer.completedAt,
      paymentAmount: Number(transfer.amount),
      paymentCurrency: transfer.currency,
      paymentMethod: null,
      creatorUserId: resolveInvoiceCreatorUserId({ transferCreatedById: transfer.createdById }),
    };
  }

  private async resolveContextFromAttachment(attachment: {
    id: string;
    entityType: FileAttachmentEntityType;
    entityId: string;
    supplierPaymentId: string | null;
    createdAt: Date;
    uploadedById: string;
    fileName: string;
  }) {
    if (attachment.entityType === FileAttachmentEntityType.SUPPLIER_PAYMENT) {
      const payment = await this.prisma.procurementSupplierPayment.findFirst({
        where: { id: attachment.supplierPaymentId ?? attachment.entityId },
        include: {
          procurementOrder: {
            select: {
              id: true,
              orderNumber: true,
              createdById: true,
              invoiceSentById: true,
            },
          },
        },
      });
      if (!payment?.procurementOrder) throw new NotFoundException('Supplier payment not found');
      return {
        invoiceId: payment.procurementOrder.id,
        paymentId: payment.id,
        creatorUserId: resolveInvoiceCreatorUserId({
          invoiceSentById: payment.procurementOrder.invoiceSentById,
          orderCreatedById: payment.procurementOrder.createdById,
          paymentCreatedById: payment.createdById,
        }),
      };
    }

    if (attachment.entityType === FileAttachmentEntityType.TRANSPORT_EXPENSE_RECEIPT) {
      const expense = await this.prisma.procurementTransportExpense.findFirst({
        where: { id: attachment.entityId },
        select: {
          id: true,
          createdById: true,
          procurementOrder: {
            select: { id: true, createdById: true, invoiceSentById: true },
          },
        },
      });
      if (!expense) throw new NotFoundException('Transport expense not found');
      return {
        invoiceId: expense.procurementOrder?.id ?? expense.id,
        paymentId: expense.id,
        creatorUserId: resolveInvoiceCreatorUserId({
          expenseCreatedById: expense.createdById,
          orderCreatedById: expense.procurementOrder?.createdById,
          invoiceSentById: expense.procurementOrder?.invoiceSentById,
        }),
      };
    }

    if (attachment.entityType === FileAttachmentEntityType.FINANCE_TRANSFER_RECEIPT) {
      const transfer = await this.prisma.financeTransfer.findFirst({
        where: { id: attachment.entityId },
        select: { id: true, createdById: true },
      });
      if (!transfer) throw new NotFoundException('Finance transfer not found');
      return {
        invoiceId: transfer.id,
        paymentId: transfer.id,
        creatorUserId: resolveInvoiceCreatorUserId({ transferCreatedById: transfer.createdById }),
      };
    }

    throw new NotFoundException('Unsupported receipt attachment');
  }
}
