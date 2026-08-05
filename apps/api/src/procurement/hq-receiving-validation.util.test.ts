import { TransportExpenseStatus, TransportExpenseType } from '@prisma/client';
import {
  buildHqReceivingBlockedMessages,
  buildHqReceivingValidationResult,
  CARGO_RECEIPT_ATTACHMENT_REQUIRED_MESSAGE,
  evaluateHqReceivingInvoiceSection,
  hqReceivingBlockedMessage,
  isSupplierInvoiceAccountantProcessed,
  isSupplierInvoicePresent,
  isTransportExpenseAccountantProcessed,
  isTransportExpenseInvoiceClosed,
  isTransportExpenseInvoicePresent,
  validateCargoReceiptComplete,
  validateHqReceivingInvoicePrerequisites,
  validateSvhToHqTransportComplete,
} from './hq-receiving-validation.util';

const completeCargo = {
  cargoTotalWeightKg: 100,
  cargoRateUsdPerKg: 2,
  defaultUsdRate: 89,
  cargoReceiptNumber: 'CR-001',
  cargoReceiptDate: '2026-06-01',
  cargoAttachmentCount: 1,
};

const completeSvh = {
  transportCompanyId: 'company-1',
  transportCostKgs: 5000,
  dispatchDate: '2026-06-02',
  arrivalDate: '2026-06-03',
  status: 'COMPLETED',
  transportCompanyStatus: 'ACTIVE',
};

const orderId = 'order-1';
const otherOrderId = 'order-2';

function expense(
  expenseType: TransportExpenseType,
  status: string,
  amount = 10000,
  procurementOrderId = orderId,
) {
  return {
    procurementOrderId,
    expenseType,
    amount,
    amountKgs: amount,
    status,
  };
}

const processedSupplier = {
  invoiceSentToAccountantAt: new Date('2026-01-01'),
  supplierInvoiceNumber: 'INV-1',
  invoiceReviewStatus: 'APPROVED',
  supplierPaymentStatus: 'PAID',
};

function allTransport(
  chinaStatus: string,
  cargoStatus: string,
  kgStatus: string,
) {
  return [
    expense(TransportExpenseType.DOMESTIC_CHINA_TRANSPORT, chinaStatus, 25000),
    expense(TransportExpenseType.INTERNATIONAL_FREIGHT, cargoStatus, 50000),
    expense(TransportExpenseType.LOCAL_DELIVERY, kgStatus, 12000),
  ];
}

function gate(params: {
  supplier?: typeof processedSupplier | null;
  china?: string;
  cargo?: string;
  kg?: string;
  expenses?: ReturnType<typeof expense>[];
}) {
  return validateHqReceivingInvoicePrerequisites({
    procurementOrderId: orderId,
    transportExpenses:
      params.expenses ??
      allTransport(
        params.china ?? TransportExpenseStatus.PAID,
        params.cargo ?? TransportExpenseStatus.PAID,
        params.kg ?? TransportExpenseStatus.PAID,
      ),
    supplier: params.supplier === undefined ? processedSupplier : params.supplier,
    chinaSectionTotal: 25000,
    cargoSectionTotal: 50000,
    kyrgyzstanSectionTotal: 12000,
  });
}

console.assert(validateCargoReceiptComplete(completeCargo).valid === true);
console.assert(validateCargoReceiptComplete({ ...completeCargo, cargoReceiptNumber: '' }).valid === false);
console.assert(validateSvhToHqTransportComplete(completeSvh).valid === true);
console.assert(validateSvhToHqTransportComplete({ ...completeSvh, status: 'WAITING' }).valid === false);

console.assert(isTransportExpenseInvoiceClosed(TransportExpenseStatus.PAID) === true);
console.assert(isTransportExpenseInvoiceClosed(TransportExpenseStatus.PARTIALLY_PAID) === false);
console.assert(isTransportExpenseInvoicePresent(TransportExpenseStatus.WAITING_ACCOUNTANT) === true);
console.assert(isTransportExpenseInvoicePresent(TransportExpenseStatus.PAYMENT_POSTPONED) === true);
console.assert(isTransportExpenseAccountantProcessed(TransportExpenseStatus.PAID) === true);
console.assert(isTransportExpenseAccountantProcessed(TransportExpenseStatus.PARTIALLY_PAID) === true);
console.assert(isTransportExpenseAccountantProcessed(TransportExpenseStatus.PAYMENT_POSTPONED) === true);
console.assert(isTransportExpenseAccountantProcessed(TransportExpenseStatus.PENDING_CASHIER) === true);
console.assert(isTransportExpenseAccountantProcessed(TransportExpenseStatus.WAITING_ACCOUNTANT) === false);

