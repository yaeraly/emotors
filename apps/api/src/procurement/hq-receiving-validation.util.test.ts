import { TransportExpenseStatus, TransportExpenseType } from '@prisma/client';
import {
  buildHqReceivingBlockedMessages,
  buildHqReceivingValidationResult,
  CARGO_RECEIPT_ATTACHMENT_REQUIRED_MESSAGE,
  evaluateHqReceivingInvoiceSection,
  hqReceivingBlockedMessage,
  isTransportExpenseInvoiceClosed,
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

console.assert(validateCargoReceiptComplete(completeCargo).valid === true);
console.assert(validateCargoReceiptComplete({ ...completeCargo, cargoReceiptNumber: '' }).valid === false);
console.assert(validateSvhToHqTransportComplete(completeSvh).valid === true);
console.assert(validateSvhToHqTransportComplete({ ...completeSvh, status: 'WAITING' }).valid === false);

console.assert(isTransportExpenseInvoiceClosed(TransportExpenseStatus.PAID) === true);
console.assert(isTransportExpenseInvoiceClosed(TransportExpenseStatus.PARTIALLY_PAID) === false);
console.assert(isTransportExpenseInvoiceClosed(TransportExpenseStatus.CANCELLED) === false);

// Both invoices closed → can receive
{
  const gate = validateHqReceivingInvoicePrerequisites({
    procurementOrderId: orderId,
    transportExpenses: [
      expense(TransportExpenseType.INTERNATIONAL_FREIGHT, TransportExpenseStatus.PAID, 50000),
      expense(TransportExpenseType.LOCAL_DELIVERY, TransportExpenseStatus.PAID, 12000),
    ],
    cargoSectionTotal: 50000,
    kyrgyzstanSectionTotal: 12000,
  });
  console.assert(gate.canReceiveToHq === true, '1. both closed');
  console.assert(gate.blockingInvoices.length === 0, '1. no blocking');
}

// Cargo open
{
  const gate = validateHqReceivingInvoicePrerequisites({
    procurementOrderId: orderId,
    transportExpenses: [
      expense(TransportExpenseType.INTERNATIONAL_FREIGHT, TransportExpenseStatus.WAITING_ACCOUNTANT),
      expense(TransportExpenseType.LOCAL_DELIVERY, TransportExpenseStatus.PAID, 12000),
    ],
    cargoSectionTotal: 50000,
    kyrgyzstanSectionTotal: 12000,
  });
  console.assert(gate.canReceiveToHq === false, '2. cargo open blocks');
  console.assert(gate.blockingInvoices.some((row) => row.requestType === 'CARGO_PAYMENT'), '2. cargo listed');
}

// Internal transport open
{
  const gate = validateHqReceivingInvoicePrerequisites({
    procurementOrderId: orderId,
    transportExpenses: [
      expense(TransportExpenseType.INTERNATIONAL_FREIGHT, TransportExpenseStatus.PAID, 50000),
      expense(TransportExpenseType.LOCAL_DELIVERY, TransportExpenseStatus.PENDING_CASHIER, 12000),
    ],
    cargoSectionTotal: 50000,
    kyrgyzstanSectionTotal: 12000,
  });
  console.assert(gate.canReceiveToHq === false, '3. internal transport open blocks');
  console.assert(
    gate.blockingInvoices.some((row) => row.requestType === 'KYRGYZSTAN_DOMESTIC_TRANSPORT'),
    '3. internal listed',
  );
}

// Both open
{
  const gate = validateHqReceivingInvoicePrerequisites({
    procurementOrderId: orderId,
    transportExpenses: [
      expense(TransportExpenseType.INTERNATIONAL_FREIGHT, TransportExpenseStatus.DRAFT),
      expense(TransportExpenseType.LOCAL_DELIVERY, TransportExpenseStatus.RETURNED),
    ],
    cargoSectionTotal: 50000,
    kyrgyzstanSectionTotal: 12000,
  });
  console.assert(gate.canReceiveToHq === false, '4. both open');
  console.assert(gate.blockingInvoices.length === 2, '4. both blocking');
}

// Cargo missing
{
  const gate = validateHqReceivingInvoicePrerequisites({
    procurementOrderId: orderId,
    transportExpenses: [expense(TransportExpenseType.LOCAL_DELIVERY, TransportExpenseStatus.PAID, 12000)],
    cargoSectionTotal: 50000,
    kyrgyzstanSectionTotal: 12000,
  });
  console.assert(gate.canReceiveToHq === false, '5. cargo missing');
  console.assert(
    gate.blockingInvoices.find((row) => row.requestType === 'CARGO_PAYMENT')?.state === 'missing',
    '5. cargo missing state',
  );
}

// Internal transport missing
{
  const gate = validateHqReceivingInvoicePrerequisites({
    procurementOrderId: orderId,
    transportExpenses: [expense(TransportExpenseType.INTERNATIONAL_FREIGHT, TransportExpenseStatus.PAID, 50000)],
    cargoSectionTotal: 50000,
    kyrgyzstanSectionTotal: 12000,
  });
  console.assert(gate.canReceiveToHq === false, '6. internal missing');
}

// Partially paid cargo
{
  const gate = validateHqReceivingInvoicePrerequisites({
    procurementOrderId: orderId,
    transportExpenses: [
      expense(TransportExpenseType.INTERNATIONAL_FREIGHT, TransportExpenseStatus.PARTIALLY_PAID, 50000),
      expense(TransportExpenseType.LOCAL_DELIVERY, TransportExpenseStatus.PAID, 12000),
    ],
    cargoSectionTotal: 50000,
    kyrgyzstanSectionTotal: 12000,
  });
  console.assert(gate.canReceiveToHq === false, '7. partial cargo blocks');
  console.assert(
    gate.blockingInvoices.find((row) => row.requestType === 'CARGO_PAYMENT')?.state === 'partial',
    '7. partial state',
  );
}

// Partially paid internal transport
{
  const gate = validateHqReceivingInvoicePrerequisites({
    procurementOrderId: orderId,
    transportExpenses: [
      expense(TransportExpenseType.INTERNATIONAL_FREIGHT, TransportExpenseStatus.PAID, 50000),
      expense(TransportExpenseType.LOCAL_DELIVERY, TransportExpenseStatus.PARTIALLY_PAID, 12000),
    ],
    cargoSectionTotal: 50000,
    kyrgyzstanSectionTotal: 12000,
  });
  console.assert(gate.canReceiveToHq === false, '8. partial internal blocks');
}

// Cancelled invoice does not satisfy
{
  const gate = validateHqReceivingInvoicePrerequisites({
    procurementOrderId: orderId,
    transportExpenses: [
      expense(TransportExpenseType.INTERNATIONAL_FREIGHT, TransportExpenseStatus.CANCELLED, 50000),
      expense(TransportExpenseType.LOCAL_DELIVERY, TransportExpenseStatus.PAID, 12000),
    ],
    cargoSectionTotal: 50000,
    kyrgyzstanSectionTotal: 12000,
  });
  console.assert(gate.canReceiveToHq === false, '9. cancelled not closed');
}

// Invoice from another shipment does not satisfy validation
{
  const gate = validateHqReceivingInvoicePrerequisites({
    procurementOrderId: orderId,
    transportExpenses: [
      expense(TransportExpenseType.INTERNATIONAL_FREIGHT, TransportExpenseStatus.PAID, 50000, otherOrderId),
      expense(TransportExpenseType.LOCAL_DELIVERY, TransportExpenseStatus.PAID, 12000),
    ],
    cargoSectionTotal: 50000,
    kyrgyzstanSectionTotal: 12000,
  });
  console.assert(gate.canReceiveToHq === false, '10. other shipment cargo ignored');
  console.assert(
    evaluateHqReceivingInvoiceSection(
      [expense(TransportExpenseType.INTERNATIONAL_FREIGHT, TransportExpenseStatus.PAID, 50000, otherOrderId)],
      orderId,
      'CARGO_PAYMENT',
      50000,
    ).state === 'missing',
    '10. section evaluates missing for wrong order',
  );
}

// Error response lists blocking invoices
{
  const gate = validateHqReceivingInvoicePrerequisites({
    procurementOrderId: orderId,
    transportExpenses: [
      expense(TransportExpenseType.INTERNATIONAL_FREIGHT, TransportExpenseStatus.WAITING_ACCOUNTANT),
    ],
    cargoSectionTotal: 50000,
    kyrgyzstanSectionTotal: 12000,
  });
  const messages = buildHqReceivingBlockedMessages(gate.blockingInvoices);
  console.assert(messages.ru.includes('Оплата карго'), '14. message lists cargo');
  console.assert(messages.ru.includes('Невозможно принять товар на склад'), '14. blocked header');
}

const readiness = buildHqReceivingValidationResult({
  cargo: completeCargo,
  svh: completeSvh,
  procurementOrderId: orderId,
  transportExpenses: [
    expense(TransportExpenseType.INTERNATIONAL_FREIGHT, TransportExpenseStatus.PAID, 50000),
    expense(TransportExpenseType.LOCAL_DELIVERY, TransportExpenseStatus.PAID, 12000),
  ],
  cargoSectionTotal: 50000,
  kyrgyzstanSectionTotal: 12000,
});
console.assert(readiness.canReceiveToHq === true, 'validation result allows when closed');
console.assert(readiness.cargoReceiptCompleted === true);

const blockedReadiness = buildHqReceivingValidationResult({
  cargo: completeCargo,
  svh: completeSvh,
  procurementOrderId: orderId,
  transportExpenses: [],
  cargoSectionTotal: 50000,
  kyrgyzstanSectionTotal: 12000,
});
console.assert(blockedReadiness.canReceiveToHq === false, 'missing invoices block validation');
console.assert(hqReceivingBlockedMessage(blockedReadiness) !== null, 'blocked message present');

const attachmentOnly = buildHqReceivingValidationResult({
  cargo: { cargoAttachmentCount: 1 },
  svh: null,
  procurementOrderId: orderId,
  transportExpenses: [
    expense(TransportExpenseType.INTERNATIONAL_FREIGHT, TransportExpenseStatus.PAID, 50000),
    expense(TransportExpenseType.LOCAL_DELIVERY, TransportExpenseStatus.PAID, 12000),
  ],
  cargoSectionTotal: 50000,
  kyrgyzstanSectionTotal: 12000,
});
console.assert(attachmentOnly.canReceiveToHq === true);
console.assert(attachmentOnly.svhToHqTransportCompleted === false);

console.assert(CARGO_RECEIPT_ATTACHMENT_REQUIRED_MESSAGE.length > 0);

console.log('hq-receiving-validation.util.test.ts passed');
