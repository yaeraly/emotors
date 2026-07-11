import { MaximumMarkupSource } from '@prisma/client';
import { applyMarkupRoundUp } from './pricing-calculator.util';
import {
  resolveRetailMaximumMarkup,
  resolveWholesaleMaximumMarkup,
  type CategoryMaximumPolicyFields,
  type ProductMaximumPolicyFields,
} from './pricing-policy-resolution.util';

export const MARKUP_VALIDATION_MESSAGES = {
  MIN_NEGATIVE: 'Минимальная наценка не может быть отрицательной',
  RECOMMENDED_NEGATIVE: 'Рекомендуемая наценка не может быть отрицательной',
  MAX_NEGATIVE: 'Максимальная наценка не может быть отрицательной',
  RECOMMENDED_BELOW_MIN: 'Рекомендуемая наценка не может быть меньше минимальной',
  MAX_BELOW_RECOMMENDED: 'Максимальная наценка не может быть меньше рекомендуемой',
  INHERITED_MAX_MISMATCH:
    'Унаследованная максимальная наценка не подходит к рекомендуемой наценке. Измените рекомендуемую наценку или установите индивидуальную максимальную наценку',
} as const;

export type MarkupValidationStatus = 'OK' | 'ERROR';

export type ProductMarkupOverrideFields = {
  maximumRetailMarkupOverridePercent?: number | { toString(): string } | null;
  maximumWholesaleMarkupOverridePercent?: number | { toString(): string } | null;
};

export type RetailMarkupInput = ProductMaximumPolicyFields &
  ProductMarkupOverrideFields & {
    minimumSellingMarkupPercent: number | { toString(): string };
    recommendedRetailMarkupPercent: number | { toString(): string };
  };

export type WholesaleMarkupInput = ProductMaximumPolicyFields &
  ProductMarkupOverrideFields & {
    minimumWholesaleMarkupPercent: number | { toString(): string };
    wholesaleMarkupPercent: number | { toString(): string };
  };

function toNumber(value: number | { toString(): string } | null | undefined) {
  if (value == null) return null;
  return Number(value);
}

export function resolveInheritedMaximumRetailMarkupPercent(
  product: Pick<
    ProductMaximumPolicyFields,
    'retailMaximumPolicySource' | 'maximumRetailMarkupPercent'
  >,
  category: Pick<CategoryMaximumPolicyFields, 'defaultRetailMaximumMarkupPercent'>,
) {
  return resolveRetailMaximumMarkup(product, category);
}

export function resolveInheritedMaximumWholesaleMarkupPercent(
  product: Pick<
    ProductMaximumPolicyFields,
    'wholesaleMaximumPolicySource' | 'maximumWholesaleMarkupPercent'
  >,
  category: Pick<CategoryMaximumPolicyFields, 'defaultWholesaleMaximumMarkupPercent'>,
) {
  return resolveWholesaleMaximumMarkup(product, category);
}

export function resolveEffectiveMaximumRetailMarkupPercent(
  product: RetailMarkupInput,
  category: Pick<CategoryMaximumPolicyFields, 'defaultRetailMaximumMarkupPercent'>,
) {
  const override = toNumber(product.maximumRetailMarkupOverridePercent);
  if (override != null) return override;
  return resolveInheritedMaximumRetailMarkupPercent(product, category);
}

export function resolveEffectiveMaximumWholesaleMarkupPercent(
  product: WholesaleMarkupInput,
  category: Pick<CategoryMaximumPolicyFields, 'defaultWholesaleMaximumMarkupPercent'>,
) {
  const override = toNumber(product.maximumWholesaleMarkupOverridePercent);
  if (override != null) return override;
  return resolveInheritedMaximumWholesaleMarkupPercent(product, category);
}

export function resolveMaximumRetailMarkupSource(
  product: Pick<ProductMarkupOverrideFields, 'maximumRetailMarkupOverridePercent'>,
): MaximumMarkupSource {
  return product.maximumRetailMarkupOverridePercent != null
    ? MaximumMarkupSource.CEO_PRODUCT_OVERRIDE
    : MaximumMarkupSource.INHERITED;
}

export function resolveMaximumWholesaleMarkupSource(
  product: Pick<ProductMarkupOverrideFields, 'maximumWholesaleMarkupOverridePercent'>,
): MaximumMarkupSource {
  return product.maximumWholesaleMarkupOverridePercent != null
    ? MaximumMarkupSource.CEO_PRODUCT_OVERRIDE
    : MaximumMarkupSource.INHERITED;
}

