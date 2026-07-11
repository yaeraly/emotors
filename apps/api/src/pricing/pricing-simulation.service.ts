import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PricingPolicyVersionStatus, Prisma } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { canManagePricingPolicy, canViewPricing } from '../rbac/rbac';
import { HQ_CATALOG_BRANCH_CODE } from '../warehouse/warehouse.util';
import { PricingEngineService } from './pricing-engine.service';

@Injectable()
export class PricingSimulationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingEngine: PricingEngineService,
  ) {}

  async getLatest(user: AuthUser, versionId: string) {
    this.assertCanView(user);
    const simulation = await this.prisma.pricingSimulation.findFirst({
      where: { pricingPolicyVersionId: versionId },
      orderBy: { createdAt: 'desc' },
    });
    if (!simulation) throw new NotFoundException('Simulation not found');
    return simulation;
  }

  async refresh(user: AuthUser, versionId: string) {
    this.assertCanManage(user);
    const version = await this.prisma.pricingPolicyVersion.findUnique({ where: { id: versionId } });
    if (!version) throw new NotFoundException('Pricing policy version not found');
    if (
      version.status !== PricingPolicyVersionStatus.DRAFT &&
      version.status !== PricingPolicyVersionStatus.READY_FOR_REVIEW
    ) {
      throw new BadRequestException('Simulation can only be refreshed for draft versions');
    }

    const activeVersionId = await this.pricingEngine.getActiveVersionId();
    const hqBranch = await this.prisma.branch.findFirst({ where: { code: HQ_CATALOG_BRANCH_CODE } });
    const products = hqBranch
      ? await this.prisma.product.findMany({
          where: { branchId: hqBranch.id, deletedAt: null, isActive: true },
          include: { productCategory: true },
        })
      : [];
    const branches = await this.prisma.branch.findMany({
      where: { deletedAt: null, code: { not: HQ_CATALOG_BRANCH_CODE } },
      include: { priceProfile: true },
    });

    const rows: Array<Record<string, unknown>> = [];
    const validationErrors: string[] = [];
    let increaseCount = 0;
    let decreaseCount = 0;
    let marginDeltaSum = 0;
    let marginDeltaCount = 0;

    for (const branch of branches) {
      for (const product of products) {
        const oldResult = activeVersionId
          ? await this.pricingEngine.resolvePrice({
              productId: product.id,
              branchId: branch.id,
              pricingPolicyVersionId: activeVersionId,
            })
          : await this.pricingEngine.resolvePrice({
              productId: product.id,
              branchId: branch.id,
            });

        const newResult = await this.pricingEngine.resolvePrice({
          productId: product.id,
          branchId: branch.id,
          pricingPolicyVersionId: versionId,
        });

        const oldPrice = oldResult.resolvedPriceKgs;
        const newPrice = newResult.resolvedPriceKgs;
        const diffKgs = newPrice - oldPrice;
        const diffPercent = oldPrice > 0 ? (diffKgs / oldPrice) * 100 : 0;
        const oldMargin =
          oldResult.baseCostKgs > 0
            ? ((oldPrice - oldResult.baseCostKgs) / oldResult.baseCostKgs) * 100
            : 0;
        const newMargin =
          newResult.baseCostKgs > 0
            ? ((newPrice - newResult.baseCostKgs) / newResult.baseCostKgs) * 100
            : 0;

        if (newPrice < 0) {
          validationErrors.push(`Negative price for ${product.sku} at ${branch.name}`);
        }
        if (diffKgs > 0) increaseCount += 1;
        if (diffKgs < 0) decreaseCount += 1;
        marginDeltaSum += newMargin - oldMargin;
        marginDeltaCount += 1;

        rows.push({
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          category: product.category,
          branchId: branch.id,
          branchName: branch.name,
          profileName: branch.priceProfile?.name ?? '—',
          oldPriceKgs: oldPrice,
          newPriceKgs: newPrice,
          diffKgs,
          diffPercent,
          oldMarginPercent: oldMargin,
          newMarginPercent: newMargin,
        });
      }
    }

    const summary = {
      productsAffected: products.length,
      categoriesAffected: new Set(products.map((p) => p.categoryId)).size,
      branchesAffected: branches.length,
      profilesAffected: new Set(branches.map((b) => b.priceProfileId).filter(Boolean)).size,
      productsWithIncrease: increaseCount,
      productsWithDecrease: decreaseCount,
      averageMarginChange: marginDeltaCount ? marginDeltaSum / marginDeltaCount : 0,
      validationErrorCount: validationErrors.length,
    };

    const simulation = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.pricingSimulation.create({
        data: {
          pricingPolicyVersionId: versionId,
          summary: summary as Prisma.InputJsonValue,
          rows: rows as Prisma.InputJsonValue,
          validationErrors: validationErrors.length
            ? (validationErrors as Prisma.InputJsonValue)
            : undefined,
          createdById: user.id,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'PRICING_SIMULATION_REFRESHED',
          entity: 'PricingSimulation',
          entityId: saved.id,
          metadata: {
            pricingPolicyVersionId: versionId,
            summary,
            timestamp: new Date().toISOString(),
          },
        },
      });
      return saved;
    });

    return simulation;
  }

  private assertCanView(user: AuthUser) {
    if (!canViewPricing(user)) throw new ForbiddenException('Insufficient permissions');
  }

  private assertCanManage(user: AuthUser) {
    if (!canManagePricingPolicy(user)) {
      throw new ForbiddenException('Only CEO can run pricing simulation');
    }
  }
}
