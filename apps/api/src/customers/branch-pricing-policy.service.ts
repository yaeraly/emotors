import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CustomerLoyaltyCategory, CustomerType, LoyaltyPurchaseWindow, Prisma } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { toApiMoneyKgs } from '../common/authoritative-money.util';
import { PrismaService } from '../prisma/prisma.service';
import {
  canManagePricingPolicy,
  isBranchOwnerUser,
  isBranchSalesManagerUser,
} from '../rbac/rbac';
import {
  assertLoyaltyCategoryRanges,
  assertLoyaltyMarkupRange,
  calculateFinalSaleUnitPrice,
  DEFAULT_LOYALTY_CATEGORY_RANGES,
  DEFAULT_LOYALTY_MARKUPS,
  getLoyaltyMarkupPercent,
  rangesFromThresholds,
  type LoyaltyCategoryRangeConfig,
  type LoyaltyMarkupConfig,
  type LoyaltyProgramConfig,
} from './customer-loyalty.util';
import { LoyaltyProgramSettingsService } from './loyalty-program-settings.service';
import { PreviewBranchPricingDto } from './dto/preview-branch-pricing.dto';
import { UpdateBranchPricingPolicyDto } from './dto/update-branch-pricing-policy.dto';

export type EffectiveBranchPricingPolicy = LoyaltyCategoryRangeConfig &
  LoyaltyMarkupConfig & {
    branchId: string;
    purchaseWindow: LoyaltyPurchaseWindow;
    allowDowngrade: boolean;
    minAllowedMarkupPercent: number;
    maxAllowedMarkupPercent: number;
    branchCustomizationEnabled: boolean;
    source: 'BRANCH' | 'HQ_DEFAULT';
  };

