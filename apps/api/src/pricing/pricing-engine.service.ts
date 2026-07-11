import { Injectable } from '@nestjs/common';
import { PricingAppliedRuleType, PricingEnginePriceType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  applyPricingAdjustment,
  calculateBaseBranchPriceKgs,
  calculateRetailPriceKgs,
  calculateWholesalePriceKgs,
  type BranchTypeForPricing,
  type PricingAdjustmentMode,
} from './pricing-calculator.util';
import { PricingEngineResolveInput, PricingEngineResolveResult } from './pricing-engine.types';
import { PricingFifoService } from './pricing-fifo.service';
import { PricingSchedulerService } from './pricing-scheduler.service';

@Injectable()
export class PricingEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fifoService: PricingFifoService,
    private readonly schedulerService: PricingSchedulerService,
  ) {}

  async resolvePrice(input: PricingEngineResolveInput): Promise<PricingEngineResolveResult> {
    await this.schedulerService.runDueActivations();

    const priceType = input.priceType ?? PricingEnginePriceType.BRANCH_PURCHASE;
    const asOf = input.documentDate ?? new Date();

    const branch = await this.prisma.branch.findFirst({
      where: { id: input.branchId, deletedAt: null },
      include: { priceProfile: true },
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

    const versionId =
      input.pricingPolicyVersionId ?? (await this.getActiveVersionId());

    const branchType = branch.branchType as BranchTypeForPricing;
    const cost = await this.fifoService.getLatestHqCostPrice(product.id);
    const baseCostKgs = cost.costPriceKgs;
    const baseFranchiseMarkupPercent = Number(product.hqBranchWholesaleMarkupPercent ?? 0);

    const baseBranchPriceKgs = calculateBaseBranchPriceKgs({
      costPriceKgs: baseCostKgs,
      markupPercent: baseFranchiseMarkupPercent,
      branchType,
    });

    const calculationSteps = [
      { step: 'cost', valueKgs: baseCostKgs },
      { step: 'baseBranch', valueKgs: baseBranchPriceKgs },
    ];

    let effectiveBranchPriceKgs = baseBranchPriceKgs;
    let appliedRuleType: PricingAppliedRuleType = PricingAppliedRuleType.BASE_FRANCHISE;
    let appliedRuleId: string | null = null;
    let appliedAdjustmentMode: PricingAdjustmentMode | null = null;
    let appliedAdjustmentValue: number | null = null;

    if (branchType === 'HQ_BRANCH') {
      effectiveBranchPriceKgs = baseCostKgs;
      appliedRuleType = PricingAppliedRuleType.HQ_COST;
      calculationSteps.push({ step: 'hqBranchExactCost', valueKgs: baseCostKgs });
    } else {
      const profileId = branch.priceProfileId;

      const tempOverride = await this.findActiveTempOverride(
        input.branchId,
        input.productId,
        asOf,
        versionId,
      );
      if (tempOverride) {
        effectiveBranchPriceKgs = applyPricingAdjustment(
          baseBranchPriceKgs,
          tempOverride.mode,
          tempOverride.value,
        );
        appliedRuleType = PricingAppliedRuleType.TEMP_OVERRIDE;
        appliedRuleId = tempOverride.id;
        appliedAdjustmentMode = tempOverride.mode;
        appliedAdjustmentValue = tempOverride.value;
        calculationSteps.push({ step: 'tempOverride', valueKgs: effectiveBranchPriceKgs });
      } else if (profileId && versionId) {
        const productRule = await this.prisma.pricingProductRule.findFirst({
          where: {
            pricingPolicyVersionId: versionId,
            pricingProfileId: profileId,
            productId: input.productId,
            status: 'ACTIVE',
          },
        });
        if (productRule) {
          const mode = productRule.adjustmentMode as PricingAdjustmentMode;
          const value = Number(productRule.adjustmentValue);
          effectiveBranchPriceKgs = applyPricingAdjustment(baseBranchPriceKgs, mode, value);
          appliedRuleType = PricingAppliedRuleType.PRODUCT_RULE;
          appliedRuleId = productRule.id;
          appliedAdjustmentMode = mode;
          appliedAdjustmentValue = value;
          calculationSteps.push({ step: 'productRule', valueKgs: effectiveBranchPriceKgs });
        } else if (product.categoryId) {
          const categoryRule = await this.prisma.pricingCategoryRule.findFirst({
            where: {
              pricingPolicyVersionId: versionId,
              pricingProfileId: profileId,
              categoryId: product.categoryId,
              status: 'ACTIVE',
            },
          });
          if (categoryRule) {
            const value = Number(categoryRule.discountPercent);
            effectiveBranchPriceKgs = applyPricingAdjustment(
              baseBranchPriceKgs,
              'PERCENTAGE_DISCOUNT',
              value,
            );
            appliedRuleType = PricingAppliedRuleType.CATEGORY_RULE;
            appliedRuleId = categoryRule.id;
            appliedAdjustmentMode = 'PERCENTAGE_DISCOUNT';
            appliedAdjustmentValue = value;
            calculationSteps.push({ step: 'categoryRule', valueKgs: effectiveBranchPriceKgs });
          }
        }
      }
    }

    let resolvedPriceKgs = effectiveBranchPriceKgs;
    switch (priceType) {
      case PricingEnginePriceType.BRANCH_PURCHASE:
        resolvedPriceKgs = effectiveBranchPriceKgs;
        break;
      case PricingEnginePriceType.RETAIL_MINIMUM:
        resolvedPriceKgs = calculateRetailPriceKgs(
          effectiveBranchPriceKgs,
          Number(product.minimumSellingMarkupPercent ?? 0),
        );
        break;
      case PricingEnginePriceType.RETAIL_RECOMMENDED:
        resolvedPriceKgs = calculateRetailPriceKgs(
          effectiveBranchPriceKgs,
          Number(product.recommendedRetailMarkupPercent ?? 0),
        );
        break;
      case PricingEnginePriceType.WHOLESALE_MINIMUM:
        resolvedPriceKgs = calculateWholesalePriceKgs(
          effectiveBranchPriceKgs,
          Number(product.minimumWholesaleMarkupPercent ?? 0),
        );
        break;
      case PricingEnginePriceType.WHOLESALE_RECOMMENDED:
        resolvedPriceKgs = calculateWholesalePriceKgs(
          effectiveBranchPriceKgs,
          Number(product.wholesaleMarkupPercent ?? 0),
        );
        break;
    }

    return {
      resolvedPriceKgs,
      pricingPolicyVersionId: versionId,
      pricingProfileId: branch.priceProfileId,
      baseCostKgs,
      baseBranchPriceKgs,
      effectiveBranchPriceKgs,
      appliedRuleType,
      appliedRuleId,
      appliedAdjustmentMode,
      appliedAdjustmentValue,
      calculationSteps,
    };
  }

  async getActiveVersionId(): Promise<string | null> {
    const active = await this.prisma.pricingPolicyVersion.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: { versionNumber: 'desc' },
      select: { id: true },
    });
    return active?.id ?? null;
  }

  private async findActiveTempOverride(
    branchId: string,
    productId: string,
    asOf: Date,
    versionId: string | null,
  ): Promise<{ id: string; mode: PricingAdjustmentMode; value: number } | null> {
    const override = await this.prisma.productPriceOverride.findFirst({
      where: {
        branchId,
        productId,
        status: { in: ['ACTIVE', 'APPROVED'] },
        startDate: { lte: asOf },
        endDate: { gte: asOf },
        ...(versionId ? { OR: [{ pricingPolicyVersionId: versionId }, { pricingPolicyVersionId: null }] } : {}),
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
