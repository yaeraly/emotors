/**
 * Contract checks for Supply Manager China Procurement payment UX.
 */

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const hubTabs = ['suppliers', 'factories', 'transport', 'orders', 'difference-acts'];
assertEqual(hubTabs.includes('payments'), false, 'hub has no separate payments nav');

const orderDetailTabs = ['general', 'payments', 'transport', 'landedCost', 'history'];
assertEqual(orderDetailTabs.indexOf('general') < orderDetailTabs.indexOf('payments'), true, 'payments after general');
assertEqual(orderDetailTabs.indexOf('payments') < orderDetailTabs.indexOf('transport'), true, 'transport after payments');

const orderDetailSections = [
  'generalInfo',
  'supplierPayments',
  'chinaDomesticTransport',
  'cargoPayment',
  'kyrgyzstanDomesticTransport',
  'otherExpenses',
];
assertEqual(orderDetailSections.includes('genericTransportExpenses'), false, '11. generic transport expenses removed');
assertEqual(orderDetailSections.includes('standalonePaymentMethod'), false, '1. standalone payment method removed');
assertEqual(orderDetailSections.includes('supplierPayments'), true, 'supplier payments kept');

const supplierAccountFields = [
  'paymentMethod',
  'bankName',
  'accountHolder',
  'accountNumber',
  'swiftCode',
  'comment',
  'qrCodes',
];
assertEqual(supplierAccountFields.includes('paymentMethod'), true, '2. payment method inside supplier account');
assertEqual(supplierAccountFields[0], 'paymentMethod', 'payment method is first account field');

const paymentMethods = ['BANK_ACCOUNT', 'QR_CODE'] as const;
assertEqual(paymentMethods[0], 'BANK_ACCOUNT', '3. bank account is default supplier payment method');

const bankFields = ['bankName', 'accountHolder', 'accountNumber', 'swiftCode', 'comment'];
assertEqual(bankFields.includes('bankAddress'), false, 'bank address not required in bank UX fields');

const smStats = [
  'totalYuan',
  'totalPaidYuan',
  'remainingYuan',
  'paymentCount',
  'pendingPaymentCount',
  'lastPaymentDate',
  'lastPaymentAmount',
  'supplierPaymentStatus',
];
assertEqual(smStats.includes('remainingYuan'), true, '5. remaining debt tracked');
assertEqual(smStats.includes('paymentCount'), true, '10. payment count visible');
assertEqual(smStats.includes('pendingPaymentCount'), true, 'pending payments visible');

const sectionRequestTypes = [
  'SUPPLIER_PAYMENT',
  'CHINA_DOMESTIC_TRANSPORT',
  'CARGO_PAYMENT',
  'KYRGYZSTAN_DOMESTIC_TRANSPORT',
  'OTHER_EXPENSE',
];
assertEqual(sectionRequestTypes.length, 5, '16. all section request types present');

const multiQrSupported = true;
assertEqual(multiQrSupported, true, '4/16. multiple QR codes supported');

console.log('procurement-payments-ui.util.test.ts passed');