@Injectable()
export class BranchPricingPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loyaltyProgramSettingsService: LoyaltyProgramSettingsService,
  ) {}

  async getEffectivePolicy(branchId: string): Promise<EffectiveBranchPricingPolicy> {
    const hq = await this.loyaltyProgramSettingsService.getConfig();
    const branchPolicy = await this.prisma.branchPricingPolicy.findUnique({
      where: { branchId },
    });

    if (!branchPolicy || !hq.branchCustomizationEnabled) {
      const ranges = rangesFromThresholds(hq);
      return {
        branchId,
        ...ranges,
        standardMarkupPercent: hq.standardMarkupPercent,
        silverMarkupPercent: hq.silverMarkupPercent,
        goldMarkupPercent: hq.goldMarkupPercent,
        vipMarkupPercent: hq.vipMarkupPercent,
        purchaseWindow: hq.purchaseWindow,
        allowDowngrade: hq.allowDowngrade,
        minAllowedMarkupPercent: hq.minAllowedMarkupPercent,
        maxAllowedMarkupPercent: hq.maxAllowedMarkupPercent,
        branchCustomizationEnabled: hq.branchCustomizationEnabled,
        source: 'HQ_DEFAULT',
      };
    }

    return {
      branchId,
      standardMinKgs: toApiMoneyKgs(branchPolicy.standardMinKgs),
      standardMaxKgs: toApiMoneyKgs(branchPolicy.standardMaxKgs),
      silverMinKgs: toApiMoneyKgs(branchPolicy.silverMinKgs),
      silverMaxKgs: toApiMoneyKgs(branchPolicy.silverMaxKgs),
      goldMinKgs: toApiMoneyKgs(branchPolicy.goldMinKgs),
      goldMaxKgs: toApiMoneyKgs(branchPolicy.goldMaxKgs),
      vipMinKgs: toApiMoneyKgs(branchPolicy.vipMinKgs),
      vipMaxKgs: branchPolicy.vipMaxKgs == null ? null : toApiMoneyKgs(branchPolicy.vipMaxKgs),
      standardMarkupPercent: Number(branchPolicy.standardMarkupPercent),
      silverMarkupPercent: Number(branchPolicy.silverMarkupPercent),
      goldMarkupPercent: Number(branchPolicy.goldMarkupPercent),
      vipMarkupPercent: Number(branchPolicy.vipMarkupPercent),
      purchaseWindow: hq.purchaseWindow,
      allowDowngrade: hq.allowDowngrade,
      minAllowedMarkupPercent: hq.minAllowedMarkupPercent,
      maxAllowedMarkupPercent: hq.maxAllowedMarkupPercent,
      branchCustomizationEnabled: hq.branchCustomizationEnabled,
      source: 'BRANCH',
    };
  }

  async getForBranchCeo(user: AuthUser) {
    this.assertBranchCeo(user);
    const hq = await this.loyaltyProgramSettingsService.getConfig();
    const policy = await this.getEffectivePolicy(user.branchId!);
    return {
      ...policy,
      hqDefaults: this.hqDefaultsPayload(hq),
      canEdit: hq.branchCustomizationEnabled,
    };
  }

  async updateForBranchCeo(user: AuthUser, dto: UpdateBranchPricingPolicyDto) {
    this.assertBranchCeo(user);
    const hq = await this.loyaltyProgramSettingsService.getConfig();
    if (!hq.branchCustomizationEnabled) {
      throw new ForbiddenException('HQ disabled branch pricing customization');
    }

    const ranges: LoyaltyCategoryRangeConfig = {
      standardMinKgs: Number(dto.standardMinKgs),
      standardMaxKgs: Number(dto.standardMaxKgs),
      silverMinKgs: Number(dto.silverMinKgs),
      silverMaxKgs: Number(dto.silverMaxKgs),
      goldMinKgs: Number(dto.goldMinKgs),
      goldMaxKgs: Number(dto.goldMaxKgs),
      vipMinKgs: Number(dto.vipMinKgs),
      vipMaxKgs: dto.vipMaxKgs == null || dto.vipMaxKgs === undefined ? null : Number(dto.vipMaxKgs),
    };
    const markups: LoyaltyMarkupConfig = {
      standardMarkupPercent: Number(dto.standardMarkupPercent),
      silverMarkupPercent: Number(dto.silverMarkupPercent),
      goldMarkupPercent: Number(dto.goldMarkupPercent),
      vipMarkupPercent: Number(dto.vipMarkupPercent),
    };

    try {
      assertLoyaltyCategoryRanges(ranges);
      assertLoyaltyMarkupRange(markups, {
        minAllowedMarkupPercent: hq.minAllowedMarkupPercent,
        maxAllowedMarkupPercent: hq.maxAllowedMarkupPercent,
      });
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid branch pricing policy',
      );
    }

    const existing = await this.prisma.branchPricingPolicy.findUnique({
      where: { branchId: user.branchId! },
    });

    const data = {
      ...ranges,
      ...markups,
      updatedById: user.id,
    };

    const updated = existing
      ? await this.prisma.branchPricingPolicy.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.branchPricingPolicy.create({
          data: {
            branchId: user.branchId!,
            ...data,
          },
        });

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: 'BRANCH_PRICING_POLICY_UPDATED',
        entity: 'BranchPricingPolicy',
        entityId: updated.id,
        metadata: {
          branchId: user.branchId,
          oldValue: existing
            ? {
                standardMinKgs: toApiMoneyKgs(existing.standardMinKgs),
                standardMaxKgs: toApiMoneyKgs(existing.standardMaxKgs),
                silverMinKgs: toApiMoneyKgs(existing.silverMinKgs),
                silverMaxKgs: toApiMoneyKgs(existing.silverMaxKgs),
                goldMinKgs: toApiMoneyKgs(existing.goldMinKgs),
                goldMaxKgs: toApiMoneyKgs(existing.goldMaxKgs),
                vipMinKgs: toApiMoneyKgs(existing.vipMinKgs),
                vipMaxKgs:
                  existing.vipMaxKgs == null ? null : toApiMoneyKgs(existing.vipMaxKgs),
                standardMarkupPercent: Number(existing.standardMarkupPercent),
                silverMarkupPercent: Number(existing.silverMarkupPercent),
                goldMarkupPercent: Number(existing.goldMarkupPercent),
                vipMarkupPercent: Number(existing.vipMarkupPercent),
              }
            : null,
          newValue: rangesFromRow(updated),
          userId: user.id,
          timestamp: new Date().toISOString(),
        },
      },
    });

    return this.getForBranchCeo(user);
  }

  async preview(user: AuthUser, dto: PreviewBranchPricingDto) {
    if (!isBranchOwnerUser(user) && !isBranchSalesManagerUser(user) && !canManagePricingPolicy(user)) {
      throw new ForbiddenException('Forbidden resource');
    }
    if (!user.branchId && !canManagePricingPolicy(user)) {
      throw new ForbiddenException('Branch is required');
    }

    const branchId = user.branchId!;
    const policy = await this.getEffectivePolicy(branchId);
    if (!dto.basePriceKgs && dto.basePriceKgs !== 0) {
      throw new BadRequestException('Base price is required');
    }
    if (dto.basePriceKgs <= 0) {
      throw new BadRequestException('Missing HQ base price');
    }

    const markupPercent = getLoyaltyMarkupPercent(dto.loyaltyCategory, policy);
    const priced = calculateFinalSaleUnitPrice({
      basePriceKgs: Number(dto.basePriceKgs),
      loyaltyMarkupPercent: markupPercent,
      minimumPriceKgs: 0,
    });

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: 'CUSTOMER_FINAL_PRICE_CALCULATED',
        entity: 'BranchPricingPolicy',
        entityId: branchId,
        metadata: {
          branchId,
          customerType: dto.customerType,
          loyaltyCategory: dto.loyaltyCategory,
          oldValue: priced.basePriceKgs,
          newValue: priced.finalPriceKgs,
          markupPercent,
          userId: user.id,
          timestamp: new Date().toISOString(),
        },
      },
    });

    return {
      customerType: dto.customerType,
      loyaltyCategory: dto.loyaltyCategory,
      basePriceKgs: priced.basePriceKgs,
      markupPercent: priced.markupPercent,
      markupAmountKgs: priced.markupAmountKgs,
      finalPriceKgs: priced.finalPriceKgs,
      affectsCostOrFifo: false,
    };
  }

  getMarkupPercentForCategory(
    category: CustomerLoyaltyCategory,
    policy: LoyaltyMarkupConfig,
  ) {
    return getLoyaltyMarkupPercent(category, policy);
  }

  assertCustomerTypePriceAvailable(customerType: CustomerType, basePrice: number | null) {
    if (basePrice == null || basePrice <= 0) {
      throw new BadRequestException(
        `Missing HQ base price for customer type ${customerType}`,
      );
    }
  }

  private assertBranchCeo(user: AuthUser) {
    if (!isBranchOwnerUser(user) || !user.branchId) {
      throw new ForbiddenException('Only Branch CEO can manage branch pricing policy');
    }
  }

  private hqDefaultsPayload(hq: LoyaltyProgramConfig) {
    return {
      ...rangesFromThresholds(hq),
      standardMarkupPercent: hq.standardMarkupPercent,
      silverMarkupPercent: hq.silverMarkupPercent,
      goldMarkupPercent: hq.goldMarkupPercent,
      vipMarkupPercent: hq.vipMarkupPercent,
      minAllowedMarkupPercent: hq.minAllowedMarkupPercent,
      maxAllowedMarkupPercent: hq.maxAllowedMarkupPercent,
      branchCustomizationEnabled: hq.branchCustomizationEnabled,
      purchaseWindow: hq.purchaseWindow,
    };
  }
}

