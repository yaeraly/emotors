import { CustomerLoyaltyCategory, LoyaltyPurchaseWindow } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { roundDisplayMoney } from '../pricing/product-cost-precision.util';

export type LoyaltyThresholdConfig = {
  standardThresholdKgs: number;
  silverThresholdKgs: number;
  goldThresholdKgs: number;
  vipThresholdKgs: number;
};

export type LoyaltyCategoryRangeConfig = {
  standardMinKgs: number;
  standardMaxKgs: number;
  silverMinKgs: number;
  silverMaxKgs: number;
  goldMinKgs: number;
  goldMaxKgs: number;
  vipMinKgs: number;
  vipMaxKgs: number | null;
};

export type LoyaltyMarkupConfig = {
  standardMarkupPercent: number;
  silverMarkupPercent: number;
  goldMarkupPercent: number;
  vipMarkupPercent: number;
};

/** @deprecated Use LoyaltyMarkupConfig */
export type LoyaltyDiscountConfig = {
  standardDiscountPercent: number;
  silverDiscountPercent: number;
  goldDiscountPercent: number;
  vipDiscountPercent: number;
};

export type LoyaltyProgramConfig = LoyaltyThresholdConfig &
  LoyaltyMarkupConfig &
  LoyaltyDiscountConfig & {
    standardMaxKgs: number;
    silverMaxKgs: number;
    goldMaxKgs: number;
    vipMaxKgs: number | null;
    minAllowedMarkupPercent: number;
    maxAllowedMarkupPercent: number;
    branchCustomizationEnabled: boolean;
    purchaseWindow: LoyaltyPurchaseWindow;
    allowDowngrade: boolean;
  };

export const DEFAULT_LOYALTY_CATEGORY_RANGES: LoyaltyCategoryRangeConfig = {
  standardMinKgs: 0,
  standardMaxKgs: 49_999,
  silverMinKgs: 50_000,
  silverMaxKgs: 149_999,
  goldMinKgs: 150_000,
  goldMaxKgs: 299_999,
  vipMinKgs: 300_000,
  vipMaxKgs: null,
};

