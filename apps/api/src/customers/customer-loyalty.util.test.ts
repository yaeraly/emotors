import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CustomerLoyaltyCategory, LoyaltyPurchaseWindow } from '@prisma/client';
import {
  assertLoyaltyDiscountRange,
  assertLoyaltyThresholdOrder,
  calculateFinalSaleUnitPrice,
  getLoyaltyDiscountPercent,
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

  const discounts = {
    standardDiscountPercent: 0,
    silverDiscountPercent: 2,
    goldDiscountPercent: 4,
    vipDiscountPercent: 6,
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

  it('uses configurable loyalty discounts', () => {
    assert.equal(
      getLoyaltyDiscountPercent(CustomerLoyaltyCategory.STANDARD, discounts),
      0,
    );
    assert.equal(getLoyaltyDiscountPercent(CustomerLoyaltyCategory.SILVER, discounts), 2);
    assert.equal(getLoyaltyDiscountPercent(CustomerLoyaltyCategory.GOLD, discounts), 4);
    assert.equal(getLoyaltyDiscountPercent(CustomerLoyaltyCategory.VIP, discounts), 6);
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

  it('calculates final price with Decimal precision and min protection', () => {
    const priced = calculateFinalSaleUnitPrice({
      basePriceKgs: 1100,
      loyaltyDiscountPercent: 4,
      minimumPriceKgs: 1000,
    });
    assert.equal(priced.finalPriceKgs, 1056);
    assert.equal(priced.minimumPriceApplied, false);

    const protectedPrice = calculateFinalSaleUnitPrice({
      basePriceKgs: 1100,
      loyaltyDiscountPercent: 20,
      minimumPriceKgs: 1000,
    });
    assert.equal(protectedPrice.finalPriceKgs, 1000);
    assert.equal(protectedPrice.minimumPriceApplied, true);
  });

  it('keeps decimal precision for fractional loyalty math', () => {
    const priced = calculateFinalSaleUnitPrice({
      basePriceKgs: 99.99,
      loyaltyDiscountPercent: 2.5,
      minimumPriceKgs: 0,
    });
    assert.equal(priced.finalPriceKgs, 97.49);
  });

  it('validates configurable threshold and discount ranges', () => {
    assert.doesNotThrow(() => assertLoyaltyThresholdOrder(thresholds));
    assert.throws(() =>
      assertLoyaltyThresholdOrder({
        ...thresholds,
        goldThresholdKgs: 10,
      }),
    );
    assert.doesNotThrow(() => assertLoyaltyDiscountRange(discounts));
    assert.throws(() =>
      assertLoyaltyDiscountRange({
        ...discounts,
        vipDiscountPercent: 120,
      }),
    );
  });

  it('supports rolling purchase windows', () => {
    assert.equal(rollingWindowStartDate(LoyaltyPurchaseWindow.TOTAL), null);
    const asOf = new Date('2026-08-01T00:00:00.000Z');
    const start90 = rollingWindowStartDate(LoyaltyPurchaseWindow.ROLLING_90_DAYS, asOf);
    assert.ok(start90);
    assert.equal(
      Math.round((asOf.getTime() - start90!.getTime()) / (24 * 60 * 60 * 1000)),
      90,
    );
  });
});
