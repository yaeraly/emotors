import {
  estimateSectionExpenseCostKgs,
  estimateSupplierCostKgs,
  resolveProcurementCostConfirmationStatus,
  sumConfirmedExpenseAmountKgs,
  weightedAveragePaidYuanRate,
} from './procurement-cost.util';

function assertClose(actual: number, expected: number, label: string, tolerance = 0.02) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// 1. 100,000 CNY order with only 20,000 paid calculates cost from 100,000 CNY
{
  const result = estimateSupplierCostKgs({
    totalProcurementYuan: 100000,
    estimatedYuanRate: 12,
    payments: [{ amountYuan: 20000, exchangeRate: 12.1, status: 'PAID' }],
  });
  assertEqual(result.totalProcurementYuan, 100000, '1. full order amount base');
  assertClose(result.completedPaidYuan, 20000, '1. paid amount tracked separately');
  assertClose(result.remainingYuan, 80000, '7. remaining debt shown separately');
  assertClose(result.costYuanRate, 12.1, '4. weighted paid rate after first payment');
  assertClose(result.estimatedSupplierCostKgs, 100000 * 12.1, '1/8. cost from full 100000 CNY');
  assertEqual(result.estimatedSupplierCostKgs === 20000 * 12.1, false, '1. not paid-only cost');
}

// 2/3. Unpaid order uses estimated rate and is not zero
{
  const unpaid = estimateSupplierCostKgs({
    totalProcurementYuan: 100000,
    estimatedYuanRate: 12.5,
    payments: [],
  });
  assertEqual(unpaid.rateSource, 'ESTIMATED', '3. estimated rate before first payment');
  assertClose(unpaid.estimatedSupplierCostKgs, 1250000, '2. unpaid order cost not zero');
  assertClose(unpaid.remainingYuan, 100000, '7. unpaid remaining equals full order');
}

// 5. Multiple payments with different rates → weighted average on full amount
{
  const multi = estimateSupplierCostKgs({
    totalProcurementYuan: 100000,
    estimatedYuanRate: 12,
    payments: [
      { amountYuan: 20000, exchangeRate: 12.1, amountKgs: 242000, status: 'PAID' },
      { amountYuan: 30000, exchangeRate: 12.3, amountKgs: 369000, status: 'PAID' },
    ],
  });
  assertClose(multi.completedPaidYuan, 50000, 'completed paid yuan');
  assertClose(multi.completedPaidKgs, 611000, 'completed paid kgs');
  assertClose(multi.costYuanRate, 12.22, '5. weighted average recalculated', 0.001);
  assertClose(multi.estimatedSupplierCostKgs, 1222000, '5. full order × weighted rate', 1);
  assertClose(multi.remainingYuan, 50000, '7. remaining debt separate from cost');
}

// 6. Historical payment rates are not overwritten (aggregation only)
{
  const payments = [
    { amountYuan: 20000, exchangeRate: 12.1, amountKgs: 242000, status: 'PAID' },
    { amountYuan: 30000, exchangeRate: 12.3, amountKgs: 369000, status: 'PAID' },
  ];
  const before = weightedAveragePaidYuanRate(payments);
  payments.push({ amountYuan: 50000, exchangeRate: 12.45, amountKgs: 622500, status: 'PAID' });
  const after = weightedAveragePaidYuanRate(payments);
  assertClose(before ?? 0, 12.22, '6. earlier weighted rate preserved conceptually', 0.001);
  assertClose(after ?? 0, 12.335, '6. new payment updates aggregate only', 0.001);
  assertEqual(payments[0].exchangeRate, 12.1, '6. historical payment rate unchanged');
  assertEqual(payments[1].exchangeRate, 12.3, '6. historical payment rate unchanged');
}

// 9. Fully paid → actual supplier cost = sum of completed payment KGS
{
  const full = estimateSupplierCostKgs({
    totalProcurementYuan: 100000,
    estimatedYuanRate: 12,
    payments: [
      { amountYuan: 20000, exchangeRate: 12.1, amountKgs: 242000, status: 'PAID' },
      { amountYuan: 30000, exchangeRate: 12.3, amountKgs: 369000, status: 'PAID' },
      { amountYuan: 50000, exchangeRate: 12.45, amountKgs: 622500, status: 'PAID' },
    ],
  });
  assertEqual(full.isFullyPaid, true, '9. fully paid');
  assertClose(full.finalSupplierCostKgs ?? 0, 1233500, '9. actual = sum completed KGS', 1);
  assertClose(full.estimatedSupplierCostKgs, 1233500, '9. estimated becomes actual', 1);
  assertClose(full.finalWeightedAverageRate ?? 0, 12.335, '9. final rate vs full order CNY', 0.001);
  assertClose(full.remainingYuan, 0, 'fully paid remaining zero');
}

