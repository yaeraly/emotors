import { TransportCompanyStatus, TransportExpenseStatus, TransportExpenseType } from '@prisma/client';
import { isSvhTransportCompleted } from './svh-to-hq-transport.util';
import {
  expenseTypeForRequestType,
  summarizeSectionPayments,
} from './section-payable.util';

export const HQ_RECEIVING_BLOCKED = 'HQ_RECEIVING_BLOCKED';

export const HQ_RECEIVING_INVOICE_PREREQUISITES = [
  'CARGO_PAYMENT',
  'KYRGYZSTAN_DOMESTIC_TRANSPORT',
] as const;

export type HqReceivingInvoiceRequestType = (typeof HQ_RECEIVING_INVOICE_PREREQUISITES)[number];

export const HQ_RECEIVING_INVOICE_DISPLAY_NAMES: Record<HqReceivingInvoiceRequestType, string> = {
  CARGO_PAYMENT: 'Оплата карго',
  KYRGYZSTAN_DOMESTIC_TRANSPORT: 'Внутренний транспорт Кыргызстана',
};

export type HqReceivingInvoiceBlockState =
  | 'closed'
  | 'missing'
  | 'open'
  | 'partial'
  | 'postponed';

export type HqReceivingTransportExpenseSnapshot = {
  procurementOrderId?: string | null;
  expenseType: TransportExpenseType | string;
  amount: number | string | { toString(): string };
  amountKgs?: number | string | { toString(): string } | null;
  status: string;
};

export type HqReceivingInvoicePrerequisite = {
  requestType: HqReceivingInvoiceRequestType;
  displayName: string;
  state: HqReceivingInvoiceBlockState;
  status: string | null;
  /** True when invoice is fully paid (informational; does not gate receiving). */
  closed: boolean;
  /** True when an invoice exists for the section (required for receiving). */
  exists: boolean;
};

export type HqReceivingInvoiceGateResult = {
  canReceiveToHq: boolean;
  prerequisites: HqReceivingInvoicePrerequisite[];
  /** Only missing invoices block receiving — payment status never does. */
  blockingInvoices: HqReceivingInvoicePrerequisite[];
};

export const HQ_RECEIVING_INVOICE_PREREQUISITE_MESSAGE =
  'Перед приемкой товара на склад должны существовать счета «Оплата карго» и «Внутренний транспорт Кыргызстана». Полная оплата не требуется.';

export const CARGO_RECEIPT_INCOMPLETE_MESSAGE =
  'Fill cargo receipt before receiving to HQ warehouse';

export const CARGO_RECEIPT_ATTACHMENT_REQUIRED_MESSAGE =
  'Attach the cargo receipt before receiving goods into the HQ warehouse.';

export const SVH_TRANSPORT_INCOMPLETE_MESSAGE =
  'Complete SVH to HQ transport before receiving';

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

/** Whether a cargo receipt file exists on the order or linked freight payment request. */
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

/** Fully paid invoice (informational only — receiving does not require this). */
export function isTransportExpenseInvoiceClosed(status: string): boolean {
  return String(status ?? '').toUpperCase() === TransportExpenseStatus.PAID;
}

