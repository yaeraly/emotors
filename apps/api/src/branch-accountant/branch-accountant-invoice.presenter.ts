import {
  BranchInvoicePaymentType,
  BranchInvoiceStatus,
  BranchOrderInstallmentStatus,
  BranchPaymentConfirmationStatus,
} from '@prisma/client';
import {
  buildBranchOrderInstallmentSchedule,
  computeBranchOrderRemainingDebt,
} from '../distribution/branch-order-installment.util';

export type AccountantInvoiceWorkflowStatus =
  | 'PENDING_ACCOUNTANT_REVIEW'
  | 'INSTALLMENT_APPROVAL_PENDING'
  | 'READY_FOR_CASHIER'
  | 'WAITING_FOR_PAYMENT'
  | 'PAYMENT_SUBMITTED'
  | 'PAID'
  | 'PARTIALLY_PAID'
  | 'REJECTED'
  | 'CANCELLED';

type InvoiceLike = {
  status: BranchInvoiceStatus;
  sentToBranchAt?: Date | string | null;
  sentToCashierAt?: Date | string | null;
  paymentType?: BranchInvoicePaymentType | null;
  payments?: Array<{ confirmationStatus?: BranchPaymentConfirmationStatus | null }>;
  branchOrderInstallment?: {
    status: BranchOrderInstallmentStatus;
  } | null;
};

export function resolveAccountantInvoiceWorkflowStatus(invoice: InvoiceLike): AccountantInvoiceWorkflowStatus {
  if (invoice.status === BranchInvoiceStatus.CANCELLED) return 'CANCELLED';
  if (invoice.status === BranchInvoiceStatus.PAID) return 'PAID';
  if (invoice.status === BranchInvoiceStatus.PARTIALLY_PAID) return 'PARTIALLY_PAID';

  const hasPendingPayment = invoice.payments?.some(
    (payment) => payment.confirmationStatus === BranchPaymentConfirmationStatus.PENDING_CONFIRMATION,
  );
  if (hasPendingPayment) return 'PAYMENT_SUBMITTED';

  if (invoice.branchOrderInstallment?.status === BranchOrderInstallmentStatus.REJECTED) {
    return 'REJECTED';
  }
  if (invoice.branchOrderInstallment?.status === BranchOrderInstallmentStatus.PENDING) {
    return 'INSTALLMENT_APPROVAL_PENDING';
  }

  if (invoice.sentToCashierAt) return 'WAITING_FOR_PAYMENT';

  if (invoice.paymentType) return 'READY_FOR_CASHIER';

  if (invoice.sentToBranchAt) return 'PENDING_ACCOUNTANT_REVIEW';

  return 'PENDING_ACCOUNTANT_REVIEW';
}

export function sanitizeAccountantInvoice(invoice: any) {
  const workflowStatus = resolveAccountantInvoiceWorkflowStatus(invoice);
  const order = invoice.distributionOrder;
  const linkedRequest = order?.branchPurchaseRequest ?? null;
  const installment = invoice.branchOrderInstallment
    ? (() => {
        const totalAmount = Number(invoice.branchOrderInstallment.totalAmount);
        const firstPaymentAmount = Number(invoice.branchOrderInstallment.firstPaymentAmount);
        const remainingDebt = computeBranchOrderRemainingDebt(totalAmount, firstPaymentAmount);
        return {
          id: invoice.branchOrderInstallment.id,
          status: invoice.branchOrderInstallment.status,
          totalAmount,
          firstPaymentAmount,
          remainingDebt,
          financedAmount: remainingDebt,
          termMonths: invoice.branchOrderInstallment.termMonths,
          firstPaymentRequired: invoice.branchOrderInstallment.firstPaymentRequired,
          firstPaymentConfirmed: invoice.branchOrderInstallment.firstPaymentConfirmed,
          requestComment: invoice.branchOrderInstallment.requestComment,
          installmentDueDate: invoice.branchOrderInstallment.installmentDueDate,
          requestedAt: invoice.branchOrderInstallment.requestedAt,
          decidedAt: invoice.branchOrderInstallment.decidedAt,
          rejectionComment: invoice.branchOrderInstallment.rejectionComment,
          initialPaymentPercent:
            totalAmount > 0 ? Math.round((firstPaymentAmount / totalAmount) * 10000) / 100 : 0,
          zeroInitialPayment: firstPaymentAmount <= 0,
          paymentSchedule: buildBranchOrderInstallmentSchedule(
            remainingDebt,
            invoice.branchOrderInstallment.termMonths,
            invoice.branchOrderInstallment.installmentDueDate,
          ),
        };
      })()
    : null;

  const remainingAmount = Number(invoice.debtAmount ?? 0);
  const requiredPaymentAmount =
    installment?.status === BranchOrderInstallmentStatus.APPROVED
      ? installment.firstPaymentRequired && !installment.firstPaymentConfirmed
        ? Number(installment.firstPaymentAmount)
        : remainingAmount
      : invoice.paymentType === BranchInvoicePaymentType.FULL_PAYMENT
        ? remainingAmount
        : installment
          ? installment.firstPaymentRequired
            ? Number(installment.firstPaymentAmount)
            : remainingAmount
          : remainingAmount;

  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    invoiceCategory: invoice.invoiceCategory ?? 'PRODUCT_ORDER',
    branchId: invoice.branchId,
    branch: invoice.branch ? { id: invoice.branch.id, name: invoice.branch.name, code: invoice.branch.code } : null,
    distributionOrderId: invoice.distributionOrderId,
    orderNumber: order?.orderNumber ?? null,
    branchPurchaseRequestId: linkedRequest?.id ?? null,
    branchPurchaseRequestNumber: linkedRequest?.requestNumber ?? null,
    workflowStatus,
    paymentType: invoice.paymentType ?? null,
    status: invoice.status,
    totalAmount: Number(invoice.totalAmount),
    paidAmount: Number(invoice.paidAmount),
    debtAmount: remainingAmount,
    remainingAmount,
    requiredPaymentAmount,
    dueDate: invoice.dueDate,
    issuedAt: invoice.issuedAt,
    sentToBranchAt: invoice.sentToBranchAt,
    sentToCashierAt: invoice.sentToCashierAt,
    itemCount: order?.items?.length ?? 0,
    items: (order?.items ?? []).map((item: any) => ({
      id: item.id,
      productId: item.productId,
      sku: item.sku,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      lineTotal: Number(item.totalPrice),
      unit: item.product?.unit ?? null,
    })),
    branchOrderInstallment: installment,
    payments: (invoice.payments ?? []).map((payment: any) => ({
      id: payment.id,
      amount: Number(payment.amount),
      method: payment.method,
      confirmationStatus: payment.confirmationStatus,
      receiptReference: payment.receiptReference,
      paidAt: payment.paidAt,
      note: payment.note,
    })),
    createdAt: invoice.createdAt,
    updatedAt: invoice.updatedAt,
  };
}