// 10/11. Transport/other expenses use full requested amounts; partial pay does not shrink cost
{
  const section = estimateSectionExpenseCostKgs({
    sectionTotalAmount: 10000,
    estimatedYuanRate: 12.2,
    defaultCurrency: 'CNY',
    expenses: [
      { amount: 2000, currency: 'CNY', exchangeRate: 12.1, amountKgs: 24200, status: 'PAID' },
      { amount: 3000, currency: 'CNY', status: 'WAITING_ACCOUNTANT' },
    ],
  });
  assertClose(section.sectionTotalAmount, 10000, '10. full section amount');
  assertClose(section.paidAmount, 2000, '11. partial paid tracked');
  assertClose(section.estimatedSectionCostKgs, 10000 * (24200 / 2000), '10/11. full section × paid weighted rate', 1);
  assertEqual(section.estimatedSectionCostKgs === 24200, false, '11. not paid-only section cost');
}

{
  const kgsSection = estimateSectionExpenseCostKgs({
    sectionTotalAmount: 50000,
    estimatedYuanRate: 12,
    defaultCurrency: 'KGS',
    expenses: [{ amount: 15000, currency: 'KGS', status: 'WAITING_ACCOUNTANT' }],
  });
  assertClose(kgsSection.estimatedSectionCostKgs, 50000, '10. unpaid KGS section still full amount');
}

// Inventory cost uses HQ Accountant-approved obligation amounts (not cash paid).
{
  const confirmed = sumConfirmedExpenseAmountKgs(
    [
      { amount: 10000, currency: 'KGS', status: 'PAID' },
      { amount: 5000, currency: 'KGS', status: 'DRAFT' },
      { amount: 7000, currency: 'KGS', status: 'WAITING_ACCOUNTANT' },
      { amount: 3000, currency: 'KGS', status: 'CANCELLED' },
      { amount: 15000, currency: 'KGS', status: 'PENDING_CASHIER' },
    ],
    12,
  );
  assertClose(confirmed, 25000, 'approved unpaid + paid obligation amounts included');
}

{
  const confirmedCargo = sumConfirmedExpenseAmountKgs(
    [
      {
        amount: 45000,
        currency: 'KGS',
        amountKgs: 45000,
        status: 'PAID',
      },
    ],
    12,
  );
  assertClose(confirmedCargo, 45000, 'confirmed cargo payment included in KGS');
}

{
  const partial = sumConfirmedExpenseAmountKgs(
    [{ amount: 10000, currency: 'KGS', paidAmountKgs: 4000, status: 'PARTIALLY_PAID' }],
    12,
  );
  assertClose(partial, 10000, 'partial cargo uses full approved amount, not paid cash');
}

{
  const postponed = sumConfirmedExpenseAmountKgs(
    [{ amount: 120000, currency: 'KGS', paidAmountKgs: 0, status: 'PAYMENT_POSTPONED' }],
    12,
  );
  assertClose(postponed, 120000, 'postponed cargo uses full approved amount');
}

{
  const otherConfirmed = sumConfirmedExpenseAmountKgs(
    [
      { amount: 1200, currency: 'KGS', status: 'PAID' },
      { amount: 800, currency: 'KGS', status: 'PAID' },
      { amount: 500, currency: 'KGS', status: 'PENDING_CASHIER' },
    ],
    12,
  );
  assertClose(otherConfirmed, 2500, 'pending cashier still counts full approved obligation');
}

// Cost confirmation status
assertEqual(
  resolveProcurementCostConfirmationStatus({
    supplierFullyPaid: false,
    supplierHasCompletedPayments: false,
    expensesFullyPaid: true,
    expensesHaveCompletedPayments: false,
  }),
  'PRELIMINARY',
  'preliminary before payments',
);
assertEqual(
  resolveProcurementCostConfirmationStatus({
    supplierFullyPaid: false,
    supplierHasCompletedPayments: true,
    expensesFullyPaid: false,
    expensesHaveCompletedPayments: false,
  }),
  'PARTIALLY_CONFIRMED',
  'partially confirmed after first payment',
);
assertEqual(
  resolveProcurementCostConfirmationStatus({
    supplierFullyPaid: true,
    supplierHasCompletedPayments: true,
    expensesFullyPaid: true,
    expensesHaveCompletedPayments: true,
  }),
  'ACTUAL',
  'actual when fully paid',
);

// 12. Audit action constant contract
assertEqual('PROCUREMENT_COST_RECALCULATED', 'PROCUREMENT_COST_RECALCULATED', '12. cost recalculation audit action');

console.log('procurement-cost.util.test.ts passed');
