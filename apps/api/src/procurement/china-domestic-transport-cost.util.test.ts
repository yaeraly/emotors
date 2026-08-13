/**
 * China domestic transport (Внутренний транспорт Китая) must enter landed cost exactly once.
 */
import { TransportExpenseStatus, TransportExpenseType } from '@prisma/client';
import {
  buildProcurementImportExpenseLines,
  dedupeSectionExpensesById,
  resolveSectionCostKgsFromApprovedExpenses,
  sumConfirmedExpenseAmountKgs,
  sumSectionConfirmedExpenseAmountKgs,
} from './procurement-cost.util';
import { calculateLandedCosts } from './landed-cost.util';

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

const CHINA_RATE = 13;
const CHINA_CNY = 600;
const CHINA_KGS = 7800;
const expenseId = 'china-expense-1';

function chinaExpense(
  overrides: Partial<{
    id: string;
    status: string;
    amount: number;
    amountKgs: number;
    paidAmountKgs: number;
    exchangeRate: number;
  }> = {},
) {
  return {
    id: overrides.id ?? expenseId,
    expenseType: TransportExpenseType.DOMESTIC_CHINA_TRANSPORT,
    amount: overrides.amount ?? CHINA_CNY,
    currency: 'CNY',
    exchangeRate: overrides.exchangeRate ?? CHINA_RATE,
    amountKgs: overrides.amountKgs ?? CHINA_KGS,
    paidAmountKgs: overrides.paidAmountKgs ?? 0,
    status: overrides.status ?? TransportExpenseStatus.PENDING_CASHIER,
  };
}

// 1. 600 CNY × 13 = 7,800 KGS
{
  const kgs = sumConfirmedExpenseAmountKgs(
    [
      {
        id: expenseId,
        amount: CHINA_CNY,
        currency: 'CNY',
        exchangeRate: CHINA_RATE,
        status: TransportExpenseStatus.PENDING_CASHIER,
      },
    ],
    CHINA_RATE,
  );
  assertClose(kgs, CHINA_KGS, '1. cny conversion');
}

// 2. One approved China transport expense enters cost once
{
  const kgs = sumConfirmedExpenseAmountKgs([chinaExpense()], CHINA_RATE);
  assertClose(kgs, CHINA_KGS, '2. single approved expense');
}

// 3. One payment does not duplicate the expense (paid tracked separately)
{
  const lines = buildProcurementImportExpenseLines({
    estimatedYuanRate: CHINA_RATE,
    transportExpenses: [chinaExpense({ status: TransportExpenseStatus.PAID, paidAmountKgs: CHINA_KGS })],
  });
  const chinaLine = lines.find((row) => row.requestType === 'CHINA_DOMESTIC_TRANSPORT');
  if (!chinaLine) throw new Error('3. china line missing');
  assertClose(chinaLine.approvedAmountKgs, CHINA_KGS, '3. approved once');
  assertClose(chinaLine.paidAmountKgs, CHINA_KGS, '3. paid tracked');
  assertClose(chinaLine.approvedAmountKgs, chinaLine.paidAmountKgs, '3. approved equals paid not doubled');
}

// 4. Multiple rows with the same expense id do not multiply cost
{
  const row = {
    id: expenseId,
    amount: CHINA_CNY,
    currency: 'CNY',
    exchangeRate: CHINA_RATE,
    amountKgs: CHINA_KGS,
    status: TransportExpenseStatus.PAID,
  };
  const kgs = sumConfirmedExpenseAmountKgs([row, row, row], CHINA_RATE);
  assertClose(kgs, CHINA_KGS, '4. join multiplication deduped');
}

// 5. Multiple product lines do not multiply total section expense
{
  const logistics = {
    chinaDomesticTransportKgs: CHINA_KGS,
    chinaExportTransportKgs: 0,
    localTransportKgs: 0,
    packagingCostKgs: 0,
    customsCostKgs: 0,
    insuranceCostKgs: 0,
    bankFeeCostKgs: 0,
    otherExpenseKgs: 0,
  };
  const result = calculateLandedCosts(
    [
      { quantity: 10, purchasePriceYuan: 100, yuanRate: CHINA_RATE, weightKg: 100 },
      { quantity: 5, purchasePriceYuan: 200, yuanRate: CHINA_RATE, weightKg: 200 },
    ],
    logistics,
  );
  const chinaAllocSum = result.items.reduce((sum, item) => sum + item.chinaDomesticAllocKgs, 0);
  assertClose(chinaAllocSum, CHINA_KGS, '5. allocation sum across lines');
}

// 6. Repeated costing input does not duplicate when ids are reused
{
  const rows = dedupeSectionExpensesById([
    chinaExpense({ id: 'a' }),
    chinaExpense({ id: 'a' }),
    chinaExpense({ id: 'b', amount: 100, amountKgs: 1300, exchangeRate: CHINA_RATE }),
  ].map((row) => ({
    id: row.id,
    amount: row.amount,
    currency: row.currency,
    exchangeRate: row.exchangeRate,
    amountKgs: row.amountKgs,
    status: row.status,
  })));
  assertEqual(rows.length, 2, '6. dedupe keeps distinct ids only');
}