// 1. Supplier not processed blocks
{
  const result = gate({
    supplier: {
      ...processedSupplier,
      invoiceReviewStatus: 'UNDER_REVIEW',
      supplierPaymentStatus: 'AWAITING_ACCOUNTANT',
    },
  });
  console.assert(result.canReceiveToHq === false, '1. supplier waiting blocks');
  console.assert(
    result.blockingInvoices.some((row) => row.requestType === 'SUPPLIER_PAYMENT'),
    '1. supplier listed',
  );
}

// 2. China transport not processed blocks
{
  const result = gate({ china: TransportExpenseStatus.WAITING_ACCOUNTANT });
  console.assert(result.canReceiveToHq === false, '2. china waiting blocks');
  console.assert(
    result.blockingInvoices.some((row) => row.requestType === 'CHINA_DOMESTIC_TRANSPORT'),
    '2. china listed',
  );
}

// 3. Cargo not processed blocks
{
  const result = gate({ cargo: TransportExpenseStatus.WAITING_ACCOUNTANT });
  console.assert(result.canReceiveToHq === false, '3. cargo waiting blocks');
  console.assert(
    result.blockingInvoices.some((row) => row.requestType === 'CARGO_PAYMENT'),
    '3. cargo listed',
  );
}

// 4. Kyrgyzstan transport not processed blocks
{
  const result = gate({ kg: TransportExpenseStatus.WAITING_ACCOUNTANT });
  console.assert(result.canReceiveToHq === false, '4. kg waiting blocks');
  console.assert(
    result.blockingInvoices.some((row) => row.requestType === 'KYRGYZSTAN_DOMESTIC_TRANSPORT'),
    '4. kg listed',
  );
}

// 5. Missing invoice type listed in blocking message
{
  const result = gate({
    expenses: [
      expense(TransportExpenseType.DOMESTIC_CHINA_TRANSPORT, TransportExpenseStatus.PAID, 25000),
      expense(TransportExpenseType.LOCAL_DELIVERY, TransportExpenseStatus.PAID, 12000),
    ],
  });
  console.assert(result.canReceiveToHq === false, '5. missing cargo blocks');
  const messages = buildHqReceivingBlockedMessages(result.blockingInvoices);
  console.assert(messages.ru.includes('Оплата карго'), '5. message lists cargo');
  console.assert(messages.ru.includes('Невозможно принять товар на HQ склад'), '5. blocked header');
  console.assert(messages.ru.includes('Не одобрено'), '5. message lists unapproved header');
}

// 6. Fully paid counts as processed
{
  const result = gate({});
  console.assert(result.canReceiveToHq === true, '6. fully paid allows');
  console.assert(result.prerequisites.every((row) => row.accountantProcessed), '6. all processed');
}

// 7. Partially paid counts as processed
{
  const result = gate({
    supplier: { ...processedSupplier, supplierPaymentStatus: 'PARTIALLY_PAID' },
    china: TransportExpenseStatus.PARTIALLY_PAID,
    cargo: TransportExpenseStatus.PARTIALLY_PAID,
    kg: TransportExpenseStatus.PARTIALLY_PAID,
  });
  console.assert(result.canReceiveToHq === true, '7. partial allows');
  console.assert(
    result.prerequisites.every((row) => row.accountantProcessed === true),
    '7. partial processed',
  );
  console.assert(
    result.prerequisites.every((row) => row.state === 'partial'),
    '7. partial state',
  );
}

// 8. Postponed counts as processed
{
  const result = gate({
    supplier: { ...processedSupplier, supplierPaymentStatus: 'PAYMENT_POSTPONED' },
    china: TransportExpenseStatus.PAYMENT_POSTPONED,
    cargo: TransportExpenseStatus.PAYMENT_POSTPONED,
    kg: TransportExpenseStatus.PAYMENT_POSTPONED,
  });
  console.assert(result.canReceiveToHq === true, '8. postponed allows');
  console.assert(
    result.prerequisites.every((row) => row.accountantProcessed),
    '8. postponed processed',
  );
}

// 9. Waiting-for-accountant does not count as processed
{
  const result = gate({
    supplier: {
      ...processedSupplier,
      invoiceReviewStatus: 'UNDER_REVIEW',
      supplierPaymentStatus: 'AWAITING_ACCOUNTANT',
    },
    china: TransportExpenseStatus.WAITING_ACCOUNTANT,
    cargo: TransportExpenseStatus.WAITING_ACCOUNTANT,
    kg: TransportExpenseStatus.WAITING_ACCOUNTANT,
  });
  console.assert(result.canReceiveToHq === false, '9. waiting does not allow');
  console.assert(result.blockingInvoices.length === 4, '9. all four block');
}