export function calculateRetailPricesFromBranchPrice(
  effectiveBranchPriceKgs: number,
  input: {
    minimumRetailMarkupPercent: number;
    recommendedRetailMarkupPercent: number;
    effectiveMaximumRetailMarkupPercent: number;
  },
) {
  return {
    minimumRetailPriceKgs: applyMarkupRoundUp(
      effectiveBranchPriceKgs,
      input.minimumRetailMarkupPercent,
    ),
    recommendedRetailPriceKgs: applyMarkupRoundUp(
      effectiveBranchPriceKgs,
      input.recommendedRetailMarkupPercent,
    ),
    maximumRetailPriceKgs: applyMarkupRoundUp(
      effectiveBranchPriceKgs,
      input.effectiveMaximumRetailMarkupPercent,
    ),
  };
}

export function calculateWholesalePricesFromBranchPrice(
  effectiveBranchPriceKgs: number,
  input: {
    minimumWholesaleMarkupPercent: number;
    recommendedWholesaleMarkupPercent: number;
    effectiveMaximumWholesaleMarkupPercent: number;
  },
) {
  return {
    minimumWholesalePriceKgs: applyMarkupRoundUp(
      effectiveBranchPriceKgs,
      input.minimumWholesaleMarkupPercent,
    ),
    recommendedWholesalePriceKgs: applyMarkupRoundUp(
      effectiveBranchPriceKgs,
      input.recommendedWholesaleMarkupPercent,
    ),
    maximumWholesalePriceKgs: applyMarkupRoundUp(
      effectiveBranchPriceKgs,
      input.effectiveMaximumWholesaleMarkupPercent,
    ),
  };
}

export function validateRetailMarkups(input: {
  minimumRetailMarkupPercent: number;
  recommendedRetailMarkupPercent: number;
  inheritedMaximumRetailMarkupPercent: number;
  effectiveMaximumRetailMarkupPercent: number;
  maximumRetailMarkupSource: MaximumMarkupSource;
}) {
  const errors: string[] = [];

  if (input.minimumRetailMarkupPercent < 0) {
    errors.push(MARKUP_VALIDATION_MESSAGES.MIN_NEGATIVE);
  }
  if (input.recommendedRetailMarkupPercent < 0) {
    errors.push(MARKUP_VALIDATION_MESSAGES.RECOMMENDED_NEGATIVE);
  }
  if (input.effectiveMaximumRetailMarkupPercent < 0) {
    errors.push(MARKUP_VALIDATION_MESSAGES.MAX_NEGATIVE);
  }
  if (input.minimumRetailMarkupPercent > input.recommendedRetailMarkupPercent + 0.01) {
    errors.push(MARKUP_VALIDATION_MESSAGES.RECOMMENDED_BELOW_MIN);
  }
  if (input.effectiveMaximumRetailMarkupPercent < input.recommendedRetailMarkupPercent - 0.01) {
    if (
      input.maximumRetailMarkupSource === MaximumMarkupSource.INHERITED &&
      input.inheritedMaximumRetailMarkupPercent < input.recommendedRetailMarkupPercent - 0.01
    ) {
      errors.push(MARKUP_VALIDATION_MESSAGES.INHERITED_MAX_MISMATCH);
    } else {
      errors.push(MARKUP_VALIDATION_MESSAGES.MAX_BELOW_RECOMMENDED);
    }
  }

  return {
    validationStatus: (errors.length ? 'ERROR' : 'OK') as MarkupValidationStatus,
    validationErrors: errors,
  };
}

export function validateWholesaleMarkups(input: {
  minimumWholesaleMarkupPercent: number;
  recommendedWholesaleMarkupPercent: number;
  inheritedMaximumWholesaleMarkupPercent: number;
  effectiveMaximumWholesaleMarkupPercent: number;
  maximumWholesaleMarkupSource: MaximumMarkupSource;
}) {
  const errors: string[] = [];

  if (input.minimumWholesaleMarkupPercent < 0) {
    errors.push(MARKUP_VALIDATION_MESSAGES.MIN_NEGATIVE);
  }
  if (input.recommendedWholesaleMarkupPercent < 0) {
    errors.push(MARKUP_VALIDATION_MESSAGES.RECOMMENDED_NEGATIVE);
  }
  if (input.effectiveMaximumWholesaleMarkupPercent < 0) {
    errors.push(MARKUP_VALIDATION_MESSAGES.MAX_NEGATIVE);
  }
  if (input.minimumWholesaleMarkupPercent > input.recommendedWholesaleMarkupPercent + 0.01) {
    errors.push(MARKUP_VALIDATION_MESSAGES.RECOMMENDED_BELOW_MIN);
  }
  if (input.effectiveMaximumWholesaleMarkupPercent < input.recommendedWholesaleMarkupPercent - 0.01) {
    if (
      input.maximumWholesaleMarkupSource === MaximumMarkupSource.INHERITED &&
      input.inheritedMaximumWholesaleMarkupPercent <
        input.recommendedWholesaleMarkupPercent - 0.01
    ) {
      errors.push(MARKUP_VALIDATION_MESSAGES.INHERITED_MAX_MISMATCH);
    } else {
      errors.push(MARKUP_VALIDATION_MESSAGES.MAX_BELOW_RECOMMENDED);
    }
  }

  return {
    validationStatus: (errors.length ? 'ERROR' : 'OK') as MarkupValidationStatus,
    validationErrors: errors,
  };
}

