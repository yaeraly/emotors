import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { distributeRoundedAmounts } from './landed-cost-allocation.util';
import { sumRoundedMoney } from './landed-cost-money.util';
import { calculateLandedCosts } from './landed-cost.util';
import { isMoneyEqual, sumMoney, toStoredMoneyKgs } from '../common/money/money';

const ESTIMATED_FULL_LANDED_COST = 914369.8;

function buildRepresentativeBatchItems(count = 62, quantity = 11) {
  const rawShares = Array.from({ length: count }, (_, index) => 14756.12 + (index % 17) * 0.31);
  const lineTotals = distributeRoundedAmounts(rawShares, ESTIMATED_FULL_LANDED_COST);
  const purchaseShare = sumRoundedMoney(lineTotals.map((total) => total * 0.62));
  const logisticsShare = sumRoundedMoney([ESTIMATED_FULL_LANDED_COST - purchaseShare]);

  return lineTotals.map((lineTotal, index) => {
    const purchaseRatio = lineTotal / ESTIMATED_FULL_LANDED_COST;
    const basePurchase = sumRoundedMoney([purchaseShare * purchaseRatio]);
    const purchasePriceYuan = basePurchase / quantity / 12;
    return {
      quantity,
      purchasePriceYuan,
      yuanRate: 12,
      weightKg: 1.2 + (index % 5) * 0.1,
      expectedLineTotal: lineTotal,
      basePurchase,
      logisticsShare: sumRoundedMoney([lineTotal - basePurchase]),
    };
  });
}

describe('landed cost order total parity', () => {
  it('estimated full landed cost equals sum of product line totals', () => {
    const specs = buildRepresentativeBatchItems();
    const totalPurchase = sumRoundedMoney(specs.map((row) => row.basePurchase));
    const totalLogistics = sumRoundedMoney(specs.map((row) => row.logisticsShare));

    const result = calculateLandedCosts(
      specs.map((row) => ({
        quantity: row.quantity,
        purchasePriceYuan: row.purchasePriceYuan,
        yuanRate: 12,
        weightKg: row.weightKg,
      })),
      {
        chinaDomesticTransportKgs: totalLogistics * 0.15,
        chinaExportTransportKgs: totalLogistics * 0.55,
        localTransportKgs: totalLogistics * 0.1,
        packagingCostKgs: totalLogistics * 0.05,
        customsCostKgs: totalLogistics * 0.08,
        insuranceCostKgs: totalLogistics * 0.04,
        bankFeeCostKgs: totalLogistics * 0.02,
        otherExpenseKgs: totalLogistics * 0.01,
      },
      {
        cargo: { usdRate: 89.5, cargoRateUsdPerKg: 0.9, cargoTotalWeightKg: 1200 },
        allocationMethods: {
          packagingCostKgs: 'BY_QUANTITY',
          customsCostKgs: 'BY_PURCHASE_VALUE',
          insuranceCostKgs: 'BY_PURCHASE_VALUE',
          bankFeeCostKgs: 'BY_PURCHASE_VALUE',
        },
      },
    );

    const productCostSum = sumMoney(result.items.map((item) => item.totalCostKgs));
    const estimatedFullCost = result.totalCostKgs;

    assert.ok(isMoneyEqual(estimatedFullCost, productCostSum));
    assert.equal(toStoredMoneyKgs(estimatedFullCost), ESTIMATED_FULL_LANDED_COST);
  });

  it('documents 914369.80 batch: remainder reconciles product table to header', () => {
    const specs = buildRepresentativeBatchItems();
    const logistics = sumRoundedMoney(specs.map((row) => row.logisticsShare));
    const result = calculateLandedCosts(
      specs.map((row) => ({
        quantity: row.quantity,
        purchasePriceYuan: row.purchasePriceYuan,
        yuanRate: 12,
        weightKg: row.weightKg,
      })),
      {
        chinaDomesticTransportKgs: logistics * 0.2,
        chinaExportTransportKgs: logistics * 0.5,
        localTransportKgs: logistics * 0.1,
        packagingCostKgs: logistics * 0.05,
        customsCostKgs: logistics * 0.08,
        insuranceCostKgs: logistics * 0.04,
        bankFeeCostKgs: logistics * 0.02,
        otherExpenseKgs: logistics * 0.01,
      },
      { cargo: { usdRate: 89.5, cargoRateUsdPerKg: 0.9, cargoTotalWeightKg: 1200 } },
    );

    const beforeReconcilePattern = sumRoundedMoney(
      result.items.map((item) =>
        Math.round((toStoredMoneyKgs(item.finalCostKgs) * item.effectiveQuantity + Number.EPSILON) * 100) / 100,
      ),
    );
    assert.notEqual(beforeReconcilePattern, toStoredMoneyKgs(result.totalCostKgs));
    assert.ok(isMoneyEqual(result.totalCostKgs, sumMoney(result.items.map((item) => item.totalCostKgs))));
  });
});