// 7. Allocation sum equals exactly 7,800 KGS
{
  const logistics = {
    chinaDomesticTransportKgs: CHINA_KGS,
    chinaExportTransportKgs: 0,
    localTransportKgs: 0,
    packagingCostKgs: 0,
    customsCostKgs: 0,
    insuranceCostKgs: 0,
    bankFeeCostKgs: 0,
    otherExpenseKgs: 0,
  };
  const result = calculateLandedCosts(
    [
      { quantity: 3, purchasePriceYuan: 50, yuanRate: CHINA_RATE, weightKg: 10 },
      { quantity: 2, purchasePriceYuan: 80, yuanRate: CHINA_RATE, weightKg: 20 },
    ],
    logistics,
  );
  const chinaAllocSum = result.items.reduce((sum, item) => sum + item.chinaDomesticAllocKgs, 0);
  assertClose(chinaAllocSum, CHINA_KGS, '7. exact allocation reconciliation');
}

// 8–9. Paid amount does not inflate approved / landed cost
{
  const paidExpense = chinaExpense({
    status: TransportExpenseStatus.PAID,
    paidAmountKgs: CHINA_KGS,
  });
  const approved = sumConfirmedExpenseAmountKgs(
    [
      {
        id: paidExpense.id,
        amount: paidExpense.amount,
        currency: paidExpense.currency,
        exchangeRate: paidExpense.exchangeRate,
        amountKgs: paidExpense.amountKgs,
        paidAmountKgs: paidExpense.paidAmountKgs,
        status: paidExpense.status,
      },
    ],
    CHINA_RATE,
  );
  assertClose(approved, CHINA_KGS, '8. approved stays 7800');
  assertClose(approved + paidExpense.paidAmountKgs, CHINA_KGS * 2, '9. approved+paid would be wrong');
  assertEqual(approved === CHINA_KGS * 2, false, '9. cost not approved+paid');
}

// 10. Three duplicate expense records must cap at section budget (7,800 KGS)
{
  const duplicates = [1, 2, 3].map((n) =>
    chinaExpense({ id: `dup-${n}`, status: TransportExpenseStatus.PAID, paidAmountKgs: CHINA_KGS }),
  );
  const rawSum = sumConfirmedExpenseAmountKgs(
    duplicates.map((row) => ({
      id: row.id,
      amount: row.amount,
      currency: row.currency,
      exchangeRate: row.exchangeRate,
      amountKgs: row.amountKgs,
      paidAmountKgs: row.paidAmountKgs,
      status: row.status,
    })),
    CHINA_RATE,
  );
  assertClose(rawSum, 23400, '10. raw sum shows triple expense rows');

  const capped = sumSectionConfirmedExpenseAmountKgs(
    duplicates.map((row) => ({
      id: row.id,
      amount: row.amount,
      currency: row.currency,
      exchangeRate: row.exchangeRate,
      amountKgs: row.amountKgs,
      paidAmountKgs: row.paidAmountKgs,
      status: row.status,
    })),
    CHINA_RATE,
    { sectionTotalAmount: CHINA_CNY, sectionCurrency: 'CNY' },
  );
  assertClose(capped, CHINA_KGS, '10. section cap returns 7800');

  const lines = buildProcurementImportExpenseLines({
    estimatedYuanRate: CHINA_RATE,
    transportExpenses: duplicates,
    sectionBudgets: {
      DOMESTIC_CHINA_TRANSPORT: { totalAmount: CHINA_CNY, currency: 'CNY' },
    },
  });
  const chinaLine = lines.find((row) => row.requestType === 'CHINA_DOMESTIC_TRANSPORT');
  if (!chinaLine) throw new Error('10. china line missing');
  assertClose(chinaLine.approvedAmountKgs, CHINA_KGS, '10. UI line shows 7800');
}

// 10b. Stale inflated order scalar must not override deduped approved expense total
{
  const resolved = resolveSectionCostKgsFromApprovedExpenses({
    confirmedFromExpenses: CHINA_KGS,
    storedOrderKgs: 23400,
    hasApprovedExpenseRows: true,
  });
  assertClose(resolved, CHINA_KGS, '10b. authoritative expense beats stale 23400 scalar');
}

// 11. Final landed cost includes corrected china transport once
{
  const logistics = {
    chinaDomesticTransportKgs: CHINA_KGS,
    chinaExportTransportKgs: 0,
    localTransportKgs: 0,
    packagingCostKgs: 0,
    customsCostKgs: 0,
    insuranceCostKgs: 0,
    bankFeeCostKgs: 0,
    otherExpenseKgs: 0,
  };
  const result = calculateLandedCosts(
    [{ quantity: 1, purchasePriceYuan: 100, yuanRate: CHINA_RATE, weightKg: 1 }],
    logistics,
  );
  const purchaseKgs = 100 * CHINA_RATE;
  assertClose(result.totalCostKgs, purchaseKgs + CHINA_KGS, '11. total landed cost');
}

// 13. Cargo section dedupe protects other batches from join multiplication
{
  const cargoId = 'cargo-1';
  const row = {
    id: cargoId,
    amount: 45000,
    currency: 'KGS',
    amountKgs: 45000,
    status: TransportExpenseStatus.PAID,
  };
  const kgs = sumConfirmedExpenseAmountKgs([row, row, row], CHINA_RATE);
  assertClose(kgs, 45000, '13. cargo deduped');
}

console.log('china-domestic-transport-cost.util.test.ts passed');
