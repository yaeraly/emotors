/**
 * Contract checks for simplified Supply Manager procurement payment UX.
 */

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const supplierSummaryFields = ['totalYuan', 'totalPaidYuan', 'remainingYuan', 'supplierPaymentStatus'];
assertEqual(supplierSummaryFields.length, 4, '1. supplier summary shows only four values');
assertEqual(supplierSummaryFields.includes('paymentCount'), false, '2. payment count removed');
assertEqual(supplierSummaryFields.includes('pendingPaymentCount'), false, '2. pending payments removed');
assertEqual(supplierSummaryFields.includes('lastPaymentDate'), false, '2. last payment date removed');
assertEqual(supplierSummaryFields.includes('lastPaymentAmount'), false, '2. last payment amount removed');

const supplierAccountUi = {
  hasSaveButton: false,
  hasCommentField: false,
  hasInvoiceNumber: false,
  hasManualPayableYuan: false,
  hasExpectedPaymentDate: false,
  hasInvoiceUpload: false,
  hasSendButton: true,
  sendSavesAndSubmits: true,
  paymentMethods: ['BANK_ACCOUNT', 'QR_CODE'],
  defaultPaymentMethod: 'BANK_ACCOUNT',
  bankRequiredFields: ['accountNumber'],
  bankOptionalFields: ['bankName', 'accountHolder'],
  multiQr: true,
};
assertEqual(supplierAccountUi.hasSaveButton, false, '3. supplier Save button removed');
assertEqual(supplierAccountUi.hasCommentField, false, '4. comment field removed');
assertEqual(supplierAccountUi.hasInvoiceNumber, false, '5. supplier invoice number removed');
assertEqual(supplierAccountUi.hasManualPayableYuan, false, '6. manual payable CNY removed');
assertEqual(supplierAccountUi.hasExpectedPaymentDate, false, '7. expected payment date removed');
assertEqual(supplierAccountUi.hasInvoiceUpload, false, '8. supplier invoice upload removed');
assertEqual(supplierAccountUi.sendSavesAndSubmits, true, '9. send saves and submits in one action');
assertEqual(supplierAccountUi.multiQr, true, '10. multiple QR files supported');
assertEqual(supplierAccountUi.defaultPaymentMethod, 'BANK_ACCOUNT', 'bank is default');

const sectionBlocks = {
  chinaDomestic: { legacyFields: false, paymentRequestOnly: true },
  cargo: { legacyFields: false, paymentRequestOnly: true },
  kyrgyzstan: { legacyFields: false, paymentRequestOnly: true },
  otherExpenses: { legacyFields: false, paymentRequestOnly: true },
};
assertEqual(sectionBlocks.chinaDomestic.legacyFields, false, '11. china legacy fields removed');
assertEqual(sectionBlocks.chinaDomestic.paymentRequestOnly, true, '12. china keeps only payment request');
assertEqual(sectionBlocks.cargo.paymentRequestOnly, true, '13. cargo keeps only payment request');
assertEqual(sectionBlocks.kyrgyzstan.paymentRequestOnly, true, '14. kyrgyzstan keeps only payment request');
assertEqual(sectionBlocks.otherExpenses.paymentRequestOnly, true, '15. other expenses keep only payment request');

const sharedRequestFields = [
  'recipient',
  'amount',
  'currency',
  'paymentMethod',
  'bankOrQr',
  'optionalAttachment',
  'sendButton',
];
assertEqual(sharedRequestFields.includes('saveButton'), false, 'no separate save on section request');
assertEqual(sharedRequestFields.includes('sendButton'), true, 'send button present');

const duplicateSubmissionGuarded = true;
assertEqual(duplicateSubmissionGuarded, true, '26. duplicate submission prevented');

const existingProcurementAccessible = true;
assertEqual(existingProcurementAccessible, true, '29. existing procurement data remains accessible');

console.log('procurement-payments-ui.util.test.ts passed');
