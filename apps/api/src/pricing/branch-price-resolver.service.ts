import { Injectable, Logger } from '@nestjs/common';
import { PricingAppliedRuleType, PricingEnginePriceType, Prisma, type PricingAdjustmentMode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PricingEngineService } from './pricing-engine.service';
import { PricingFifoService } from './pricing-fifo.service';

type PrismaTx = Prisma.TransactionClient;

export type BranchPriceMissingReason =
  | 'NO_FIFO_COST'
  | 'NO_BRANCH_MARKUP_RULE'
  | 'NO_ACTIVE_PRICING_VERSION'
  | 'NO_BRANCH_PRICE_PROFILE'
  | null;

export type BranchPricingSource =
  | 'BRANCH_PRODUCT_OVERRIDE'
  | 'BRANCH_PROFILE_PRODUCT_RULE'
  | 'BRANCH_PROFILE_CATEGORY_RULE'
  | 'CATEGORY_POLICY'
  | 'DEFAULT_BRANCH_SALE_RULE'
  | 'HQ_BRANCH_COST'
  | null;

export type BranchPriceResolution = {
  productId: string;
  branchId: string;
  costPrice: number;
  baseFranchiseMarkupPercent: number;
  baseFranchisePrice: number;
  markupPercent: number;
  markupAmount: number;
  branchPrice: number;
  finalBranchPrice: number;
  fifoBatchId: string | null;
  pricingPolicyVersionId: string | null;
  pricingPolicyVersionNumber: number | null;
  branchPriceProfileId: string | null;
  costAvailable: boolean;
  markupConfigured: boolean;
  priceConfigured: boolean;
  priceMissingReason: BranchPriceMissingReason;
  pricingSource: BranchPricingSource;
  sourceRuleType: BranchPricingSource;
  sourceRuleId: string | null;
  costSource: string;
  appliedRuleType: PricingAppliedRuleType | null;
  appliedAdjustmentMode: PricingAdjustmentMode | null;
  appliedAdjustmentValue: number | null;
};

