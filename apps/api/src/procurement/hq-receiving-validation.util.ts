import { TransportCompanyStatus, TransportExpenseStatus, TransportExpenseType } from '@prisma/client';
import { isSvhTransportCompleted } from './svh-to-hq-transport.util';
import {
  expenseTypeForRequestType,
  summarizeSectionPayments,
} from './section-payable.util';

export const HQ_RECEIVING_BLOCKED = 'HQ_RECEIVING_BLOCKED';

/** All four mandatory expense groups must be processed by HQ Accountant before receive. */
export const HQ_RECEIVING_INVOICE_PREREQUISITES = [
  'SUPPLIER_PAYMENT',
  'CHINA_DOMESTIC_TRANSPORT',
  'CARGO_PAYMENT',
  'KYRGYZSTAN_DOMESTIC_TRANSPORT',
] as const;

export type HqReceivingInvoiceRequestType = (typeof HQ_RECEIVING_INVOICE_PREREQUISITES)[number];

export const HQ_RECEIVING_INVOICE_DISPLAY_NAMES: Record<HqReceivingInvoiceRequestType, string> = {
  SUPPLIER_PAYMENT: 'Платежи поставщику',
  CHINA_DOMESTIC_TRANSPORT: 'Внутренний транспорт Китая',
  CARGO_PAYMENT: 'Оплата карго',
  KYRGYZSTAN_DOMESTIC_TRANSPORT: 'Внутренний транспорт Кыргызстана',
};

export type HqReceivingInvoiceBlockState =
  | 'closed'
  | 'missing'
  | 'open'
  | 'partial'
  | 'postponed'
  | 'approved'
  | 'rejected';

export type HqReceivingTransportExpenseSnapshot = {
  procurementOrderId?: string | null;
  expenseType: TransportExpenseType | string;
  amount: number | string | { toString(): string };
  amountKgs?: number | string | { toString(): string } | null;
  status: string;
};

export type HqReceivingSupplierSnapshot = {
  invoiceSentToAccountantAt?: string | Date | null;
  supplierInvoiceNumber?: string | null;
  invoiceReviewStatus?: string | null;
  supplierPaymentStatus?: string | null;
};

export type HqReceivingInvoicePrerequisite = {
  requestType: HqReceivingInvoiceRequestType;
  displayName: string;
  state: HqReceivingInvoiceBlockState;
  status: string | null;
  /** True when invoice is fully paid (informational). */
  closed: boolean;
  /** True when an invoice record exists for the section. */
  exists: boolean;
  /**
   * True when HQ Accountant completed a payment decision:
   * full pay / partial pay / postpone (not merely waiting for review).
   */
  accountantProcessed: boolean;
};

export type HqReceivingInvoiceGateResult = {
  canReceiveToHq: boolean;
  prerequisites: HqReceivingInvoicePrerequisite[];
  /** Missing, rejected, or unprocessed invoices block receiving. */
  blockingInvoices: HqReceivingInvoicePrerequisite[];
};

export const HQ_RECEIVING_INVOICE_PREREQUISITE_MESSAGE =
  'Невозможно принять товар на HQ склад.\n\nНе все импортные расходы одобрены HQ Accountant.';

export const CARGO_RECEIPT_INCOMPLETE_MESSAGE =
  'Fill cargo receipt before receiving to HQ warehouse';

export const CARGO_RECEIPT_ATTACHMENT_REQUIRED_MESSAGE =
  'Attach the cargo receipt before receiving goods into the HQ warehouse.';

export const SVH_TRANSPORT_INCOMPLETE_MESSAGE =
  'Complete SVH to HQ transport before receiving';

/** Transport statuses that mean HQ Accountant finished processing (pay or postpone). */
export const TRANSPORT_ACCOUNTANT_PROCESSED_STATUSES = new Set<string>([
  TransportExpenseStatus.PENDING_CASHIER,
  TransportExpenseStatus.PARTIALLY_PAID,
  TransportExpenseStatus.PAYMENT_POSTPONED,
  TransportExpenseStatus.PAID,
]);

/** Supplier ledger statuses that mean HQ Accountant finished processing. */
export const SUPPLIER_ACCOUNTANT_PROCESSED_STATUSES = new Set<string>([
  'AWAITING_CASHIER',
  'PARTIALLY_PAID',
  'PAYMENT_POSTPONED',
  'PAID',
  'OVERPAID',
]);

