import { Injectable } from '@nestjs/common';
import { PricingAppliedRuleType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { HQ_CATALOG_BRANCH_CODE } from '../warehouse/warehouse.util';
import {
  calculateBranchPriceFromFifoCost,
  DEFAULT_PRICING_ROUNDING,
} from './pricing-calculator.util';
import { PricingEngineService } from './pricing-engine.service';
import { PricingFifoService } from './pricing-fifo.service';
import { PricingSettingsService } from './pricing-settings.service';

type PrismaTx = Prisma.TransactionClient;

export type BranchPriceResolution = {
  costPrice: number;
  markupPercent: number;
  branchPrice: number;
  fifoBatchId: string | null;
  pricingPolicyVersionId: string | null;
  costAvailable: boolean;
  markupConfigured: boolean;
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
};

@Injectable()
export class BranchPriceResolverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fifoService: PricingFifoService,
    private readonly settingsService: PricingSettingsService,
    private readonly pricingEngine: PricingEngineService,
  ) {}

  /**
   * Single source of truth: oldest active HQ FIFO landed cost + product HQ branch markup.
   * Does not apply pricing-profile discounts or temporary overrides.
   */
  async resolveBranchPrice(
    productId: string,
    options?: { warehouseId?: string; branchId?: string },
    tx?: PrismaTx,
  ): Promise<BranchPriceResolution | null> {
    const client = tx ?? this.prisma;
    const rounding = await this.settingsService.getRoundingConfig().catch(() => DEFAULT_PRICING_ROUNDING);

    const catalogProduct = await this.resolveHqCatalogProduct(client, productId);
    if (!catalogProduct) return null;

    const fifo = await this.fifoService.getOldestActiveHqFifoCost(
      {
        productId: catalogProduct.id,
        ...(options?.warehouseId ? { warehouseId: options.warehouseId } : {}),
      },
      tx,
    );
    const costAvailable = Boolean(fifo.available && fifo.costPriceKgs > 0);
    if (!costAvailable) return null;

    const markupPercent = await this.getActiveProductBranchMarkupPercent(client, catalogProduct.id, options?.branchId);
    const markupConfigured = markupPercent > 0;
    if (!markupConfigured) {
      return {
        costPrice: fifo.costPriceKgs,
        markupPercent: 0,
        branchPrice: 0,
        fifoBatchId: fifo.batchId,
        pricingPolicyVersionId: await this.pricingEngine.getActiveVersionId(),
        costAvailable: true,
        markupConfigured: false,
        costSource: fifo.source,
      };
    }

    const branchPrice = calculateBranchPriceFromFifoCost(fifo.costPriceKgs, markupPercent, rounding);
    return {
      costPrice: fifo.costPriceKgs,
      markupPercent,
      branchPrice,
      fifoBatchId: fifo.batchId,
      pricingPolicyVersionId: await this.pricingEngine.getActiveVersionId(),
      costAvailable: true,
      markupConfigured: true,
      costSource: fifo.source,
    };
  }

  async resolveBranchPriceFreeze(
    productId: string,
    options?: { warehouseId?: string; branchId?: string; pricingProfileId?: string | null },
    tx?: PrismaTx,
  ): Promise<BranchPriceFreezePayload | null> {
    const resolution = await this.resolveBranchPrice(productId, options, tx);
    if (!resolution || !resolution.costAvailable || !resolution.markupConfigured) {
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
      appliedRuleType: PricingAppliedRuleType.BASE_FRANCHISE,
      appliedRuleId: null,
      appliedAdjustmentMode: null,
      appliedAdjustmentValue: resolution.markupPercent,
      priceResolvedAt: new Date(),
      fifoBatchId: resolution.fifoBatchId,
    };
  }

  private async getActiveProductBranchMarkupPercent(
    client: PrismaTx | PrismaService,
    catalogProductId: string,
    branchId?: string,
  ) {
    if (branchId) {
      const branch = await client.branch.findFirst({
        where: { id: branchId, deletedAt: null },
        select: { branchType: true },
      });
      if (branch?.branchType === 'HQ_BRANCH') return 0;
    }

    const product = await client.product.findFirst({
      where: { id: catalogProductId, deletedAt: null },
      select: { hqBranchWholesaleMarkupPercent: true },
    });
    return Math.max(0, Number(product?.hqBranchWholesaleMarkupPercent ?? 0));
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
