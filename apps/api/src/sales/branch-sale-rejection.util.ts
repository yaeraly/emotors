import { BadRequestException } from '@nestjs/common';
import {
  BranchInvoiceStatus,
  BranchPaymentConfirmationStatus,
  Prisma,
  SaleInstallmentApprovalStatus,
} from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';

type PrismaTx = Prisma.TransactionClient;

export const BRANCH_SALE_REJECTION_AUDIT = {
  SALE_REJECTED: 'BRANCH_SALE_REJECTED',
  RETURNED_TO_DRAFT: 'BRANCH_SALE_RETURNED_TO_DRAFT',
  INVOICE_CANCELLED: 'BRANCH_INVOICE_CANCELLED_AFTER_REJECTION',
} as const;

export const BRANCH_SALE_REJECTION_REASON = 'Продажа отклонена Branch CEO';

export const STOPPED_RETAIL_APPROVAL_STATUSES: SaleInstallmentApprovalStatus[] = [
  SaleInstallmentApprovalStatus.REJECTED,
  SaleInstallmentApprovalStatus.CANCELLED,
];

export function isRetailSaleWorkflowStopped(
  approval?: { status: SaleInstallmentApprovalStatus | string } | null,
) {
  return Boolean(
    approval?.status &&
      STOPPED_RETAIL_APPROVAL_STATUSES.includes(approval.status as SaleInstallmentApprovalStatus),
  );
}

export function buildActiveAccountantInvoiceWhere(
  branchId: string,
): Prisma.BranchInvoiceWhereInput {
  return {
    deletedAt: null,
    branchId,
    sentToBranchAt: { not: null },
    status: { not: BranchInvoiceStatus.CANCELLED },
    NOT: {
      sale: {
        installmentApproval: {
          status: { in: STOPPED_RETAIL_APPROVAL_STATUSES },
        },
      },
    },
  };
}

export function assertRetailSaleFinanceAllowed(input: {
  invoiceStatus?: BranchInvoiceStatus | string;
  installmentApproval?: { status: SaleInstallmentApprovalStatus | string } | null;
}) {
  if (input.invoiceStatus === BranchInvoiceStatus.CANCELLED) {
    throw new BadRequestException('Счёт аннулирован после отклонения продажи');
  }
  if (isRetailSaleWorkflowStopped(input.installmentApproval)) {
    throw new BadRequestException('Продажа отклонена Branch CEO');
  }
}

export function canReturnRejectedSaleToDraft(
  approval?: { status: SaleInstallmentApprovalStatus | string } | null,
) {
  return isRetailSaleWorkflowStopped(approval);
}

export async function cancelRetailSaleInvoicesAfterRejectionInTx(
  tx: PrismaTx,
  user: AuthUser,
  input: {
    saleId: string;
    branchId: string;
    rejectionReason: string;
    previousApprovalStatus?: string;
  },
) {
  const invoices = await tx.branchInvoice.findMany({
    where: {
      saleId: input.saleId,
      deletedAt: null,
      status: { not: BranchInvoiceStatus.CANCELLED },
    },
  });

  const cancelledInvoiceIds: string[] = [];

  for (const invoice of invoices) {
    await tx.branchPayment.updateMany({
      where: {
        invoiceId: invoice.id,
        deletedAt: null,
        confirmationStatus: BranchPaymentConfirmationStatus.PENDING_CONFIRMATION,
      },
      data: {
        confirmationStatus: BranchPaymentConfirmationStatus.REJECTED,
        rejectionComment: BRANCH_SALE_REJECTION_REASON,
      },
    });

    await tx.branchInvoice.update({
      where: { id: invoice.id },
      data: {
        status: BranchInvoiceStatus.CANCELLED,
        debtAmount: 0,
        sentToCashierAt: null,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: BRANCH_SALE_REJECTION_AUDIT.INVOICE_CANCELLED,
        entity: 'BranchInvoice',
        entityId: invoice.id,
        metadata: {
          saleId: input.saleId,
          invoiceId: invoice.id,
          branchId: input.branchId,
          previousStatus: invoice.status,
          newStatus: BranchInvoiceStatus.CANCELLED,
          rejectionReason: input.rejectionReason,
          reason: BRANCH_SALE_REJECTION_REASON,
          actorUserId: user.id,
          actorRole: user.role,
          timestamp: new Date().toISOString(),
        },
      },
    });

    cancelledInvoiceIds.push(invoice.id);
  }

  return cancelledInvoiceIds;
}