export type CargoReceiptSnapshot = {
  cargoTotalWeightKg?: number | string | null;
  cargoRateUsdPerKg?: number | string | null;
  defaultUsdRate?: number | string | null;
  cargoReceiptNumber?: string | null;
  cargoReceiptDate?: string | Date | null;
  cargoAttachmentCount?: number;
};

export type SvhTransportSnapshot = {
  transportCompanyId?: string | null;
  transportCostKgs?: number | string | null;
  dispatchDate?: string | Date | null;
  arrivalDate?: string | Date | null;
  status?: string | null;
  transportCompanyStatus?: string | null;
} | null | undefined;

export type HqReceivingValidationResult = {
  valid: boolean;
  errors: string[];
};

/** Full Import Logistics cargo form completeness (informational; does not block HQ receive). */
export function validateCargoReceiptComplete(snapshot: CargoReceiptSnapshot): HqReceivingValidationResult {
  const errors: string[] = [];
  if (Number(snapshot.cargoTotalWeightKg ?? 0) <= 0) {
    errors.push('cargoTotalWeightKg');
  }
  if (Number(snapshot.cargoRateUsdPerKg ?? 0) <= 0) {
    errors.push('cargoRateUsdPerKg');
  }
  if (Number(snapshot.defaultUsdRate ?? 0) <= 0) {
    errors.push('defaultUsdRate');
  }
  if (!snapshot.cargoReceiptNumber?.trim()) {
    errors.push('cargoReceiptNumber');
  }
  if (!snapshot.cargoReceiptDate) {
    errors.push('cargoReceiptDate');
  }
  if ((snapshot.cargoAttachmentCount ?? 0) < 1) {
    errors.push('cargoAttachment');
  }
  return { valid: errors.length === 0, errors };
}

export function hasCargoReceiptAttachment(snapshot: CargoReceiptSnapshot): boolean {
  return (snapshot.cargoAttachmentCount ?? 0) >= 1;
}

export function validateSvhToHqTransportComplete(snapshot: SvhTransportSnapshot): HqReceivingValidationResult {
  const errors: string[] = [];
  if (!snapshot) {
    return { valid: false, errors: ['svhTransportMissing'] };
  }
  if (!snapshot.transportCompanyId) {
    errors.push('transportCompanyId');
  }
  if (Number(snapshot.transportCostKgs ?? -1) < 0) {
    errors.push('transportCostKgs');
  }
  if (!snapshot.dispatchDate) {
    errors.push('dispatchDate');
  }
  if (!snapshot.arrivalDate) {
    errors.push('arrivalDate');
  }
  if (!isSvhTransportCompleted(snapshot.status)) {
    errors.push('status');
  }
  if (
    snapshot.transportCompanyId &&
    snapshot.transportCompanyStatus &&
    snapshot.transportCompanyStatus !== TransportCompanyStatus.ACTIVE
  ) {
    errors.push('transportCompanyInactive');
  }
  return { valid: errors.length === 0, errors };
}

export function isTransportExpenseInvoiceClosed(status: string): boolean {
  return String(status ?? '').toUpperCase() === TransportExpenseStatus.PAID;
}

export function isTransportExpenseInvoicePresent(status: string): boolean {
  const normalized = String(status ?? '').toUpperCase();
  return (
    normalized.length > 0 &&
    normalized !== TransportExpenseStatus.CANCELLED &&
    normalized !== TransportExpenseStatus.DRAFT
  );
}

export function isTransportExpenseAccountantProcessed(status: string): boolean {
  return TRANSPORT_ACCOUNTANT_PROCESSED_STATUSES.has(String(status ?? '').toUpperCase());
}

export function isSupplierInvoicePresent(order: {
  invoiceSentToAccountantAt?: string | Date | null;
  supplierInvoiceNumber?: string | null;
}): boolean {
  return Boolean(order.invoiceSentToAccountantAt || order.supplierInvoiceNumber?.trim());
}

export function isSupplierInvoiceAccountantProcessed(order: {
  invoiceReviewStatus?: string | null;
  supplierPaymentStatus?: string | null;
}): boolean {
  const review = String(order.invoiceReviewStatus ?? '').toUpperCase();
  if (review === 'REJECTED') return false;
  const ledger = String(order.supplierPaymentStatus ?? '').toUpperCase();
  return SUPPLIER_ACCOUNTANT_PROCESSED_STATUSES.has(ledger);
}

