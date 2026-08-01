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
  assertLoyaltyDiscountRange,
  assertLoyaltyThresholdOrder,
  getLoyaltyDiscountPercent,
  loyaltyCategoryRank,
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

    const next = {
      purchaseWindow: dto.purchaseWindow ?? LoyaltyPurchaseWindow.TOTAL,
      standardThresholdKgs: Number(dto.standardThresholdKgs ?? 0),
      silverThresholdKgs: Number(dto.silverThresholdKgs ?? 0),
      goldThresholdKgs: Number(dto.goldThresholdKgs ?? 0),
      vipThresholdKgs: Number(dto.vipThresholdKgs ?? 0),
      standardDiscountPercent: Number(dto.standardDiscountPercent ?? 0),
      silverDiscountPercent: Number(dto.silverDiscountPercent ?? 0),
      goldDiscountPercent: Number(dto.goldDiscountPercent ?? 0),
      vipDiscountPercent: Number(dto.vipDiscountPercent ?? 0),
      allowDowngrade: Boolean(dto.allowDowngrade ?? false),
    };

    try {
      assertLoyaltyThresholdOrder(next);
      assertLoyaltyDiscountRange(next);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid loyalty configuration',
      );
    }

    const existing = await this.ensureDefaults();
    const updated = await this.prisma.loyaltyProgramSettings.update({
      where: { id: existing.id },
      data: {
        purchaseWindow: next.purchaseWindow,
        standardThresholdKgs: next.standardThresholdKgs,
        silverThresholdKgs: next.silverThresholdKgs,
        goldThresholdKgs: next.goldThresholdKgs,
        vipThresholdKgs: next.vipThresholdKgs,
        standardDiscountPercent: next.standardDiscountPercent,
        silverDiscountPercent: next.silverDiscountPercent,
        goldDiscountPercent: next.goldDiscountPercent,
        vipDiscountPercent: next.vipDiscountPercent,
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

  async getDiscountPercentForCategory(category: CustomerLoyaltyCategory): Promise<number> {
    const config = await this.getConfig();
    return getLoyaltyDiscountPercent(category, config);
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
    const nextCategory = resolveNextLoyaltyCategory({
      currentCategory: customer.loyaltyCategory,
      purchaseVolumeKgs: purchaseVolume,
      config,
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
            action: 'LOYALTY_CATEGORY_UPGRADED',
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
    if (existing) return existing;

    return this.prisma.loyaltyProgramSettings.create({
      data: {
        singletonKey: 'DEFAULT',
        purchaseWindow: LoyaltyPurchaseWindow.TOTAL,
        standardThresholdKgs: 0,
        silverThresholdKgs: 0,
        goldThresholdKgs: 0,
        vipThresholdKgs: 0,
        standardDiscountPercent: 0,
        silverDiscountPercent: 0,
        goldDiscountPercent: 0,
        vipDiscountPercent: 0,
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
    standardDiscountPercent: Prisma.Decimal | number;
    silverDiscountPercent: Prisma.Decimal | number;
    goldDiscountPercent: Prisma.Decimal | number;
    vipDiscountPercent: Prisma.Decimal | number;
    allowDowngrade: boolean;
  }): LoyaltyProgramConfig {
    return {
      purchaseWindow: settings.purchaseWindow,
      standardThresholdKgs: toApiMoneyKgs(settings.standardThresholdKgs),
      silverThresholdKgs: toApiMoneyKgs(settings.silverThresholdKgs),
      goldThresholdKgs: toApiMoneyKgs(settings.goldThresholdKgs),
      vipThresholdKgs: toApiMoneyKgs(settings.vipThresholdKgs),
      standardDiscountPercent: Number(settings.standardDiscountPercent),
      silverDiscountPercent: Number(settings.silverDiscountPercent),
      goldDiscountPercent: Number(settings.goldDiscountPercent),
      vipDiscountPercent: Number(settings.vipDiscountPercent),
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
    standardDiscountPercent: Prisma.Decimal | number;
    silverDiscountPercent: Prisma.Decimal | number;
    goldDiscountPercent: Prisma.Decimal | number;
    vipDiscountPercent: Prisma.Decimal | number;
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
