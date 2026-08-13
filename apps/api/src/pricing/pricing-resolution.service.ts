import { Injectable } from '@nestjs/common';
import { BranchType, PricingEnginePriceType, Prisma } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { BranchPriceResolverService } from './branch-price-resolver.service';
import { toPriceFreezePayload, type PriceFreezePayload } from './pricing-engine.types';
import { PricingEngineService } from './pricing-engine.service';
import {
  isCustomerSalePriceType,
  SHARED_FRANCHISE_PRICING_BRANCH_WHERE,
} from './shared-franchise-pricing-branch.util';

@Injectable()
export class PricingResolutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingEngine: PricingEngineService,
    private readonly branchPriceResolver: BranchPriceResolverService,
  ) {}

  async resolveBranchProductPrice(
    branchId: string,
    productId: string,
    _tx?: Prisma.TransactionClient,
  ) {
    const result = await this.pricingEngine.resolvePrice({ productId, branchId });
    return {
      priceKgs: result.resolvedPriceKgs,
      source: result.appliedRuleType,
      baseFranchisePriceKgs: result.baseBranchPriceKgs,
      freeze: toPriceFreezePayload(result),
    };
  }

  async resolveBranchProductUnitPrice(
    branchId: string,
    productId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const resolved = await this.resolveBranchProductPrice(branchId, productId, tx);
    return resolved.priceKgs;
  }

  /**
   * Franchise branch order price via PricingEngineService (profile rules, overrides, simulation parity).
   */
  async resolveBranchOrderPrice(
    branchId: string,
    productId: string,
    options?: { warehouseId?: string },
  ): Promise<PriceFreezePayload | null> {
    const freeze = await this.branchPriceResolver.resolveBranchPriceFreeze(productId, {
      branchId,
      warehouseId: options?.warehouseId,
    });
    if (!freeze) return null;
    return {
      pricingPolicyVersionId: freeze.pricingPolicyVersionId,
      pricingProfileId: freeze.pricingProfileId,
      resolvedPriceKgs: freeze.resolvedPriceKgs,
      baseCostKgs: freeze.baseCostKgs,
      baseBranchPriceKgs: freeze.baseBranchPriceKgs,
      appliedRuleType: freeze.appliedRuleType,
      appliedRuleId: freeze.appliedRuleId,
      appliedAdjustmentMode: freeze.appliedAdjustmentMode,
      appliedAdjustmentValue: freeze.appliedAdjustmentValue,
      priceResolvedAt: freeze.priceResolvedAt,
    };
  }

  async resolveWithFreeze(
    branchId: string,
    productId: string,
    options?: {
      priceType?: PricingEnginePriceType;
      documentDate?: Date;
      pricingPolicyVersionId?: string | null;
      auditUser?: AuthUser | null;
      auditEntity?: string;
      auditEntityId?: string;
      /** When true, branch purchase uses FIFO+markup resolver instead of profile-adjusted engine price. */
      useBranchOrderPrice?: boolean;
      warehouseId?: string;
    },
  ): Promise<PriceFreezePayload> {
    if (options?.useBranchOrderPrice) {
      const branchFreeze = await this.resolveBranchOrderPrice(branchId, productId, {
        warehouseId: options?.warehouseId,
      });
      if (branchFreeze) {
        if (options?.auditUser) {
          await this.auditPriceResolution(options.auditUser, branchFreeze, {
            branchId,
            productId,
            priceType: PricingEnginePriceType.BRANCH_PURCHASE,
            entity: options.auditEntity,
            entityId: options.auditEntityId,
          });
        }
        return branchFreeze;
      }
    }

    const result = await this.pricingEngine.resolvePrice({
      productId,
      branchId: await this.resolvePricingBranchId(branchId, options?.priceType),
      priceType: options?.priceType,
      documentDate: options?.documentDate,
      pricingPolicyVersionId: options?.pricingPolicyVersionId,
    });
    const freeze = toPriceFreezePayload(result);

    if (options?.auditUser) {
      await this.auditPriceResolution(options.auditUser, freeze, {
        branchId,
        productId,
        priceType: options.priceType ?? PricingEnginePriceType.BRANCH_PURCHASE,
        entity: options.auditEntity,
        entityId: options.auditEntityId,
      });
    }

    return freeze;
  }

  /**
   * HQ Branch customer sales use the same shared franchise-network price resolver
   * as franchise branches (reference branch profile + centralized policy).
   * Inventory receipt / branch purchase stays on the operating branch id.
   */
  async resolvePricingBranchId(
    operatingBranchId: string,
    priceType?: PricingEnginePriceType,
  ): Promise<string> {
    if (!isCustomerSalePriceType(priceType)) {
      return operatingBranchId;
    }

    const operatingBranch = await this.prisma.branch.findFirst({
      where: { id: operatingBranchId, deletedAt: null },
      select: { branchType: true },
    });
    if (operatingBranch?.branchType !== BranchType.HQ_BRANCH) {
      return operatingBranchId;
    }

    const referenceBranch = await this.findSharedFranchisePricingBranch();
    return referenceBranch?.id ?? operatingBranchId;
  }

  private async findSharedFranchisePricingBranch() {
    return this.prisma.branch.findFirst({
      where: SHARED_FRANCHISE_PRICING_BRANCH_WHERE,
      orderBy: { name: 'asc' },
      select: { id: true },
    });
  }

  private async auditPriceResolution(
    user: AuthUser,
    freeze: PriceFreezePayload,
    meta: {
      branchId: string;
      productId: string;
      priceType: PricingEnginePriceType;
      entity?: string;
      entityId?: string;
    },
  ) {
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: 'PRICE_RESOLVED',
        entity: meta.entity ?? 'Product',
        entityId: meta.entityId ?? meta.productId,
        metadata: {
          userId: user.id,
          role: user.role,
          branchId: meta.branchId,
          productId: meta.productId,
          priceType: meta.priceType,
          pricingPolicyVersionId: freeze.pricingPolicyVersionId,
          pricingProfileId: freeze.pricingProfileId,
          appliedRuleType: freeze.appliedRuleType,
          appliedRuleId: freeze.appliedRuleId,
          appliedAdjustmentMode: freeze.appliedAdjustmentMode,
          appliedAdjustmentValue: freeze.appliedAdjustmentValue,
          resolvedPriceKgs: freeze.resolvedPriceKgs,
          baseCostKgs: freeze.baseCostKgs,
          baseBranchPriceKgs: freeze.baseBranchPriceKgs,
          resolutionSource: freeze.appliedRuleType,
          priceResolvedAt: freeze.priceResolvedAt.toISOString(),
          timestamp: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    });
  }
}