function normalizeExpenseStatus(status: string): string {
  return String(status ?? '').toUpperCase();
}

function expensesForOrderSection(
  expenses: HqReceivingTransportExpenseSnapshot[],
  procurementOrderId: string,
  expenseType: TransportExpenseType,
): HqReceivingTransportExpenseSnapshot[] {
  return expenses.filter((row) => {
    if (row.procurementOrderId !== procurementOrderId) return false;
    if (row.expenseType !== expenseType) return false;
    const status = normalizeExpenseStatus(row.status);
    return status !== TransportExpenseStatus.CANCELLED && status !== TransportExpenseStatus.DRAFT;
  });
}

function emptyPrerequisite(
  requestType: HqReceivingInvoiceRequestType,
  state: HqReceivingInvoiceBlockState = 'missing',
  status: string | null = null,
): HqReceivingInvoicePrerequisite {
  return {
    requestType,
    displayName: HQ_RECEIVING_INVOICE_DISPLAY_NAMES[requestType],
    state,
    status,
    closed: false,
    exists: state !== 'missing',
    accountantProcessed: false,
  };
}

export function evaluateSupplierInvoiceSection(
  supplier?: HqReceivingSupplierSnapshot | null,
): HqReceivingInvoicePrerequisite {
  const requestType = 'SUPPLIER_PAYMENT' as const;
  const displayName = HQ_RECEIVING_INVOICE_DISPLAY_NAMES[requestType];
  if (!supplier || !isSupplierInvoicePresent(supplier)) {
    return emptyPrerequisite(requestType, 'missing');
  }

  const review = String(supplier.invoiceReviewStatus ?? '').toUpperCase();
  const ledger = String(supplier.supplierPaymentStatus ?? '').toUpperCase();

  if (review === 'REJECTED') {
    return {
      requestType,
      displayName,
      state: 'rejected',
      status: 'REJECTED',
      closed: false,
      exists: true,
      accountantProcessed: false,
    };
  }

  if (ledger === 'PAID' || ledger === 'OVERPAID') {
    return {
      requestType,
      displayName,
      state: 'closed',
      status: ledger,
      closed: true,
      exists: true,
      accountantProcessed: true,
    };
  }
  if (ledger === 'PARTIALLY_PAID') {
    return {
      requestType,
      displayName,
      state: 'partial',
      status: ledger,
      closed: false,
      exists: true,
      accountantProcessed: true,
    };
  }
  if (ledger === 'PAYMENT_POSTPONED') {
    return {
      requestType,
      displayName,
      state: 'postponed',
      status: ledger,
      closed: false,
      exists: true,
      accountantProcessed: true,
    };
  }
  if (ledger === 'AWAITING_CASHIER') {
    return {
      requestType,
      displayName,
      state: 'approved',
      status: ledger,
      closed: false,
      exists: true,
      accountantProcessed: true,
    };
  }

  if (review === 'APPROVED') {
    return {
      requestType,
      displayName,
      state: ledger === 'UNPAID' || !ledger ? 'approved' : 'open',
      status: ledger || 'APPROVED',
      closed: false,
      exists: true,
      accountantProcessed: true,
    };
  }

  return {
    requestType,
    displayName,
    state: 'open',
    status: ledger || review || 'AWAITING_ACCOUNTANT',
    closed: false,
    exists: true,
    accountantProcessed: false,
  };
}

