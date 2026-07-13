import { Injectable } from '@nestjs/common';
import { PricingPolicyVersionStatus, Prisma, ProductPriceOverrideStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PricingValidationService } from './pricing-validation.service';

@Injectable()
export class PricingSchedulerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validationService: PricingValidationService,
  ) {}

  async runDueActivations() {
    await Promise.all([
      this.activateApprovedOverrides(),
      this.expireOverrides(),
      this.activateScheduledVersions(),
    ]);
  }

  private async activateApprovedOverrides() {
    const now = new Date();
    const due = await this.prisma.productPriceOverride.findMany({
      where: {
        status: ProductPriceOverrideStatus.APPROVED,
        startDate: { lte: now },
        endDate: { gte: now },
      },
    });
    for (const row of due) {
      await this.prisma.productPriceOverride.update({
        where: { id: row.id },
        data: { status: ProductPriceOverrideStatus.ACTIVE },
      });
      await this.prisma.auditLog.create({
        data: {
          userId: row.approvedById,
          role: 'SYSTEM',
          action: 'TEMP_OVERRIDE_ACTIVATED',
          entity: 'ProductPriceOverride',
          entityId: row.id,
          metadata: {
            branchId: row.branchId,
            productId: row.productId,
            timestamp: now.toISOString(),
          },
        },
      });
    }
  }

  private async expireOverrides() {
    const now = new Date();
    const stale = await this.prisma.productPriceOverride.findMany({
      where: {
        status: { in: [ProductPriceOverrideStatus.ACTIVE, ProductPriceOverrideStatus.APPROVED] },
        endDate: { lt: now },
      },
    });
    for (const row of stale) {
      await this.prisma.productPriceOverride.update({
        where: { id: row.id },
        data: { status: ProductPriceOverrideStatus.EXPIRED },
      });
      await this.prisma.auditLog.create({
        data: {
          userId: null,
          role: 'SYSTEM',
          action: 'TEMP_OVERRIDE_EXPIRED',
          entity: 'ProductPriceOverride',
          entityId: row.id,
          metadata: {
            branchId: row.branchId,
            productId: row.productId,
            timestamp: now.toISOString(),
          },
        },
      });
    }
  }

  private async activateScheduledVersions() {
    const now = new Date();
    const due = await this.prisma.pricingPolicyVersion.findMany({
      where: {
        status: PricingPolicyVersionStatus.SCHEDULED,
        effectiveFrom: { lte: now },
      },
      orderBy: { versionNumber: 'asc' },
    });

    for (const version of due) {
      const validation = await this.validationService.validateVersion(version.id);
      if (!validation.valid) {
        await this.prisma.auditLog.create({
          data: {
            userId: version.scheduledById,
            role: 'SYSTEM',
            action: 'PRICE_POLICY_VALIDATION_FAILED',
            entity: 'PricingPolicyVersion',
            entityId: version.id,
            metadata: {
              versionNumber: version.versionNumber,
              source: 'SCHEDULED_ACTIVATION',
              validation,
              timestamp: now.toISOString(),
            } as Prisma.InputJsonValue,
          },
        });
        continue;
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.pricingPolicyVersion.updateMany({
          where: { status: PricingPolicyVersionStatus.ACTIVE },
          data: {
            status: PricingPolicyVersionStatus.ARCHIVED,
            archivedAt: now,
          },
        });
        await tx.pricingPolicyVersion.update({
          where: { id: version.id },
          data: {
            status: PricingPolicyVersionStatus.ACTIVE,
            isLocked: true,
            publishedAt: now,
          },
        });
        await tx.auditLog.create({
          data: {
            userId: version.scheduledById,
            role: 'SYSTEM',
            action: 'PRICE_POLICY_ACTIVATED',
            entity: 'PricingPolicyVersion',
            entityId: version.id,
            metadata: {
              versionNumber: version.versionNumber,
              effectiveFrom: version.effectiveFrom?.toISOString(),
              timestamp: now.toISOString(),
            },
          },
        });
      });
    }
  }
}
