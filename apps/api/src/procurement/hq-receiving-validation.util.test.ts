import { TransportExpenseStatus, TransportExpenseType } from '@prisma/client';
import {
  buildHqReceivingBlockedMessages,
  buildHqReceivingValidationResult,
  CARGO_RECEIPT_ATTACHMENT_REQUIRED_MESSAGE,
  evaluateHqReceivingInvoiceSection,
  hqReceivingBlockedMessage,
  isSupplierInvoicePresent,
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

console.assert(validateCargoReceiptComplete(completeCargo).valid === true);
console.assert(validateCargoReceiptComplete({ ...completeCargo, cargoReceiptNumber: '' }).valid === false);
console.assert(validateSvhToHqTransportComplete(completeSvh).valid === true);
console.assert(validateSvhToHqTransportComplete({ ...completeSvh, status: 'WAITING' }).valid === false);

console.assert(isTransportExpenseInvoiceClosed(TransportExpenseStatus.PAID) === true);
console.assert(isTransportExpenseInvoiceClosed(TransportExpenseStatus.PARTIALLY_PAID) === false);
console.assert(isTransportExpenseInvoiceClosed(TransportExpenseStatus.CANCELLED) === false);
console.assert(isTransportExpenseInvoicePresent(TransportExpenseStatus.WAITING_ACCOUNTANT) === true);
console.assert(isTransportExpenseInvoicePresent(TransportExpenseStatus.PAYMENT_POSTPONED) === true);
console.assert(isTransportExpenseInvoicePresent(TransportExpenseStatus.DRAFT) === false);

// Both invoices paid → can receive
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
  console.assert(gate.canReceiveToHq === true, '1. both paid allows receive');
  console.assert(gate.blockingInvoices.length === 0, '1. no blocking');
}

// Unpaid cargo still allows receive when invoice exists
{
  const gate = validateHqReceivingInvoicePrerequisites({
    procurementOrderId: orderId,
    transportExpenses: [
      expense(TransportExpenseType.INTERNATIONAL_FREIGHT, TransportExpenseStatus.WAITING_ACCOUNTANT, 50000),
      expense(TransportExpenseType.LOCAL_DELIVERY, TransportExpenseStatus.WAITING_ACCOUNTANT, 12000),
    ],
    cargoSectionTotal: 50000,
    kyrgyzstanSectionTotal: 12000,
  });
  console.assert(gate.canReceiveToHq === true, '2. unpaid cargo allows receive');
  console.assert(gate.blockingInvoices.length === 0, '2. no blocking when invoices exist');
}

// Internal transport open still allows receive
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
  console.assert(gate.canReceiveToHq === true, '3. unpaid internal allows receive');
}

// Both open → still allowed
{
  const gate = validateHqReceivingInvoicePrerequisites({
    procurementOrderId: orderId,
    transportExpenses: [
      expense(TransportExpenseType.INTERNATIONAL_FREIGHT, TransportExpenseStatus.WAITING_ACCOUNTANT),
      expense(TransportExpenseType.LOCAL_DELIVERY, TransportExpenseStatus.RETURNED),
    ],
    cargoSectionTotal: 50000,
    kyrgyzstanSectionTotal: 12000,
  });
  console.assert(gate.canReceiveToHq === true, '4. open invoices allow receive');
}

// Cargo missing blocks
{
  const gate = validateHqReceivingInvoicePrerequisites({
    procurementOrderId: orderId,
    transportExpenses: [expense(TransportExpenseType.LOCAL_DELIVERY, TransportExpenseStatus.PAID, 12000)],
    cargoSectionTotal: 50000,
    kyrgyzstanSectionTotal: 12000,
  });
  console.assert(gate.canReceiveToHq === false, '5. cargo missing blocks');
  console.assert(
    gate.blockingInvoices.find((row) => row.requestType === 'CARGO_PAYMENT')?.state === 'missing',
    '5. cargo missing state',
  );
}