export function evaluateHqReceivingInvoiceSection(
  expenses: HqReceivingTransportExpenseSnapshot[],
  procurementOrderId: string,
  requestType: Exclude<HqReceivingInvoiceRequestType, 'SUPPLIER_PAYMENT'>,
  sectionTotal?: number | null,
): HqReceivingInvoicePrerequisite {
  const expenseType = expenseTypeForRequestType(requestType);
  const displayName = HQ_RECEIVING_INVOICE_DISPLAY_NAMES[requestType];
  const orderExpenses = expensesForOrderSection(expenses, procurementOrderId, expenseType);

  if (orderExpenses.length === 0) {
    return emptyPrerequisite(requestType, 'missing');
  }

  const hasRejected = orderExpenses.every(
    (row) => normalizeExpenseStatus(row.status) === TransportExpenseStatus.REJECTED,
  );
  if (hasRejected) {
    return {
      requestType,
      displayName,
      state: 'rejected',
      status: TransportExpenseStatus.REJECTED,
      closed: false,
      exists: true,
      accountantProcessed: false,
    };
  }

  // Prefer any processed row for the section (partial/postpone/paid/pending cashier).
  const processedRows = orderExpenses.filter((row) =>
    isTransportExpenseAccountantProcessed(row.status),
  );
  if (processedRows.length > 0) {
    const summary = summarizeSectionPayments(
      orderExpenses.map((row) => ({
        amount: Number(row.amount),
        amountKgs: row.amountKgs != null ? Number(row.amountKgs) : null,
        status: row.status,
      })),
      sectionTotal,
    );

    if (summary.status === 'PAID' || processedRows.some((row) => normalizeExpenseStatus(row.status) === 'PAID')) {
      const allPaid = orderExpenses.every((row) =>
        ['PAID', 'CANCELLED', 'REJECTED'].includes(normalizeExpenseStatus(row.status)),
      );
      if (allPaid || summary.status === 'PAID') {
        return {
          requestType,
          displayName,
          state: 'closed',
          status: TransportExpenseStatus.PAID,
          closed: true,
          exists: true,
          accountantProcessed: true,
        };
      }
    }

    if (processedRows.some((row) => normalizeExpenseStatus(row.status) === 'PAYMENT_POSTPONED')) {
      return {
        requestType,
        displayName,
        state: 'postponed',
        status: TransportExpenseStatus.PAYMENT_POSTPONED,
        closed: false,
        exists: true,
        accountantProcessed: true,
      };
    }

    if (
      summary.status === 'PARTIALLY_PAID' ||
      processedRows.some((row) => normalizeExpenseStatus(row.status) === 'PARTIALLY_PAID')
    ) {
      return {
        requestType,
        displayName,
        state: 'partial',
        status: TransportExpenseStatus.PARTIALLY_PAID,
        closed: false,
        exists: true,
        accountantProcessed: true,
      };
    }

    return {
      requestType,
      displayName,
      state: 'approved',
      status: TransportExpenseStatus.PENDING_CASHIER,
      closed: false,
      exists: true,
      accountantProcessed: true,
    };
  }

  const dominantStatus = orderExpenses[0]?.status ?? TransportExpenseStatus.WAITING_ACCOUNTANT;
  const normalizedDominant = normalizeExpenseStatus(dominantStatus);
  if (normalizedDominant === TransportExpenseStatus.RETURNED) {
    return {
      requestType,
      displayName,
      state: 'open',
      status: TransportExpenseStatus.RETURNED,
      closed: false,
      exists: true,
      accountantProcessed: false,
    };
  }
  return {
    requestType,
    displayName,
    state: 'open',
    status: dominantStatus,
    closed: false,
    exists: true,
    accountantProcessed: false,
  };
}

export function validateHqReceivingInvoicePrerequisites(input: {
  procurementOrderId: string;
  transportExpenses: HqReceivingTransportExpenseSnapshot[];
  supplier?: HqReceivingSupplierSnapshot | null;
  chinaSectionTotal?: number | string | null;
  cargoSectionTotal?: number | string | null;
  kyrgyzstanSectionTotal?: number | string | null;
}): HqReceivingInvoiceGateResult {
  const prerequisites: HqReceivingInvoicePrerequisite[] = HQ_RECEIVING_INVOICE_PREREQUISITES.map(
    (requestType) => {
      if (requestType === 'SUPPLIER_PAYMENT') {
        return evaluateSupplierInvoiceSection(input.supplier);
      }
      if (requestType === 'CHINA_DOMESTIC_TRANSPORT') {
        return evaluateHqReceivingInvoiceSection(
          input.transportExpenses,
          input.procurementOrderId,
          requestType,
          Number(input.chinaSectionTotal ?? 0),
        );
      }
      if (requestType === 'CARGO_PAYMENT') {
        return evaluateHqReceivingInvoiceSection(
          input.transportExpenses,
          input.procurementOrderId,
          requestType,
          Number(input.cargoSectionTotal ?? 0),
        );
      }
      return evaluateHqReceivingInvoiceSection(
        input.transportExpenses,
        input.procurementOrderId,
        requestType,
        Number(input.kyrgyzstanSectionTotal ?? 0),
      );
    },
  );

  const blockingInvoices = prerequisites.filter((row) => !row.accountantProcessed);
  return {
    canReceiveToHq: blockingInvoices.length === 0,
    prerequisites,
    blockingInvoices,
  };
}

