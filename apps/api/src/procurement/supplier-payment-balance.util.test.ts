import { ProcurementSupplierPaymentLedgerStatus } from '@prisma/client';
import {
  assertSupplierPartialPaymentWithinRemainingCny,
  assertSupplierPartialPaymentWithinRemainingKgs,
  assertSupplierPaymentHasRemainingBalance,
  deriveSupplierPaymentYuanFromKgs,
  isSupplierCashierRequestKgsPrecisionDrift,
  resolveReconciledSupplierPaymentLedgerStatus,
  resolveSupplierCurrentRemainingKgs,
  resolveSupplierPartialPaymentInstruction,
  resolveSupplierPayRemainderInstruction,
  resolveSupplierPaymentInstructionAmountKgs,
  resolveSupplierPaymentMonetaryBalance,
  SUPPLIER_ALREADY_FULLY_PAID_MESSAGE,
  SUPPLIER_PARTIAL_PAYMENT_EXCEEDS_CURRENT_REMAINING_KGS_MESSAGE,
} from './supplier-payment-balance.util';

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertClose(actual: number, expected: number, label: string, tolerance = 0.001) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

const partialPayments = [
  {
    amountYuan: 40000,
    exchangeRate: 13,
    amountKgs: 520000,
    approvedAmountKgs: 520000,
    status: 'ACTIVE',
  },
];

const balance = resolveSupplierPaymentMonetaryBalance({
  totalYuan: 100000,
  exchangeRate: 13,
  payments: partialPayments,
});

assertClose(balance.confirmedPaidCny, 40000, '1. confirmed paid cny');
assertClose(balance.remainingCny, 60000, '1. remaining cny');
assertClose(balance.remainingKgs, 780000, '1. remaining kgs');
assertEqual(balance.isFullyPaid, false, '1. not fully paid');
assertEqual(balance.isPayable, true, '1. payable');

const payRemainderBalance = resolveSupplierPaymentMonetaryBalance({
  totalYuan: 100000,
  exchangeRate: 5,
  payments: [{ amountYuan: 65178.04, exchangeRate: 5, amountKgs: 325890.2, status: 'ACTIVE' }],
});
assertClose(payRemainderBalance.obligationKgs, 500000, '1b. approved total kgs');
assertClose(payRemainderBalance.confirmedPaidKgs, 325890.2, '1c. confirmed paid kgs');
assertClose(payRemainderBalance.remainingKgs, 174109.8, '1d. remaining 174109.80');

assertEqual(
  resolveSupplierPaymentInstructionAmountKgs({
    requestedAmountKgs: 174109.78,
    remainingAmountKgs: 174109.8,
  }),
  174109.8,
  '2. pay remainder snaps to authoritative remaining',
);

assertEqual(
  resolveSupplierPaymentInstructionAmountKgs({
    requestedAmountKgs: 174109.8,
    remainingAmountKgs: 174109.8,
  }),
  174109.8,
  '3. exact pay remainder stays 174109.80',
);

const derivedYuan = deriveSupplierPaymentYuanFromKgs({
  amountKgs: 174109.8,
  exchangeRate: 5,
});
assertClose(derivedYuan, 34821.96, '4. cny derived one-way from kgs');
assertEqual(
  resolveSupplierPaymentInstructionAmountKgs({
    requestedAmountKgs: 174109.78,
    remainingAmountKgs: 174109.8,
  }),
  174109.8,
  '4b. no kgs round trip drift for pay remainder',
);

assertEqual(
  resolveReconciledSupplierPaymentLedgerStatus({
    totalYuan: 100000,
    exchangeRate: 13,
    payments: partialPayments,
  }),
  ProcurementSupplierPaymentLedgerStatus.PARTIALLY_PAID,
  '7. partial ledger status',
);

let threwFullyPaid = false;
try {
  assertSupplierPaymentHasRemainingBalance({
    ...balance,
    isFullyPaid: true,
    isPayable: false,
    remainingCny: 0,
    remainingKgs: 0,
  });
} catch (error) {
  threwFullyPaid =
    error instanceof Error && error.message === SUPPLIER_ALREADY_FULLY_PAID_MESSAGE;
}
if (!threwFullyPaid) throw new Error('9. fully paid guard throws Russian message');

assertEqual(
  isSupplierCashierRequestKgsPrecisionDrift({
    approvedAmountKgs: 174109.78,
    authoritativeRemainingKgs: 174109.8,
  }),
  true,
  '10. drift detection for stale cashier request',
);

const closingPayment = resolveSupplierPaymentMonetaryBalance({
  totalYuan: 100000,
  exchangeRate: 13,
  payments: [
    ...partialPayments,
    { amountYuan: 60000, exchangeRate: 13, amountKgs: 780000, approvedAmountKgs: 780000, status: 'ACTIVE' },
  ],
});
assertEqual(closingPayment.isFullyPaid, true, '6. final payment closes invoice');
assertEqual(
  resolveReconciledSupplierPaymentLedgerStatus({
    totalYuan: 100000,
    exchangeRate: 13,
    payments: [
      ...partialPayments,
      { amountYuan: 60000, exchangeRate: 13, amountKgs: 780000, approvedAmountKgs: 780000, status: 'ACTIVE' },
    ],
  }),
  ProcurementSupplierPaymentLedgerStatus.PAID,
  '6b. final status paid',
);

assertEqual(
  resolveSupplierPaymentInstructionAmountKgs({
    requestedAmountKgs: 174000,
    remainingAmountKgs: 174109.8,
  }),
  174000,
  '5b. smaller partial payment is not snapped to remainder',
);