export const DEFAULT_LOYALTY_MARKUPS: LoyaltyMarkupConfig = {
  standardMarkupPercent: 5,
  silverMarkupPercent: 3,
  goldMarkupPercent: 1.5,
  vipMarkupPercent: 0,
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

export function getLoyaltyMarkupPercent(
  category: CustomerLoyaltyCategory,
  config: LoyaltyMarkupConfig,
): number {
  switch (category) {
    case CustomerLoyaltyCategory.SILVER:
      return Number(config.silverMarkupPercent ?? 0);
    case CustomerLoyaltyCategory.GOLD:
      return Number(config.goldMarkupPercent ?? 0);
    case CustomerLoyaltyCategory.VIP:
      return Number(config.vipMarkupPercent ?? 0);
    case CustomerLoyaltyCategory.STANDARD:
    default:
      return Number(config.standardMarkupPercent ?? 0);
  }
}

/** @deprecated Prefer getLoyaltyMarkupPercent — discounts are no longer applied to selling price. */
export function getLoyaltyDiscountPercent(
  category: CustomerLoyaltyCategory,
  config: LoyaltyDiscountConfig | LoyaltyMarkupConfig,
): number {
  if ('standardMarkupPercent' in config) {
    return getLoyaltyMarkupPercent(category, config as LoyaltyMarkupConfig);
  }
  switch (category) {
    case CustomerLoyaltyCategory.SILVER:
      return Number((config as LoyaltyDiscountConfig).silverDiscountPercent ?? 0);
    case CustomerLoyaltyCategory.GOLD:
      return Number((config as LoyaltyDiscountConfig).goldDiscountPercent ?? 0);
    case CustomerLoyaltyCategory.VIP:
      return Number((config as LoyaltyDiscountConfig).vipDiscountPercent ?? 0);
    case CustomerLoyaltyCategory.STANDARD:
    default:
      return Number((config as LoyaltyDiscountConfig).standardDiscountPercent ?? 0);
  }
}

export function resolveLoyaltyCategoryFromVolume(
  purchaseVolumeKgs: number,
  config: LoyaltyThresholdConfig | LoyaltyCategoryRangeConfig,
): CustomerLoyaltyCategory {
  const volume = roundDisplayMoney(purchaseVolumeKgs);

  if ('vipMinKgs' in config) {
    const ranges = config as LoyaltyCategoryRangeConfig;
    if (volume >= Number(ranges.vipMinKgs)) return CustomerLoyaltyCategory.VIP;
    if (volume >= Number(ranges.goldMinKgs)) return CustomerLoyaltyCategory.GOLD;
    if (volume >= Number(ranges.silverMinKgs)) return CustomerLoyaltyCategory.SILVER;
    return CustomerLoyaltyCategory.STANDARD;
  }

  const thresholds = config as LoyaltyThresholdConfig;
  const vip = Number(thresholds.vipThresholdKgs ?? 0);
  const gold = Number(thresholds.goldThresholdKgs ?? 0);
  const silver = Number(thresholds.silverThresholdKgs ?? 0);

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
  config: (LoyaltyThresholdConfig | LoyaltyCategoryRangeConfig) & { allowDowngrade: boolean };
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
 * Final sale unit price (selling price only):
 * Base (customer-type HQ price) + Additional Branch Markup %,
 * never below minimum allowed selling price.
 * Never modifies себестоимость / FIFO / inventory valuation.
 */
export function calculateFinalSaleUnitPrice(input: {
  basePriceKgs: number;
  loyaltyMarkupPercent?: number;
  /** @deprecated Use loyaltyMarkupPercent */
  loyaltyDiscountPercent?: number;
  minimumPriceKgs: number;
}): {
  basePriceKgs: number;
  markupPercent: number;
  markupAmountKgs: number;
  discountPercent: number;
  discountAmountKgs: number;
  provisionalPriceKgs: number;
  finalPriceKgs: number;
  minimumPriceApplied: boolean;
} {
  const base = new Prisma.Decimal(input.basePriceKgs || 0);
  const markupPercent = new Prisma.Decimal(
    Math.max(0, Number(input.loyaltyMarkupPercent ?? input.loyaltyDiscountPercent ?? 0)),
  );
  const minimum = new Prisma.Decimal(Math.max(0, Number(input.minimumPriceKgs || 0)));

  const markupAmount = base.mul(markupPercent).div(100);
  const provisional = base.plus(markupAmount);
  const provisionalRounded = new Prisma.Decimal(roundDisplayMoney(provisional));
  const minimumRounded = new Prisma.Decimal(roundDisplayMoney(minimum));
  const minimumApplied = minimumRounded.gt(0) && provisionalRounded.lt(minimumRounded);
  const finalPrice = minimumApplied ? minimumRounded : provisionalRounded;

  return {
    basePriceKgs: roundDisplayMoney(base),
    markupPercent: roundDisplayMoney(markupPercent),
    markupAmountKgs: roundDisplayMoney(markupAmount),
    discountPercent: 0,
    discountAmountKgs: 0,
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

export function assertLoyaltyCategoryRanges(config: LoyaltyCategoryRangeConfig) {
  const ranges: Array<{ label: string; min: number; max: number | null }> = [
    {
      label: 'Standard',
      min: Number(config.standardMinKgs),
      max: Number(config.standardMaxKgs),
    },
    {
      label: 'Silver',
      min: Number(config.silverMinKgs),
      max: Number(config.silverMaxKgs),
    },
    {
      label: 'Gold',
      min: Number(config.goldMinKgs),
      max: Number(config.goldMaxKgs),
    },
    {
      label: 'VIP',
      min: Number(config.vipMinKgs),
      max: config.vipMaxKgs == null ? null : Number(config.vipMaxKgs),
    },
  ];

  for (const range of ranges) {
    if (!Number.isFinite(range.min) || range.min < 0) {
      throw new Error(`${range.label} minimum purchase amount is invalid`);
    }
    if (range.max != null && (!Number.isFinite(range.max) || range.max < range.min)) {
      throw new Error(`${range.label} maximum must be greater than or equal to minimum`);
    }
  }

  for (let i = 0; i < ranges.length - 1; i += 1) {
    const current = ranges[i];
    const next = ranges[i + 1];
    if (current.max == null) {
      throw new Error(`${current.label} must have a maximum purchase amount`);
    }
    if (next.min <= current.max) {
      throw new Error('Customer categories must not overlap');
    }
  }
}

export function assertLoyaltyMarkupRange(
  config: LoyaltyMarkupConfig,
  limits?: { minAllowedMarkupPercent?: number; maxAllowedMarkupPercent?: number },
) {
  const minAllowed = Number(limits?.minAllowedMarkupPercent ?? 0);
  const maxAllowed = Number(limits?.maxAllowedMarkupPercent ?? 100);

  if (minAllowed < 0 || maxAllowed < minAllowed || maxAllowed > 100) {
    throw new Error('HQ markup limits are invalid');
  }

  for (const [label, value] of [
    ['Standard', config.standardMarkupPercent],
    ['Silver', config.silverMarkupPercent],
    ['Gold', config.goldMarkupPercent],
    ['VIP', config.vipMarkupPercent],
  ] as const) {
    const numeric = Number(value ?? 0);
    if (!Number.isFinite(numeric) || numeric < 0) {
      throw new Error(`${label} additional markup cannot be negative`);
    }
    if (numeric < minAllowed || numeric > maxAllowed) {
      throw new Error(
        `${label} additional markup must be between ${minAllowed}% and ${maxAllowed}%`,
      );
    }
  }
}

/** @deprecated Prefer assertLoyaltyMarkupRange */
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

export function rangesFromThresholds(
  config: LoyaltyThresholdConfig & {
    standardMaxKgs?: number;
    silverMaxKgs?: number;
    goldMaxKgs?: number;
    vipMaxKgs?: number | null;
  },
): LoyaltyCategoryRangeConfig {
  const silverMin = Number(config.silverThresholdKgs ?? DEFAULT_LOYALTY_CATEGORY_RANGES.silverMinKgs);
  const goldMin = Number(config.goldThresholdKgs ?? DEFAULT_LOYALTY_CATEGORY_RANGES.goldMinKgs);
  const vipMin = Number(config.vipThresholdKgs ?? DEFAULT_LOYALTY_CATEGORY_RANGES.vipMinKgs);
  return {
    standardMinKgs: Number(config.standardThresholdKgs ?? 0),
    standardMaxKgs: Number(config.standardMaxKgs ?? Math.max(silverMin - 1, 0)),
    silverMinKgs: silverMin,
    silverMaxKgs: Number(config.silverMaxKgs ?? Math.max(goldMin - 1, silverMin)),
    goldMinKgs: goldMin,
    goldMaxKgs: Number(config.goldMaxKgs ?? Math.max(vipMin - 1, goldMin)),
    vipMinKgs: vipMin,
    vipMaxKgs: config.vipMaxKgs == null ? null : Number(config.vipMaxKgs),
  };
}
