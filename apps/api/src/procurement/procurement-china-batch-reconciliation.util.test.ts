/**
 * Full landed-cost reconciliation for the first China procurement batch (914,369.80 KGS).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TransportExpenseStatus, TransportExpenseType } from '@prisma/client';
import { distributeRoundedAmounts } from './landed-cost-allocation.util';
import { sumRoundedMoney } from './landed-cost-money.util';
import { calculateLandedCosts } from './landed-cost.util';
import { buildProcurementLandedCostReconciliation } from './procurement-landed-cost-reconciliation.util';
import {
  sumConfirmedExpenseAmountKgs,
  sumSectionConfirmedExpenseAmountKgs,
} from './procurement-cost.util';

const ACCOUNTING_TOTAL_KGS = 914369.8;
const CHINA_TRANSPORT_KGS = 7800;
const CHINA_TRANSPORT_CNY = 600;
const CHINA_RATE = 13;
const INFLATED_TOTAL_KGS = 929969.8;
const OVERCOUNT_KGS = 15600;

function buildRepresentativeBatchItems(count = 62, quantity = 11) {
  const rawShares = Array.from({ length: count }, (_, index) => 14756.12 + (index % 17) * 0.31);
  const lineTotals = distributeRoundedAmounts(rawShares, ACCOUNTING_TOTAL_KGS);
  const purchaseShare = sumRoundedMoney(lineTotals.map((total) => total * 0.62));
  const logisticsShare = sumRoundedMoney([ACCOUNTING_TOTAL_KGS - purchaseShare]);

  return {
    lineTotals,
    purchaseShare,
    logisticsShare,
    items: lineTotals.map((lineTotal, index) => {
      const purchaseRatio = lineTotal / ACCOUNTING_TOTAL_KGS;
      const basePurchase = sumRoundedMoney([purchaseShare * purchaseRatio]);
      const purchasePriceYuan = basePurchase / quantity / CHINA_RATE;
      return {
        quantity,
        purchasePriceYuan,
        yuanRate: CHINA_RATE,
        weightKg: 1.2 + (index % 5) * 0.1,
        lineTotal,
        basePurchase,
        logisticsShare: sumRoundedMoney([lineTotal - basePurchase]),
      };
    }),
  };
}

function chinaExpense(id: string, status = TransportExpenseStatus.PAID) {
  return {
    id,
    expenseType: TransportExpenseType.DOMESTIC_CHINA_TRANSPORT,
    amount: CHINA_TRANSPORT_CNY,
    currency: 'CNY',
    exchangeRate: CHINA_RATE,
    amountKgs: CHINA_TRANSPORT_KGS,
    paidAmountKgs: CHINA_TRANSPORT_KGS,
    status,
  };
}

function buildLogistics(chinaDomesticKgs: number, totalLogistics: number) {
  const remainder = sumRoundedMoney([totalLogistics - chinaDomesticKgs]);
  return {
    chinaDomesticTransportKgs: chinaDomesticKgs,
    chinaExportTransportKgs: remainder,
    localTransportKgs: 0,
    packagingCostKgs: 0,
    customsCostKgs: 0,
    insuranceCostKgs: 0,
    bankFeeCostKgs: 0,
    otherExpenseKgs: 0,
  };
}

describe('first China batch landed cost reconciliation', () => {
  const batch = buildRepresentativeBatchItems();

  it('representative 62-line batch sums to 914,369.80 KGS', () => {
    assert.equal(sumRoundedMoney(batch.lineTotals), ACCOUNTING_TOTAL_KGS);
  });

  it('documents observed inflation: 914,369.80 + 15,600 = 929,969.80', () => {
    assert.equal(round2(ACCOUNTING_TOTAL_KGS + OVERCOUNT_KGS), INFLATED_TOTAL_KGS);
    assert.equal(OVERCOUNT_KGS, CHINA_TRANSPORT_KGS * 2);
  });

  it('China Internal Transport 600 CNY × 13 = 7,800 KGS counted once', () => {
    const triple = [chinaExpense('a'), chinaExpense('b'), chinaExpense('c')];
    const raw = sumConfirmedExpenseAmountKgs(triple, CHINA_RATE);
    const capped = sumSectionConfirmedExpenseAmountKgs(triple, CHINA_RATE, {
      sectionTotalAmount: CHINA_TRANSPORT_CNY,
      sectionCurrency: 'CNY',
    });
    assert.equal(raw, CHINA_TRANSPORT_KGS * 3);
    assert.equal(capped, CHINA_TRANSPORT_KGS);
  });

  it('triple-counted china transport inflates total by exactly 15,600 KGS', () => {
    const logisticsCorrect = buildLogistics(CHINA_TRANSPORT_KGS, batch.logisticsShare);
    const logisticsInflated = buildLogistics(CHINA_TRANSPORT_KGS * 3, batch.logisticsShare + OVERCOUNT_KGS);

    const itemInputs = batch.items.map((row) => ({
      quantity: row.quantity,
      purchasePriceYuan: row.purchasePriceYuan,
      yuanRate: row.yuanRate,
      weightKg: row.weightKg,
    }));
    const cargoOptions = { cargo: { usdRate: 89.5, cargoRateUsdPerKg: 0.9, cargoTotalWeightKg: 1200 } };

    const correct = calculateLandedCosts(itemInputs, logisticsCorrect, cargoOptions);
    const inflated = calculateLandedCosts(itemInputs, logisticsInflated, cargoOptions);

    assert.equal(round2(inflated.totalCostKgs - correct.totalCostKgs), OVERCOUNT_KGS);
    assert.equal(round2(inflated.totalCostKgs), round2(correct.totalCostKgs + OVERCOUNT_KGS));
  });

  it('first procurement batch repair removes exactly 15,600 KGS over-count', () => {
    const triple = [chinaExpense('a'), chinaExpense('b'), chinaExpense('c')];
    const repairedChinaKgs = sumSectionConfirmedExpenseAmountKgs(triple, CHINA_RATE, {
      sectionTotalAmount: CHINA_TRANSPORT_CNY,
      sectionCurrency: 'CNY',
    });
    const inflatedChinaKgs = sumConfirmedExpenseAmountKgs(triple, CHINA_RATE);

    const logisticsCorrect = buildLogistics(repairedChinaKgs, batch.logisticsShare);
    const logisticsInflated = buildLogistics(
      inflatedChinaKgs,
      batch.logisticsShare + (inflatedChinaKgs - repairedChinaKgs),
    );
    const itemInputs = batch.items.map((row) => ({
      quantity: row.quantity,
      purchasePriceYuan: row.purchasePriceYuan,
      yuanRate: row.yuanRate,
      weightKg: row.weightKg,
    }));

    const repaired = calculateLandedCosts(itemInputs, logisticsCorrect);
    const inflated = calculateLandedCosts(itemInputs, logisticsInflated);

    assert.equal(round2(inflated.totalCostKgs - repaired.totalCostKgs), OVERCOUNT_KGS);
    assert.equal(repairedChinaKgs, CHINA_TRANSPORT_KGS);
    assert.equal(round2(repaired.totalCostKgs + OVERCOUNT_KGS), round2(inflated.totalCostKgs));
  });

  it('allocation totals equal expense totals for china transport', () => {
    const logistics = buildLogistics(CHINA_TRANSPORT_KGS, batch.logisticsShare);
    const result = calculateLandedCosts(
      batch.items.map((row) => ({
        quantity: row.quantity,
        purchasePriceYuan: row.purchasePriceYuan,
        yuanRate: row.yuanRate,
        weightKg: row.weightKg,
      })),
      logistics,
    );
    const chinaAlloc = sumRoundedMoney(result.items.map((item) => item.chinaDomesticAllocKgs));
    assert.equal(chinaAlloc, CHINA_TRANSPORT_KGS);
  });

  it('supplier, cargo and kyrgyzstan sections are not multiplied by payment rows', () => {
    const cargoRows = [
      {
        id: 'cargo-1',
        expenseType: TransportExpenseType.INTERNATIONAL_FREIGHT,
        amount: 45000,
        currency: 'KGS',
        amountKgs: 45000,
        paidAmountKgs: 45000,
        status: TransportExpenseStatus.PAID,
      },
    ];
    const joined = [...cargoRows, ...cargoRows, ...cargoRows];
    assert.equal(
      sumSectionConfirmedExpenseAmountKgs(joined, CHINA_RATE, {
        sectionTotalAmount: 45000,
        sectionCurrency: 'KGS',
      }),
      45000,
    );
  });

  it('reconciliation difference is 0.00 KGS for authoritative batch', () => {
    const logistics = buildLogistics(CHINA_TRANSPORT_KGS, batch.logisticsShare);
    const result = calculateLandedCosts(
      batch.items.map((row) => ({
        quantity: row.quantity,
        purchasePriceYuan: row.purchasePriceYuan,
        yuanRate: row.yuanRate,
        weightKg: row.weightKg,
      })),
      logistics,
    );
    const chinaAlloc = sumRoundedMoney(result.items.map((item) => item.chinaDomesticAllocKgs));
    const reconciliation = buildProcurementLandedCostReconciliation({
      estimatedYuanRate: CHINA_RATE,
      supplier: {
        invoiceSentToAccountantAt: new Date(),
        supplierInvoiceNumber: 'INV-CHINA-1',
        invoiceReviewStatus: 'APPROVED',
        supplierPaymentStatus: 'PAID',
        totalYuan: batch.purchaseShare / CHINA_RATE,
        estimatedSupplierCostKgs: batch.purchaseShare,
      },
      transportExpenses: [chinaExpense('china-1')],
      sectionBudgets: {
        DOMESTIC_CHINA_TRANSPORT: { totalAmount: CHINA_TRANSPORT_CNY, currency: 'CNY' },
      },
      logisticsIncluded: logistics,
      allocationTotals: {
        CHINA_DOMESTIC_TRANSPORT: { amountKgs: chinaAlloc, count: result.items.length },
      },
      expectedTotalKgs: result.totalCostKgs,
      actualTotalKgs: result.totalCostKgs,
    });
    assert.equal(reconciliation.differenceKgs, 0);
    const china = reconciliation.components.find((row) => row.component === 'CHINA_DOMESTIC_TRANSPORT');
    assert.ok(china);
    assert.equal(china.differenceKgs, 0);
    assert.equal(china.includedInCostingKgs, CHINA_TRANSPORT_KGS);
  });

  it('recalculation is idempotent', () => {
    const triple = [chinaExpense('a'), chinaExpense('b'), chinaExpense('c')];
    const first = sumSectionConfirmedExpenseAmountKgs(triple, CHINA_RATE, {
      sectionTotalAmount: CHINA_TRANSPORT_CNY,
      sectionCurrency: 'CNY',
    });
    const second = sumSectionConfirmedExpenseAmountKgs(triple, CHINA_RATE, {
      sectionTotalAmount: CHINA_TRANSPORT_CNY,
      sectionCurrency: 'CNY',
    });
    assert.equal(first, second);
    assert.equal(first, CHINA_TRANSPORT_KGS);
  });

  it('other procurement batches with distinct partial cargo payments still sum correctly', () => {
    const partialCargo = [
      {
        id: 'cargo-p1',
        amount: 20000,
        currency: 'KGS',
        amountKgs: 20000,
        paidAmountKgs: 20000,
        status: TransportExpenseStatus.PAID,
      },
      {
        id: 'cargo-p2',
        amount: 25000,
        currency: 'KGS',
        amountKgs: 25000,
        paidAmountKgs: 25000,
        status: TransportExpenseStatus.PAID,
      },
    ];
    const total = sumSectionConfirmedExpenseAmountKgs(partialCargo, CHINA_RATE, {
      sectionTotalAmount: 45000,
      sectionCurrency: 'KGS',
    });
    assert.equal(total, 45000);
  });
});

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
