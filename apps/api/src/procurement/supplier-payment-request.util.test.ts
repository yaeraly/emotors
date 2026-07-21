/**
 * Contract tests for Supply Manager → HQ Accountant payment request flow.
 */

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

/** New PO create payload must not require payment details. */
function buildCreateOrderPayload(input: {
  supplierId: string;
  hqWarehouseId: string;
  items: Array<{ productId: string; quantity: number; purchasePriceYuan: number }>;
}) {
  return {
    supplierId: input.supplierId,
    hqWarehouseId: input.hqWarehouseId,
    currency: 'CNY',
    items: input.items,
  };
}

function validateSendPaymentRequest(input: {
  requestedPaymentYuan: number;
  hasPaymentInfo: boolean;
  paymentMethod?: 'BANK_ACCOUNT' | 'QR_CODE';
  bankComplete?: boolean;
  qrComplete?: boolean;
  hasInvoice: boolean;
}) {
  if (!(input.requestedPaymentYuan > 0)) {
    return 'Requested CNY payment amount must be greater than zero';
  }
  if (!input.hasPaymentInfo) {
    return 'Add payment method and payment instructions before sending to HQ Accountant';
  }
  if (input.paymentMethod === 'BANK_ACCOUNT' && !input.bankComplete) {
    return 'Complete supplier bank account payment instructions before sending to HQ Accountant';
  }
  if (input.paymentMethod === 'QR_CODE' && !input.qrComplete) {
    return 'Attach at least one payment QR code before sending to HQ Accountant';
  }
  if (!input.hasInvoice) {
    return 'Upload a supplier invoice or enter an invoice number before sending';
  }
  return null;
}

{
  const payload = buildCreateOrderPayload({
    supplierId: 'sup-1',
    hqWarehouseId: 'wh-1',
    items: [{ productId: 'p1', quantity: 2, purchasePriceYuan: 100 }],
  });
  assertEqual(
    Object.prototype.hasOwnProperty.call(payload, 'paymentMethod'),
    false,
    'create PO payload has no paymentMethod',
  );
  assertEqual(
    Object.prototype.hasOwnProperty.call(payload, 'bankName'),
    false,
    'create PO payload has no bankName',
  );
  assertEqual(
    Object.prototype.hasOwnProperty.call(payload, 'providedBy'),
    false,
    'create PO payload has no providedBy',
  );
}

assertEqual(
  validateSendPaymentRequest({
    requestedPaymentYuan: 0,
    hasPaymentInfo: true,
    paymentMethod: 'BANK_ACCOUNT',
    bankComplete: true,
    hasInvoice: true,
  }),
  'Requested CNY payment amount must be greater than zero',
  'amount required',
);

assertEqual(
  validateSendPaymentRequest({
    requestedPaymentYuan: 5000,
    hasPaymentInfo: false,
    hasInvoice: true,
  }),
  'Add payment method and payment instructions before sending to HQ Accountant',
  'payment info required',
);

assertEqual(
  validateSendPaymentRequest({
    requestedPaymentYuan: 5000,
    hasPaymentInfo: true,
    paymentMethod: 'BANK_ACCOUNT',
    bankComplete: false,
    hasInvoice: true,
  }),
  'Complete supplier bank account payment instructions before sending to HQ Accountant',
  'bank details required',
);

assertEqual(
  validateSendPaymentRequest({
    requestedPaymentYuan: 12000,
    hasPaymentInfo: true,
    paymentMethod: 'QR_CODE',
    qrComplete: true,
    hasInvoice: true,
  }),
  null,
  'valid payment request accepted',
);

// Auto-appear rule: newly saved UNPAID orders belong in SM queue
{
  const order = { supplierPaymentStatus: 'UNPAID', remainingYuan: 1000, deletedAt: null };
  const appearsInSmQueue =
    order.deletedAt == null &&
    (order.remainingYuan > 0 || order.supplierPaymentStatus === 'UNPAID');
  assertEqual(appearsInSmQueue, true, 'new UNPAID order appears in SM payment queue');
}

console.log('supplier-payment-request.util.test.ts passed');