export type BranchPriceFreezePayload = {
  pricingPolicyVersionId: string | null;
  pricingProfileId: string | null;
  resolvedPriceKgs: number;
  baseCostKgs: number;
  baseBranchPriceKgs: number;
  appliedRuleType: PricingAppliedRuleType;
  appliedRuleId: string | null;
  appliedAdjustmentMode: null;
  appliedAdjustmentValue: number;
  priceResolvedAt: Date;
  fifoBatchId: string | null;
  priceConfigured: boolean;
  priceMissingReason: BranchPriceMissingReason;
  pricingSource: BranchPricingSource;
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function deriveEffectiveMarkupPercent(costPrice: number, branchPrice: number) {
  if (costPrice <= 0 || branchPrice <= 0) return 0;
  return roundMoney(((branchPrice - costPrice) / costPrice) * 100);
}

@Injectable()
export class BranchPriceResolverService {
  private readonly logger = new Logger(BranchPriceResolverService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fifoService: PricingFifoService,
    private readonly pricingEngine: PricingEngineService,
  ) {}

  /**
   * Single source of truth for branch-sale price — delegates to PricingEngineService
   * (same pipeline as HQ Продажа филиалам, Симуляция, and Branch Sales orders).
   */
  async resolveBranchPrice(
    productId: string,
    options?: { warehouseId?: string; branchId?: string },
    tx?: PrismaTx,
  ): Promise<BranchPriceResolution> {
    const client = tx ?? this.prisma;
    const branchId = options?.branchId ?? '';

    if (!branchId) {
      return this.unresolvedResolution(productId, '', 'NO_BRANCH_PRICE_PROFILE', null, null);
    }

    const activeVersion = await this.pricingEngine.getActiveVersion();
    const pricingPolicyVersionId = activeVersion?.id ?? null;
    const pricingPolicyVersionNumber = activeVersion?.versionNumber ?? null;

    if (!pricingPolicyVersionId) {
      const fifo = await this.fifoService.getOldestActiveHqFifoCost(
        {
          productId,
          ...(options?.warehouseId ? { warehouseId: options.warehouseId } : {}),
        },
        tx,
      );
      return this.emptyResolution(productId, branchId, {
        costPrice: fifo.available ? fifo.costPriceKgs : 0,
        fifoBatchId: fifo.batchId,
        costAvailable: Boolean(fifo.available && fifo.costPriceKgs > 0),
        priceMissingReason: 'NO_ACTIVE_PRICING_VERSION',
        costSource: fifo.source,
      });
    }

    const branch = await client.branch.findFirst({
      where: { id: branchId, deletedAt: null },
      select: { id: true, branchType: true, priceProfileId: true },
    });
    if (!branch) {
      return this.unresolvedResolution(
        productId,
        branchId,
        'NO_BRANCH_PRICE_PROFILE',
        pricingPolicyVersionId,
        pricingPolicyVersionNumber,
      );
    }

    if (!branch.priceProfileId && branch.branchType !== 'HQ_BRANCH') {
      return this.unresolvedResolution(
        productId,
        branchId,
        'NO_BRANCH_PRICE_PROFILE',
        pricingPolicyVersionId,
        pricingPolicyVersionNumber,
      );
    }

    try {
      const engineResult = await this.pricingEngine.resolvePrice({
        productId,
        branchId,
        priceType: PricingEnginePriceType.BRANCH_PURCHASE,
        pricingPolicyVersionId,
      });

      const costPrice = engineResult.baseCostKgs;
      const baseFranchiseMarkupPercent = engineResult.baseFranchiseMarkupPercent;
      const baseFranchisePrice = engineResult.baseBranchPriceKgs;
      const finalBranchPrice = engineResult.resolvedPriceKgs;
      const markupAmount = roundMoney(finalBranchPrice - costPrice);
      const markupPercent = deriveEffectiveMarkupPercent(costPrice, finalBranchPrice);
      const pricingSource = this.mapAppliedRuleToPricingSource(engineResult.appliedRuleType);
      const priceConfigured = Boolean(
        engineResult.costAvailable && pricingPolicyVersionId && finalBranchPrice > 0,
      );

      let priceMissingReason: BranchPriceMissingReason = null;
      if (!engineResult.costAvailable) {
        priceMissingReason = 'NO_FIFO_COST';
      } else if (!priceConfigured) {
        priceMissingReason = 'NO_BRANCH_MARKUP_RULE';
      }

      const fifo = await this.fifoService.getOldestActiveHqFifoCost(
        {
          productId,
          ...(options?.warehouseId ? { warehouseId: options.warehouseId } : {}),
        },
        tx,
      );

      return {
        productId,
        branchId,
        costPrice,
        baseFranchiseMarkupPercent,
        baseFranchisePrice,
        markupPercent,
        markupAmount,
        branchPrice: finalBranchPrice,
        finalBranchPrice,
        fifoBatchId: fifo.batchId,
        pricingPolicyVersionId: engineResult.pricingPolicyVersionId ?? pricingPolicyVersionId,
        pricingPolicyVersionNumber,
        branchPriceProfileId: engineResult.pricingProfileId,
        costAvailable: engineResult.costAvailable,
        markupConfigured: priceConfigured,
        priceConfigured,
        priceMissingReason,
        pricingSource,
        sourceRuleType: pricingSource,
        sourceRuleId: engineResult.appliedRuleId,
        costSource: engineResult.costSource,
        appliedRuleType: engineResult.appliedRuleType,
        appliedAdjustmentMode: engineResult.appliedAdjustmentMode,
        appliedAdjustmentValue: engineResult.appliedAdjustmentValue,
      };
    } catch (error) {
      this.logger.warn(
        `Branch price resolution failed for product=${productId} branch=${branchId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return this.unresolvedResolution(
        productId,
        branchId,
        'NO_BRANCH_MARKUP_RULE',
        pricingPolicyVersionId,
        pricingPolicyVersionNumber,
        branch.priceProfileId,
      );
    }
  }

  async resolveBranchPriceFreeze(
    productId: string,
    options?: { warehouseId?: string; branchId?: string; pricingProfileId?: string | null },
    tx?: PrismaTx,
  ): Promise<BranchPriceFreezePayload | null> {
    const resolution = await this.resolveBranchPrice(productId, options, tx);
    if (!resolution.priceConfigured) {
      return null;
    }

    const pricingProfileId =
      options?.pricingProfileId ?? resolution.branchPriceProfileId ?? null;

    return {
      pricingPolicyVersionId: resolution.pricingPolicyVersionId,
      pricingProfileId,
      resolvedPriceKgs: resolution.finalBranchPrice,
      baseCostKgs: resolution.costPrice,
      baseBranchPriceKgs: resolution.baseFranchisePrice,
      appliedRuleType: resolution.appliedRuleType ?? PricingAppliedRuleType.BASE_FRANCHISE,
      appliedRuleId: resolution.sourceRuleId,
      appliedAdjustmentMode: null,
      appliedAdjustmentValue: resolution.appliedAdjustmentValue ?? resolution.markupPercent,
      priceResolvedAt: new Date(),
      fifoBatchId: resolution.fifoBatchId,
      priceConfigured: resolution.priceConfigured,
      priceMissingReason: resolution.priceMissingReason,
      pricingSource: resolution.pricingSource,
    };
  }

  private mapAppliedRuleToPricingSource(
    appliedRuleType: PricingAppliedRuleType,
  ): BranchPricingSource {
    switch (appliedRuleType) {
      case PricingAppliedRuleType.TEMP_OVERRIDE:
        return 'BRANCH_PRODUCT_OVERRIDE';
      case PricingAppliedRuleType.PRODUCT_RULE:
        return 'BRANCH_PROFILE_PRODUCT_RULE';
      case PricingAppliedRuleType.CATEGORY_RULE:
        return 'BRANCH_PROFILE_CATEGORY_RULE';
      case PricingAppliedRuleType.PRICING_PROFILE:
        return 'CATEGORY_POLICY';
      case PricingAppliedRuleType.HQ_COST:
        return 'HQ_BRANCH_COST';
      case PricingAppliedRuleType.BASE_FRANCHISE:
        return 'DEFAULT_BRANCH_SALE_RULE';
      default:
        return 'DEFAULT_BRANCH_SALE_RULE';
    }
  }

  private unresolvedResolution(
    productId: string,
    branchId: string,
    reason: BranchPriceMissingReason,
    pricingPolicyVersionId: string | null,
    pricingPolicyVersionNumber: number | null,
    branchPriceProfileId?: string | null,
  ): BranchPriceResolution {
    return this.emptyResolution(productId, branchId, {
      priceMissingReason: reason,
      pricingPolicyVersionId,
      pricingPolicyVersionNumber,
      branchPriceProfileId: branchPriceProfileId ?? null,
    });
  }

  private emptyResolution(
    productId: string,
    branchId: string,
    partial: Partial<BranchPriceResolution> & { priceMissingReason: BranchPriceMissingReason },
  ): BranchPriceResolution {
    return {
      productId,
      branchId,
      costPrice: partial.costPrice ?? 0,
      baseFranchiseMarkupPercent: 0,
      baseFranchisePrice: 0,
      markupPercent: 0,
      markupAmount: 0,
      branchPrice: 0,
      finalBranchPrice: 0,
      fifoBatchId: partial.fifoBatchId ?? null,
      pricingPolicyVersionId: partial.pricingPolicyVersionId ?? null,
      pricingPolicyVersionNumber: partial.pricingPolicyVersionNumber ?? null,
      branchPriceProfileId: partial.branchPriceProfileId ?? null,
      costAvailable: partial.costAvailable ?? false,
      markupConfigured: false,
      priceConfigured: false,
      priceMissingReason: partial.priceMissingReason,
      pricingSource: null,
      sourceRuleType: null,
      sourceRuleId: null,
      costSource: partial.costSource ?? 'NO_FIFO_LAYER',
      appliedRuleType: null,
      appliedAdjustmentMode: null,
      appliedAdjustmentValue: null,
    };
  }
}
