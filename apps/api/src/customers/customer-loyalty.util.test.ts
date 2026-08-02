import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CustomerLoyaltyCategory, LoyaltyPurchaseWindow } from '@prisma/client';
import {
  assertLoyaltyCategoryRanges,
  assertLoyaltyMarkupRange,
  assertLoyaltyThresholdOrder,
  calculateFinalSaleUnitPrice,
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

  it('uses configurable loyalty markups', () => {
    assert.equal(
      getLoyaltyMarkupPercent(CustomerLoyaltyCategory.STANDARD, DEFAULT_LOYALTY_MARKUPS),
      5,
    );
    assert.equal(
      getLoyaltyMarkupPercent(CustomerLoyaltyCategory.SILVER, DEFAULT_LOYALTY_MARKUPS),
      3,
    );
    assert.equal(
      getLoyaltyMarkupPercent(CustomerLoyaltyCategory.GOLD, DEFAULT_LOYALTY_MARKUPS),
      1.5,
    );
    assert.equal(
      getLoyaltyMarkupPercent(CustomerLoyaltyCategory.VIP, DEFAULT_LOYALTY_MARKUPS),
      0,
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

  it('enforces HQ markup limits', () => {
    assert.doesNotThrow(() =>
      assertLoyaltyMarkupRange(DEFAULT_LOYALTY_MARKUPS, {
        minAllowedMarkupPercent: 0,
        maxAllowedMarkupPercent: 20,
      }),
    );
    assert.throws(
      () =>
        assertLoyaltyMarkupRange(
          { ...DEFAULT_LOYALTY_MARKUPS, standardMarkupPercent: 25 },
          { minAllowedMarkupPercent: 0, maxAllowedMarkupPercent: 20 },
        ),
      /between 0% and 20%/,
    );
    assert.throws(
      () =>
        assertLoyaltyMarkupRange(
          { ...DEFAULT_LOYALTY_MARKUPS, silverMarkupPercent: -1 },
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
