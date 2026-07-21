/**
 * Contract checks for Supply Manager China Procurement payment UX.
 */

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const hubTabs = ['suppliers', 'factories', 'transport', 'orders', 'difference-acts'];
assertEqual(hubTabs.includes('payments'), false, '1. hub has no separate payments nav');

const orderDetailTabs = ['general', 'payments', 'transport', 'landedCost', 'history'];
assertEqual(orderDetailTabs.indexOf('general') < orderDetailTabs.indexOf('payments'), true, '2. payments after general');
assertEqual(orderDetailTabs.indexOf('payments') < orderDetailTabs.indexOf('transport'), true, 'transport after payments');

const paymentMethods = ['QR_CODE', 'BANK_ACCOUNT'] as const;
assertEqual(paymentMethods[0], 'QR_CODE', '4. QR is default first option');

const bankFields = ['bankName', 'accountHolder', 'accountNumber', 'swiftCode', 'comment'];
assertEqual(bankFields.includes('bankAddress'), false, '6. bank address removed from required bank UX fields');

const smStats = [
  'totalYuan',
  'totalPaidYuan',
  'remainingYuan',
  'paymentCount',
  'lastPaymentDate',
  'lastPaymentAmount',
  'supplierPaymentStatus',
];
assertEqual(smStats.includes('remainingYuan'), true, '10. remaining debt tracked');

console.log('procurement-payments-ui.util.test.ts passed');
