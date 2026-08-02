import {
  CustomerLoyaltyCategory,
  CustomerType,
  LoyaltyPurchaseWindow,
} from '@prisma/client';
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

/** Single loyalty-tier markup set (legacy / one customer type). */
export type LoyaltyMarkupConfig = {
  standardMarkupPercent: number;
  silverMarkupPercent: number;
  goldMarkupPercent: number;
  vipMarkupPercent: number;
};

/** Branch/HQ matrix: Customer Type × Loyalty Category additional selling-price markup. */
export type CustomerTypeLoyaltyMarkupMatrix = {
  retailStandardMarkupPercent: number;
  retailSilverMarkupPercent: number;
  retailGoldMarkupPercent: number;
  retailVipMarkupPercent: number;
  masterStandardMarkupPercent: number;
  masterSilverMarkupPercent: number;
  masterGoldMarkupPercent: number;
  masterVipMarkupPercent: number;
  wholesaleStandardMarkupPercent: number;
  wholesaleSilverMarkupPercent: number;
  wholesaleGoldMarkupPercent: number;
  wholesaleVipMarkupPercent: number;
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
  CustomerTypeLoyaltyMarkupMatrix &
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

/** @deprecated Prefer DEFAULT_CUSTOMER_TYPE_LOYALTY_MARKUPS */
export const DEFAULT_LOYALTY_MARKUPS: LoyaltyMarkupConfig = {
  standardMarkupPercent: 5,
  silverMarkupPercent: 3,
  goldMarkupPercent: 1.5,
  vipMarkupPercent: 0,
};

export const DEFAULT_CUSTOMER_TYPE_LOYALTY_MARKUPS: CustomerTypeLoyaltyMarkupMatrix = {
  retailStandardMarkupPercent: 5,
  retailSilverMarkupPercent: 3,
  retailGoldMarkupPercent: 1.5,
  retailVipMarkupPercent: 0,
  masterStandardMarkupPercent: 6,
  masterSilverMarkupPercent: 4,
  masterGoldMarkupPercent: 2,
  masterVipMarkupPercent: 1,
  wholesaleStandardMarkupPercent: 5,
  wholesaleSilverMarkupPercent: 3,
  wholesaleGoldMarkupPercent: 1.5,
  wholesaleVipMarkupPercent: 0,
};

const CUSTOMER_TYPE_LABEL_RU: Record<
  'RETAIL' | 'MASTER' | 'WHOLESALE',
  string
> = {
  RETAIL: 'Розничный',
  MASTER: 'Мастер',
  WHOLESALE: 'Оптовый',
};

const LOYALTY_CATEGORY_LABEL: Record<CustomerLoyaltyCategory, string> = {
  [CustomerLoyaltyCategory.STANDARD]: 'Standard',
  [CustomerLoyaltyCategory.SILVER]: 'Silver',
  [CustomerLoyaltyCategory.GOLD]: 'Gold',
  [CustomerLoyaltyCategory.VIP]: 'VIP',
};

export type BranchSaleCustomerType = 'RETAIL' | 'MASTER' | 'WHOLESALE';

export function isBranchSaleCustomerType(
  customerType: CustomerType | string | null | undefined,
): customerType is BranchSaleCustomerType {
  return (
    customerType === 'RETAIL' ||
    customerType === 'MASTER' ||
    customerType === 'WHOLESALE'
  );
}

export function markupMatrixFieldFor(
  customerType: BranchSaleCustomerType,
  category: CustomerLoyaltyCategory,
): keyof CustomerTypeLoyaltyMarkupMatrix {
  const typePrefix =
    customerType === 'MASTER'
      ? 'master'
      : customerType === 'WHOLESALE'
        ? 'wholesale'
        : 'retail';
  const categorySuffix =
    category === CustomerLoyaltyCategory.SILVER
      ? 'Silver'
      : category === CustomerLoyaltyCategory.GOLD
        ? 'Gold'
        : category === CustomerLoyaltyCategory.VIP
          ? 'Vip'
          : 'Standard';
  return `${typePrefix}${categorySuffix}MarkupPercent` as keyof CustomerTypeLoyaltyMarkupMatrix;
}

export function markupsForCustomerType(
  matrix: CustomerTypeLoyaltyMarkupMatrix,
  customerType: BranchSaleCustomerType,
): LoyaltyMarkupConfig {
  return {
    standardMarkupPercent: Number(
      matrix[markupMatrixFieldFor(customerType, CustomerLoyaltyCategory.STANDARD)],
    ),
    silverMarkupPercent: Number(
      matrix[markupMatrixFieldFor(customerType, CustomerLoyaltyCategory.SILVER)],
    ),
    goldMarkupPercent: Number(
      matrix[markupMatrixFieldFor(customerType, CustomerLoyaltyCategory.GOLD)],
    ),
    vipMarkupPercent: Number(
      matrix[markupMatrixFieldFor(customerType, CustomerLoyaltyCategory.VIP)],
    ),
  };
}

export function legacyMarkupsFromMatrix(
  matrix: CustomerTypeLoyaltyMarkupMatrix,
): LoyaltyMarkupConfig {
  return markupsForCustomerType(matrix, 'WHOLESALE');
}

const CATEGORY_RANK: Record<CustomerLoyaltyCategory, number> = {
  [CustomerLoyaltyCategory.STANDARD]: 0,
  [CustomerLoyaltyCategory.SILVER]: 1,
  [CustomerLoyaltyCategory.GOLD]: 2,
  [CustomerLoyaltyCategory.VIP]: 3,
};

export function loyaltyCategoryRank(category: CustomerLoyaltyCategory): number {
  return CATEGORY_RANK[category] ?? 0;
}

/**
 * Resolve additional selling-price markup for Customer Type × Loyalty Category.
 * Throws a clear configuration error when the rule is missing/invalid.
 */
export function getLoyaltyMarkupPercent(
  category: CustomerLoyaltyCategory,
  config: LoyaltyMarkupConfig | CustomerTypeLoyaltyMarkupMatrix,
  customerType?: CustomerType | null,
): number {
  if (customerType != null && isBranchSaleCustomerType(customerType) && isMarkupMatrix(config)) {
    const typeKey = customerType as BranchSaleCustomerType;
    const field = markupMatrixFieldFor(typeKey, category);
    if (!(field in config) || config[field] === undefined || config[field] === null) {
      throw new Error(
        `Для типа клиента «${CUSTOMER_TYPE_LABEL_RU[typeKey]}» и категории «${LOYALTY_CATEGORY_LABEL[category]}» не настроена наценка.`,
      );
    }
    const value = Number(config[field]);
    if (!Number.isFinite(value)) {
      throw new Error(
        `Для типа клиента «${CUSTOMER_TYPE_LABEL_RU[typeKey]}» и категории «${LOYALTY_CATEGORY_LABEL[category]}» не настроена наценка.`,
      );
    }
    return value;
  }

  // Legacy single-set config (tests / backward-compatible callers).
  const legacy = config as LoyaltyMarkupConfig;
  switch (category) {
    case CustomerLoyaltyCategory.SILVER:
      return Number(legacy.silverMarkupPercent ?? 0);
    case CustomerLoyaltyCategory.GOLD:
      return Number(legacy.goldMarkupPercent ?? 0);
    case CustomerLoyaltyCategory.VIP:
      return Number(legacy.vipMarkupPercent ?? 0);
    case CustomerLoyaltyCategory.STANDARD:
    default:
      return Number(legacy.standardMarkupPercent ?? 0);
  }
}

function isMarkupMatrix(config: object): config is CustomerTypeLoyaltyMarkupMatrix {
  return 'retailStandardMarkupPercent' in config || 'masterStandardMarkupPercent' in config;
}

/** @deprecated Prefer getLoyaltyMarkupPercent — discounts are no longer applied to selling price. */
export function getLoyaltyDiscountPercent(
  category: CustomerLoyaltyCategory,
  config: LoyaltyDiscountConfig | LoyaltyMarkupConfig | CustomerTypeLoyaltyMarkupMatrix,
  customerType?: CustomerType | null,
): number {
  if (isMarkupMatrix(config as object) || 'standardMarkupPercent' in (config as object)) {
    return getLoyaltyMarkupPercent(
      category,
      config as LoyaltyMarkupConfig | CustomerTypeLoyaltyMarkupMatrix,
      customerType,
    );
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
  config: LoyaltyMarkupConfig | CustomerTypeLoyaltyMarkupMatrix,
  limits?: { minAllowedMarkupPercent?: number; maxAllowedMarkupPercent?: number },
) {
  const minAllowed = Number(limits?.minAllowedMarkupPercent ?? 0);
  const maxAllowed = Number(limits?.maxAllowedMarkupPercent ?? 100);

  if (minAllowed < 0 || maxAllowed < minAllowed || maxAllowed > 100) {
    throw new Error('HQ markup limits are invalid');
  }

  const entries: Array<[string, number]> = isMarkupMatrix(config)
    ? (
        [
          ['RETAIL', CustomerLoyaltyCategory.STANDARD],
          ['RETAIL', CustomerLoyaltyCategory.SILVER],
          ['RETAIL', CustomerLoyaltyCategory.GOLD],
          ['RETAIL', CustomerLoyaltyCategory.VIP],
          ['MASTER', CustomerLoyaltyCategory.STANDARD],
          ['MASTER', CustomerLoyaltyCategory.SILVER],
          ['MASTER', CustomerLoyaltyCategory.GOLD],
          ['MASTER', CustomerLoyaltyCategory.VIP],
          ['WHOLESALE', CustomerLoyaltyCategory.STANDARD],
          ['WHOLESALE', CustomerLoyaltyCategory.SILVER],
          ['WHOLESALE', CustomerLoyaltyCategory.GOLD],
          ['WHOLESALE', CustomerLoyaltyCategory.VIP],
        ] as const
      ).map(([type, category]) => {
        const field = markupMatrixFieldFor(type, category);
        return [
          `${CUSTOMER_TYPE_LABEL_RU[type]}/${LOYALTY_CATEGORY_LABEL[category]}`,
          Number(config[field]),
        ];
      })
    : [
        ['Standard', Number((config as LoyaltyMarkupConfig).standardMarkupPercent)],
        ['Silver', Number((config as LoyaltyMarkupConfig).silverMarkupPercent)],
        ['Gold', Number((config as LoyaltyMarkupConfig).goldMarkupPercent)],
        ['VIP', Number((config as LoyaltyMarkupConfig).vipMarkupPercent)],
      ];

  const seen = new Set<string>();
  for (const [label, numeric] of entries) {
    if (seen.has(label)) {
      throw new Error(`Duplicate markup rule for ${label}`);
    }
    seen.add(label);
    if (!Number.isFinite(numeric) || Number.isNaN(numeric) || numeric < 0) {
      throw new Error(`${label} additional markup cannot be negative`);
    }
    if (numeric < minAllowed || numeric > maxAllowed) {
      throw new Error(
        `${label} additional markup must be between ${minAllowed}% and ${maxAllowed}%`,
      );
    }
  }
}

type MarkupMatrixSource = {
  [K in keyof CustomerTypeLoyaltyMarkupMatrix]?: Prisma.Decimal | number | null;
} & {
  standardMarkupPercent?: Prisma.Decimal | number | null;
  silverMarkupPercent?: Prisma.Decimal | number | null;
  goldMarkupPercent?: Prisma.Decimal | number | null;
  vipMarkupPercent?: Prisma.Decimal | number | null;
};

export function readMarkupMatrix(row: MarkupMatrixSource): CustomerTypeLoyaltyMarkupMatrix {
  const fallback = DEFAULT_CUSTOMER_TYPE_LOYALTY_MARKUPS;
  const legacyStandard = Number(row.standardMarkupPercent ?? fallback.wholesaleStandardMarkupPercent);
  const legacySilver = Number(row.silverMarkupPercent ?? fallback.wholesaleSilverMarkupPercent);
  const legacyGold = Number(row.goldMarkupPercent ?? fallback.wholesaleGoldMarkupPercent);
  const legacyVip = Number(row.vipMarkupPercent ?? fallback.wholesaleVipMarkupPercent);

  return {
    retailStandardMarkupPercent: Number(
      row.retailStandardMarkupPercent ?? legacyStandard,
    ),
    retailSilverMarkupPercent: Number(row.retailSilverMarkupPercent ?? legacySilver),
    retailGoldMarkupPercent: Number(row.retailGoldMarkupPercent ?? legacyGold),
    retailVipMarkupPercent: Number(row.retailVipMarkupPercent ?? legacyVip),
    masterStandardMarkupPercent: Number(
      row.masterStandardMarkupPercent ?? fallback.masterStandardMarkupPercent,
    ),
    masterSilverMarkupPercent: Number(
      row.masterSilverMarkupPercent ?? fallback.masterSilverMarkupPercent,
    ),
    masterGoldMarkupPercent: Number(
      row.masterGoldMarkupPercent ?? fallback.masterGoldMarkupPercent,
    ),
    masterVipMarkupPercent: Number(
      row.masterVipMarkupPercent ?? fallback.masterVipMarkupPercent,
    ),
    wholesaleStandardMarkupPercent: Number(
      row.wholesaleStandardMarkupPercent ?? legacyStandard,
    ),
    wholesaleSilverMarkupPercent: Number(
      row.wholesaleSilverMarkupPercent ?? legacySilver,
    ),
    wholesaleGoldMarkupPercent: Number(row.wholesaleGoldMarkupPercent ?? legacyGold),
    wholesaleVipMarkupPercent: Number(row.wholesaleVipMarkupPercent ?? legacyVip),
  };
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
