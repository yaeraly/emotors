import { Prisma } from '@prisma/client';

export type PricingRoundingStrategy = 'ROUNDUP' | 'ROUND_NEAREST' | 'NONE';

export type PricingRoundingConfig = {
  strategy: PricingRoundingStrategy;
  /** Sheets-style precision: -1 = nearest 10, 0 = integer, 2 = cents */
  roundUpPrecision: number;
  decimalPrecision: number;
};

export const DEFAULT_PRICING_ROUNDING: PricingRoundingConfig = {
  strategy: 'ROUNDUP',
  roundUpPrecision: -1,
  decimalPrecision: 2,
};

export function roundMoney(value: number, decimalPrecision = 2) {
  const factor = 10 ** Math.max(0, decimalPrecision);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function toDecimal(value: number | Prisma.Decimal) {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

/** Apply centralized pricing rounding (master settings). Defaults match historical ROUNDUP to tens. */
export function applyPricingRounding(
  value: number | Prisma.Decimal,
  config: PricingRoundingConfig = DEFAULT_PRICING_ROUNDING,
) {
  const decimal = toDecimal(value);
  if (decimal.lte(0)) return 0;

  if (config.strategy === 'NONE') {
    return roundMoney(decimal.toNumber(), config.decimalPrecision);
  }

  if (config.strategy === 'ROUND_NEAREST') {
    const precision = config.roundUpPrecision;
    if (precision >= 0) {
      return roundMoney(decimal.toNumber(), precision);
    }
    const factor = new Prisma.Decimal(10).pow(Math.abs(precision));
    return decimal.div(factor).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).mul(factor).toNumber();
  }

  // ROUNDUP (default)
  const precision = config.roundUpPrecision;
  if (precision >= 0) {
    const factor = new Prisma.Decimal(10).pow(precision);
    return decimal.mul(factor).ceil().div(factor).toNumber();
  }
  const factor = new Prisma.Decimal(10).pow(Math.abs(precision));
  return decimal.div(factor).ceil().mul(factor).toNumber();
}

/** Google Sheets style: ROUNDUP(value, -1) → nearest 10 KGS */
export function roundUpToTens(value: number | Prisma.Decimal) {
  return applyPricingRounding(value, DEFAULT_PRICING_ROUNDING);
}

/** Google Sheets style: ROUNDUP(cost * markup% + cost, -1) → nearest 10 KGS */
export function applyMarkupRoundUp(
  costPrice: number,
  markupPercent: number,
  config: PricingRoundingConfig = DEFAULT_PRICING_ROUNDING,
) {
  if (costPrice <= 0) return 0;
  if (!Number.isFinite(markupPercent)) return 0;
  const base = new Prisma.Decimal(costPrice);
  const markupRate = new Prisma.Decimal(markupPercent).div(100);
  const raw = base.mul(markupRate).plus(base);
  return applyPricingRounding(raw, config);
}

/** HQ wholesale: when markup is 0, return exact cost without ROUNDUP. */
export function applyHqBranchWholesaleMarkup(
  costPrice: number,
  markupPercent: number,
  config: PricingRoundingConfig = DEFAULT_PRICING_ROUNDING,
) {
  if (costPrice <= 0) return 0;
  if (markupPercent === 0) return roundMoney(costPrice, config.decimalPrecision);
  return applyMarkupRoundUp(costPrice, markupPercent, config);
}

/**
 * Branch order price: cost × (1 + markup%) with centralized rounding (Prisma Decimal).
 * Used by BranchPriceResolverService — single source for franchise branch purchase price.
 */
export function calculateBranchPriceFromFifoCost(
  costPriceKgs: number | Prisma.Decimal,
  markupPercent: number | Prisma.Decimal,
  config: PricingRoundingConfig = DEFAULT_PRICING_ROUNDING,
) {
  const cost = toDecimal(costPriceKgs);
  if (cost.lte(0)) return 0;
  const markup = toDecimal(markupPercent);
  if (markup.lt(0)) return 0;
  if (markup.eq(0)) return roundMoney(cost.toNumber(), config.decimalPrecision);
  const raw = cost.mul(new Prisma.Decimal(1).plus(markup.div(100)));
  return applyPricingRounding(raw, config);
}

export function applyMarkup(costPrice: number, markupPercent: number) {
  return applyMarkupRoundUp(costPrice, markupPercent);
}

export function deriveMarkupPercent(costPrice: number, sellingPrice: number) {
  if (costPrice <= 0) return 0;
  return roundMoney(((sellingPrice - costPrice) / costPrice) * 100);
}

export type BranchTypeForPricing = 'HQ_BRANCH' | 'FRANCHISE' | 'DEALER' | 'DISTRIBUTOR';

export type PricingAdjustmentMode =
  | 'PERCENTAGE_DISCOUNT'
  | 'FIXED_AMOUNT_DISCOUNT'
  | 'FIXED_SELLING_PRICE';

export function resolveHqToBranchPrice(
  costPriceKgs: number,
  branchType: BranchTypeForPricing,
  markupPercent: number,
) {
  if (branchType === 'HQ_BRANCH') return roundMoney(costPriceKgs);
  return applyHqBranchWholesaleMarkup(costPriceKgs, markupPercent);
}

export function resolveBranchHqMarkupPercent(input: {
  branchType: BranchTypeForPricing;
  productDefaultMarkupPercent: number;
  profileMarkupPercent?: number | null;
  profileStatus?: 'ACTIVE' | 'INACTIVE' | null;
}) {
  if (input.branchType === 'HQ_BRANCH') return 0;
  return Math.max(0, input.productDefaultMarkupPercent);
}

export function resolveBranchPurchasePrice(
  costPriceKgs: number,
  branchType: BranchTypeForPricing,
  markupPercent: number,
) {
  return resolveHqToBranchPrice(costPriceKgs, branchType, markupPercent);
}

export function calculateBaseBranchPriceKgs(input: {
  costPriceKgs: number;
  markupPercent: number;
  branchType: BranchTypeForPricing;
}) {
  return resolveBaseFranchiseBranchPrice(
    input.costPriceKgs,
    input.branchType,
    input.markupPercent,
  );
}

export function calculateRetailPriceKgs(
  effectiveBranchPriceKgs: number,
  retailMarkupPercent: number,
  config: PricingRoundingConfig = DEFAULT_PRICING_ROUNDING,
) {
  return applyMarkupRoundUp(effectiveBranchPriceKgs, retailMarkupPercent, config);
}

export function calculateWholesalePriceKgs(
  effectiveBranchPriceKgs: number,
  wholesaleMarkupPercent: number,
  config: PricingRoundingConfig = DEFAULT_PRICING_ROUNDING,
) {
  return applyMarkupRoundUp(effectiveBranchPriceKgs, wholesaleMarkupPercent, config);
}

export type BranchProductPriceSource =
  | 'OVERRIDE'
  | 'PRODUCT_RULE'
  | 'CATEGORY_DISCOUNT'
  | 'PRICING_PROFILE'
  | 'BASE_FRANCHISE'
  | 'HQ_COST';

/** Apply category discount on branch price: ROUNDUP(branchPrice × (1 - discount%), -1) */
export function applyCategoryDiscountRoundUp(
  branchPriceKgs: number,
  discountPercent: number,
  config: PricingRoundingConfig = DEFAULT_PRICING_ROUNDING,
) {
  if (branchPriceKgs <= 0) return 0;
  if (discountPercent <= 0) return branchPriceKgs;
  const raw = branchPriceKgs * (1 - discountPercent / 100);
  return applyPricingRounding(raw, config);
}

export const applyCategoryDiscount = applyCategoryDiscountRoundUp;

export function applyPricingAdjustment(
  baseBranchPriceKgs: number,
  mode: PricingAdjustmentMode,
  adjustmentValue: number,
  config: PricingRoundingConfig = DEFAULT_PRICING_ROUNDING,
): number {
  if (adjustmentValue < 0) {
    throw new Error('adjustmentValue cannot be negative');
  }

  let result: number;
  switch (mode) {
    case 'PERCENTAGE_DISCOUNT':
      result = applyCategoryDiscountRoundUp(baseBranchPriceKgs, adjustmentValue, config);
      break;
    case 'FIXED_AMOUNT_DISCOUNT':
      result = applyPricingRounding(baseBranchPriceKgs - adjustmentValue, config);
      break;
    case 'FIXED_SELLING_PRICE':
      result = adjustmentValue;
      break;
    default:
      throw new Error(`Unknown adjustment mode: ${mode}`);
  }

  if (result < 0) {
    throw new Error('Resulting price cannot be negative');
  }
  return result;
}

export function resolveBaseFranchiseBranchPrice(
  costPriceKgs: number,
  branchType: BranchTypeForPricing,
  baseFranchiseMarkupPercent: number,
) {
  if (branchType === 'HQ_BRANCH') return roundMoney(costPriceKgs);
  return applyHqBranchWholesaleMarkup(costPriceKgs, baseFranchiseMarkupPercent);
}

export function isProductOverrideEffective(
  override: { status: string; startDate: Date; endDate: Date },
  now: Date = new Date(),
) {
  if (override.status !== 'ACTIVE' && override.status !== 'APPROVED') return false;
  return override.startDate.getTime() <= now.getTime() && now.getTime() <= override.endDate.getTime();
}

export function dateRangesOverlap(startA: Date, endA: Date, startB: Date, endB: Date) {
  return startA.getTime() <= endB.getTime() && startB.getTime() <= endA.getTime();
}

export function resolveFinalBranchProductPrice(input: {
  costPriceKgs: number;
  branchType: BranchTypeForPricing;
  baseFranchiseMarkupPercent: number;
  categoryDiscountPercent?: number | null;
  productRule?: { mode: PricingAdjustmentMode; value: number } | null;
  overridePriceKgs?: number | null;
  override?: { mode: PricingAdjustmentMode; value: number } | { status: string; startDate: Date; endDate: Date } | null;
  now?: Date;
}): { priceKgs: number; source: BranchProductPriceSource; baseFranchisePriceKgs: number } {
  const baseFranchisePriceKgs = resolveBaseFranchiseBranchPrice(
    input.costPriceKgs,
    input.branchType,
    input.baseFranchiseMarkupPercent,
  );

  const modeOverride =
    input.override && 'mode' in input.override
      ? input.override
      : input.overridePriceKgs != null &&
          input.override &&
          'status' in input.override &&
          isProductOverrideEffective(input.override, input.now)
        ? { mode: 'FIXED_SELLING_PRICE' as const, value: input.overridePriceKgs }
        : null;

  if (modeOverride) {
    return {
      priceKgs: applyPricingAdjustment(baseFranchisePriceKgs, modeOverride.mode, modeOverride.value),
      source: 'OVERRIDE',
      baseFranchisePriceKgs,
    };
  }

  if (input.branchType === 'HQ_BRANCH') {
    return {
      priceKgs: roundMoney(input.costPriceKgs),
      source: 'HQ_COST',
      baseFranchisePriceKgs: roundMoney(input.costPriceKgs),
    };
  }

  if (input.productRule) {
    return {
      priceKgs: applyPricingAdjustment(
        baseFranchisePriceKgs,
        input.productRule.mode,
        input.productRule.value,
      ),
      source: 'PRODUCT_RULE',
      baseFranchisePriceKgs,
    };
  }

  const discountPercent = Math.max(0, input.categoryDiscountPercent ?? 0);
  if (discountPercent > 0) {
    return {
      priceKgs: applyCategoryDiscountRoundUp(baseFranchisePriceKgs, discountPercent),
      source: 'CATEGORY_DISCOUNT',
      baseFranchisePriceKgs,
    };
  }

  return {
    priceKgs: baseFranchisePriceKgs,
    source: 'BASE_FRANCHISE',
    baseFranchisePriceKgs,
  };
}

/**
 * @deprecated Prefer PricingEngineService.resolvePrice — single source of truth.
 * Kept for unit tests of pure formula helpers and transitional callers.
 */
export function resolveFinalBranchProductPriceWithProfile(input: {
  costPriceKgs: number;
  branchType: BranchTypeForPricing;
  baseFranchiseMarkupPercent: number;
  profileDiscountPercent?: number | null;
  categoryDiscountPercent?: number | null;
  productRule?: { mode: PricingAdjustmentMode; value: number } | null;
  override?: { mode: PricingAdjustmentMode; value: number } | null;
}): { priceKgs: number; source: BranchProductPriceSource; baseFranchisePriceKgs: number } {
  const baseFranchisePriceKgs = resolveBaseFranchiseBranchPrice(
    input.costPriceKgs,
    input.branchType,
    input.baseFranchiseMarkupPercent,
  );

  if (input.override) {
    return {
      priceKgs: applyPricingAdjustment(baseFranchisePriceKgs, input.override.mode, input.override.value),
      source: 'OVERRIDE',
      baseFranchisePriceKgs,
    };
  }

  if (input.branchType === 'HQ_BRANCH') {
    return {
      priceKgs: roundMoney(input.costPriceKgs),
      source: 'HQ_COST',
      baseFranchisePriceKgs: roundMoney(input.costPriceKgs),
    };
  }

  if (input.productRule) {
    return {
      priceKgs: applyPricingAdjustment(
        baseFranchisePriceKgs,
        input.productRule.mode,
        input.productRule.value,
      ),
      source: 'PRODUCT_RULE',
      baseFranchisePriceKgs,
    };
  }

  const categoryDiscount = Math.max(0, input.categoryDiscountPercent ?? 0);
  if (categoryDiscount > 0) {
    return {
      priceKgs: applyCategoryDiscountRoundUp(baseFranchisePriceKgs, categoryDiscount),
      source: 'CATEGORY_DISCOUNT',
      baseFranchisePriceKgs,
    };
  }

  const profileDiscount = Math.max(0, input.profileDiscountPercent ?? 0);
  if (profileDiscount > 0) {
    return {
      priceKgs: applyCategoryDiscountRoundUp(baseFranchisePriceKgs, profileDiscount),
      source: 'PRICING_PROFILE',
      baseFranchisePriceKgs,
    };
  }

  return {
    priceKgs: baseFranchisePriceKgs,
    source: 'BASE_FRANCHISE',
    baseFranchisePriceKgs,
  };
}

export function pricesFromMarkups(
  costPriceKgs: number,
  markups: {
    wholesaleMarkupPercent: number;
    minimumWholesaleMarkupPercent?: number;
    hqBranchWholesaleMarkupPercent: number;
    recommendedRetailMarkupPercent: number;
    minimumSellingMarkupPercent: number;
    maximumRetailMarkupPercent?: number;
    maximumWholesaleMarkupPercent?: number;
    enableMaximumRetailPrice?: boolean;
    enableMaximumWholesalePrice?: boolean;
  },
) {
  const branchPurchasePriceKgs = applyHqBranchWholesaleMarkup(
    costPriceKgs,
    markups.hqBranchWholesaleMarkupPercent,
  );
  const minimumWholesaleMarkupPercent = markups.minimumWholesaleMarkupPercent ?? markups.wholesaleMarkupPercent;
  const maximumRetailPriceKgs =
    markups.enableMaximumRetailPrice && (markups.maximumRetailMarkupPercent ?? 0) > 0
      ? applyMarkupRoundUp(branchPurchasePriceKgs, markups.maximumRetailMarkupPercent ?? 0)
      : 0;
  const maximumWholesalePriceKgs =
    markups.enableMaximumWholesalePrice && (markups.maximumWholesaleMarkupPercent ?? 0) > 0
      ? applyMarkupRoundUp(branchPurchasePriceKgs, markups.maximumWholesaleMarkupPercent ?? 0)
      : 0;
  return {
    hqBranchWholesalePriceKgs: branchPurchasePriceKgs,
    minimumWholesalePriceKgs: applyMarkupRoundUp(branchPurchasePriceKgs, minimumWholesaleMarkupPercent),
    wholesalePriceKgs: applyMarkupRoundUp(branchPurchasePriceKgs, markups.wholesaleMarkupPercent),
    recommendedRetailPriceKgs: applyMarkupRoundUp(branchPurchasePriceKgs, markups.recommendedRetailMarkupPercent),
    minimumSellingPriceKgs: applyMarkupRoundUp(branchPurchasePriceKgs, markups.minimumSellingMarkupPercent),
    maximumRetailPriceKgs,
    maximumWholesalePriceKgs,
  };
}

export type SellingPriceValidationResult =
  | { ok: true; warning: false }
  | { ok: true; warning: true; message: string }
  | { ok: false; error: string };

export type MaximumPricePolicyValue = 'DISABLED' | 'WARNING_ONLY' | 'HARD_LIMIT';

export function validateSellingPriceLimits(input: {
  unitPrice: number;
  minimumPriceKgs: number;
  recommendedPriceKgs: number;
  maximumPriceKgs?: number | null;
  maximumEnabled?: boolean;
  maximumPolicy?: MaximumPricePolicyValue;
}): SellingPriceValidationResult {
  const maximumPolicy =
    input.maximumPolicy ?? (input.maximumEnabled ? 'HARD_LIMIT' : 'DISABLED');

  if (input.unitPrice + 0.01 < input.minimumPriceKgs) {
    return { ok: false, error: 'PRICE_BELOW_MINIMUM' };
  }

  const aboveMaximum =
    maximumPolicy !== 'DISABLED' &&
    input.maximumPriceKgs != null &&
    input.maximumPriceKgs > 0 &&
    input.unitPrice > input.maximumPriceKgs + 0.01;

  if (aboveMaximum && maximumPolicy === 'HARD_LIMIT') {
    return { ok: false, error: 'PRICE_ABOVE_MAXIMUM' };
  }

  if (aboveMaximum && maximumPolicy === 'WARNING_ONLY') {
    return {
      ok: true,
      warning: true,
      message: 'Цена выше максимальной. Укажите причину.',
    };
  }

  if (input.unitPrice > input.recommendedPriceKgs + 0.01) {
    return {
      ok: true,
      warning: true,
      message: 'Цена выше рекомендуемой. Укажите причину.',
    };
  }
  return { ok: true, warning: false };
}

export function validateRetailCurrentPrice(
  branchPurchasePriceKgs: number,
  minimumMarkupPercent: number,
  recommendedMarkupPercent: number,
  currentPriceKgs: number,
  options?: {
    maximumMarkupPercent?: number;
    enableMaximumPrice?: boolean;
  },
) {
  if (branchPurchasePriceKgs <= 0) return 'Cost price must be greater than 0 to validate retail price';
  const minPrice = applyMarkupRoundUp(branchPurchasePriceKgs, minimumMarkupPercent);
  const maxPrice = applyMarkupRoundUp(branchPurchasePriceKgs, recommendedMarkupPercent);
  if (currentPriceKgs + 0.01 < minPrice) {
    return 'Current retail price cannot be below minimum allowed price';
  }
  if (options?.enableMaximumPrice && (options.maximumMarkupPercent ?? 0) > 0) {
    const ceiling = applyMarkupRoundUp(branchPurchasePriceKgs, options.maximumMarkupPercent ?? 0);
    if (recommendedMarkupPercent > (options.maximumMarkupPercent ?? 0) + 0.01) {
      return 'Recommended retail markup cannot exceed maximum retail markup';
    }
    if (currentPriceKgs > ceiling + 0.01) {
      return 'Current retail price cannot exceed maximum allowed price';
    }
    return null;
  }
  if (currentPriceKgs > maxPrice + 0.01) {
    return 'Current retail price cannot exceed recommended retail price';
  }
  return null;
}

export function validateWholesaleCurrentPrice(
  branchPurchasePriceKgs: number,
  minimumMarkupPercent: number,
  recommendedMarkupPercent: number,
  currentPriceKgs: number,
  options?: {
    maximumMarkupPercent?: number;
    enableMaximumPrice?: boolean;
  },
) {
  if (branchPurchasePriceKgs <= 0) return 'Cost price must be greater than 0 to validate wholesale price';
  const minPrice = applyMarkupRoundUp(branchPurchasePriceKgs, minimumMarkupPercent);
  const maxPrice = applyMarkupRoundUp(branchPurchasePriceKgs, recommendedMarkupPercent);
  if (currentPriceKgs + 0.01 < minPrice) {
    return 'Current wholesale price cannot be below minimum allowed price';
  }
  if (options?.enableMaximumPrice && (options.maximumMarkupPercent ?? 0) > 0) {
    const ceiling = applyMarkupRoundUp(branchPurchasePriceKgs, options.maximumMarkupPercent ?? 0);
    if (recommendedMarkupPercent > (options.maximumMarkupPercent ?? 0) + 0.01) {
      return 'Recommended wholesale markup cannot exceed maximum wholesale markup';
    }
    if (currentPriceKgs > ceiling + 0.01) {
      return 'Current wholesale price cannot exceed maximum allowed price';
    }
    return null;
  }
  if (currentPriceKgs > maxPrice + 0.01) {
    return 'Current wholesale price cannot exceed recommended wholesale price';
  }
  return null;
}

export function validateMarkupInput(markups: {
  wholesaleMarkupPercent: number;
  hqBranchWholesaleMarkupPercent: number;
  recommendedRetailMarkupPercent: number;
  minimumSellingMarkupPercent: number;
}) {
  if (markups.wholesaleMarkupPercent < 0) return 'Wholesale markup must be >= 0';
  if (markups.hqBranchWholesaleMarkupPercent < 0) return 'HQ wholesale markup must be >= 0';
  if (markups.recommendedRetailMarkupPercent < 0) return 'Retail markup must be >= 0';
  if (markups.minimumSellingMarkupPercent < 0) return 'Minimum markup must be >= 0';
  return null;
}

export function validatePricingTiers(input: {
  branchPurchasePriceKgs: number;
  wholesalePriceKgs: number;
  hqBranchWholesalePriceKgs: number;
  recommendedRetailPriceKgs: number;
  minimumSellingPriceKgs: number;
}) {
  if (input.branchPurchasePriceKgs <= 0) return 'Branch purchase price must be greater than 0';
  if (input.wholesalePriceKgs <= 0) return 'Wholesale price must be greater than 0';
  if (input.hqBranchWholesalePriceKgs <= 0) return 'HQ wholesale price must be greater than 0';
  if (input.recommendedRetailPriceKgs <= 0) return 'Retail price must be greater than 0';
  if (input.minimumSellingPriceKgs <= 0) return 'Minimum price must be greater than 0';
  if (input.minimumSellingPriceKgs > input.recommendedRetailPriceKgs + 0.01) {
    return 'Minimum selling price cannot exceed recommended retail price';
  }
  if (input.wholesalePriceKgs > input.recommendedRetailPriceKgs + 0.01) {
    return 'Wholesale price cannot exceed recommended retail price';
  }
  if (input.hqBranchWholesalePriceKgs > input.wholesalePriceKgs + 0.01) {
    return 'Branch purchase price cannot exceed wholesale price';
  }
  return null;
}

export function validateMarkups(costPriceKgs: number, markups: {
  wholesaleMarkupPercent: number;
  hqBranchWholesaleMarkupPercent: number;
  recommendedRetailMarkupPercent: number;
  minimumSellingMarkupPercent: number;
}) {
  const markupError = validateMarkupInput(markups);
  if (markupError) return markupError;
  if (costPriceKgs <= 0) return 'Cost price must be greater than 0 to calculate prices';
  const prices = pricesFromMarkups(costPriceKgs, markups);
  return validatePricingTiers({
    branchPurchasePriceKgs: prices.hqBranchWholesalePriceKgs,
    ...prices,
  });
}
