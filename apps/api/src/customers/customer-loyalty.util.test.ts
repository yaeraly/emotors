import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CustomerLoyaltyCategory, CustomerType, LoyaltyPurchaseWindow } from '@prisma/client';
import {
  assertLoyaltyCategoryRanges,
  assertLoyaltyMarkupRange,
  assertLoyaltyThresholdOrder,
  calculateFinalSaleUnitPrice,
  DEFAULT_CUSTOMER_TYPE_LOYALTY_MARKUPS,
  DEFAULT_LOYALTY_CATEGORY_RANGES,
  DEFAULT_LOYALTY_MARKUPS,
  getLoyaltyMarkupPercent,
  resolveLoyaltyCategoryFromVolume,
  resolveNextLoyaltyCategory,
  rollingWindowStartDate,
} from './customer-loyalty.util';

describe('customer loyalty utilities', () => {
  const thresholds = {
    standardThresholdKgs: 0,
    silverThresholdKgs: 50_000,
    goldThresholdKgs: 150_000,
    vipThresholdKgs: 300_000,
  };

  it('defaults unresolved volume to STANDARD', () => {
    assert.equal(
      resolveLoyaltyCategoryFromVolume(0, thresholds),
      CustomerLoyaltyCategory.STANDARD,
    );
  });

  it('resolves configurable loyalty thresholds', () => {
    assert.equal(
      resolveLoyaltyCategoryFromVolume(50_000, thresholds),
      CustomerLoyaltyCategory.SILVER,
    );
    assert.equal(
      resolveLoyaltyCategoryFromVolume(150_000, thresholds),
      CustomerLoyaltyCategory.GOLD,
    );
    assert.equal(
      resolveLoyaltyCategoryFromVolume(300_000, thresholds),
      CustomerLoyaltyCategory.VIP,
    );
  });

  it('uses configurable loyalty markups per customer type', () => {
    assert.equal(
      getLoyaltyMarkupPercent(
        CustomerLoyaltyCategory.STANDARD,
        DEFAULT_CUSTOMER_TYPE_LOYALTY_MARKUPS,
        CustomerType.RETAIL,
      ),
      5,
    );
    assert.equal(
      getLoyaltyMarkupPercent(
        CustomerLoyaltyCategory.SILVER,
        DEFAULT_CUSTOMER_TYPE_LOYALTY_MARKUPS,
        CustomerType.RETAIL,
      ),
      3,
    );
    assert.equal(
      getLoyaltyMarkupPercent(
        CustomerLoyaltyCategory.GOLD,
        DEFAULT_CUSTOMER_TYPE_LOYALTY_MARKUPS,
        CustomerType.RETAIL,
      ),
      1.5,
    );
    assert.equal(
      getLoyaltyMarkupPercent(
        CustomerLoyaltyCategory.VIP,
        DEFAULT_CUSTOMER_TYPE_LOYALTY_MARKUPS,
        CustomerType.RETAIL,
      ),
      0,
    );

    assert.equal(
      getLoyaltyMarkupPercent(
        CustomerLoyaltyCategory.STANDARD,
        DEFAULT_CUSTOMER_TYPE_LOYALTY_MARKUPS,
        CustomerType.MASTER,
      ),
      6,
    );
    assert.equal(
      getLoyaltyMarkupPercent(
        CustomerLoyaltyCategory.SILVER,
        DEFAULT_CUSTOMER_TYPE_LOYALTY_MARKUPS,
        CustomerType.MASTER,
      ),
      4,
    );
    assert.equal(
      getLoyaltyMarkupPercent(
        CustomerLoyaltyCategory.GOLD,
        DEFAULT_CUSTOMER_TYPE_LOYALTY_MARKUPS,
        CustomerType.MASTER,
      ),
      2,
    );
    assert.equal(
      getLoyaltyMarkupPercent(
        CustomerLoyaltyCategory.VIP,
        DEFAULT_CUSTOMER_TYPE_LOYALTY_MARKUPS,
        CustomerType.MASTER,
      ),
      1,
    );

    assert.equal(
      getLoyaltyMarkupPercent(
        CustomerLoyaltyCategory.STANDARD,
        DEFAULT_CUSTOMER_TYPE_LOYALTY_MARKUPS,
        CustomerType.WHOLESALE,
      ),
      5,
    );
    assert.equal(
      getLoyaltyMarkupPercent(
        CustomerLoyaltyCategory.SILVER,
        DEFAULT_CUSTOMER_TYPE_LOYALTY_MARKUPS,
        CustomerType.WHOLESALE,
      ),
      3,
    );
    assert.equal(
      getLoyaltyMarkupPercent(
        CustomerLoyaltyCategory.GOLD,
        DEFAULT_CUSTOMER_TYPE_LOYALTY_MARKUPS,
        CustomerType.WHOLESALE,
      ),
      1.5,
    );
    assert.equal(
      getLoyaltyMarkupPercent(
        CustomerLoyaltyCategory.VIP,
        DEFAULT_CUSTOMER_TYPE_LOYALTY_MARKUPS,
        CustomerType.WHOLESALE,
      ),
      0,
    );
  });

  it('keeps legacy single-set markup resolution for backward compatibility', () => {
    assert.equal(
      getLoyaltyMarkupPercent(CustomerLoyaltyCategory.SILVER, DEFAULT_LOYALTY_MARKUPS),
      3,
    );
  });

  it('throws clear error when matrix rule is missing', () => {
    const incomplete = {
      ...DEFAULT_CUSTOMER_TYPE_LOYALTY_MARKUPS,
      masterGoldMarkupPercent: undefined as unknown as number,
    };
    assert.throws(
      () =>
        getLoyaltyMarkupPercent(
          CustomerLoyaltyCategory.GOLD,
          incomplete,
          CustomerType.MASTER,
        ),
      /Мастер.*Gold.*не настроена наценка/,
    );
  });

  it('upgrades automatically and respects downgrade policy', () => {
    assert.equal(
      resolveNextLoyaltyCategory({
        currentCategory: CustomerLoyaltyCategory.STANDARD,
        purchaseVolumeKgs: 50_000,
        config: { ...thresholds, allowDowngrade: false },
      }),
      CustomerLoyaltyCategory.SILVER,
    );

    assert.equal(
      resolveNextLoyaltyCategory({
        currentCategory: CustomerLoyaltyCategory.GOLD,
        purchaseVolumeKgs: 10_000,
        config: { ...thresholds, allowDowngrade: false },
      }),
      CustomerLoyaltyCategory.GOLD,
    );

    assert.equal(
      resolveNextLoyaltyCategory({
        currentCategory: CustomerLoyaltyCategory.GOLD,
        purchaseVolumeKgs: 10_000,
        config: { ...thresholds, allowDowngrade: true },
      }),
      CustomerLoyaltyCategory.STANDARD,
    );
  });

  it('calculates final selling price with additional branch markup', () => {
    const priced = calculateFinalSaleUnitPrice({
      basePriceKgs: 1000,
      loyaltyMarkupPercent: 3,
      minimumPriceKgs: 900,
    });
    assert.equal(priced.finalPriceKgs, 1030);
    assert.equal(priced.markupAmountKgs, 30);
    assert.equal(priced.minimumPriceApplied, false);
  });

  it('calculates master gold final price from type-specific markup', () => {
    const markup = getLoyaltyMarkupPercent(
      CustomerLoyaltyCategory.GOLD,
      DEFAULT_CUSTOMER_TYPE_LOYALTY_MARKUPS,
      CustomerType.MASTER,
    );
    const priced = calculateFinalSaleUnitPrice({
      basePriceKgs: 1100,
      loyaltyMarkupPercent: markup,
      minimumPriceKgs: 0,
    });
    assert.equal(markup, 2);
    assert.equal(priced.finalPriceKgs, 1122);
  });

  it('calculates wholesale vip final price with zero markup', () => {
    const markup = getLoyaltyMarkupPercent(
      CustomerLoyaltyCategory.VIP,
      DEFAULT_CUSTOMER_TYPE_LOYALTY_MARKUPS,
      CustomerType.WHOLESALE,
    );
    const priced = calculateFinalSaleUnitPrice({
      basePriceKgs: 1000,
      loyaltyMarkupPercent: markup,
      minimumPriceKgs: 0,
    });
    assert.equal(markup, 0);
    assert.equal(priced.finalPriceKgs, 1000);
  });

  it('never sells below minimum allowed price', () => {
    const protectedPrice = calculateFinalSaleUnitPrice({
      basePriceKgs: 1000,
      loyaltyMarkupPercent: 0,
      minimumPriceKgs: 1100,
    });
    assert.equal(protectedPrice.finalPriceKgs, 1100);
    assert.equal(protectedPrice.minimumPriceApplied, true);
  });

  it('keeps decimal precision for fractional markup math', () => {
    const priced = calculateFinalSaleUnitPrice({
      basePriceKgs: 99.99,
      loyaltyMarkupPercent: 1.5,
      minimumPriceKgs: 0,
    });
    assert.equal(priced.finalPriceKgs, 101.49);
  });

  it('validates non-overlapping category ranges', () => {
    assert.doesNotThrow(() => assertLoyaltyCategoryRanges(DEFAULT_LOYALTY_CATEGORY_RANGES));
    assert.throws(
      () =>
        assertLoyaltyCategoryRanges({
          ...DEFAULT_LOYALTY_CATEGORY_RANGES,
          silverMinKgs: 40_000,
        }),
      /must not overlap/,
    );
  });

  it('enforces HQ markup limits for the full customer-type matrix', () => {
    assert.doesNotThrow(() =>
      assertLoyaltyMarkupRange(DEFAULT_CUSTOMER_TYPE_LOYALTY_MARKUPS, {
        minAllowedMarkupPercent: 0,
        maxAllowedMarkupPercent: 20,
      }),
    );
    assert.throws(
      () =>
        assertLoyaltyMarkupRange(
          { ...DEFAULT_CUSTOMER_TYPE_LOYALTY_MARKUPS, retailStandardMarkupPercent: 25 },
          { minAllowedMarkupPercent: 0, maxAllowedMarkupPercent: 20 },
        ),
      /between 0% and 20%/,
    );
    assert.throws(
      () =>
        assertLoyaltyMarkupRange(
          { ...DEFAULT_CUSTOMER_TYPE_LOYALTY_MARKUPS, masterSilverMarkupPercent: -1 },
          { minAllowedMarkupPercent: 0, maxAllowedMarkupPercent: 20 },
        ),
      /cannot be negative/,
    );
  });

  it('validates configurable threshold order', () => {
    assert.doesNotThrow(() => assertLoyaltyThresholdOrder(thresholds));
    assert.throws(() =>
      assertLoyaltyThresholdOrder({
        ...thresholds,
        goldThresholdKgs: 10,
      }),
    );
  });

  it('defaults purchase window to rolling 90 days', () => {
    const asOf = new Date('2026-08-01T00:00:00.000Z');
    const start90 = rollingWindowStartDate(LoyaltyPurchaseWindow.ROLLING_90_DAYS, asOf);
    assert.ok(start90);
    assert.equal(
      Math.round((asOf.getTime() - start90!.getTime()) / (24 * 60 * 60 * 1000)),
      90,
    );
  });
});