const afterPartial = resolveSupplierPaymentMonetaryBalance({
  totalYuan: 500000,
  exchangeRate: 1,
  payments: [{ amountYuan: 100000, exchangeRate: 1, amountKgs: 100000, status: 'ACTIVE' }],
});
assertClose(afterPartial.remainingKgs, 400000, '5. partial payment remaining uses decimal subtraction');

const payRemainderInstruction = resolveSupplierPayRemainderInstruction({
  remainingCny: 13393.06,
  exchangeRate: 13,
});
assertClose(payRemainderInstruction.amountYuan, 13393.06, '13. pay remainder uses remaining cny');
assertClose(payRemainderInstruction.amountKgs, 174109.78, '14. pay remainder kgs = remaining cny × rate');
assertClose(60000 * 13, 780000, '14b. total cny × rate is not used for pay remainder');
if (Math.abs(payRemainderInstruction.amountKgs - 60000 * 13) < 1) {
  throw new Error('14c. pay remainder must not equal total cny × rate');
}

const partialPayRemainderBalance = resolveSupplierPaymentMonetaryBalance({
  totalYuan: 60000,
  exchangeRate: 13,
  payments: [
    { amountYuan: 20000, exchangeRate: 12.9, amountKgs: 258000, status: 'ACTIVE' },
    { amountYuan: 26606.94, exchangeRate: 13.05, amountKgs: 347220.57, status: 'ACTIVE' },
  ],
});
assertClose(partialPayRemainderBalance.confirmedPaidCny, 46606.94, '15. confirmed paid cny');
assertClose(partialPayRemainderBalance.remainingCny, 13393.06, '16. remaining cny');
const closingInstruction = resolveSupplierPayRemainderInstruction({
  remainingCny: partialPayRemainderBalance.remainingCny,
  exchangeRate: 13,
});
assertClose(closingInstruction.amountKgs, 174109.78, '17. closing payment kgs from remaining cny × rate');

const partialInstruction = resolveSupplierPartialPaymentInstruction({
  requestedAmountKgs: 100000,
  remainingCny: partialPayRemainderBalance.remainingCny,
  exchangeRate: 13,
});
assertClose(partialInstruction.amountYuan, 7692.31, '18. partial derives cny from kgs');
assertClose(partialInstruction.amountKgs, 100000, '18b. partial keeps requested kgs');

const remaining20kAt13 = resolveSupplierCurrentRemainingKgs({
  remainingCny: 20000,
  exchangeRate: 13,
});
assertClose(remaining20kAt13, 260000, '1. remaining 20k cny × rate 13 = 260k kgs');

const partial100k = resolveSupplierPartialPaymentInstruction({
  requestedAmountKgs: 100000,
  remainingCny: 20000,
  exchangeRate: 13,
});
assertClose(partial100k.amountKgs, 100000, '2. partial 100k kgs accepted');
assertClose(partial100k.amountYuan, 7692.31, '8. partial kgs converts back to cny');

const partial250k = resolveSupplierPartialPaymentInstruction({
  requestedAmountKgs: 250000,
  remainingCny: 20000,
  exchangeRate: 13,
});
assertClose(partial250k.amountKgs, 250000, '3. partial 250k kgs accepted');

const partialFull = resolveSupplierPartialPaymentInstruction({
  requestedAmountKgs: 260000,
  remainingCny: 20000,
  exchangeRate: 13,
});
assertClose(partialFull.amountKgs, 260000, '4. partial 260k kgs closes remaining');
assertClose(partialFull.amountYuan, 20000, '9. exact full kgs settles remaining cny exactly');

assertSupplierPartialPaymentWithinRemainingKgs({
  paymentAmountKgs: 260000,
  remainingCny: 20000,
  exchangeRate: 13,
});

let threwPartialOverLimit = false;
try {
  assertSupplierPartialPaymentWithinRemainingKgs({
    paymentAmountKgs: 260001,
    remainingCny: 20000,
    exchangeRate: 13,
  });
} catch (error) {
  threwPartialOverLimit =
    error instanceof Error &&
    error.message === SUPPLIER_PARTIAL_PAYMENT_EXCEEDS_CURRENT_REMAINING_KGS_MESSAGE;
}
if (!threwPartialOverLimit) throw new Error('5. partial 260001 kgs rejected at current rate');

let threwCnyCompare = false;
try {
  assertSupplierPartialPaymentWithinRemainingKgs({
    paymentAmountKgs: 100000,
    remainingCny: 5000,
    exchangeRate: 13,
  });
} catch (error) {
  threwCnyCompare =
    error instanceof Error &&
    error.message === SUPPLIER_PARTIAL_PAYMENT_EXCEEDS_CURRENT_REMAINING_KGS_MESSAGE;
}
if (!threwCnyCompare) throw new Error('6. kgs is not compared directly to cny remaining');

assertClose(
  resolveSupplierCurrentRemainingKgs({ remainingCny: 20000, exchangeRate: 13.1 }),
  262000,
  '7. changing rate updates remaining kgs immediately',
);

let threwLegacyCnyValidation = false;
try {
  assertSupplierPartialPaymentWithinRemainingCny({
    amountYuan: partialInstruction.amountYuan,
    remainingCny: 5000,
  });
} catch (error) {
  threwLegacyCnyValidation =
    error instanceof Error && error.message === 'Сумма частичного платежа превышает остаток.';
}
if (!threwLegacyCnyValidation) throw new Error('19. legacy cny validation still available separately');

console.log('supplier-payment-balance.util.test.ts passed');