/** Invoice exists with a confirmed amount; payment may still be open/partial/postponed. */
export function isTransportExpenseInvoicePresent(status: string): boolean {
  const normalized = String(status ?? '').toUpperCase();
  return (
    normalized.length > 0 &&
    normalized !== TransportExpenseStatus.CANCELLED &&
    normalized !== TransportExpenseStatus.DRAFT
  );
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

export function evaluateHqReceivingInvoiceSection(
  expenses: HqReceivingTransportExpenseSnapshot[],
  procurementOrderId: string,
  requestType: HqReceivingInvoiceRequestType,
  sectionTotal?: number | null,
): HqReceivingInvoicePrerequisite {
  const expenseType = expenseTypeForRequestType(requestType);
  const displayName = HQ_RECEIVING_INVOICE_DISPLAY_NAMES[requestType];
  const orderExpenses = expensesForOrderSection(expenses, procurementOrderId, expenseType);

  if (orderExpenses.length === 0) {
    return {
      requestType,
      displayName,
      state: 'missing',
      status: null,
      closed: false,
      exists: false,
    };
  }

  const summary = summarizeSectionPayments(
    orderExpenses.map((row) => ({
      amount: Number(row.amount),
      amountKgs: row.amountKgs != null ? Number(row.amountKgs) : null,
      status: row.status,
    })),
    sectionTotal,
  );

  if (summary.status === 'PAID') {
    return {
      requestType,
      displayName,
      state: 'closed',
      status: TransportExpenseStatus.PAID,
      closed: true,
      exists: true,
    };
  }

  const hasPostponed = orderExpenses.some(
    (row) => normalizeExpenseStatus(row.status) === TransportExpenseStatus.PAYMENT_POSTPONED,
  );
  if (hasPostponed) {
    return {
      requestType,
      displayName,
      state: 'postponed',
      status: TransportExpenseStatus.PAYMENT_POSTPONED,
      closed: false,
      exists: true,
    };
  }

  const hasPartial =
    summary.status === 'PARTIALLY_PAID' ||
    orderExpenses.some(
      (row) => normalizeExpenseStatus(row.status) === TransportExpenseStatus.PARTIALLY_PAID,
    );

  if (hasPartial) {
    return {
      requestType,
      displayName,
      state: 'partial',
      status: TransportExpenseStatus.PARTIALLY_PAID,
      closed: false,
      exists: true,
    };
  }

  const dominantStatus = orderExpenses[0]?.status ?? TransportExpenseStatus.WAITING_ACCOUNTANT;
  return {
    requestType,
    displayName,
    state: 'open',
    status: dominantStatus,
    closed: false,
    exists: true,
  };
}

export function validateHqReceivingInvoicePrerequisites(input: {
  procurementOrderId: string;
  transportExpenses: HqReceivingTransportExpenseSnapshot[];
  cargoSectionTotal?: number | string | null;
  kyrgyzstanSectionTotal?: number | string | null;
}): HqReceivingInvoiceGateResult {
  const prerequisites = HQ_RECEIVING_INVOICE_PREREQUISITES.map((requestType) => {
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
  });
  // Receiving requires invoices to exist; unpaid / partial / postponed must NOT block.
  const blockingInvoices = prerequisites.filter((row) => !row.exists);
  return {
    canReceiveToHq: blockingInvoices.length === 0,
    prerequisites,
    blockingInvoices,
  };
}

function formatBlockedInvoiceLines(blocking: HqReceivingInvoicePrerequisite[]): string {
  return blocking.map((row) => `— ${row.displayName}`).join('\n');
}

function buildBlockedInvoiceAction(blocking: HqReceivingInvoicePrerequisite[]): string {
  const missing = blocking.filter((row) => row.state === 'missing');
  const parts: string[] = [];
  if (missing.length > 0) {
    parts.push(
      missing.length === 1
        ? 'Supply Manager должен создать счет:'
        : 'Supply Manager должен создать счета:',
    );
    parts.push(formatBlockedInvoiceLines(missing));
  }
  return parts.join('\n');
}

export function buildHqReceivingBlockedMessages(
  blockingInvoices: HqReceivingInvoicePrerequisite[],
): { ru: string; ky: string; en: string } {
  if (blockingInvoices.length === 0) {
    return {
      ru: HQ_RECEIVING_INVOICE_PREREQUISITE_MESSAGE,
      ky: HQ_RECEIVING_INVOICE_PREREQUISITE_MESSAGE,
      en: HQ_RECEIVING_INVOICE_PREREQUISITE_MESSAGE,
    };
  }

  const body = buildBlockedInvoiceAction(blockingInvoices);
  const ru = `Невозможно принять товар на склад.\n\n${body}\n\nПолная оплата счетов не требуется.`;
  const ky = `Товарды складга кабыл алуу мүмкүн эмес.\n\n${body}\n\nЭсептерди толук төлөө талап кылынбайт.`;
  const en = `Cannot receive goods into the warehouse.\n\n${body}\n\nFull invoice payment is not required.`;
  return { ru, ky, en };
}

export function buildHqReceivingValidationResult(params: {
  cargo: CargoReceiptSnapshot;
  svh: SvhTransportSnapshot;
  procurementOrderId?: string;
  transportExpenses?: HqReceivingTransportExpenseSnapshot[];
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
          cargoSectionTotal: params.cargoSectionTotal,
          kyrgyzstanSectionTotal: params.kyrgyzstanSectionTotal,
        })
      : null;

  return {
    /** True when a cargo receipt file already exists (payment request / order). */
    cargoReceiptCompleted: receiptAttached,
    /** Informational only — does not gate HQ warehouse receiving. */
    svhToHqTransportCompleted: svhTransport.valid,
    /** HQ China receiving requires cargo + domestic invoices to exist; payment status is ignored. */
    canReceiveToHq: invoiceGate?.canReceiveToHq ?? false,
    invoicePrerequisites: invoiceGate?.prerequisites ?? [],
    blockingInvoices: invoiceGate?.blockingInvoices ?? [],
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

/** Supplier ledger statuses that still allow HQ receiving. */
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

export function isSupplierInvoicePresent(order: {
  invoiceSentToAccountantAt?: string | Date | null;
  supplierInvoiceNumber?: string | null;
}): boolean {
  return Boolean(order.invoiceSentToAccountantAt || order.supplierInvoiceNumber?.trim());
}
