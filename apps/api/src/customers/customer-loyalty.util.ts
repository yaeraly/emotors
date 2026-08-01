import { CustomerLoyaltyCategory, LoyaltyPurchaseWindow } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { roundDisplayMoney } from '../pricing/product-cost-precision.util';

export type LoyaltyThresholdConfig = {
  standardThresholdKgs: number;
  silverThresholdKgs: number;
  goldThresholdKgs: number;
  vipThresholdKgs: number;
};

export type LoyaltyDiscountConfig = {
  standardDiscountPercent: number;
  silverDiscountPercent: number;
  goldDiscountPercent: number;
  vipDiscountPercent: number;
};

export type LoyaltyProgramConfig = LoyaltyThresholdConfig &
  LoyaltyDiscountConfig & {
    purchaseWindow: LoyaltyPurchaseWindow;
    allowDowngrade: boolean;
  };

const CATEGORY_RANK: Record<CustomerLoyaltyCategory, number> = {
  [CustomerLoyaltyCategory.STANDARD]: 0,
  [CustomerLoyaltyCategory.SILVER]: 1,
  [CustomerLoyaltyCategory.GOLD]: 2,
  [CustomerLoyaltyCategory.VIP]: 3,
};

export function loyaltyCategoryRank(category: CustomerLoyaltyCategory): number {
  return CATEGORY_RANK[category] ?? 0;
}

export function getLoyaltyDiscountPercent(
  category: CustomerLoyaltyCategory,
  config: LoyaltyDiscountConfig,
): number {
  switch (category) {
    case CustomerLoyaltyCategory.SILVER:
      return Number(config.silverDiscountPercent ?? 0);
    case CustomerLoyaltyCategory.GOLD:
      return Number(config.goldDiscountPercent ?? 0);
    case CustomerLoyaltyCategory.VIP:
      return Number(config.vipDiscountPercent ?? 0);
    case CustomerLoyaltyCategory.STANDARD:
    default:
      return Number(config.standardDiscountPercent ?? 0);
  }
}

export function resolveLoyaltyCategoryFromVolume(
  purchaseVolumeKgs: number,
  config: LoyaltyThresholdConfig,
): CustomerLoyaltyCategory {
  const volume = roundDisplayMoney(purchaseVolumeKgs);
  const vip = Number(config.vipThresholdKgs ?? 0);
  const gold = Number(config.goldThresholdKgs ?? 0);
  const silver = Number(config.silverThresholdKgs ?? 0);

  if (vip > 0 && volume >= vip) return CustomerLoyaltyCategory.VIP;
  if (gold > 0 && volume >= gold) return CustomerLoyaltyCategory.GOLD;
  if (silver > 0 && volume >= silver) return CustomerLoyaltyCategory.SILVER;
  return CustomerLoyaltyCategory.STANDARD;
}

/**
 * Upgrade always when volume reaches a higher tier.
 * Downgrade only when allowDowngrade is enabled by HQ policy.
 */
export function resolveNextLoyaltyCategory(input: {
  currentCategory: CustomerLoyaltyCategory;
  purchaseVolumeKgs: number;
  config: LoyaltyThresholdConfig & { allowDowngrade: boolean };
}): CustomerLoyaltyCategory {
  const target = resolveLoyaltyCategoryFromVolume(input.purchaseVolumeKgs, input.config);
  if (loyaltyCategoryRank(target) >= loyaltyCategoryRank(input.currentCategory)) {
    return target;
  }
  return input.config.allowDowngrade ? target : input.currentCategory;
}

export function rollingWindowStartDate(
  window: LoyaltyPurchaseWindow,
  asOf: Date = new Date(),
): Date | null {
  if (window === LoyaltyPurchaseWindow.TOTAL) return null;
  const days = window === LoyaltyPurchaseWindow.ROLLING_90_DAYS ? 90 : 180;
  return new Date(asOf.getTime() - days * 24 * 60 * 60 * 1000);
}

/**
 * Final sale unit price:
 * base (customer-type price) − loyalty discount %, never below minimum allowed.
 */
export function calculateFinalSaleUnitPrice(input: {
  basePriceKgs: number;
  loyaltyDiscountPercent: number;
  minimumPriceKgs: number;
}): {
  basePriceKgs: number;
  discountPercent: number;
  discountAmountKgs: number;
  provisionalPriceKgs: number;
  finalPriceKgs: number;
  minimumPriceApplied: boolean;
} {
  const base = new Prisma.Decimal(input.basePriceKgs || 0);
  const discountPercent = new Prisma.Decimal(Math.max(0, Number(input.loyaltyDiscountPercent || 0)));
  const minimum = new Prisma.Decimal(Math.max(0, Number(input.minimumPriceKgs || 0)));

  const discountAmount = base.mul(discountPercent).div(100);
  const provisional = base.minus(discountAmount);
  const provisionalRounded = new Prisma.Decimal(roundDisplayMoney(provisional));
  const minimumRounded = new Prisma.Decimal(roundDisplayMoney(minimum));
  const minimumApplied = minimumRounded.gt(0) && provisionalRounded.lt(minimumRounded);
  const finalPrice = minimumApplied ? minimumRounded : provisionalRounded;

  return {
    basePriceKgs: roundDisplayMoney(base),
    discountPercent: roundDisplayMoney(discountPercent),
    discountAmountKgs: roundDisplayMoney(discountAmount),
    provisionalPriceKgs: roundDisplayMoney(provisionalRounded),
    finalPriceKgs: roundDisplayMoney(finalPrice),
    minimumPriceApplied: minimumApplied,
  };
}

export function assertLoyaltyThresholdOrder(config: LoyaltyThresholdConfig) {
  const standard = Number(config.standardThresholdKgs ?? 0);
  const silver = Number(config.silverThresholdKgs ?? 0);
  const gold = Number(config.goldThresholdKgs ?? 0);
  const vip = Number(config.vipThresholdKgs ?? 0);

  if (standard < 0 || silver < 0 || gold < 0 || vip < 0) {
    throw new Error('Loyalty thresholds cannot be negative');
  }
  if (silver > 0 && silver < standard) {
    throw new Error('Silver threshold must be greater than or equal to Standard');
  }
  if (gold > 0 && silver > 0 && gold < silver) {
    throw new Error('Gold threshold must be greater than or equal to Silver');
  }
  if (vip > 0 && gold > 0 && vip < gold) {
    throw new Error('VIP threshold must be greater than or equal to Gold');
  }
}

export function assertLoyaltyDiscountRange(config: LoyaltyDiscountConfig) {
  for (const [label, value] of [
    ['Standard', config.standardDiscountPercent],
    ['Silver', config.silverDiscountPercent],
    ['Gold', config.goldDiscountPercent],
    ['VIP', config.vipDiscountPercent],
  ] as const) {
    const numeric = Number(value ?? 0);
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) {
      throw new Error(`${label} loyalty discount must be between 0 and 100`);
    }
  }
}
