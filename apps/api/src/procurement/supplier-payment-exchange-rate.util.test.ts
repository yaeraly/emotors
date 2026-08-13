import {
  calculateApprovedSupplierKgsFromRate,
  countSupplierExchangeRateRevisions,
  isSupplierPaymentExchangeRateRevisionAllowed,
  resolveLatestConfirmedSupplierPaymentExchangeRate,
  resolveLockedSupplierExchangeRate,
  resolveSupplierPaymentDetailDisplayExchangeRate,
  resolveSupplierPaymentDialogDefaultExchangeRate,
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

const revised = resolveSupplierPaymentExchangeRate({
  defaultYuanRate: 13,
  submittedRate: 13.2,
  allowRateRevision: true,
});
assertEqual(revised.rate, 13.2, '9. revised rate accepted after correction');
assertEqual(revised.shouldPersist, true, '11. revised rate persists');
assertEqual(revised.previousRate, 13, '12. previous rate preserved');
assertEqual(revised.rateRevised, true, '12b. revision flagged');

assertEqual(
  isSupplierPaymentExchangeRateRevisionAllowed([
    { action: 'SUPPLIER_PAYMENT_SENT_TO_CASHIER', timestamp: '2026-01-01T10:00:00Z' },
    { action: 'SUPPLIER_PAYMENT_RESUBMITTED', timestamp: '2026-01-02T10:00:00Z' },
  ]),
  true,
  '7. resubmit after cashier request unlocks rate',
);

assertEqual(
  isSupplierPaymentExchangeRateRevisionAllowed([
    { action: 'SUPPLIER_PAYMENT_RESUBMITTED', timestamp: '2026-01-01T10:00:00Z' },
    { action: 'SUPPLIER_PAYMENT_SENT_TO_CASHIER', timestamp: '2026-01-02T10:00:00Z' },
  ]),
  false,
  '14. new cashier request re-locks rate',
);

assertEqual(
  countSupplierExchangeRateRevisions([
    { action: 'SUPPLIER_EXCHANGE_RATE_REVISED' },
    { action: 'SUPPLIER_EXCHANGE_RATE_REVISED' },
  ]),
  2,
  '12c. revision counter',
);

const approvedKgs = calculateApprovedSupplierKgsFromRate(
  resolveApprovedSupplierCostBaseYuan({ totalYuan: 50000, requestedPaymentYuan: 50000 }),
  13.2,
);
assertEqual(approvedKgs, 660000, '10. decimal approved kgs for corrected costing');

let threw = false;
try {
  resolveSupplierPaymentExchangeRate({ defaultYuanRate: 0, submittedRate: 0 });
} catch (error) {
  threw = error instanceof Error && error.message === SUPPLIER_CNY_RATE_REQUIRED_MESSAGE;
}
if (!threw) throw new Error('12. missing rate throws Russian message');

assertEqual(
  resolveLatestConfirmedSupplierPaymentExchangeRate([
    { exchangeRate: 12.9, status: 'ACTIVE', paidAt: '2026-01-01T10:00:00Z' },
  ]),
  12.9,
  '16. single confirmed payment prefills 12.90',
);

assertEqual(
  resolveLatestConfirmedSupplierPaymentExchangeRate([
    { exchangeRate: 12.9, status: 'ACTIVE', paidAt: '2026-01-01T10:00:00Z' },
    { exchangeRate: 13.05, status: 'ACTIVE', paidAt: '2026-02-01T10:00:00Z' },
  ]),
  13.05,
  '17. latest confirmed payment wins by paidAt',
);

assertEqual(
  resolveLatestConfirmedSupplierPaymentExchangeRate([
    { exchangeRate: 99, status: 'CANCELLED', paidAt: '2026-03-01T10:00:00Z' },
    { exchangeRate: 12.9, status: 'ACTIVE', paidAt: '2026-01-01T10:00:00Z' },
  ]),
  12.9,
  '18. cancelled payment rate ignored',
);

const noPayments = resolveSupplierPaymentDialogDefaultExchangeRate({
  payments: [],
  defaultYuanRate: 13,
});
assertEqual(noPayments.lastPaidExchangeRateCnyKgs, null, '19. no payments -> no last paid rate');
assertEqual(noPayments.defaultExchangeRateCnyKgs, '13', '20. approved invoice rate used when unpaid');

const twoPayments = resolveSupplierPaymentDialogDefaultExchangeRate({
  payments: [
    { exchangeRate: 12.9, status: 'ACTIVE', paidAt: '2026-01-01T10:00:00Z' },
    { exchangeRate: 13.05, status: 'ACTIVE', paidAt: '2026-02-01T10:00:00Z' },
  ],
  defaultYuanRate: 13,
});
assertEqual(twoPayments.lastPaidExchangeRateCnyKgs, '13.05', '21. dialog exposes last paid rate');
assertEqual(twoPayments.defaultExchangeRateCnyKgs, '13.05', '22. dialog default uses last paid rate');

const inFlightOnly = resolveSupplierPaymentDialogDefaultExchangeRate({
  payments: [{ exchangeRate: 12.8, status: 'PENDING_CASHIER', sentToCashierAt: '2026-01-01T10:00:00Z' }],
  defaultYuanRate: 13,
});
assertEqual(inFlightOnly.lastPaidExchangeRateCnyKgs, null, '23. in-flight is not last paid');
assertEqual(inFlightOnly.defaultExchangeRateCnyKgs, '12.8', '24. in-flight rate used before invoice rate');

assertEqual(
  resolveSupplierPaymentDetailDisplayExchangeRate({
    payments: [
      { exchangeRate: 12.9, status: 'ACTIVE', paidAt: '2026-01-01T10:00:00Z' },
      { exchangeRate: 13.05, status: 'ACTIVE', paidAt: '2026-02-01T10:00:00Z' },
      { exchangeRate: 13.1, status: 'ACTIVE', paidAt: '2026-03-01T10:00:00Z' },
    ],
    defaultYuanRate: 13,
  }),
  '13.1',
  '25. detail shows latest paid rate',
);

assertEqual(
  resolveSupplierPaymentDetailDisplayExchangeRate({
    payments: [{ exchangeRate: 12.8, status: 'PENDING_CASHIER', sentToCashierAt: '2026-01-01T10:00:00Z' }],
    defaultYuanRate: 13,
  }),
  '13',
  '26. detail ignores in-flight and uses approved rate',
);

assertEqual(
  resolveSupplierPaymentDetailDisplayExchangeRate({ payments: [], defaultYuanRate: 0 }),
  null,
  '27. detail has no rate when unpaid and no approved rate',
);

console.log('supplier-payment-exchange-rate.util.test.ts passed');
