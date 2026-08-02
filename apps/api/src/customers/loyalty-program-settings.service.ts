import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import {
  CustomerLoyaltyCategory,
  LoyaltyPurchaseWindow,
  Prisma,
  SaleStatus,
} from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { toApiMoneyKgs } from '../common/authoritative-money.util';
import { PrismaService } from '../prisma/prisma.service';
import { canManagePricingPolicy } from '../rbac/rbac';
import {
  assertLoyaltyCategoryRanges,
  assertLoyaltyMarkupRange,
  assertLoyaltyThresholdOrder,
  DEFAULT_CUSTOMER_TYPE_LOYALTY_MARKUPS,
  DEFAULT_LOYALTY_CATEGORY_RANGES,
  DEFAULT_LOYALTY_MARKUPS,
  getLoyaltyMarkupPercent,
  legacyMarkupsFromMatrix,
  loyaltyCategoryRank,
  rangesFromThresholds,
  readMarkupMatrix,
  resolveNextLoyaltyCategory,
  rollingWindowStartDate,
  type LoyaltyProgramConfig,
} from './customer-loyalty.util';
import { UpdateLoyaltyProgramSettingsDto } from './dto/update-loyalty-program-settings.dto';

@Injectable()
export class LoyaltyProgramSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfig(): Promise<LoyaltyProgramConfig> {
    const settings = await this.ensureDefaults();
    return this.toConfig(settings);
  }

  async get(user: AuthUser) {
    void user;
    const settings = await this.ensureDefaults();
    return this.toApi(settings);
  }

  async update(user: AuthUser, dto: UpdateLoyaltyProgramSettingsDto) {
    if (!canManagePricingPolicy(user)) {
      throw new ForbiddenException('Only HQ CEO can configure loyalty categories');
    }

    const existing = await this.ensureDefaults();
    const existingMatrix = readMarkupMatrix(existing);
    const matrix = readMarkupMatrix({
      ...existingMatrix,
      retailStandardMarkupPercent:
        dto.retailStandardMarkupPercent ?? existingMatrix.retailStandardMarkupPercent,
      retailSilverMarkupPercent:
        dto.retailSilverMarkupPercent ?? existingMatrix.retailSilverMarkupPercent,
      retailGoldMarkupPercent:
        dto.retailGoldMarkupPercent ?? existingMatrix.retailGoldMarkupPercent,
      retailVipMarkupPercent:
        dto.retailVipMarkupPercent ?? existingMatrix.retailVipMarkupPercent,
      masterStandardMarkupPercent:
        dto.masterStandardMarkupPercent ?? existingMatrix.masterStandardMarkupPercent,
      masterSilverMarkupPercent:
        dto.masterSilverMarkupPercent ?? existingMatrix.masterSilverMarkupPercent,
      masterGoldMarkupPercent:
        dto.masterGoldMarkupPercent ?? existingMatrix.masterGoldMarkupPercent,
      masterVipMarkupPercent:
        dto.masterVipMarkupPercent ?? existingMatrix.masterVipMarkupPercent,
      wholesaleStandardMarkupPercent:
        dto.wholesaleStandardMarkupPercent ??
        dto.standardMarkupPercent ??
        dto.standardDiscountPercent ??
        existingMatrix.wholesaleStandardMarkupPercent,
      wholesaleSilverMarkupPercent:
        dto.wholesaleSilverMarkupPercent ??
        dto.silverMarkupPercent ??
        dto.silverDiscountPercent ??
        existingMatrix.wholesaleSilverMarkupPercent,
      wholesaleGoldMarkupPercent:
        dto.wholesaleGoldMarkupPercent ??
        dto.goldMarkupPercent ??
        dto.goldDiscountPercent ??
        existingMatrix.wholesaleGoldMarkupPercent,
      wholesaleVipMarkupPercent:
        dto.wholesaleVipMarkupPercent ??
        dto.vipMarkupPercent ??
        dto.vipDiscountPercent ??
        existingMatrix.wholesaleVipMarkupPercent,
    });
    const legacy = legacyMarkupsFromMatrix(matrix);

    const next = {
      purchaseWindow: dto.purchaseWindow ?? LoyaltyPurchaseWindow.ROLLING_90_DAYS,
      standardThresholdKgs: Number(dto.standardThresholdKgs ?? existing.standardThresholdKgs),
      silverThresholdKgs: Number(dto.silverThresholdKgs ?? existing.silverThresholdKgs),
      goldThresholdKgs: Number(dto.goldThresholdKgs ?? existing.goldThresholdKgs),
      vipThresholdKgs: Number(dto.vipThresholdKgs ?? existing.vipThresholdKgs),
      standardMaxKgs: Number(dto.standardMaxKgs ?? existing.standardMaxKgs),
      silverMaxKgs: Number(dto.silverMaxKgs ?? existing.silverMaxKgs),
      goldMaxKgs: Number(dto.goldMaxKgs ?? existing.goldMaxKgs),
      vipMaxKgs:
        dto.vipMaxKgs === undefined
          ? existing.vipMaxKgs == null
            ? null
            : Number(existing.vipMaxKgs)
          : dto.vipMaxKgs,
      ...matrix,
      ...legacy,
      minAllowedMarkupPercent: Number(
        dto.minAllowedMarkupPercent ?? existing.minAllowedMarkupPercent,
      ),
      maxAllowedMarkupPercent: Number(
        dto.maxAllowedMarkupPercent ?? existing.maxAllowedMarkupPercent,
      ),
      branchCustomizationEnabled: Boolean(
        dto.branchCustomizationEnabled ?? existing.branchCustomizationEnabled,
      ),
      allowDowngrade: Boolean(dto.allowDowngrade ?? existing.allowDowngrade),
    };

    try {
      assertLoyaltyThresholdOrder(next);
      assertLoyaltyCategoryRanges(rangesFromThresholds(next));
      assertLoyaltyMarkupRange(matrix, {
        minAllowedMarkupPercent: next.minAllowedMarkupPercent,
        maxAllowedMarkupPercent: next.maxAllowedMarkupPercent,
      });
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid loyalty configuration',
      );
    }

    const updated = await this.prisma.loyaltyProgramSettings.update({
      where: { id: existing.id },
      data: {
        purchaseWindow: next.purchaseWindow,
        standardThresholdKgs: next.standardThresholdKgs,
        silverThresholdKgs: next.silverThresholdKgs,
        goldThresholdKgs: next.goldThresholdKgs,
        vipThresholdKgs: next.vipThresholdKgs,
        standardMaxKgs: next.standardMaxKgs,
        silverMaxKgs: next.silverMaxKgs,
        goldMaxKgs: next.goldMaxKgs,
        vipMaxKgs: next.vipMaxKgs,
        ...matrix,
        ...legacy,
        // Keep legacy discount columns synced to zero — selling price uses markup.
        standardDiscountPercent: 0,
        silverDiscountPercent: 0,
        goldDiscountPercent: 0,
        vipDiscountPercent: 0,
        minAllowedMarkupPercent: next.minAllowedMarkupPercent,
        maxAllowedMarkupPercent: next.maxAllowedMarkupPercent,
        branchCustomizationEnabled: next.branchCustomizationEnabled,
        allowDowngrade: next.allowDowngrade,
        updatedById: user.id,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: 'LOYALTY_PROGRAM_SETTINGS_UPDATED',
        entity: 'LoyaltyProgramSettings',
        entityId: updated.id,
        metadata: {
          oldValue: this.toApi(existing),
          newValue: this.toApi(updated),
          userId: user.id,
          timestamp: new Date().toISOString(),
        },
      },
    });

    return this.toApi(updated);
  }

  async getMarkupPercentForCategory(category: CustomerLoyaltyCategory): Promise<number> {
    const config = await this.getConfig();
    return getLoyaltyMarkupPercent(category, config);
  }

  /** @deprecated Prefer getMarkupPercentForCategory */
  async getDiscountPercentForCategory(category: CustomerLoyaltyCategory): Promise<number> {
    return this.getMarkupPercentForCategory(category);
  }

  async computePurchaseVolume(
    tx: Prisma.TransactionClient | PrismaService,
    customerId: string,
    asOf: Date = new Date(),
  ): Promise<number> {
    const config = await this.getConfig();
    const windowStart = rollingWindowStartDate(config.purchaseWindow, asOf);
    const sales = await tx.sale.findMany({
      where: {
        customerId,
        deletedAt: null,
        status: SaleStatus.FINALIZED,
        ...(windowStart ? { saleDate: { gte: windowStart } } : {}),
      },
      select: { totalAmount: true, saleDate: true },
      orderBy: { saleDate: 'desc' },
    });

    return sales.reduce((sum, sale) => sum + toApiMoneyKgs(sale.totalAmount), 0);
  }

  async refreshCustomerLoyalty(
    tx: Prisma.TransactionClient,
    input: {
      customerId: string;
      branchId: string;
      userId: string;
      role: string;
      asOf?: Date;
      categoryRanges?: {
        standardMinKgs: number;
        standardMaxKgs: number;
        silverMinKgs: number;
        silverMaxKgs: number;
        goldMinKgs: number;
        goldMaxKgs: number;
        vipMinKgs: number;
        vipMaxKgs: number | null;
      };
    },
  ) {
    const config = await this.getConfig();
    const customer = await tx.customer.findFirst({
      where: { id: input.customerId, deletedAt: null },
      select: {
        id: true,
        loyaltyCategory: true,
        lastPurchaseAt: true,
      },
    });
    if (!customer) return null;

    const purchaseVolume = await this.computePurchaseVolume(
      tx,
      input.customerId,
      input.asOf ?? new Date(),
    );
    const categoryConfig = input.categoryRanges ?? rangesFromThresholds(config);
    const nextCategory = resolveNextLoyaltyCategory({
      currentCategory: customer.loyaltyCategory,
      purchaseVolumeKgs: purchaseVolume,
      config: {
        ...categoryConfig,
        allowDowngrade: config.allowDowngrade,
      },
    });

    const latestSale = await tx.sale.findFirst({
      where: {
        customerId: input.customerId,
        deletedAt: null,
        status: SaleStatus.FINALIZED,
      },
      select: { saleDate: true },
      orderBy: { saleDate: 'desc' },
    });

    const updated = await tx.customer.update({
      where: { id: input.customerId },
      data: {
        purchaseVolume,
        loyaltyCategory: nextCategory,
        lastPurchaseAt: latestSale?.saleDate ?? customer.lastPurchaseAt,
      },
      select: {
        id: true,
        loyaltyCategory: true,
        purchaseVolume: true,
        lastPurchaseAt: true,
      },
    });

    if (nextCategory !== customer.loyaltyCategory) {
      await tx.auditLog.create({
        data: {
          userId: input.userId,
          role: input.role,
          action: 'CUSTOMER_CATEGORY_CHANGED',
          entity: 'Customer',
          entityId: input.customerId,
          metadata: {
            customerId: input.customerId,
            oldValue: customer.loyaltyCategory,
            newValue: nextCategory,
            userId: input.userId,
            branchId: input.branchId,
            timestamp: new Date().toISOString(),
            purchaseVolume,
          },
        },
      });

      if (loyaltyCategoryRank(nextCategory) > loyaltyCategoryRank(customer.loyaltyCategory)) {
        await tx.auditLog.create({
          data: {
            userId: input.userId,
            role: input.role,
            action: 'CUSTOMER_CATEGORY_AUTO_UPGRADED',
            entity: 'Customer',
            entityId: input.customerId,
            metadata: {
              customerId: input.customerId,
              oldValue: customer.loyaltyCategory,
              newValue: nextCategory,
              userId: input.userId,
              branchId: input.branchId,
              timestamp: new Date().toISOString(),
              purchaseVolume,
            },
          },
        });
      }
    }

    return updated;
  }

  private async ensureDefaults() {
    const existing = await this.prisma.loyaltyProgramSettings.findUnique({
      where: { singletonKey: 'DEFAULT' },
    });
    if (existing) {
      const needsBackfill =
        Number(existing.silverThresholdKgs) === 0 &&
        Number(existing.goldThresholdKgs) === 0 &&
        Number(existing.vipThresholdKgs) === 0;
      if (!needsBackfill) return existing;
      return this.prisma.loyaltyProgramSettings.update({
        where: { id: existing.id },
        data: {
          purchaseWindow: LoyaltyPurchaseWindow.ROLLING_90_DAYS,
          standardThresholdKgs: DEFAULT_LOYALTY_CATEGORY_RANGES.standardMinKgs,
          silverThresholdKgs: DEFAULT_LOYALTY_CATEGORY_RANGES.silverMinKgs,
          goldThresholdKgs: DEFAULT_LOYALTY_CATEGORY_RANGES.goldMinKgs,
          vipThresholdKgs: DEFAULT_LOYALTY_CATEGORY_RANGES.vipMinKgs,
          standardMaxKgs: DEFAULT_LOYALTY_CATEGORY_RANGES.standardMaxKgs,
          silverMaxKgs: DEFAULT_LOYALTY_CATEGORY_RANGES.silverMaxKgs,
          goldMaxKgs: DEFAULT_LOYALTY_CATEGORY_RANGES.goldMaxKgs,
          vipMaxKgs: null,
          ...DEFAULT_LOYALTY_MARKUPS,
          ...DEFAULT_CUSTOMER_TYPE_LOYALTY_MARKUPS,
          minAllowedMarkupPercent: 0,
          maxAllowedMarkupPercent: 20,
          branchCustomizationEnabled: true,
        },
      });
    }

    return this.prisma.loyaltyProgramSettings.create({
      data: {
        singletonKey: 'DEFAULT',
        purchaseWindow: LoyaltyPurchaseWindow.ROLLING_90_DAYS,
        standardThresholdKgs: DEFAULT_LOYALTY_CATEGORY_RANGES.standardMinKgs,
        silverThresholdKgs: DEFAULT_LOYALTY_CATEGORY_RANGES.silverMinKgs,
        goldThresholdKgs: DEFAULT_LOYALTY_CATEGORY_RANGES.goldMinKgs,
        vipThresholdKgs: DEFAULT_LOYALTY_CATEGORY_RANGES.vipMinKgs,
        standardMaxKgs: DEFAULT_LOYALTY_CATEGORY_RANGES.standardMaxKgs,
        silverMaxKgs: DEFAULT_LOYALTY_CATEGORY_RANGES.silverMaxKgs,
        goldMaxKgs: DEFAULT_LOYALTY_CATEGORY_RANGES.goldMaxKgs,
        vipMaxKgs: null,
        standardDiscountPercent: 0,
        silverDiscountPercent: 0,
        goldDiscountPercent: 0,
        vipDiscountPercent: 0,
        ...DEFAULT_LOYALTY_MARKUPS,
        ...DEFAULT_CUSTOMER_TYPE_LOYALTY_MARKUPS,
        minAllowedMarkupPercent: 0,
        maxAllowedMarkupPercent: 20,
        branchCustomizationEnabled: true,
        allowDowngrade: false,
      },
    });
  }

  private toConfig(settings: {
    purchaseWindow: LoyaltyPurchaseWindow;
    standardThresholdKgs: Prisma.Decimal | number;
    silverThresholdKgs: Prisma.Decimal | number;
    goldThresholdKgs: Prisma.Decimal | number;
    vipThresholdKgs: Prisma.Decimal | number;
    standardMaxKgs: Prisma.Decimal | number;
    silverMaxKgs: Prisma.Decimal | number;
    goldMaxKgs: Prisma.Decimal | number;
    vipMaxKgs: Prisma.Decimal | number | null;
    standardDiscountPercent: Prisma.Decimal | number;
    silverDiscountPercent: Prisma.Decimal | number;
    goldDiscountPercent: Prisma.Decimal | number;
    vipDiscountPercent: Prisma.Decimal | number;
    standardMarkupPercent: Prisma.Decimal | number;
    silverMarkupPercent: Prisma.Decimal | number;
    goldMarkupPercent: Prisma.Decimal | number;
    vipMarkupPercent: Prisma.Decimal | number;
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
    minAllowedMarkupPercent: Prisma.Decimal | number;
    maxAllowedMarkupPercent: Prisma.Decimal | number;
    branchCustomizationEnabled: boolean;
    allowDowngrade: boolean;
  }): LoyaltyProgramConfig {
    const matrix = readMarkupMatrix(settings);
    const legacy = legacyMarkupsFromMatrix(matrix);
    return {
      purchaseWindow: settings.purchaseWindow,
      standardThresholdKgs: toApiMoneyKgs(settings.standardThresholdKgs),
      silverThresholdKgs: toApiMoneyKgs(settings.silverThresholdKgs),
      goldThresholdKgs: toApiMoneyKgs(settings.goldThresholdKgs),
      vipThresholdKgs: toApiMoneyKgs(settings.vipThresholdKgs),
      standardMaxKgs: toApiMoneyKgs(settings.standardMaxKgs),
      silverMaxKgs: toApiMoneyKgs(settings.silverMaxKgs),
      goldMaxKgs: toApiMoneyKgs(settings.goldMaxKgs),
      vipMaxKgs: settings.vipMaxKgs == null ? null : toApiMoneyKgs(settings.vipMaxKgs),
      standardDiscountPercent: 0,
      silverDiscountPercent: 0,
      goldDiscountPercent: 0,
      vipDiscountPercent: 0,
      ...matrix,
      ...legacy,
      minAllowedMarkupPercent: Number(settings.minAllowedMarkupPercent),
      maxAllowedMarkupPercent: Number(settings.maxAllowedMarkupPercent),
      branchCustomizationEnabled: Boolean(settings.branchCustomizationEnabled),
      allowDowngrade: settings.allowDowngrade,
    };
  }

  private toApi(settings: {
    id: string;
    purchaseWindow: LoyaltyPurchaseWindow;
    standardThresholdKgs: Prisma.Decimal | number;
    silverThresholdKgs: Prisma.Decimal | number;
    goldThresholdKgs: Prisma.Decimal | number;
    vipThresholdKgs: Prisma.Decimal | number;
    standardMaxKgs: Prisma.Decimal | number;
    silverMaxKgs: Prisma.Decimal | number;
    goldMaxKgs: Prisma.Decimal | number;
    vipMaxKgs: Prisma.Decimal | number | null;
    standardDiscountPercent: Prisma.Decimal | number;
    silverDiscountPercent: Prisma.Decimal | number;
    goldDiscountPercent: Prisma.Decimal | number;
    vipDiscountPercent: Prisma.Decimal | number;
    standardMarkupPercent: Prisma.Decimal | number;
    silverMarkupPercent: Prisma.Decimal | number;
    goldMarkupPercent: Prisma.Decimal | number;
    vipMarkupPercent: Prisma.Decimal | number;
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
    minAllowedMarkupPercent: Prisma.Decimal | number;
    maxAllowedMarkupPercent: Prisma.Decimal | number;
    branchCustomizationEnabled: boolean;
    allowDowngrade: boolean;
    updatedAt: Date;
  }) {
    return {
      id: settings.id,
      ...this.toConfig(settings),
      updatedAt: settings.updatedAt,
    };
  }
}
