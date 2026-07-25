import { Injectable, Logger } from '@nestjs/common';
import { PricingAppliedRuleType, PricingEnginePriceType, Prisma, type PricingAdjustmentMode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PricingEngineService } from './pricing-engine.service';
import { PricingFifoService } from './pricing-fifo.service';
import { resolveDefaultPriceProfileId } from './pricing-profile-defaults.util';

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
  costPrice: number;
  markupPercent: number;
  markupAmount: number;
  branchPrice: number;
  fifoBatchId: string | null;
  pricingPolicyVersionId: string | null;
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
   * Single source of truth for branch-sale order price — delegates to PricingEngineService
   * (same pipeline as Симуляция and HQ Sales branch orders).
   */
  async resolveBranchPrice(
    productId: string,
    options?: { warehouseId?: string; branchId?: string },
    tx?: PrismaTx,
  ): Promise<BranchPriceResolution> {
    const client = tx ?? this.prisma;
    const branchId = options?.branchId;

    if (!branchId) {
      return this.unresolvedResolution('NO_BRANCH_PRICE_PROFILE', null, null);
    }

    const pricingPolicyVersionId = await this.pricingEngine.getActiveVersionId();
    if (!pricingPolicyVersionId) {
      const fifo = await this.fifoService.getOldestActiveHqFifoCost(
        {
          productId,
          ...(options?.warehouseId ? { warehouseId: options.warehouseId } : {}),
        },
        tx,
      );
      return {
        costPrice: fifo.available ? fifo.costPriceKgs : 0,
        markupPercent: 0,
        markupAmount: 0,
        branchPrice: 0,
        fifoBatchId: fifo.batchId,
        pricingPolicyVersionId: null,
        branchPriceProfileId: null,
        costAvailable: Boolean(fifo.available && fifo.costPriceKgs > 0),
        markupConfigured: false,
        priceConfigured: false,
        priceMissingReason: 'NO_ACTIVE_PRICING_VERSION',
        pricingSource: null,
        sourceRuleType: null,
        sourceRuleId: null,
        costSource: fifo.source,
        appliedRuleType: null,
        appliedAdjustmentMode: null,
        appliedAdjustmentValue: null,
      };
    }

    const branch = await client.branch.findFirst({
      where: { id: branchId, deletedAt: null },
      select: { id: true, branchType: true, priceProfileId: true },
    });
    if (!branch) {
      return this.unresolvedResolution('NO_BRANCH_PRICE_PROFILE', pricingPolicyVersionId, null);
    }

    const effectiveProfileId =
      branch.priceProfileId ?? (await resolveDefaultPriceProfileId(client, branch.branchType));
    if (!effectiveProfileId && branch.branchType !== 'HQ_BRANCH') {
      return this.unresolvedResolution('NO_BRANCH_PRICE_PROFILE', pricingPolicyVersionId, null);
    }

    try {
      const engineResult = await this.pricingEngine.resolvePrice({
        productId,
        branchId,
        priceType: PricingEnginePriceType.BRANCH_PURCHASE,
        pricingPolicyVersionId,
      });

      const costPrice = engineResult.baseCostKgs;
      const branchPrice = engineResult.resolvedPriceKgs;
      const markupAmount = roundMoney(branchPrice - costPrice);
      const markupPercent = deriveEffectiveMarkupPercent(costPrice, branchPrice);
      const pricingSource = this.mapAppliedRuleToPricingSource(engineResult.appliedRuleType);
      const priceConfigured = Boolean(
        engineResult.costAvailable && pricingPolicyVersionId && branchPrice > 0,
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
        costPrice,
        markupPercent,
        markupAmount,
        branchPrice,
        fifoBatchId: fifo.batchId,
        pricingPolicyVersionId: engineResult.pricingPolicyVersionId ?? pricingPolicyVersionId,
        branchPriceProfileId: engineResult.pricingProfileId ?? effectiveProfileId,
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
      return this.unresolvedResolution('NO_BRANCH_MARKUP_RULE', pricingPolicyVersionId, effectiveProfileId);
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
      resolvedPriceKgs: resolution.branchPrice,
      baseCostKgs: resolution.costPrice,
      baseBranchPriceKgs: resolution.branchPrice,
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
    reason: BranchPriceMissingReason,
    pricingPolicyVersionId: string | null,
    branchPriceProfileId: string | null,
  ): BranchPriceResolution {
    return {
      costPrice: 0,
      markupPercent: 0,
      markupAmount: 0,
      branchPrice: 0,
      fifoBatchId: null,
      pricingPolicyVersionId,
      branchPriceProfileId,
      costAvailable: false,
      markupConfigured: false,
      priceConfigured: false,
      priceMissingReason: reason,
      pricingSource: null,
      sourceRuleType: null,
      sourceRuleId: null,
      costSource: 'NO_FIFO_LAYER',
      appliedRuleType: null,
      appliedAdjustmentMode: null,
      appliedAdjustmentValue: null,
    };
  }
}
