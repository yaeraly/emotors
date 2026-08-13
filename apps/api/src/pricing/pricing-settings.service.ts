import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { canManagePricingPolicy, canViewPricing } from '../rbac/rbac';
import { UpdatePricingMasterSettingsDto } from './dto/pricing-master-settings.dto';
import type { PricingRoundingConfig } from './pricing-calculator.util';

export type PricingMasterSettingsView = {
  id: string;
  baseCalculationSource: string;
  roundingStrategy: string;
  roundUpPrecision: number;
  currency: string;
  defaultDecimalPrecision: number;
  defaultMinimumMarkup: number;
  defaultMaximumMarkup: number;
  defaultActivationTimezone: string;
  updatedAt: Date;
  updatedBy?: { id: string; fullName: string } | null;
};

const DEFAULTS = {
  singletonKey: 'DEFAULT',
  baseCalculationSource: 'FIFO_COST',
  roundingStrategy: 'ROUNDUP',
  roundUpPrecision: -1,
  currency: 'KGS',
  defaultDecimalPrecision: 2,
  defaultMinimumMarkup: 0,
  defaultMaximumMarkup: 0,
  defaultActivationTimezone: 'Asia/Bishkek',
} as const;

@Injectable()
export class PricingSettingsService {
  private cache: PricingMasterSettingsView | null = null;
  private cacheExpiresAt = 0;

  constructor(private readonly prisma: PrismaService) {}

  async get(user: AuthUser): Promise<PricingMasterSettingsView> {
    this.assertCanView(user);
    return this.getOrCreate();
  }

  async update(user: AuthUser, dto: UpdatePricingMasterSettingsDto): Promise<PricingMasterSettingsView> {
    this.assertCanManage(user);
    const current = await this.getOrCreate();

    const nextMin = dto.defaultMinimumMarkup ?? current.defaultMinimumMarkup;
    const nextMax = dto.defaultMaximumMarkup ?? current.defaultMaximumMarkup;
    if (nextMax < nextMin) {
      throw new BadRequestException('defaultMaximumMarkup cannot be less than defaultMinimumMarkup');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.pricingMasterSettings.update({
        where: { id: current.id },
        data: {
          baseCalculationSource: dto.baseCalculationSource ?? undefined,
          roundingStrategy: dto.roundingStrategy ?? undefined,
          roundUpPrecision: dto.roundUpPrecision ?? undefined,
          currency: dto.currency?.trim() || undefined,
          defaultDecimalPrecision: dto.defaultDecimalPrecision ?? undefined,
          defaultMinimumMarkup:
            dto.defaultMinimumMarkup != null ? new Prisma.Decimal(dto.defaultMinimumMarkup) : undefined,
          defaultMaximumMarkup:
            dto.defaultMaximumMarkup != null ? new Prisma.Decimal(dto.defaultMaximumMarkup) : undefined,
          defaultActivationTimezone: dto.defaultActivationTimezone?.trim() || undefined,
          updatedById: user.id,
        },
        include: { updatedBy: { select: { id: true, fullName: true } } },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'PRICING_MASTER_SETTINGS_UPDATED',
          entity: 'PricingMasterSettings',
          entityId: row.id,
          metadata: {
            before: current,
            after: this.toView(row),
            timestamp: new Date().toISOString(),
          },
        },
      });

      return row;
    });

    this.cache = this.toView(updated);
    this.cacheExpiresAt = Date.now() + 30_000;
    return this.cache;
  }

  /** Internal: used by Pricing Engine / Version without auth gating. */
  async getRoundingConfig(): Promise<PricingRoundingConfig> {
    const settings = await this.getOrCreate();
    return {
      strategy: settings.roundingStrategy as PricingRoundingConfig['strategy'],
      roundUpPrecision: settings.roundUpPrecision,
      decimalPrecision: settings.defaultDecimalPrecision,
    };
  }

  async getDefaultActivationTimezone(): Promise<string> {
    const settings = await this.getOrCreate();
    return settings.defaultActivationTimezone || DEFAULTS.defaultActivationTimezone;
  }

  async getCurrency(): Promise<string> {
    const settings = await this.getOrCreate();
    return settings.currency || DEFAULTS.currency;
  }

  invalidateCache() {
    this.cache = null;
    this.cacheExpiresAt = 0;
  }

  private async getOrCreate(): Promise<PricingMasterSettingsView> {
    if (this.cache && Date.now() < this.cacheExpiresAt) {
      return this.cache;
    }

    let row = await this.prisma.pricingMasterSettings.findUnique({
      where: { singletonKey: DEFAULTS.singletonKey },
      include: { updatedBy: { select: { id: true, fullName: true } } },
    });

    if (!row) {
      row = await this.prisma.pricingMasterSettings.create({
        data: {
          singletonKey: DEFAULTS.singletonKey,
          baseCalculationSource: DEFAULTS.baseCalculationSource,
          roundingStrategy: DEFAULTS.roundingStrategy,
          roundUpPrecision: DEFAULTS.roundUpPrecision,
          currency: DEFAULTS.currency,
          defaultDecimalPrecision: DEFAULTS.defaultDecimalPrecision,
          defaultMinimumMarkup: DEFAULTS.defaultMinimumMarkup,
          defaultMaximumMarkup: DEFAULTS.defaultMaximumMarkup,
          defaultActivationTimezone: DEFAULTS.defaultActivationTimezone,
        },
        include: { updatedBy: { select: { id: true, fullName: true } } },
      });
    }

    this.cache = this.toView(row);
    this.cacheExpiresAt = Date.now() + 30_000;
    return this.cache;
  }

  private toView(row: {
    id: string;
    baseCalculationSource: string;
    roundingStrategy: string;
    roundUpPrecision: number;
    currency: string;
    defaultDecimalPrecision: number;
    defaultMinimumMarkup: { toString(): string } | number;
    defaultMaximumMarkup: { toString(): string } | number;
    defaultActivationTimezone: string;
    updatedAt: Date;
    updatedBy?: { id: string; fullName: string } | null;
  }): PricingMasterSettingsView {
    return {
      id: row.id,
      baseCalculationSource: row.baseCalculationSource,
      roundingStrategy: row.roundingStrategy,
      roundUpPrecision: row.roundUpPrecision,
      currency: row.currency,
      defaultDecimalPrecision: row.defaultDecimalPrecision,
      defaultMinimumMarkup: Number(row.defaultMinimumMarkup),
      defaultMaximumMarkup: Number(row.defaultMaximumMarkup),
      defaultActivationTimezone: row.defaultActivationTimezone,
      updatedAt: row.updatedAt,
      updatedBy: row.updatedBy ?? null,
    };
  }

  private assertCanView(user: AuthUser) {
    if (!canViewPricing(user)) throw new ForbiddenException('Insufficient permissions');
  }

  private assertCanManage(user: AuthUser) {
    if (!canManagePricingPolicy(user)) {
      throw new ForbiddenException('Only CEO can update pricing master settings');
    }
  }
}
