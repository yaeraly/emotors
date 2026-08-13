import { Injectable } from '@nestjs/common';
import { PricingRuleStatus, Prisma } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { HQ_CATALOG_BRANCH_CODE } from '../warehouse/warehouse.util';

export type PricingValidationIssue = {
  code: string;
  severity: 'ERROR' | 'WARNING';
  message: string;
  entity?: string;
  entityId?: string;
  meta?: Record<string, unknown>;
};

export type PricingVersionValidationReport = {
  versionId: string;
  valid: boolean;
  errorCount: number;
  warningCount: number;
  issues: PricingValidationIssue[];
  checkedAt: string;
};

@Injectable()
export class PricingValidationService {
  constructor(private readonly prisma: PrismaService) {}

  async validateVersion(
    versionId: string,
    options?: { auditUser?: AuthUser | null },
  ): Promise<PricingVersionValidationReport> {
    const issues: PricingValidationIssue[] = [];

    const version = await this.prisma.pricingPolicyVersion.findUnique({
      where: { id: versionId },
      include: {
        categoryRules: true,
        productRules: true,
        productOverrides: true,
      },
    });

    if (!version) {
      return {
        versionId,
        valid: false,
        errorCount: 1,
        warningCount: 0,
        issues: [
          {
            code: 'VERSION_NOT_FOUND',
            severity: 'ERROR',
            message: 'Pricing policy version not found',
            entity: 'PricingPolicyVersion',
            entityId: versionId,
          },
        ],
        checkedAt: new Date().toISOString(),
      };
    }

    const hqBranch = await this.prisma.branch.findFirst({
      where: { code: HQ_CATALOG_BRANCH_CODE },
      select: { id: true },
    });

    if (hqBranch) {
      const products = await this.prisma.product.findMany({
        where: { branchId: hqBranch.id, deletedAt: null, isActive: true },
        select: {
          id: true,
          sku: true,
          name: true,
          hqBranchWholesaleMarkupPercent: true,
        },
      });

      for (const product of products) {
        const markup = Number(product.hqBranchWholesaleMarkupPercent);
        if (!Number.isFinite(markup) || markup < 0) {
          issues.push({
            code: 'INVALID_HQ_MARKUP',
            severity: 'ERROR',
            message: `Product ${product.sku} has invalid HQ franchise markup`,
            entity: 'Product',
            entityId: product.id,
            meta: { sku: product.sku, markup },
          });
        }
      }
    } else {
      issues.push({
        code: 'HQ_CATALOG_MISSING',
        severity: 'ERROR',
        message: 'HQ catalog branch is missing',
      });
    }

    const branches = await this.prisma.branch.findMany({
      where: { deletedAt: null, code: { not: HQ_CATALOG_BRANCH_CODE } },
      select: {
        id: true,
        name: true,
        code: true,
        priceProfileId: true,
        priceProfile: { select: { id: true, status: true, name: true } },
      },
    });

    for (const branch of branches) {
      if (!branch.priceProfileId) {
        issues.push({
          code: 'BRANCH_MISSING_PROFILE',
          severity: 'ERROR',
          message: `Branch ${branch.code} has no Pricing Profile assigned`,
          entity: 'Branch',
          entityId: branch.id,
          meta: { branchCode: branch.code, branchName: branch.name },
        });
      } else if (branch.priceProfile?.status !== 'ACTIVE') {
        issues.push({
          code: 'BRANCH_INACTIVE_PROFILE',
          severity: 'ERROR',
          message: `Branch ${branch.code} references inactive Pricing Profile`,
          entity: 'Branch',
          entityId: branch.id,
          meta: {
            branchCode: branch.code,
            profileId: branch.priceProfileId,
            profileName: branch.priceProfile?.name,
          },
        });
      }
    }

    const activeCategoryRules = version.categoryRules.filter(
      (rule) => rule.status === PricingRuleStatus.ACTIVE,
    );
    const categoryKeyCounts = new Map<string, number>();
    for (const rule of activeCategoryRules) {
      const key = `${rule.pricingProfileId}::${rule.categoryId}`;
      categoryKeyCounts.set(key, (categoryKeyCounts.get(key) ?? 0) + 1);
    }
    for (const [key, count] of categoryKeyCounts) {
      if (count > 1) {
        const [pricingProfileId, categoryId] = key.split('::');
        issues.push({
          code: 'DUPLICATE_ACTIVE_CATEGORY_RULE',
          severity: 'ERROR',
          message: `Duplicate active Category Rule for profile ${pricingProfileId} and category ${categoryId}`,
          entity: 'PricingCategoryRule',
          meta: { pricingProfileId, categoryId, count },
        });
      }
    }

    const activeProductRules = version.productRules.filter(
      (rule) => rule.status === PricingRuleStatus.ACTIVE,
    );
    const productKeyCounts = new Map<string, number>();
    for (const rule of activeProductRules) {
      const key = `${rule.pricingProfileId}::${rule.productId}`;
      productKeyCounts.set(key, (productKeyCounts.get(key) ?? 0) + 1);
    }
    for (const [key, count] of productKeyCounts) {
      if (count > 1) {
        const [pricingProfileId, productId] = key.split('::');
        issues.push({
          code: 'DUPLICATE_ACTIVE_PRODUCT_RULE',
          severity: 'ERROR',
          message: `Duplicate active Product Rule for profile ${pricingProfileId} and product ${productId}`,
          entity: 'PricingProductRule',
          meta: { pricingProfileId, productId, count },
        });
      }
    }

    const profileIds = new Set<string>([
      ...version.categoryRules.map((r) => r.pricingProfileId),
      ...version.productRules.map((r) => r.pricingProfileId),
    ]);
    if (profileIds.size) {
      const profiles = await this.prisma.branchPriceProfile.findMany({
        where: { id: { in: Array.from(profileIds) } },
        select: { id: true, status: true, name: true },
      });
      const found = new Map(profiles.map((p) => [p.id, p]));
      for (const profileId of profileIds) {
        const profile = found.get(profileId);
        if (!profile) {
          issues.push({
            code: 'INVALID_PROFILE_REFERENCE',
            severity: 'ERROR',
            message: `Pricing Profile ${profileId} referenced by rules does not exist`,
            entity: 'BranchPriceProfile',
            entityId: profileId,
          });
        } else if (profile.status !== 'ACTIVE') {
          issues.push({
            code: 'INACTIVE_PROFILE_REFERENCE',
            severity: 'WARNING',
            message: `Pricing Profile ${profile.name} is inactive but referenced by version rules`,
            entity: 'BranchPriceProfile',
            entityId: profileId,
          });
        }
      }
    }

    const overrides = await this.prisma.productPriceOverride.findMany({
      where: {
        OR: [{ pricingPolicyVersionId: versionId }, { pricingPolicyVersionId: null }],
        status: { in: ['ACTIVE', 'APPROVED', 'PENDING_APPROVAL', 'DRAFT'] },
      },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        status: true,
        productId: true,
        branchId: true,
      },
    });