// 10. Rejected invoice blocks receiving
{
  const result = gate({
    supplier: {
      ...processedSupplier,
      invoiceReviewStatus: 'REJECTED',
      supplierPaymentStatus: 'AWAITING_ACCOUNTANT',
    },
    cargo: TransportExpenseStatus.REJECTED,
  });
  console.assert(result.canReceiveToHq === false, '10. rejected blocks');
  console.assert(
    result.blockingInvoices.some((row) => row.state === 'rejected'),
    '10. rejected state',
  );
}

// Invoice from another shipment does not satisfy validation
{
  const result = gate({
    expenses: [
      expense(TransportExpenseType.DOMESTIC_CHINA_TRANSPORT, TransportExpenseStatus.PAID, 25000, otherOrderId),
      expense(TransportExpenseType.INTERNATIONAL_FREIGHT, TransportExpenseStatus.PAID, 50000),
      expense(TransportExpenseType.LOCAL_DELIVERY, TransportExpenseStatus.PAID, 12000),
    ],
  });
  console.assert(result.canReceiveToHq === false, 'other shipment china ignored');
  console.assert(
    evaluateHqReceivingInvoiceSection(
      [expense(TransportExpenseType.DOMESTIC_CHINA_TRANSPORT, TransportExpenseStatus.PAID, 25000, otherOrderId)],
      orderId,
      'CHINA_DOMESTIC_TRANSPORT',
      25000,
    ).state === 'missing',
    'section evaluates missing for wrong order',
  );
}

// Supplier invoice approved (unpaid) allows receive
{
  const approvedUnpaid = gate({
    supplier: {
      ...processedSupplier,
      supplierPaymentStatus: 'AWAITING_ACCOUNTANT',
      invoiceReviewStatus: 'APPROVED',
    },
  });
  console.assert(approvedUnpaid.canReceiveToHq === true, 'supplier approved unpaid allows receive');
}

// Missing supplier blocks
{
  const result = gate({ supplier: null });
  console.assert(result.canReceiveToHq === false, 'missing supplier blocks');
  console.assert(
    result.blockingInvoices.some((row) => row.requestType === 'SUPPLIER_PAYMENT' && row.state === 'missing'),
    'supplier missing state',
  );
}

const readiness = buildHqReceivingValidationResult({
  cargo: completeCargo,
  svh: completeSvh,
  procurementOrderId: orderId,
  transportExpenses: allTransport(
    TransportExpenseStatus.PARTIALLY_PAID,
    TransportExpenseStatus.PAYMENT_POSTPONED,
    TransportExpenseStatus.PENDING_CASHIER,
  ),
  supplier: { ...processedSupplier, supplierPaymentStatus: 'PARTIALLY_PAID' },
  chinaSectionTotal: 25000,
  cargoSectionTotal: 50000,
  kyrgyzstanSectionTotal: 12000,
});
console.assert(readiness.canReceiveToHq === true, 'validation allows processed partial/postponed');
console.assert(readiness.allExpensesProcessed === true, 'allExpensesProcessed true');
console.assert(hqReceivingBlockedMessage(readiness) === null, 'no blocked message when receivable');

const blockedReadiness = buildHqReceivingValidationResult({
  cargo: completeCargo,
  svh: completeSvh,
  procurementOrderId: orderId,
  transportExpenses: [],
  supplier: null,
  cargoSectionTotal: 50000,
  kyrgyzstanSectionTotal: 12000,
});
console.assert(blockedReadiness.canReceiveToHq === false, 'missing invoices block validation');
console.assert(hqReceivingBlockedMessage(blockedReadiness) !== null, 'blocked message present');
console.assert(
  (hqReceivingBlockedMessage(blockedReadiness) ?? '').includes('Не одобрено'),
  'blocked message lists unprocessed',
);

console.assert(isSupplierInvoicePresent({ invoiceSentToAccountantAt: new Date() }) === true);
console.assert(isSupplierInvoicePresent({ supplierInvoiceNumber: 'INV-1' }) === true);
console.assert(isSupplierInvoicePresent({}) === false);
console.assert(
  isSupplierInvoiceAccountantProcessed({
    invoiceReviewStatus: 'APPROVED',
    supplierPaymentStatus: 'PARTIALLY_PAID',
  }) === true,
);
console.assert(
  isSupplierInvoiceAccountantProcessed({
    invoiceReviewStatus: 'APPROVED',
    supplierPaymentStatus: 'AWAITING_ACCOUNTANT',
  }) === false,
);

console.assert(CARGO_RECEIPT_ATTACHMENT_REQUIRED_MESSAGE.length > 0);

console.log('hq-receiving-validation.util.test.ts passed');