function rangesFromRow(row: {
  standardMinKgs: Prisma.Decimal | number;
  standardMaxKgs: Prisma.Decimal | number;
  silverMinKgs: Prisma.Decimal | number;
  silverMaxKgs: Prisma.Decimal | number;
  goldMinKgs: Prisma.Decimal | number;
  goldMaxKgs: Prisma.Decimal | number;
  vipMinKgs: Prisma.Decimal | number;
  vipMaxKgs: Prisma.Decimal | number | null;
  standardMarkupPercent: Prisma.Decimal | number;
  silverMarkupPercent: Prisma.Decimal | number;
  goldMarkupPercent: Prisma.Decimal | number;
  vipMarkupPercent: Prisma.Decimal | number;
}) {
  return {
    standardMinKgs: toApiMoneyKgs(row.standardMinKgs),
    standardMaxKgs: toApiMoneyKgs(row.standardMaxKgs),
    silverMinKgs: toApiMoneyKgs(row.silverMinKgs),
    silverMaxKgs: toApiMoneyKgs(row.silverMaxKgs),
    goldMinKgs: toApiMoneyKgs(row.goldMinKgs),
    goldMaxKgs: toApiMoneyKgs(row.goldMaxKgs),
    vipMinKgs: toApiMoneyKgs(row.vipMinKgs),
    vipMaxKgs: row.vipMaxKgs == null ? null : toApiMoneyKgs(row.vipMaxKgs),
    standardMarkupPercent: Number(row.standardMarkupPercent),
    silverMarkupPercent: Number(row.silverMarkupPercent),
    goldMarkupPercent: Number(row.goldMarkupPercent),
    vipMarkupPercent: Number(row.vipMarkupPercent),
  };
}

export { DEFAULT_LOYALTY_CATEGORY_RANGES, DEFAULT_LOYALTY_MARKUPS };
