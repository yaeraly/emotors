import {
  calculateApprovedSupplierKgsFromRate,
  resolveLockedSupplierExchangeRate,
  resolveSupplierPaymentExchangeRate,
  SUPPLIER_CNY_RATE_REQUIRED_MESSAGE,
} from './supplier-payment-exchange-rate.util';
import { resolveApprovedSupplierCostBaseYuan } from './procurement-cost.util';

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

assertEqual(resolveLockedSupplierExchangeRate({ defaultYuanRate: 13 }), 13, '13. saved rate from order');
assertEqual(
  resolveLockedSupplierExchangeRate({
    payments: [{ exchangeRate: 12.5, status: 'PENDING_CASHIER' }],
  }),
  12.5,
  '14. saved rate from payment',
);

const resolved = resolveSupplierPaymentExchangeRate({
  defaultYuanRate: 0,
  submittedRate: 13,
});
assertEqual(resolved.rate, 13, '15. submitted rate accepted');
assertEqual(resolved.shouldPersist, true, '15. first rate persists');

assertEqual(
  resolveSupplierPaymentExchangeRate({ defaultYuanRate: 13, submittedRate: 14 }).rate,
  13,
  '14. locked rate reused',
);

const approvedKgs = calculateApprovedSupplierKgsFromRate(
  resolveApprovedSupplierCostBaseYuan({ totalYuan: 60000, requestedPaymentYuan: 60000 }),
  13,
);
assertEqual(approvedKgs, 780000, '16. decimal approved kgs for costing');

let threw = false;
try {
  resolveSupplierPaymentExchangeRate({ defaultYuanRate: 0, submittedRate: 0 });
} catch (error) {
  threw = error instanceof Error && error.message === SUPPLIER_CNY_RATE_REQUIRED_MESSAGE;
}
if (!threw) throw new Error('12. missing rate throws Russian message');

console.log('supplier-payment-exchange-rate.util.test.ts passed');
