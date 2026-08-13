import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  CustomerLoyaltyCategory,
  CustomerType,
  LoyaltyPurchaseWindow,
  Prisma,
} from '@prisma/client';
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
  DEFAULT_CUSTOMER_TYPE_LOYALTY_MARKUPS,
  DEFAULT_LOYALTY_CATEGORY_RANGES,
  DEFAULT_LOYALTY_MARKUPS,
  getLoyaltyMarkupPercent,
  isBranchSaleCustomerType,
  legacyMarkupsFromMatrix,
  markupMatrixFieldFor,
  rangesFromThresholds,
  readMarkupMatrix,
  type CustomerTypeLoyaltyMarkupMatrix,
  type LoyaltyCategoryRangeConfig,
  type LoyaltyMarkupConfig,
  type LoyaltyProgramConfig,
} from './customer-loyalty.util';
import { LoyaltyProgramSettingsService } from './loyalty-program-settings.service';
import { PreviewBranchPricingDto } from './dto/preview-branch-pricing.dto';
import { UpdateBranchPricingPolicyDto } from './dto/update-branch-pricing-policy.dto';

export type EffectiveBranchPricingPolicy = LoyaltyCategoryRangeConfig &
  LoyaltyMarkupConfig &
  CustomerTypeLoyaltyMarkupMatrix & {
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
      const matrix = readMarkupMatrix(hq);
      return {
        branchId,
        ...ranges,
        ...matrix,
        ...legacyMarkupsFromMatrix(matrix),
        purchaseWindow: hq.purchaseWindow,
        allowDowngrade: hq.allowDowngrade,
        minAllowedMarkupPercent: hq.minAllowedMarkupPercent,
        maxAllowedMarkupPercent: hq.maxAllowedMarkupPercent,
        branchCustomizationEnabled: hq.branchCustomizationEnabled,
        source: 'HQ_DEFAULT',
      };
    }

    const matrix = readMarkupMatrix(branchPolicy);
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
      ...matrix,
      ...legacyMarkupsFromMatrix(matrix),
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
    const matrix = this.matrixFromDto(dto);

    try {
      assertLoyaltyCategoryRanges(ranges);
      assertLoyaltyMarkupRange(matrix, {
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
    const legacy = legacyMarkupsFromMatrix(matrix);

    const data = {
      ...ranges,
      ...matrix,
      ...legacy,
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

    const oldMatrix = existing ? readMarkupMatrix(existing) : null;
    await this.auditMatrixChanges(user, updated.id, oldMatrix, matrix);

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: 'BRANCH_PRICING_POLICY_UPDATED',
        entity: 'BranchPricingPolicy',
        entityId: updated.id,
        metadata: {
          branchId: user.branchId,
          oldValue: existing ? policySnapshot(existing) : null,
          newValue: policySnapshot(updated),
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
    if (!isBranchSaleCustomerType(dto.customerType)) {
      throw new BadRequestException('У клиента не указан тип клиента.');
    }

    let markupPercent: number;
    try {
      markupPercent = getLoyaltyMarkupPercent(dto.loyaltyCategory, policy, dto.customerType);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Markup rule is missing',
      );
    }

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
    policy: LoyaltyMarkupConfig | CustomerTypeLoyaltyMarkupMatrix,
    customerType?: CustomerType | null,
  ) {
    return getLoyaltyMarkupPercent(category, policy, customerType);
  }

  assertCustomerTypePriceAvailable(customerType: CustomerType, basePrice: number | null) {
    if (basePrice == null || basePrice <= 0) {
      throw new BadRequestException(
        `Missing HQ base price for customer type ${customerType}`,
      );
    }
  }

  private matrixFromDto(dto: UpdateBranchPricingPolicyDto): CustomerTypeLoyaltyMarkupMatrix {
    if (
      dto.retailStandardMarkupPercent == null &&
      dto.standardMarkupPercent != null
    ) {
      // Backward-compatible payload with only legacy 4 fields.
      return {
        retailStandardMarkupPercent: Number(dto.standardMarkupPercent),
        retailSilverMarkupPercent: Number(dto.silverMarkupPercent ?? 0),
        retailGoldMarkupPercent: Number(dto.goldMarkupPercent ?? 0),
        retailVipMarkupPercent: Number(dto.vipMarkupPercent ?? 0),
        masterStandardMarkupPercent: Number(dto.standardMarkupPercent),
        masterSilverMarkupPercent: Number(dto.silverMarkupPercent ?? 0),
        masterGoldMarkupPercent: Number(dto.goldMarkupPercent ?? 0),
        masterVipMarkupPercent: Number(dto.vipMarkupPercent ?? 0),
        wholesaleStandardMarkupPercent: Number(dto.standardMarkupPercent),
        wholesaleSilverMarkupPercent: Number(dto.silverMarkupPercent ?? 0),
        wholesaleGoldMarkupPercent: Number(dto.goldMarkupPercent ?? 0),
        wholesaleVipMarkupPercent: Number(dto.vipMarkupPercent ?? 0),
      };
    }

    return readMarkupMatrix({
      retailStandardMarkupPercent: Number(dto.retailStandardMarkupPercent),
      retailSilverMarkupPercent: Number(dto.retailSilverMarkupPercent),
      retailGoldMarkupPercent: Number(dto.retailGoldMarkupPercent),
      retailVipMarkupPercent: Number(dto.retailVipMarkupPercent),
      masterStandardMarkupPercent: Number(dto.masterStandardMarkupPercent),
      masterSilverMarkupPercent: Number(dto.masterSilverMarkupPercent),
      masterGoldMarkupPercent: Number(dto.masterGoldMarkupPercent),
      masterVipMarkupPercent: Number(dto.masterVipMarkupPercent),
      wholesaleStandardMarkupPercent: Number(dto.wholesaleStandardMarkupPercent),
      wholesaleSilverMarkupPercent: Number(dto.wholesaleSilverMarkupPercent),
      wholesaleGoldMarkupPercent: Number(dto.wholesaleGoldMarkupPercent),
      wholesaleVipMarkupPercent: Number(dto.wholesaleVipMarkupPercent),
    });
  }

  private async auditMatrixChanges(
    user: AuthUser,
    policyId: string,
    oldMatrix: CustomerTypeLoyaltyMarkupMatrix | null,
    newMatrix: CustomerTypeLoyaltyMarkupMatrix,
  ) {
    const pairs = [
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
    ] as const;

    for (const [customerType, loyaltyCategory] of pairs) {
      const field = markupMatrixFieldFor(customerType, loyaltyCategory);
      const oldMarkup = oldMatrix ? Number(oldMatrix[field]) : null;
      const newMarkup = Number(newMatrix[field]);
      if (oldMarkup === newMarkup) continue;

      await this.prisma.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: oldMatrix
            ? 'BRANCH_CUSTOMER_TYPE_MARKUP_UPDATED'
            : 'BRANCH_CUSTOMER_TYPE_MARKUP_CREATED',
          entity: 'BranchPricingPolicy',
          entityId: policyId,
          metadata: {
            branchId: user.branchId,
            customerType,
            loyaltyCategory,
            oldMarkup,
            newMarkup,
            updatedBy: user.id,
            timestamp: new Date().toISOString(),
          },
        },
      });
    }
  }

  private assertBranchCeo(user: AuthUser) {
    if (!isBranchOwnerUser(user) || !user.branchId) {
      throw new ForbiddenException('Only Branch CEO can manage branch pricing policy');
    }
  }

  private hqDefaultsPayload(hq: LoyaltyProgramConfig) {
    const matrix = readMarkupMatrix(hq);
    return {
      ...rangesFromThresholds(hq),
      ...matrix,
      ...legacyMarkupsFromMatrix(matrix),
      minAllowedMarkupPercent: hq.minAllowedMarkupPercent,
      maxAllowedMarkupPercent: hq.maxAllowedMarkupPercent,
      branchCustomizationEnabled: hq.branchCustomizationEnabled,
      purchaseWindow: hq.purchaseWindow,
    };
  }
}