function formatBlockedInvoiceLines(blocking: HqReceivingInvoicePrerequisite[]): string {
  return blocking.map((row) => `• ${row.displayName}`).join('\n');
}

export function buildHqReceivingBlockedMessages(
  blockingInvoices: HqReceivingInvoicePrerequisite[],
): { ru: string; ky: string; en: string } {
  const list = formatBlockedInvoiceLines(blockingInvoices);
  const ru = `${HQ_RECEIVING_INVOICE_PREREQUISITE_MESSAGE}\n\nНе одобрено:\n${list || '• —'}`;
  const ky = `HQ складга товар кабыл алуу мүмкүн эмес.\n\nБардык импорт чыгымдары HQ Accountant тарабынан бекитилген эмес.\n\nБекитилген эмес:\n${list || '• —'}`;
  const en = `Cannot receive goods into the HQ warehouse.\n\nNot all import expenses have been approved by HQ Accountant.\n\nNot approved:\n${list || '• —'}`;
  return { ru, ky, en };
}

export function buildHqReceivingValidationResult(params: {
  cargo: CargoReceiptSnapshot;
  svh: SvhTransportSnapshot;
  procurementOrderId?: string;
  transportExpenses?: HqReceivingTransportExpenseSnapshot[];
  supplier?: HqReceivingSupplierSnapshot | null;
  chinaSectionTotal?: number | string | null;
  cargoSectionTotal?: number | string | null;
  kyrgyzstanSectionTotal?: number | string | null;
}) {
  const cargoForm = validateCargoReceiptComplete(params.cargo);
  const svhTransport = validateSvhToHqTransportComplete(params.svh);
  const receiptAttached = hasCargoReceiptAttachment(params.cargo);
  const cargoReceipt: HqReceivingValidationResult = receiptAttached
    ? { valid: true, errors: [] }
    : { valid: false, errors: ['cargoAttachment'] };

  const invoiceGate =
    params.procurementOrderId && params.transportExpenses
      ? validateHqReceivingInvoicePrerequisites({
          procurementOrderId: params.procurementOrderId,
          transportExpenses: params.transportExpenses,
          supplier: params.supplier,
          chinaSectionTotal: params.chinaSectionTotal,
          cargoSectionTotal: params.cargoSectionTotal,
          kyrgyzstanSectionTotal: params.kyrgyzstanSectionTotal,
        })
      : null;

  return {
    cargoReceiptCompleted: receiptAttached,
    svhToHqTransportCompleted: svhTransport.valid,
    /** True only when all four mandatory invoices are processed by HQ Accountant. */
    canReceiveToHq: invoiceGate?.canReceiveToHq ?? false,
    invoicePrerequisites: invoiceGate?.prerequisites ?? [],
    blockingInvoices: invoiceGate?.blockingInvoices ?? [],
    allExpensesProcessed: invoiceGate?.canReceiveToHq ?? false,
    cargoReceipt,
    cargoForm,
    svhTransport,
  };
}

export function hqReceivingBlockedMessage(
  validation: ReturnType<typeof buildHqReceivingValidationResult>,
): string | null {
  if (validation.canReceiveToHq) return null;
  return buildHqReceivingBlockedMessages(validation.blockingInvoices).ru;
}

/** @deprecated Prefer isSupplierInvoiceAccountantProcessed for the receiving gate. */
export function isSupplierPaymentStatusReceivable(status: string | null | undefined): boolean {
  const normalized = String(status ?? '').toUpperCase();
  return (
    normalized === '' ||
    normalized === 'UNPAID' ||
    normalized === 'AWAITING_ACCOUNTANT' ||
    normalized === 'AWAITING_CASHIER' ||
    normalized === 'PARTIALLY_PAID' ||
    normalized === 'PAYMENT_POSTPONED' ||
    normalized === 'PAID' ||
    normalized === 'OVERPAID'
  );
}
