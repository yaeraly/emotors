import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PricingChangeReasonCode, PricingPolicyVersionStatus, PricingRuleStatus } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { canManagePricingPolicy, canViewPricing } from '../rbac/rbac';
import { applyCategoryDiscountRoundUp } from './pricing-calculator.util';

export class UpsertPricingCategoryRuleDto {
  pricingProfileId!: string;
  categoryId!: string;
  discountPercent!: number;
  reason?: PricingChangeReasonCode;
  reasonNote?: string;
}

@Injectable()
export class PricingCategoryRuleService {
  constructor(private readonly prisma: PrismaService) {}

  async listForVersion(user: AuthUser, versionId: string) {
    this.assertCanView(user);
    await this.assertVersionEditable(versionId);
    return this.prisma.pricingCategoryRule.findMany({
      where: { pricingPolicyVersionId: versionId },
      include: {
        pricingProfile: { select: { id: true, name: true, code: true } },
        category: { select: { id: true, code: true, nameRu: true, nameEn: true } },
      },
      orderBy: [{ pricingProfileId: 'asc' }, { categoryId: 'asc' }],
    });
  }

  async upsert(user: AuthUser, versionId: string, dto: UpsertPricingCategoryRuleDto) {
    this.assertCanManage(user);
    const version = await this.assertVersionEditable(versionId);
    this.validateDiscount(dto.discountPercent);

    const baseBranchPriceKgs = 1000;
    const resultPrice = applyCategoryDiscountRoundUp(baseBranchPriceKgs, dto.discountPercent);
    if (resultPrice < 0) {
      throw new BadRequestException('Resulting price cannot be negative');
    }

    const rule = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.pricingCategoryRule.upsert({
        where: {
          pricingPolicyVersionId_pricingProfileId_categoryId: {
            pricingPolicyVersionId: versionId,
            pricingProfileId: dto.pricingProfileId,
            categoryId: dto.categoryId,
          },
        },
        create: {
          pricingPolicyVersionId: versionId,
          pricingProfileId: dto.pricingProfileId,
          categoryId: dto.categoryId,
          discountPercent: dto.discountPercent,
          status: PricingRuleStatus.ACTIVE,
          reason: dto.reason ?? null,
          reasonNote: dto.reasonNote ?? null,
        },
        update: {
          discountPercent: dto.discountPercent,
          status: PricingRuleStatus.ACTIVE,
          reason: dto.reason ?? null,
          reasonNote: dto.reasonNote ?? null,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'CATEGORY_RULE_UPDATED',
          entity: 'PricingCategoryRule',
          entityId: saved.id,
          metadata: {
            pricingPolicyVersionId: versionId,
            pricingProfileId: dto.pricingProfileId,
            categoryId: dto.categoryId,
            discountPercent: dto.discountPercent,
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
    const existing = await this.prisma.pricingCategoryRule.findFirst({
      where: { id: ruleId, pricingPolicyVersionId: versionId },
    });
    if (!existing) throw new NotFoundException('Category rule not found');
    await this.prisma.pricingCategoryRule.delete({ where: { id: ruleId } });
    return { ok: true };
  }

  private validateDiscount(discountPercent: number) {
    if (discountPercent < 0 || discountPercent > 100) {
      throw new BadRequestException('discountPercent must be between 0 and 100');
    }
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
      throw new BadRequestException('Category rules can only be edited on draft versions');
    }
    return version;
  }

  private assertCanView(user: AuthUser) {
    if (!canViewPricing(user)) throw new ForbiddenException('Insufficient permissions');
  }

  private assertCanManage(user: AuthUser) {
    if (!canManagePricingPolicy(user)) {
      throw new ForbiddenException('Only CEO can manage category rules');
    }
  }
}