function policySnapshot(row: {
  standardMinKgs: Prisma.Decimal | number;
  standardMaxKgs: Prisma.Decimal | number;
  silverMinKgs: Prisma.Decimal | number;
  silverMaxKgs: Prisma.Decimal | number;
  goldMinKgs: Prisma.Decimal | number;
  goldMaxKgs: Prisma.Decimal | number;
  vipMinKgs: Prisma.Decimal | number;
  vipMaxKgs: Prisma.Decimal | number | null;
  retailStandardMarkupPercent?: Prisma.Decimal | number;
  retailSilverMarkupPercent?: Prisma.Decimal | number;
  retailGoldMarkupPercent?: Prisma.Decimal | number;
  retailVipMarkupPercent?: Prisma.Decimal | number;
  masterStandardMarkupPercent?: Prisma.Decimal | number;
  masterSilverMarkupPercent?: Prisma.Decimal | number;
  masterGoldMarkupPercent?: Prisma.Decimal | number;
  masterVipMarkupPercent?: Prisma.Decimal | number;
  wholesaleStandardMarkupPercent?: Prisma.Decimal | number;
  wholesaleSilverMarkupPercent?: Prisma.Decimal | number;
  wholesaleGoldMarkupPercent?: Prisma.Decimal | number;
  wholesaleVipMarkupPercent?: Prisma.Decimal | number;
  standardMarkupPercent?: Prisma.Decimal | number;
  silverMarkupPercent?: Prisma.Decimal | number;
  goldMarkupPercent?: Prisma.Decimal | number;
  vipMarkupPercent?: Prisma.Decimal | number;
}) {
  const matrix = readMarkupMatrix(row);
  return {
    standardMinKgs: toApiMoneyKgs(row.standardMinKgs),
    standardMaxKgs: toApiMoneyKgs(row.standardMaxKgs),
    silverMinKgs: toApiMoneyKgs(row.silverMinKgs),
    silverMaxKgs: toApiMoneyKgs(row.silverMaxKgs),
    goldMinKgs: toApiMoneyKgs(row.goldMinKgs),
    goldMaxKgs: toApiMoneyKgs(row.goldMaxKgs),
    vipMinKgs: toApiMoneyKgs(row.vipMinKgs),
    vipMaxKgs: row.vipMaxKgs == null ? null : toApiMoneyKgs(row.vipMaxKgs),
    ...matrix,
    ...legacyMarkupsFromMatrix(matrix),
  };
}

export {
  DEFAULT_CUSTOMER_TYPE_LOYALTY_MARKUPS,
  DEFAULT_LOYALTY_CATEGORY_RANGES,
  DEFAULT_LOYALTY_MARKUPS,
};
