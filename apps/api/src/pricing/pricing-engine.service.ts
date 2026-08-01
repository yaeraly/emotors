import { Injectable } from '@nestjs/common';
import { PricingAppliedRuleType, PricingEnginePriceType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { HQ_CATALOG_BRANCH_CODE } from '../warehouse/warehouse.util';
import {
  applyPricingAdjustment,
  applyPricingAdjustmentRaw,
  calculateBaseBranchPriceKgs,
  calculateBaseBranchPriceKgsRaw,
  calculateMasterPriceKgs,
  calculateRetailPriceKgs,
  calculateWholesalePriceKgs,
  applyPricingRounding,
  DEFAULT_PRICING_ROUNDING,
  type BranchTypeForPricing,
  type PricingAdjustmentMode,
  type PricingRoundingConfig,
} from './pricing-calculator.util';
import {
  buildPriceExplanation,
  PricingEngineResolveInput,
  PricingEngineResolveResult,
  PricingCalculationStep,
  PriceExplanationResult,
} from './pricing-engine.types';
import { PricingFifoService } from './pricing-fifo.service';
import { PricingSchedulerService } from './pricing-scheduler.service';
import { PricingSettingsService } from './pricing-settings.service';
import {
  isMaximumPolicyActive,
  resolveRetailMaximumMarkup,
  resolveRetailMaximumPolicy,
  resolveWholesaleMaximumMarkup,
  resolveWholesaleMaximumPolicy,
} from './pricing-policy-resolution.util';
import {
  isCustomerSalePriceType,
  shouldUseHqBranchInventoryCostForPriceType,
} from './shared-franchise-pricing-branch.util';

/**
 * Single source of truth for price resolution.
 *
 * Priority (non-HQ):
 * 1. Temporary Product Override
 * 2. Product Rule (version + profile + product)
 * 3. Category Rule (version + profile + category)
 * 4. Pricing Profile category discount
 * 5. Master Franchise Policy (product HQ markup)
 * 6. FIFO Cost
 */
@Injectable()
export class PricingEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fifoService: PricingFifoService,
    private readonly schedulerService: PricingSchedulerService,
    private readonly settingsService: PricingSettingsService,
  ) {}

  async resolvePrice(input: PricingEngineResolveInput): Promise<PricingEngineResolveResult> {
    await this.schedulerService.runDueActivations();

    const priceType = input.priceType ?? PricingEnginePriceType.BRANCH_PURCHASE;
    const asOf = input.documentDate ?? new Date();
    const rounding = await this.settingsService.getRoundingConfig().catch(() => DEFAULT_PRICING_ROUNDING);

    const branch = await this.prisma.branch.findFirst({
      where: { id: input.branchId, deletedAt: null },
      include: {
        priceProfile: {
          include: { categoryDiscounts: true },
        },
      },
    });
    if (!branch) {
      throw new Error(`Branch not found: ${input.branchId}`);
    }

    const product = await this.prisma.product.findFirst({
      where: { id: input.productId, deletedAt: null },
      include: { productCategory: true },
    });
    if (!product) {
      throw new Error(`Product not found: ${input.productId}`);
    }

    const catalogProduct = await this.resolveHqCatalogProduct(product);
    const pricingProduct = catalogProduct ?? product;
    const pricingProductIds = Array.from(
      new Set([product.id, pricingProduct.id].filter(Boolean)),
    );

    const versionId = input.pricingPolicyVersionId ?? (await this.getActiveVersionId());

    const branchType = (input.branchTypeOverride ??
      branch.branchType) as BranchTypeForPricing;
    const isBranchPurchase = priceType === PricingEnginePriceType.BRANCH_PURCHASE;
    const profileId = input.pricingProfileIdOverride ?? branch.priceProfileId;
    const profileForRules =
      profileId && profileId !== branch.priceProfileId
        ? await this.prisma.branchPriceProfile.findFirst({
            where: { id: profileId },
            include: { categoryDiscounts: true },
          })
        : branch.priceProfile ??
          (profileId
            ? await this.prisma.branchPriceProfile.findFirst({
                where: { id: profileId },
                include: { categoryDiscounts: true },
              })
            : null);

    const cost = await this.fifoService.getOldestActiveHqFifoCost(pricingProduct.id);
    const costAvailable = Boolean(cost.available && cost.costPriceKgs > 0);
    const baseCostKgs = costAvailable ? cost.costPriceKgs : 0;
    const baseFranchiseMarkupPercent = Number(pricingProduct.hqBranchWholesaleMarkupPercent ?? 0);

    const isHqBranchTransfer = branchType === 'HQ_BRANCH';
    const useHqBranchInventoryCost = shouldUseHqBranchInventoryCostForPriceType(
      branchType,
      priceType,
    );
    const pricingBranchType: BranchTypeForPricing =
      branchType === 'HQ_BRANCH' && isCustomerSalePriceType(priceType)
        ? 'FRANCHISE'
        : branchType;

    const baseBranchPriceRaw = calculateBaseBranchPriceKgsRaw({
      costPriceKgs: baseCostKgs,
      markupPercent: baseFranchiseMarkupPercent,
      branchType: pricingBranchType,
    });
    const baseBranchPriceKgs = isBranchPurchase
      ? baseBranchPriceRaw
      : calculateBaseBranchPriceKgs({
          costPriceKgs: baseCostKgs,
          markupPercent: baseFranchiseMarkupPercent,
          branchType: pricingBranchType,
        });

    const calculationSteps: PricingCalculationStep[] = [
      { step: 'fifoCost', valueKgs: baseCostKgs, detail: cost.source },
      {
        step: 'masterFranchise',
        valueKgs:
          isBranchPurchase && !isHqBranchTransfer
            ? applyPricingRounding(baseBranchPriceRaw, rounding)
            : baseBranchPriceKgs,
        detail: `markup=${baseFranchiseMarkupPercent}`,
      },
    ];

    let effectiveBranchPriceKgs = baseBranchPriceKgs;
    let appliedRuleType: PricingAppliedRuleType = PricingAppliedRuleType.BASE_FRANCHISE;
    let appliedRuleId: string | null = null;
    let appliedAdjustmentMode: PricingAdjustmentMode | null = null;
    let appliedAdjustmentValue: number | null = null;
    let categoryRulePercent: number | null = null;
    let productRuleMode: PricingAdjustmentMode | null = null;
    let productRuleValue: number | null = null;
    let pricingProfileDiscountPercent: number | null = null;
    let temporaryOverrideApplied = false;

    if (useHqBranchInventoryCost) {
      effectiveBranchPriceKgs = baseCostKgs;
      appliedRuleType = PricingAppliedRuleType.HQ_COST;
      calculationSteps.push({ step: 'hqBranchExactCost', valueKgs: baseCostKgs });
    } else {
      const applyAdjustment = (base: number, mode: PricingAdjustmentMode, value: number) =>
        isBranchPurchase
          ? applyPricingAdjustmentRaw(base, mode, value)
          : applyPricingAdjustment(base, mode, value, rounding);

      const tempOverride = await this.findActiveTempOverride(
        input.branchId,
        pricingProductIds,
        asOf,
        versionId,
      );
      if (tempOverride) {
        effectiveBranchPriceKgs = applyAdjustment(
          baseBranchPriceKgs,
          tempOverride.mode,
          tempOverride.value,
        );
        appliedRuleType = PricingAppliedRuleType.TEMP_OVERRIDE;
        appliedRuleId = tempOverride.id;
        appliedAdjustmentMode = tempOverride.mode;
        appliedAdjustmentValue = tempOverride.value;
        temporaryOverrideApplied = true;
        calculationSteps.push({
          step: 'tempOverride',
          valueKgs: effectiveBranchPriceKgs,
          detail: `${tempOverride.mode}=${tempOverride.value}`,
        });
      } else if (profileId) {
        let resolvedByRule = false;

        if (versionId) {
          const productRule = await this.prisma.pricingProductRule.findFirst({
            where: {
              pricingPolicyVersionId: versionId,
              pricingProfileId: profileId,
              productId: { in: pricingProductIds },
              status: 'ACTIVE',
            },
          });
          if (productRule) {
            const mode = productRule.adjustmentMode as PricingAdjustmentMode;
            const value = Number(productRule.adjustmentValue);
            effectiveBranchPriceKgs = applyAdjustment(baseBranchPriceKgs, mode, value);
            appliedRuleType = PricingAppliedRuleType.PRODUCT_RULE;
            appliedRuleId = productRule.id;
            appliedAdjustmentMode = mode;
            appliedAdjustmentValue = value;
            productRuleMode = mode;
            productRuleValue = value;
            calculationSteps.push({
              step: 'productRule',
              valueKgs: effectiveBranchPriceKgs,
              detail: `${mode}=${value}`,
            });
            resolvedByRule = true;
          } else if (pricingProduct.categoryId) {
            const categoryRule = await this.prisma.pricingCategoryRule.findFirst({
              where: {
                pricingPolicyVersionId: versionId,
                pricingProfileId: profileId,
                categoryId: pricingProduct.categoryId,
                status: 'ACTIVE',
              },
            });
            if (categoryRule) {
              const value = Number(categoryRule.discountPercent);
              effectiveBranchPriceKgs = applyAdjustment(
                baseBranchPriceKgs,
                'PERCENTAGE_DISCOUNT',
                value,
              );
              appliedRuleType = PricingAppliedRuleType.CATEGORY_RULE;
              appliedRuleId = categoryRule.id;
              appliedAdjustmentMode = 'PERCENTAGE_DISCOUNT';
              appliedAdjustmentValue = value;
              categoryRulePercent = value;
              calculationSteps.push({
                step: 'categoryRule',
                valueKgs: effectiveBranchPriceKgs,
                detail: `discount=${value}%`,
              });
              resolvedByRule = true;
            }
          }
        }

        // Pricing Profile layer: live profile category discounts when no version rule matched
        if (!resolvedByRule && pricingProduct.categoryId && profileForRules) {
          const profileDiscount = profileForRules.categoryDiscounts.find(
            (row) => row.categoryId === pricingProduct.categoryId,
          );
          const discountPercent = profileDiscount ? Number(profileDiscount.discountPercent) : 0;
          if (discountPercent > 0) {
            effectiveBranchPriceKgs = applyAdjustment(
              baseBranchPriceKgs,
              'PERCENTAGE_DISCOUNT',
              discountPercent,
            );
            appliedRuleType = PricingAppliedRuleType.PRICING_PROFILE;
            appliedRuleId = profileDiscount?.id ?? profileId;
            appliedAdjustmentMode = 'PERCENTAGE_DISCOUNT';
            appliedAdjustmentValue = discountPercent;
            pricingProfileDiscountPercent = discountPercent;
            calculationSteps.push({
              step: 'pricingProfile',
              valueKgs: effectiveBranchPriceKgs,
              detail: `discount=${discountPercent}%`,
            });
          }
        }
      }
    }

    const category = pricingProduct.productCategory ?? {
      defaultRetailMaximumPolicy: 'DISABLED' as const,
      defaultWholesaleMaximumPolicy: 'DISABLED' as const,
      defaultRetailMaximumMarkupPercent: 0,
      defaultWholesaleMaximumMarkupPercent: 0,
    };

    let resolvedPriceKgs = effectiveBranchPriceKgs;
    switch (priceType) {
      case PricingEnginePriceType.BRANCH_PURCHASE:
        resolvedPriceKgs =
          isHqBranchTransfer
            ? effectiveBranchPriceKgs
            : isBranchPurchase
              ? applyPricingRounding(effectiveBranchPriceKgs, rounding)
              : effectiveBranchPriceKgs;
        if (isBranchPurchase && !isHqBranchTransfer) {
          calculationSteps.push({
            step: 'finalBranchRoundup',
            valueKgs: resolvedPriceKgs,
            detail: 'ROUNDUP(-1)',
          });
        }
        break;
      case PricingEnginePriceType.RETAIL_MINIMUM:
        resolvedPriceKgs = calculateRetailPriceKgs(
          effectiveBranchPriceKgs,
          Number(pricingProduct.minimumSellingMarkupPercent ?? 0),
          rounding,
        );
        break;
      case PricingEnginePriceType.RETAIL_RECOMMENDED:
        resolvedPriceKgs = calculateRetailPriceKgs(
          effectiveBranchPriceKgs,
          Number(pricingProduct.recommendedRetailMarkupPercent ?? 0),
          rounding,
        );
        break;
      case PricingEnginePriceType.RETAIL_MAXIMUM: {
        const retailPolicy = resolveRetailMaximumPolicy(pricingProduct, category);
        const retailMarkup = resolveRetailMaximumMarkup(pricingProduct, category);
        resolvedPriceKgs =
          isMaximumPolicyActive(retailPolicy) && retailMarkup > 0
            ? calculateRetailPriceKgs(effectiveBranchPriceKgs, retailMarkup, rounding)
            : calculateRetailPriceKgs(
                effectiveBranchPriceKgs,
                Number(pricingProduct.recommendedRetailMarkupPercent ?? 0),
                rounding,
              );
        break;
      }
      case PricingEnginePriceType.MASTER_MINIMUM:
        // Master floor uses the HQ minimum allowed selling price.
        resolvedPriceKgs = calculateRetailPriceKgs(
          effectiveBranchPriceKgs,
          Number(pricingProduct.minimumSellingMarkupPercent ?? 0),
          rounding,
        );
        break;
      case PricingEnginePriceType.MASTER_RECOMMENDED:
      case PricingEnginePriceType.MASTER_MAXIMUM: {
        const configuredMasterMarkup = Number(pricingProduct.masterMarkupPercent ?? 0);
        const retailMarkup = Number(pricingProduct.recommendedRetailMarkupPercent ?? 0);
        const wholesaleMarkup = Number(pricingProduct.wholesaleMarkupPercent ?? 0);
        const masterMarkup =
          configuredMasterMarkup > 0
            ? configuredMasterMarkup
            : retailMarkup > wholesaleMarkup
              ? (retailMarkup + wholesaleMarkup) / 2
              : wholesaleMarkup;
        resolvedPriceKgs = calculateMasterPriceKgs(
          effectiveBranchPriceKgs,
          masterMarkup,
          rounding,
        );
        break;
      }
      case PricingEnginePriceType.WHOLESALE_MINIMUM:
        resolvedPriceKgs = calculateWholesalePriceKgs(
          effectiveBranchPriceKgs,
          Number(pricingProduct.minimumWholesaleMarkupPercent ?? 0),
          rounding,
        );
        break;
      case PricingEnginePriceType.WHOLESALE_RECOMMENDED:
        resolvedPriceKgs = calculateWholesalePriceKgs(
          effectiveBranchPriceKgs,
          Number(pricingProduct.wholesaleMarkupPercent ?? 0),
          rounding,
        );
        break;
      case PricingEnginePriceType.WHOLESALE_MAXIMUM: {
        const wholesalePolicy = resolveWholesaleMaximumPolicy(pricingProduct, category);
        const wholesaleMarkup = resolveWholesaleMaximumMarkup(pricingProduct, category);
        resolvedPriceKgs =
          isMaximumPolicyActive(wholesalePolicy) && wholesaleMarkup > 0
            ? calculateWholesalePriceKgs(effectiveBranchPriceKgs, wholesaleMarkup, rounding)
            : calculateWholesalePriceKgs(
                effectiveBranchPriceKgs,
                Number(pricingProduct.wholesaleMarkupPercent ?? 0),
                rounding,
              );
        break;
      }
    }

    calculationSteps.push({ step: 'finalPrice', valueKgs: resolvedPriceKgs, detail: priceType });

    return {
      resolvedPriceKgs: costAvailable ? resolvedPriceKgs : 0,
      pricingPolicyVersionId: versionId,
      pricingProfileId: profileId,
      pricingProfileName: profileForRules?.name ?? branch.priceProfile?.name ?? null,
      baseCostKgs,
      costAvailable,
      costSource: cost.source,
      baseFranchiseMarkupPercent,
      baseBranchPriceKgs: costAvailable
        ? isBranchPurchase && !isHqBranchTransfer
          ? applyPricingRounding(baseBranchPriceRaw, rounding)
          : baseBranchPriceKgs
        : 0,
      effectiveBranchPriceKgs: costAvailable ? effectiveBranchPriceKgs : 0,
      appliedRuleType,
      appliedRuleId,
      appliedAdjustmentMode,
      appliedAdjustmentValue,
      categoryRulePercent,
      productRuleMode,
      productRuleValue,
      pricingProfileDiscountPercent,
      temporaryOverrideApplied,
      calculationSteps,
    };
  }

  async explainPrice(input: PricingEngineResolveInput): Promise<PriceExplanationResult> {
    const priceType = input.priceType ?? PricingEnginePriceType.BRANCH_PURCHASE;
    await this.fifoService.syncFifoBatchesFromHqStockMovements();
    const result = await this.resolvePrice(input);
    const currency = await this.settingsService.getCurrency().catch(() => 'KGS');
    return buildPriceExplanation(result, {
      productId: input.productId,
      branchId: input.branchId,
      priceType,
      currency,
    });
  }

  async getActiveVersionId(): Promise<string | null> {
    const active = await this.getActiveVersion();
    return active?.id ?? null;
  }

  async getActiveVersion(): Promise<{ id: string; versionNumber: number } | null> {
    const active = await this.prisma.pricingPolicyVersion.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: { versionNumber: 'desc' },
      select: { id: true, versionNumber: true },
    });
    return active ?? null;
  }

  private async resolveHqCatalogProduct(product: {
    id: string;
    sku: string;
    branchId: string | null;
    categoryId: string | null;
    hqBranchWholesaleMarkupPercent: { toString(): string } | number;
    minimumSellingMarkupPercent: { toString(): string } | number;
    recommendedRetailMarkupPercent: { toString(): string } | number;
    minimumWholesaleMarkupPercent: { toString(): string } | number;
    wholesaleMarkupPercent: { toString(): string } | number;
    masterMarkupPercent?: { toString(): string } | number;
    retailMaximumPolicySource: import('@prisma/client').MaximumPricePolicySource;
    wholesaleMaximumPolicySource: import('@prisma/client').MaximumPricePolicySource;
    retailMaximumPolicy: import('@prisma/client').MaximumPricePolicy;
    wholesaleMaximumPolicy: import('@prisma/client').MaximumPricePolicy;
    maximumRetailMarkupPercent: { toString(): string } | number;
    maximumWholesaleMarkupPercent: { toString(): string } | number;
    productCategory: {
      defaultRetailMaximumPolicy: import('@prisma/client').MaximumPricePolicy;
      defaultWholesaleMaximumPolicy: import('@prisma/client').MaximumPricePolicy;
      defaultRetailMaximumMarkupPercent: { toString(): string } | number;
      defaultWholesaleMaximumMarkupPercent: { toString(): string } | number;
    } | null;
  }) {
    const hqBranch = await this.prisma.branch.findFirst({
      where: { code: HQ_CATALOG_BRANCH_CODE },
      select: { id: true },
    });
    if (!hqBranch) return null;
    if (product.branchId === hqBranch.id) return product;

    const sku = product.sku?.trim();
    if (!sku) return null;

    return this.prisma.product.findFirst({
      where: {
        sku,
        branchId: hqBranch.id,
        deletedAt: null,
        isActive: true,
      },
      include: { productCategory: true },
    });
  }

  private async findActiveTempOverride(
    branchId: string,
    productIds: string[],
    asOf: Date,
    versionId: string | null,
  ): Promise<{ id: string; mode: PricingAdjustmentMode; value: number } | null> {
    const override = await this.prisma.productPriceOverride.findFirst({
      where: {
        branchId,
        productId: { in: productIds },
        status: { in: ['ACTIVE', 'APPROVED'] },
        startDate: { lte: asOf },
        endDate: { gte: asOf },
        ...(versionId
          ? { OR: [{ pricingPolicyVersionId: versionId }, { pricingPolicyVersionId: null }] }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!override) return null;

    const mode = (override.adjustmentMode ?? 'FIXED_SELLING_PRICE') as PricingAdjustmentMode;
    const value =
      override.adjustmentValue != null
        ? Number(override.adjustmentValue)
        : Number(override.overridePriceKgs);

    return { id: override.id, mode, value };
  }
}