// Internal transport missing blocks
{
  const gate = validateHqReceivingInvoicePrerequisites({
    procurementOrderId: orderId,
    transportExpenses: [expense(TransportExpenseType.INTERNATIONAL_FREIGHT, TransportExpenseStatus.PAID, 50000)],
    cargoSectionTotal: 50000,
    kyrgyzstanSectionTotal: 12000,
  });
  console.assert(gate.canReceiveToHq === false, '6. internal missing blocks');
}

// Partially paid cargo allows receive
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
  console.assert(gate.canReceiveToHq === true, '7. partial cargo allows receive');
  console.assert(
    gate.prerequisites.find((row) => row.requestType === 'CARGO_PAYMENT')?.state === 'partial',
    '7. partial state preserved',
  );
}

// Partially paid internal transport allows receive
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
  console.assert(gate.canReceiveToHq === true, '8. partial internal allows receive');
}

// Cancelled-only invoice does not satisfy existence
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
  console.assert(gate.canReceiveToHq === false, '9. cancelled not present');
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

// Postponed cargo allows receive
{
  const gate = validateHqReceivingInvoicePrerequisites({
    procurementOrderId: orderId,
    transportExpenses: [
      expense(TransportExpenseType.INTERNATIONAL_FREIGHT, TransportExpenseStatus.PAYMENT_POSTPONED, 50000),
      expense(TransportExpenseType.LOCAL_DELIVERY, TransportExpenseStatus.PAYMENT_POSTPONED, 12000),
    ],
    cargoSectionTotal: 50000,
    kyrgyzstanSectionTotal: 12000,
  });
  console.assert(gate.canReceiveToHq === true, '11. postponed allows receive');
  console.assert(
    gate.prerequisites.find((row) => row.requestType === 'CARGO_PAYMENT')?.state === 'postponed',
    '11. postponed state',
  );
}

// Error response lists missing invoices only
{
  const gate = validateHqReceivingInvoicePrerequisites({
    procurementOrderId: orderId,
    transportExpenses: [
      expense(TransportExpenseType.INTERNATIONAL_FREIGHT, TransportExpenseStatus.WAITING_ACCOUNTANT),
    ],
    cargoSectionTotal: 50000,
    kyrgyzstanSectionTotal: 12000,
  });
  console.assert(gate.canReceiveToHq === false, '12. missing internal still blocks');
  const messages = buildHqReceivingBlockedMessages(gate.blockingInvoices);
  console.assert(messages.ru.includes('Внутренний транспорт'), '12. message lists internal');
  console.assert(messages.ru.includes('Невозможно принять товар на склад'), '12. blocked header');
  console.assert(messages.ru.includes('не требуется'), '12. payment not required note');
}

const readiness = buildHqReceivingValidationResult({
  cargo: completeCargo,
  svh: completeSvh,
  procurementOrderId: orderId,
  transportExpenses: [
    expense(TransportExpenseType.INTERNATIONAL_FREIGHT, TransportExpenseStatus.WAITING_ACCOUNTANT, 50000),
    expense(TransportExpenseType.LOCAL_DELIVERY, TransportExpenseStatus.PARTIALLY_PAID, 12000),
  ],
  cargoSectionTotal: 50000,
  kyrgyzstanSectionTotal: 12000,
});
console.assert(readiness.canReceiveToHq === true, 'validation allows unpaid/partial invoices');
console.assert(readiness.cargoReceiptCompleted === true);
console.assert(hqReceivingBlockedMessage(readiness) === null, 'no blocked message when receivable');

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

console.assert(isSupplierInvoicePresent({ invoiceSentToAccountantAt: new Date() }) === true);
console.assert(isSupplierInvoicePresent({ supplierInvoiceNumber: 'INV-1' }) === true);
console.assert(isSupplierInvoicePresent({}) === false);

console.assert(CARGO_RECEIPT_ATTACHMENT_REQUIRED_MESSAGE.length > 0);

console.log('hq-receiving-validation.util.test.ts passed');
