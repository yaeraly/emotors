import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PricingAdjustmentMode,
  PricingChangeReasonCode,
  PricingPolicyVersionStatus,
  PricingRuleStatus,
} from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { canManagePricingPolicy, canViewPricing } from '../rbac/rbac';
import { applyPricingAdjustment } from './pricing-calculator.util';

export class UpsertPricingProductRuleDto {
  pricingProfileId!: string;
  productId!: string;
  adjustmentMode!: PricingAdjustmentMode;
  adjustmentValue!: number;
  reason?: PricingChangeReasonCode;
  reasonNote?: string;
}

@Injectable()
export class PricingProductRuleService {
  constructor(private readonly prisma: PrismaService) {}

  async listForVersion(user: AuthUser, versionId: string) {
    this.assertCanView(user);
    await this.assertVersionEditable(versionId);
    return this.prisma.pricingProductRule.findMany({
      where: { pricingPolicyVersionId: versionId },
      include: {
        pricingProfile: { select: { id: true, name: true, code: true } },
        product: { select: { id: true, name: true, sku: true } },
      },
      orderBy: [{ pricingProfileId: 'asc' }, { productId: 'asc' }],
    });
  }

  async upsert(user: AuthUser, versionId: string, dto: UpsertPricingProductRuleDto) {
    this.assertCanManage(user);
    const version = await this.assertVersionEditable(versionId);
    if (dto.adjustmentValue < 0) {
      throw new BadRequestException('adjustmentValue cannot be negative');
    }

    try {
      applyPricingAdjustment(1000, dto.adjustmentMode, dto.adjustmentValue);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Invalid adjustment');
    }

    const rule = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.pricingProductRule.upsert({
        where: {
          pricingPolicyVersionId_pricingProfileId_productId: {
            pricingPolicyVersionId: versionId,
            pricingProfileId: dto.pricingProfileId,
            productId: dto.productId,
          },
        },
        create: {
          pricingPolicyVersionId: versionId,
          pricingProfileId: dto.pricingProfileId,
          productId: dto.productId,
          adjustmentMode: dto.adjustmentMode,
          adjustmentValue: dto.adjustmentValue,
          status: PricingRuleStatus.ACTIVE,
          reason: dto.reason ?? null,
          reasonNote: dto.reasonNote ?? null,
          createdById: user.id,
        },
        update: {
          adjustmentMode: dto.adjustmentMode,
          adjustmentValue: dto.adjustmentValue,
          status: PricingRuleStatus.ACTIVE,
          reason: dto.reason ?? null,
          reasonNote: dto.reasonNote ?? null,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'PRODUCT_RULE_UPDATED',
          entity: 'PricingProductRule',
          entityId: saved.id,
          metadata: {
            pricingPolicyVersionId: versionId,
            pricingProfileId: dto.pricingProfileId,
            productId: dto.productId,
            adjustmentMode: dto.adjustmentMode,
            adjustmentValue: dto.adjustmentValue,
            versionNumber: version.versionNumber,
            reason: dto.reason,
            timestamp: new Date().toISOString(),
          },
        },
      });
      return saved;
    });

    return rule;
  }

  async remove(user: AuthUser, versionId: string, ruleId: string) {
    this.assertCanManage(user);
    await this.assertVersionEditable(versionId);
    const existing = await this.prisma.pricingProductRule.findFirst({
      where: { id: ruleId, pricingPolicyVersionId: versionId },
    });
    if (!existing) throw new NotFoundException('Product rule not found');
    await this.prisma.pricingProductRule.delete({ where: { id: ruleId } });
    return { ok: true };
  }

  private async assertVersionEditable(versionId: string) {
    const version = await this.prisma.pricingPolicyVersion.findUnique({ where: { id: versionId } });
    if (!version) throw new NotFoundException('Pricing policy version not found');
    if (version.isLocked || version.status === PricingPolicyVersionStatus.ACTIVE) {
      throw new BadRequestException('Published versions are read-only');
    }
    if (
      version.status !== PricingPolicyVersionStatus.DRAFT &&
      version.status !== PricingPolicyVersionStatus.READY_FOR_REVIEW
    ) {
      throw new BadRequestException('Product rules can only be edited on draft versions');
    }
    return version;
  }

  private assertCanView(user: AuthUser) {
    if (!canViewPricing(user)) throw new ForbiddenException('Insufficient permissions');
  }

  private assertCanManage(user: AuthUser) {
    if (!canManagePricingPolicy(user)) {
      throw new ForbiddenException('Only CEO can manage product rules');
    }
  }
}
