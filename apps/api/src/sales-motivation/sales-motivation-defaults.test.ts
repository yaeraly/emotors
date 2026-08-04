import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildSmartRecommendations,
  EMOTORS_DEFAULT_MOTIVATION,
  estimateMonthlyBonusImpact,
} from './sales-motivation-defaults';

describe('sales motivation defaults and recommendations', () => {
  it('uses EMOTORS defaults when statistics are insufficient', () => {
    const result = buildSmartRecommendations({
      monthsAnalyzed: 3,
      completedSalesCount: 2,
      monthlySalesAverage: 0,
      averageReceipt: 0,
      installmentSharePercent: 0,
      repeatCustomerRatePercent: 0,
      sufficient: false,
    });
    assert.equal(result.source, 'EMOTORS_DEFAULT');
    assert.equal(result.values.fullPaymentCommissionPercent, 0.8);
    assert.equal(result.values.installmentApprovalCommissionPercent, 0.3);
    assert.equal(result.values.installmentRepaymentCommissionPercent, 0.5);
    assert.equal(result.values.planLevels.length, 5);
    assert.equal(result.values.averageReceiptLevels.length, 3);
    assert.equal(result.values.averageReceiptMinCount, 30);
    assert.equal(result.values.returningCustomerDays, 30);
  });

  it('builds branch-statistics recommendations when data is sufficient', () => {
    const result = buildSmartRecommendations({
      monthsAnalyzed: 3,
      completedSalesCount: 120,
      monthlySalesAverage: 1_500_000,
      averageReceipt: 14_000,
      installmentSharePercent: 40,
      repeatCustomerRatePercent: 18,
      sufficient: true,
    });
    assert.equal(result.source, 'BRANCH_STATISTICS');
    assert.ok(result.values.planLevels.length > 0);
    assert.ok(result.values.averageReceiptLevels[0].averageReceiptThreshold > 0);
  });

  it('estimates monthly bonus impact from values and sales volume', () => {
    const impact = estimateMonthlyBonusImpact({
      monthlySalesAverage: 1_000_000,
      fullPaymentShare: 70,
      installmentShare: 30,
      values: EMOTORS_DEFAULT_MOTIVATION,
    });
    assert.ok(impact.estimatedMonthlyBonusExpenseKgs > 0);
    assert.ok(impact.breakdown.fullPaymentCommission > 0);
    assert.ok(impact.breakdown.installmentCommission > 0);
  });

  it('keeps default plan and average-receipt levels configurable', () => {
    assert.deepEqual(EMOTORS_DEFAULT_MOTIVATION.planLevels[0], {
      salesThreshold: 500_000,
      bonusAmount: 5_000,
    });
    assert.deepEqual(EMOTORS_DEFAULT_MOTIVATION.averageReceiptLevels[0], {
      averageReceiptThreshold: 12_000,
      bonusAmount: 2_000,
    });
  });
});
