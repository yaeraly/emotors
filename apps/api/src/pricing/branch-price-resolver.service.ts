import { Injectable } from '@nestjs/common';
import { PricingAppliedRuleType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { HQ_CATALOG_BRANCH_CODE } from '../warehouse/warehouse.util';
import {
  calculateBranchPriceFromFifoCost,
  DEFAULT_PRICING_ROUNDING,
  type BranchTypeForPricing,
} from './pricing-calculator.util';
import { PricingEngineService } from './pricing-engine.service';
import { PricingFifoService } from './pricing-fifo.service';
import { PricingSettingsService } from './pricing-settings.service';

type PrismaTx = Prisma.TransactionClient;

export type BranchPriceMissingReason =
  | 'NO_FIFO_COST'
  | 'NO_BRANCH_MARKUP'
  | 'NO_ACTIVE_PRICING_VERSION'
  | null;

export type BranchPriceSourceRuleType =
  | 'PRODUCT_BRANCH_MARKUP'
  | 'CATEGORY_BRANCH_MARKUP'
  | 'DEFAULT_BRANCH_MARKUP'
  | 'HQ_BRANCH_COST'
  | null;

export type BranchPriceResolution = {
  costPrice: number;
  markupPercent: number;
  markupAmount: number;
  branchPrice: number;
  fifoBatchId: string | null;
  pricingPolicyVersionId: string | null;
  costAvailable: boolean;
  markupConfigured: boolean;
  priceConfigured: boolean;
  priceMissingReason: BranchPriceMissingReason;
  sourceRuleType: BranchPriceSourceRuleType;
  sourceRuleId: string | null;
  costSource: string;
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
  sourceRuleType: BranchPriceSourceRuleType;
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizePercent(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

@Injectable()
export class BranchPriceResolverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fifoService: PricingFifoService,
    private readonly settingsService: PricingSettingsService,
    private readonly pricingEngine: PricingEngineService,
  ) {}

  /**
   * Single source of truth for franchise branch-sale price:
   * oldest active HQ FIFO landed cost + branch-sale markup (product → category → default).
   */
  async resolveBranchPrice(
    productId: string,
    options?: { warehouseId?: string; branchId?: string },
    tx?: PrismaTx,
  ): Promise<BranchPriceResolution> {
    const client = tx ?? this.prisma;
    const rounding = await this.settingsService.getRoundingConfig().catch(() => DEFAULT_PRICING_ROUNDING);
    const pricingPolicyVersionId = await this.resolveEffectivePricingPolicyVersionId(client);

    const catalogProduct = await this.resolveHqCatalogProduct(client, productId);
    if (!catalogProduct) {
      return this.unresolvedResolution('NO_FIFO_COST', pricingPolicyVersionId);
    }

    const fifo = await this.fifoService.getOldestActiveHqFifoCost(
      {
        productId: catalogProduct.id,
        ...(options?.warehouseId ? { warehouseId: options.warehouseId } : {}),
      },
      tx,
    );
    const costAvailable = Boolean(fifo.available && fifo.costPriceKgs > 0);
    if (!costAvailable) {
      return {
        costPrice: 0,
        markupPercent: 0,
        markupAmount: 0,
        branchPrice: 0,
        fifoBatchId: fifo.batchId,
        pricingPolicyVersionId,
        costAvailable: false,
        markupConfigured: false,
        priceConfigured: false,
        priceMissingReason: 'NO_FIFO_COST',
        sourceRuleType: null,
        sourceRuleId: null,
        costSource: fifo.source,
      };
    }

    if (!pricingPolicyVersionId) {
      return {
        costPrice: fifo.costPriceKgs,
        markupPercent: 0,
        markupAmount: 0,
        branchPrice: 0,
        fifoBatchId: fifo.batchId,
        pricingPolicyVersionId: null,
        costAvailable: true,
        markupConfigured: false,
        priceConfigured: false,
        priceMissingReason: 'NO_ACTIVE_PRICING_VERSION',
        sourceRuleType: null,
        sourceRuleId: null,
        costSource: fifo.source,
      };
    }

    const markupResolution = await this.resolveBranchSaleMarkupPercent(
      client,
      catalogProduct.id,
      options?.branchId,
    );

    if (markupResolution.branchType === 'HQ_BRANCH') {
      const branchPrice = roundMoney(fifo.costPriceKgs);
      return {
        costPrice: fifo.costPriceKgs,
        markupPercent: 0,
        markupAmount: 0,
        branchPrice,
        fifoBatchId: fifo.batchId,
        pricingPolicyVersionId,
        costAvailable: true,
        markupConfigured: true,
        priceConfigured: true,
        priceMissingReason: null,
        sourceRuleType: 'HQ_BRANCH_COST',
        sourceRuleId: markupResolution.branchId,
        costSource: fifo.source,
      };
    }

    const markupPercent = markupResolution.markupPercent;
    const markupConfigured = markupPercent > 0;
    if (!markupConfigured) {
      return {
        costPrice: fifo.costPriceKgs,
        markupPercent: 0,
        markupAmount: 0,
        branchPrice: 0,
        fifoBatchId: fifo.batchId,
        pricingPolicyVersionId,
        costAvailable: true,
        markupConfigured: false,
        priceConfigured: false,
        priceMissingReason: 'NO_BRANCH_MARKUP',
        sourceRuleType: null,
        sourceRuleId: null,
        costSource: fifo.source,
      };
    }

    const branchPrice = calculateBranchPriceFromFifoCost(fifo.costPriceKgs, markupPercent, rounding);
    const markupAmount = roundMoney(branchPrice - fifo.costPriceKgs);

    return {
      costPrice: fifo.costPriceKgs,
      markupPercent,
      markupAmount,
      branchPrice,
      fifoBatchId: fifo.batchId,
      pricingPolicyVersionId,
      costAvailable: true,
      markupConfigured: true,
      priceConfigured: branchPrice > 0,
      priceMissingReason: branchPrice > 0 ? null : 'NO_BRANCH_MARKUP',
      sourceRuleType: markupResolution.sourceRuleType,
      sourceRuleId: markupResolution.sourceRuleId,
      costSource: fifo.source,
    };
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

    let pricingProfileId = options?.pricingProfileId ?? null;
    if (!pricingProfileId && options?.branchId) {
      const branch = await (tx ?? this.prisma).branch.findFirst({
        where: { id: options.branchId, deletedAt: null },
        select: { priceProfileId: true },
      });
      pricingProfileId = branch?.priceProfileId ?? null;
    }

    return {
      pricingPolicyVersionId: resolution.pricingPolicyVersionId,
      pricingProfileId,
      resolvedPriceKgs: resolution.branchPrice,
      baseCostKgs: resolution.costPrice,
      baseBranchPriceKgs: resolution.branchPrice,
      appliedRuleType: this.mapSourceRuleToAppliedRuleType(resolution.sourceRuleType),
      appliedRuleId: resolution.sourceRuleId,
      appliedAdjustmentMode: null,
      appliedAdjustmentValue: resolution.markupPercent,
      priceResolvedAt: new Date(),
      fifoBatchId: resolution.fifoBatchId,
      priceConfigured: resolution.priceConfigured,
      priceMissingReason: resolution.priceMissingReason,
      sourceRuleType: resolution.sourceRuleType,
    };
  }

  private unresolvedResolution(
    reason: BranchPriceMissingReason,
    pricingPolicyVersionId: string | null,
  ): BranchPriceResolution {
    return {
      costPrice: 0,
      markupPercent: 0,
      markupAmount: 0,
      branchPrice: 0,
      fifoBatchId: null,
      pricingPolicyVersionId,
      costAvailable: false,
      markupConfigured: false,
      priceConfigured: false,
      priceMissingReason: reason,
      sourceRuleType: null,
      sourceRuleId: null,
      costSource: 'NO_FIFO_LAYER',
    };
  }

  private mapSourceRuleToAppliedRuleType(sourceRuleType: BranchPriceSourceRuleType): PricingAppliedRuleType {
    switch (sourceRuleType) {
      case 'CATEGORY_BRANCH_MARKUP':
        return PricingAppliedRuleType.CATEGORY_RULE;
      case 'PRODUCT_BRANCH_MARKUP':
      case 'DEFAULT_BRANCH_MARKUP':
      case 'HQ_BRANCH_COST':
        return PricingAppliedRuleType.BASE_FRANCHISE;
      default:
        return PricingAppliedRuleType.BASE_FRANCHISE;
    }
  }

  private async resolveBranchSaleMarkupPercent(
    client: PrismaTx | PrismaService,
    catalogProductId: string,
    branchId?: string,
  ): Promise<{
    markupPercent: number;
    sourceRuleType: BranchPriceSourceRuleType;
    sourceRuleId: string | null;
    branchType: BranchTypeForPricing;
    branchId: string | null;
  }> {
    const product = await client.product.findFirst({
      where: { id: catalogProductId, deletedAt: null },
      select: {
        id: true,
        hqBranchWholesaleMarkupPercent: true,
        productCategory: {
          select: { id: true, hqBranchWholesaleMarkupPercent: true },
        },
      },
    });

    const branch = branchId
      ? await client.branch.findFirst({
          where: { id: branchId, deletedAt: null },
          select: {
            id: true,
            branchType: true,
            hqToBranchMarkupPercent: true,
            priceProfileId: true,
            priceProfile: { select: { id: true, defaultHqMarkupPercent: true } },
          },
        })
      : null;

    const branchType = (branch?.branchType ?? 'FRANCHISE') as BranchTypeForPricing;
    if (branchType === 'HQ_BRANCH') {
      return {
        markupPercent: 0,
        sourceRuleType: 'HQ_BRANCH_COST',
        sourceRuleId: branch?.id ?? null,
        branchType,
        branchId: branch?.id ?? null,
      };
    }

    const productMarkup = normalizePercent(product?.hqBranchWholesaleMarkupPercent);
    if (productMarkup > 0) {
      return {
        markupPercent: productMarkup,
        sourceRuleType: 'PRODUCT_BRANCH_MARKUP',
        sourceRuleId: product?.id ?? null,
        branchType,
        branchId: branch?.id ?? null,
      };
    }

    const categoryMarkup = normalizePercent(product?.productCategory?.hqBranchWholesaleMarkupPercent);
    if (categoryMarkup > 0) {
      return {
        markupPercent: categoryMarkup,
        sourceRuleType: 'CATEGORY_BRANCH_MARKUP',
        sourceRuleId: product?.productCategory?.id ?? null,
        branchType,
        branchId: branch?.id ?? null,
      };
    }

    const branchMarkup = normalizePercent(branch?.hqToBranchMarkupPercent);
    if (branchMarkup > 0) {
      return {
        markupPercent: branchMarkup,
        sourceRuleType: 'DEFAULT_BRANCH_MARKUP',
        sourceRuleId: branch?.id ?? null,
        branchType,
        branchId: branch?.id ?? null,
      };
    }

    const profileMarkup = normalizePercent(branch?.priceProfile?.defaultHqMarkupPercent);
    if (profileMarkup > 0) {
      return {
        markupPercent: profileMarkup,
        sourceRuleType: 'DEFAULT_BRANCH_MARKUP',
        sourceRuleId: branch?.priceProfile?.id ?? branch?.priceProfileId ?? null,
        branchType,
        branchId: branch?.id ?? null,
      };
    }

    const settingsRow = await client.pricingMasterSettings.findFirst({
      where: { singletonKey: 'DEFAULT' },
      select: { defaultMinimumMarkup: true },
    });
    const settingsMarkup = normalizePercent(settingsRow?.defaultMinimumMarkup);
    if (settingsMarkup > 0) {
      return {
        markupPercent: settingsMarkup,
        sourceRuleType: 'DEFAULT_BRANCH_MARKUP',
        sourceRuleId: null,
        branchType,
        branchId: branch?.id ?? null,
      };
    }

    return {
      markupPercent: 0,
      sourceRuleType: null,
      sourceRuleId: null,
      branchType,
      branchId: branch?.id ?? null,
    };
  }

  private async resolveEffectivePricingPolicyVersionId(client: PrismaTx | PrismaService) {
    const active = await client.pricingPolicyVersion.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: { versionNumber: 'desc' },
      select: { id: true },
    });
    if (active?.id) return active.id;

    const approved = await client.pricingPolicyVersion.findFirst({
      where: { status: 'APPROVED' },
      orderBy: { versionNumber: 'desc' },
      select: { id: true },
    });
    return approved?.id ?? null;
  }

  private async resolveHqCatalogProduct(client: PrismaTx | PrismaService, productId: string) {
    const product = await client.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { id: true, sku: true, branchId: true },
    });
    if (!product) return null;

    const hqBranch = await client.branch.findFirst({
      where: { code: HQ_CATALOG_BRANCH_CODE },
      select: { id: true },
    });
    if (!hqBranch) return product;

    if (product.branchId === hqBranch.id) return product;

    const sku = product.sku?.trim();
    if (!sku) return product;

    const catalog = await client.product.findFirst({
      where: { sku, branchId: hqBranch.id, deletedAt: null },
      select: { id: true, sku: true, branchId: true },
    });
    return catalog ?? product;
  }
}