    for (const override of overrides) {
      if (override.startDate.getTime() > override.endDate.getTime()) {
        issues.push({
          code: 'INVALID_OVERRIDE_DATES',
          severity: 'ERROR',
          message: `Override ${override.id} has startDate after endDate`,
          entity: 'ProductPriceOverride',
          entityId: override.id,
          meta: {
            startDate: override.startDate.toISOString(),
            endDate: override.endDate.toISOString(),
            status: override.status,
          },
        });
      }
    }

    const errorCount = issues.filter((i) => i.severity === 'ERROR').length;
    const warningCount = issues.filter((i) => i.severity === 'WARNING').length;
    const report: PricingVersionValidationReport = {
      versionId,
      valid: errorCount === 0,
      errorCount,
      warningCount,
      issues,
      checkedAt: new Date().toISOString(),
    };

    if (options?.auditUser) {
      await this.prisma.auditLog.create({
        data: {
          userId: options.auditUser.id,
          role: options.auditUser.role,
          action: report.valid ? 'PRICE_POLICY_VALIDATION_PASSED' : 'PRICE_POLICY_VALIDATION_FAILED',
          entity: 'PricingPolicyVersion',
          entityId: versionId,
          metadata: {
            versionNumber: version.versionNumber,
            valid: report.valid,
            errorCount,
            warningCount,
            issues: issues.slice(0, 100),
            timestamp: report.checkedAt,
          } as Prisma.InputJsonValue,
        },
      });
    }

    return report;
  }
}