export function sanitizeBranchCashierInvoice(invoice: any) {
  const base = sanitizeAccountantInvoice(invoice);
  return {
    ...base,
    items: (base.items ?? []).map((item: { id: string; productId: string; sku: string; productName: string; quantity: number; unit: string | null }) => ({
      id: item.id,
      productId: item.productId,
      sku: item.sku,
      productName: item.productName,
      quantity: item.quantity,
      unit: item.unit,
    })),
  };
}

export function buildWorkflowStatusWhere(
  workflowStatus: AccountantInvoiceWorkflowStatus,
): Record<string, unknown> | null {
  switch (workflowStatus) {
    case 'PENDING_ACCOUNTANT_REVIEW':
      return {
        sentToBranchAt: { not: null },
        paymentType: null,
        sentToCashierAt: null,
        status: { in: [BranchInvoiceStatus.ISSUED, BranchInvoiceStatus.OVERDUE] },
        OR: [
          { branchOrderInstallment: null },
          { branchOrderInstallment: { status: { not: BranchOrderInstallmentStatus.PENDING } } },
        ],
      };
    case 'INSTALLMENT_APPROVAL_PENDING':
      return { branchOrderInstallment: { status: BranchOrderInstallmentStatus.PENDING } };
    case 'READY_FOR_CASHIER':
      return {
        paymentType: { not: null },
        sentToCashierAt: null,
        status: { in: [BranchInvoiceStatus.ISSUED, BranchInvoiceStatus.OVERDUE, BranchInvoiceStatus.PARTIALLY_PAID] },
        OR: [
          { branchOrderInstallment: null },
          { branchOrderInstallment: { status: BranchOrderInstallmentStatus.APPROVED } },
        ],
      };
    case 'WAITING_FOR_PAYMENT':
      return {
        sentToCashierAt: { not: null },
        status: { in: [BranchInvoiceStatus.ISSUED, BranchInvoiceStatus.OVERDUE, BranchInvoiceStatus.PARTIALLY_PAID] },
        payments: {
          none: { confirmationStatus: BranchPaymentConfirmationStatus.PENDING_CONFIRMATION, deletedAt: null },
        },
      };
    case 'PAYMENT_SUBMITTED':
      return {
        payments: {
          some: { confirmationStatus: BranchPaymentConfirmationStatus.PENDING_CONFIRMATION, deletedAt: null },
        },
      };
    case 'PAID':
      return { status: BranchInvoiceStatus.PAID };
    case 'PARTIALLY_PAID':
      return { status: BranchInvoiceStatus.PARTIALLY_PAID };
    case 'REJECTED':
      return { branchOrderInstallment: { status: BranchOrderInstallmentStatus.REJECTED } };
    case 'CANCELLED':
      return { status: BranchInvoiceStatus.CANCELLED };
    default:
      return null;
  }
}
