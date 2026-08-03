import {
  BranchInvoicePaymentType,
  BranchInvoiceStatus,
  BranchInstallmentEarlyPaymentStatus,
  BranchOrderInstallmentStatus,
  BranchPaymentConfirmationStatus,
} from '@prisma/client';
import {
  buildBranchOrderInstallmentSchedule,
  computeBranchOrderRemainingDebt,
} from '../distribution/branch-order-installment.util';
import { CASHIER_VISIBLE_EARLY_PAYMENT_STATUSES } from '../distribution/branch-installment-early-payment.util';
import {
  isRetailInstallmentInvoice,
  resolveRetailInstallmentInitialPayment,
  resolveRetailInstallmentPaidAmount,
  resolveRetailInstallmentRemainingDebt,
  resolveRetailInstallmentRequiredPayment,
} from '../sales/sale-installment-invoice.util';

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

export function resolveAccountantInvoiceWorkflowStatus(invoice: InvoiceLike & {
  sale?: {
    installmentApproval?: { status: string } | null;
  } | null;
}): AccountantInvoiceWorkflowStatus {
  if (invoice.status === BranchInvoiceStatus.CANCELLED) return 'CANCELLED';
  if (invoice.status === BranchInvoiceStatus.PAID) return 'PAID';
  if (invoice.status === BranchInvoiceStatus.PARTIALLY_PAID) return 'PARTIALLY_PAID';

  const retailApproval = invoice.sale?.installmentApproval;
  if (
    retailApproval?.status === 'REJECTED' ||
    retailApproval?.status === 'CANCELLED'
  ) {
    return 'REJECTED';
  }

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
  const sale = invoice.sale;
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
  const retailInstallmentApproval = invoice.sale?.installmentApproval;
  const retailInstallment = isRetailInstallmentInvoice(invoice) && retailInstallmentApproval
    ? {
        id: retailInstallmentApproval.id,
        requestNumber: retailInstallmentApproval.requestNumber,
        status: retailInstallmentApproval.status,
        totalAmount: Number(retailInstallmentApproval.totalAmount ?? invoice.totalAmount),
        initialPayment: resolveRetailInstallmentInitialPayment(retailInstallmentApproval),
        paidAmount: resolveRetailInstallmentPaidAmount({ ...invoice, sale: invoice.sale }),
        remainingDebt: resolveRetailInstallmentRemainingDebt({ ...invoice, sale: invoice.sale }),
        dueDate: retailInstallmentApproval.dueDate ?? invoice.dueDate ?? null,
        zeroInitialPayment: resolveRetailInstallmentInitialPayment(retailInstallmentApproval) <= 0,
      }
    : null;

  const activeEarlyPayment = (invoice.installmentEarlyPaymentRequests ?? []).find(
    (row: { status: BranchInstallmentEarlyPaymentStatus; sentToCashierAt?: Date | string | null }) =>
      row.status === BranchInstallmentEarlyPaymentStatus.APPROVED_BY_BRANCH_CEO ||
      CASHIER_VISIBLE_EARLY_PAYMENT_STATUSES.includes(row.status),
  );
  const requiredPaymentAmount = retailInstallment
    ? resolveRetailInstallmentRequiredPayment({ ...invoice, sale: invoice.sale })
    : activeEarlyPayment
    ? Number(activeEarlyPayment.approvedAmount ?? activeEarlyPayment.requestedAmount ?? 0)
    : installment?.status === BranchOrderInstallmentStatus.APPROVED
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

  const earlyPaymentRequests = (invoice.installmentEarlyPaymentRequests ?? []).map((row: any) => {
    const approvedAmount = row.approvedAmount != null ? Number(row.approvedAmount) : null;
    const requestedAmount = Number(row.requestedAmount);
    const paymentAmount = approvedAmount ?? requestedAmount;
    return {
      id: row.id,
      installmentId: row.installmentId ?? invoice.branchOrderInstallment?.id ?? null,
      paymentType: row.paymentType,
      status: row.status,
      requestedAmount,
      approvedAmount,
      remainingDebtAtRequest:
        row.remainingDebtAtRequest != null ? Number(row.remainingDebtAtRequest) : remainingAmount,
      expectedRemainingDebtAfterPayment: Math.max(remainingAmount - paymentAmount, 0),
      financeAccount: row.financeAccount
        ? {
            id: row.financeAccount.id,
            name: row.financeAccount.name,
            accountNumber: row.financeAccount.accountNumber,
            availableBalance: Number(row.financeAccount.availableBalance ?? 0),
          }
        : null,
      requestComment: row.requestComment,
      rejectionComment: row.rejectionComment,
      requestedAt: row.requestedAt,
      requestedBy: row.requestedBy ?? null,
      branchCeoApprovedBy: row.branchCeoApprovedBy ?? null,
      branchCeoApprovedAt: row.branchCeoApprovedAt,
      sentToCashierBy: row.sentToCashierBy ?? null,
      sentToCashierAt: row.sentToCashierAt,
      canSendToCashier: row.status === BranchInstallmentEarlyPaymentStatus.APPROVED_BY_BRANCH_CEO,
      sentToCashier:
        row.status === BranchInstallmentEarlyPaymentStatus.SENT_TO_CASHIER ||
        row.status === BranchInstallmentEarlyPaymentStatus.PAYMENT_SUBMITTED ||
        row.status === BranchInstallmentEarlyPaymentStatus.PAYMENT_CONFIRMED,
    };
  });

  const cashierVisibleEarlyPayment =
    earlyPaymentRequests.find(
      (row: { sentToCashier?: boolean; sentToCashierAt?: Date | string | null }) =>
        Boolean(row.sentToCashier && row.sentToCashierAt),
    ) ?? null;

  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    invoiceCategory: invoice.invoiceCategory ?? 'PRODUCT_ORDER',
    branchId: invoice.branchId,
    branch: invoice.branch ? { id: invoice.branch.id, name: invoice.branch.name, code: invoice.branch.code } : null,
    distributionOrderId: invoice.distributionOrderId,
    saleId: invoice.saleId ?? null,
    orderNumber: order?.orderNumber ?? sale?.receiptNumber ?? null,
    branchPurchaseRequestId: linkedRequest?.id ?? null,
    branchPurchaseRequestNumber: linkedRequest?.requestNumber ?? null,
    customerName: sale?.customer?.fullName ?? null,
    customerPhone: sale?.customer?.phone ?? null,
    saleReceiptNumber: sale?.receiptNumber ?? null,
    receivedAmountEnteredBySales:
      sale?.receivedAmountEnteredBySales != null
        ? Number(sale.receivedAmountEnteredBySales)
        : null,
    expectedChangeAmount:
      sale?.expectedChangeAmount != null ? Number(sale.expectedChangeAmount) : null,
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
    itemCount: order?.items?.length ?? sale?.items?.length ?? 0,
    items: (order?.items ?? sale?.items ?? []).map((item: any) => ({
      id: item.id,
      productId: item.productId,
      sku: item.productSku ?? item.sku,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      lineTotal: Number(item.totalPrice ?? item.unitPrice * item.quantity),
      unit: item.product?.unit ?? item.unit ?? null,
    })),
    branchOrderInstallment: installment,
    retailInstallment,
    installmentEarlyPaymentRequests: earlyPaymentRequests,
    activeEarlyPaymentRequest: cashierVisibleEarlyPayment,
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

export function sanitizeRetailInstallmentCashierInvoice(invoice: any) {
  const base = sanitizeAccountantInvoice(invoice);
  const retail = base.retailInstallment;
  return {
    ...base,
    paidAmount: retail?.paidAmount ?? base.paidAmount,
    remainingAmount: retail?.remainingDebt ?? base.remainingAmount,
    debtAmount: retail?.remainingDebt ?? base.debtAmount,
    requiredPaymentAmount: base.requiredPaymentAmount,
    nextPaymentDate: retail?.dueDate ?? base.dueDate ?? null,
    installmentSchedule: retail
      ? [
          {
            installmentNumber: 1,
            dueDate: retail.dueDate,
            amount: retail.remainingDebt,
          },
        ]
      : [],
    items: [],
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