export function buildRetailMarkupRow(
  product: RetailMarkupInput & { id: string },
  category: CategoryMaximumPolicyFields,
  effectiveBranchPriceKgs: number,
) {
  const minimumRetailMarkupPercent = Number(product.minimumSellingMarkupPercent);
  const recommendedRetailMarkupPercent = Number(product.recommendedRetailMarkupPercent);
  const inheritedMaximumRetailMarkupPercent = resolveInheritedMaximumRetailMarkupPercent(
    product,
    category,
  );
  const maximumRetailMarkupOverridePercent = toNumber(product.maximumRetailMarkupOverridePercent);
  const effectiveMaximumRetailMarkupPercent = resolveEffectiveMaximumRetailMarkupPercent(
    product,
    category,
  );
  const maximumRetailMarkupSource = resolveMaximumRetailMarkupSource(product);
  const prices = calculateRetailPricesFromBranchPrice(effectiveBranchPriceKgs, {
    minimumRetailMarkupPercent,
    recommendedRetailMarkupPercent,
    effectiveMaximumRetailMarkupPercent,
  });
  const validation = validateRetailMarkups({
    minimumRetailMarkupPercent,
    recommendedRetailMarkupPercent,
    inheritedMaximumRetailMarkupPercent,
    effectiveMaximumRetailMarkupPercent,
    maximumRetailMarkupSource,
  });

  return {
    productId: product.id,
    effectiveBranchPriceKgs,
    minimumRetailMarkupPercent,
    ...prices,
    recommendedRetailMarkupPercent,
    inheritedMaximumRetailMarkupPercent,
    maximumRetailMarkupOverridePercent,
    effectiveMaximumRetailMarkupPercent,
    maximumRetailMarkupSource,
    ...validation,
  };
}

export function buildWholesaleMarkupRow(
  product: WholesaleMarkupInput & { id: string },
  category: CategoryMaximumPolicyFields,
  effectiveBranchPriceKgs: number,
) {
  const minimumWholesaleMarkupPercent = Number(product.minimumWholesaleMarkupPercent);
  const recommendedWholesaleMarkupPercent = Number(product.wholesaleMarkupPercent);
  const inheritedMaximumWholesaleMarkupPercent = resolveInheritedMaximumWholesaleMarkupPercent(
    product,
    category,
  );
  const maximumWholesaleMarkupOverridePercent = toNumber(
    product.maximumWholesaleMarkupOverridePercent,
  );
  const effectiveMaximumWholesaleMarkupPercent = resolveEffectiveMaximumWholesaleMarkupPercent(
    product,
    category,
  );
  const maximumWholesaleMarkupSource = resolveMaximumWholesaleMarkupSource(product);
  const prices = calculateWholesalePricesFromBranchPrice(effectiveBranchPriceKgs, {
    minimumWholesaleMarkupPercent,
    recommendedWholesaleMarkupPercent,
    effectiveMaximumWholesaleMarkupPercent,
  });
  const validation = validateWholesaleMarkups({
    minimumWholesaleMarkupPercent,
    recommendedWholesaleMarkupPercent,
    inheritedMaximumWholesaleMarkupPercent,
    effectiveMaximumWholesaleMarkupPercent,
    maximumWholesaleMarkupSource,
  });

  return {
    productId: product.id,
    effectiveBranchPriceKgs,
    minimumWholesaleMarkupPercent,
    ...prices,
    recommendedWholesaleMarkupPercent,
    inheritedMaximumWholesaleMarkupPercent,
    maximumWholesaleMarkupOverridePercent,
    effectiveMaximumWholesaleMarkupPercent,
    maximumWholesaleMarkupSource,
    ...validation,
  };
}
