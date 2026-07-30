import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth.types';

type AuditClient = Prisma.TransactionClient | PrismaService;

export type PaymentPermanentDeleteAuditPayload = {
  paymentId: string;
  paymentType: string;
  paymentNumber: string;
  amount: number;
  currency: string;
  paymentDate: string | null;
  accountId: string | null;
  cashboxId?: string | null;
  invoiceId?: string | null;
  oldInvoiceStatus: string | null;
  newInvoiceStatus: string | null;
  reason?: string | null;
};

export async function auditPaymentPermanentlyDeleted(
  client: AuditClient,
  user: AuthUser,
  payload: PaymentPermanentDeleteAuditPayload,
) {
  const deletedAt = new Date().toISOString();
  return client.auditLog.create({
    data: {
      userId: user.id,
      role: user.role,
      action: 'PAYMENT_PERMANENTLY_DELETED',
      entity: payload.paymentType,
      entityId: payload.paymentId,
      metadata: {
        paymentId: payload.paymentId,
        paymentType: payload.paymentType,
        paymentNumber: payload.paymentNumber,
        amount: payload.amount,
        currency: payload.currency,
        paymentDate: payload.paymentDate,
        accountId: payload.accountId,
        cashboxId: payload.cashboxId ?? null,
        invoiceId: payload.invoiceId ?? null,
        oldInvoiceStatus: payload.oldInvoiceStatus,
        newInvoiceStatus: payload.newInvoiceStatus,
        reason: payload.reason ?? null,
        deletedByUserId: user.id,
        deletedByRole: user.role,
        deletedAt,
      } as Prisma.InputJsonValue,
    },
  });
}
