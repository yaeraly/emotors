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
import {
  CreatePricingPolicyVersionDto,
  PublishPricingPolicyVersionDto,
  RollbackPricingPolicyVersionDto,
} from './dto/pricing-policy-version.dto';
import { pricesFromMarkups } from './pricing-calculator.util';
import { PricingCatalogService } from './pricing-catalog.service';

@Injectable()
export class PricingVersionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogService: PricingCatalogService,
  ) {}

  async list(user: AuthUser) {
    this.assertCanView(user);
    const versions = await this.prisma.pricingPolicyVersion.findMany({
      orderBy: { versionNumber: 'desc' },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        publishedBy: { select: { id: true, fullName: true } },
        _count: {
          select: {
            productSnapshots: true,
            categoryDiscountSnapshots: true,
          },
        },
      },
    });
    return versions.map((version) => ({
      id: version.id,
      versionNumber: version.versionNumber,
      label: version.label,
      status: version.status,
      isLocked: version.isLocked,
      publishedAt: version.publishedAt,
      createdBy: version.createdBy,
      publishedBy: version.publishedBy,
      productSnapshotCount: version._count.productSnapshots,
      categoryDiscountSnapshotCount: version._count.categoryDiscountSnapshots,
      createdAt: version.createdAt,
      updatedAt: version.updatedAt,
    }));
  }

  async getActive(user: AuthUser) {
    this.assertCanView(user);
    const active = await this.prisma.pricingPolicyVersion.findFirst({
      where: { status: PricingPolicyVersionStatus.ACTIVE },
      orderBy: { versionNumber: 'desc' },
    });
    return active ?? null;
  }

  async create(user: AuthUser, dto: CreatePricingPolicyVersionDto) {
    this.assertCanManage(user);
    const existingDraft = await this.prisma.pricingPolicyVersion.findFirst({
      where: { status: PricingPolicyVersionStatus.DRAFT },
    });
    if (existingDraft) {
      throw new BadRequestException('A draft pricing policy version already exists');
    }

    const maxVersion = await this.prisma.pricingPolicyVersion.aggregate({ _max: { versionNumber: true } });
    const versionNumber = (maxVersion._max.versionNumber ?? 0) + 1;
    const label = dto.label?.trim() || `Pricing Policy v${versionNumber}`;

    const created = await this.prisma.$transaction(async (tx) => {
      const version = await tx.pricingPolicyVersion.create({
        data: {
          versionNumber,
          label,
          status: PricingPolicyVersionStatus.DRAFT,
          createdById: user.id,
        },
      });
      await this.auditInTx(tx, user, 'PRICE_POLICY_VERSION_CREATED', version.id, {
        version: versionNumber,
        label,
        reason: dto.reason,
      });
      return version;
    });

    return created;
  }

  async publish(user: AuthUser, id: string, dto: PublishPricingPolicyVersionDto) {
    this.assertCanManage(user);
    const version = await this.prisma.pricingPolicyVersion.findUnique({ where: { id } });
    if (!version) throw new NotFoundException('Pricing policy version not found');
    if (version.status !== PricingPolicyVersionStatus.DRAFT) {
      throw new BadRequestException('Only draft versions can be published');
    }

    const published = await this.prisma.$transaction(async (tx) => {
      await this.snapshotCurrentState(tx, version.id);

      await tx.pricingPolicyVersion.updateMany({
        where: { status: PricingPolicyVersionStatus.ACTIVE },
        data: { status: PricingPolicyVersionStatus.ARCHIVED },
      });

      const next = await tx.pricingPolicyVersion.update({
        where: { id },
        data: {
          status: PricingPolicyVersionStatus.ACTIVE,
          isLocked: true,
          publishedAt: new Date(),
          publishedById: user.id,
        },
      });

      await this.auditInTx(tx, user, 'PRICE_POLICY_VERSION_PUBLISHED', id, {
        version: version.versionNumber,
        reason: dto.reason,
      });
      await this.auditInTx(tx, user, 'PRICE_RECALCULATED', id, {
        version: version.versionNumber,
        reason: dto.reason ?? 'Pricing policy version published',
      });

      return next;
    });

    await this.catalogService.refreshCostsAndAutoPrices(user);
    return published;
  }

  async rollback(user: AuthUser, id: string, dto: RollbackPricingPolicyVersionDto) {
    this.assertCanManage(user);
    const source = await this.prisma.pricingPolicyVersion.findUnique({
      where: { id },
      include: {
        categoryDiscountSnapshots: true,
        productSnapshots: true,
      },
    });
    if (!source) throw new NotFoundException('Pricing policy version not found');
    if (!source.isLocked) {
      throw new BadRequestException('Only published versions can be rolled back');
    }

    const maxVersion = await this.prisma.pricingPolicyVersion.aggregate({ _max: { versionNumber: true } });
    const versionNumber = (maxVersion._max.versionNumber ?? 0) + 1;
    const label = `Pricing Policy v${versionNumber} (rollback from v${source.versionNumber})`;

    const rolled = await this.prisma.$transaction(async (tx) => {
      const draft = await tx.pricingPolicyVersion.create({
        data: {
          versionNumber,
          label,
          status: PricingPolicyVersionStatus.DRAFT,
          createdById: user.id,
        },
      });

      await this.restoreSnapshotToLive(tx, source);
      await this.snapshotCurrentState(tx, draft.id);

      await tx.pricingPolicyVersion.updateMany({
        where: { status: PricingPolicyVersionStatus.ACTIVE },
        data: { status: PricingPolicyVersionStatus.ARCHIVED },
      });

      const active = await tx.pricingPolicyVersion.update({
        where: { id: draft.id },
        data: {
          status: PricingPolicyVersionStatus.ACTIVE,
          isLocked: true,
          publishedAt: new Date(),
          publishedById: user.id,
        },
      });

      await this.auditInTx(tx, user, 'PRICE_POLICY_VERSION_ROLLED_BACK', active.id, {
        version: versionNumber,
        rolledBackFromVersion: source.versionNumber,
        reason: dto.reason,
      });
      await this.auditInTx(tx, user, 'PRICE_RECALCULATED', active.id, {
        version: versionNumber,
        reason: dto.reason ?? `Rollback from v${source.versionNumber}`,
      });

      return active;
    });

    await this.catalogService.refreshCostsAndAutoPrices(user);
    return rolled;
  }

  private async snapshotCurrentState(tx: Prisma.TransactionClient, versionId: string) {
    const profiles = await tx.branchPriceProfile.findMany({
      include: { categoryDiscounts: true },
    });
    for (const profile of profiles) {
      for (const discount of profile.categoryDiscounts) {
        await tx.pricingPolicyVersionCategoryDiscount.create({
          data: {
            versionId,
            profileId: profile.id,
            profileType: profile.profileType,
            categoryId: discount.categoryId,
            discountPercent: discount.discountPercent,
          },
        });
      }
    }

    const hqBranch = await tx.branch.findFirst({ where: { code: HQ_CATALOG_BRANCH_CODE } });
    if (!hqBranch) return;

    const products = await tx.product.findMany({
      where: { branchId: hqBranch.id, deletedAt: null },
    });
    for (const product of products) {
      const markups = {
        wholesaleMarkupPercent: Number(product.wholesaleMarkupPercent),
        minimumWholesaleMarkupPercent: Number(product.minimumWholesaleMarkupPercent),
        hqBranchWholesaleMarkupPercent: Number(product.hqBranchWholesaleMarkupPercent),
        recommendedRetailMarkupPercent: Number(product.recommendedRetailMarkupPercent),
        minimumSellingMarkupPercent: Number(product.minimumSellingMarkupPercent),
      };
      const prices = pricesFromMarkups(Number(product.costPriceKgs), markups);
      await tx.pricingPolicyVersionProductSnapshot.create({
        data: {
          versionId,
          productId: product.id,
          sku: product.sku,
          costPriceKgs: product.costPriceKgs,
          hqBranchWholesaleMarkupPercent: product.hqBranchWholesaleMarkupPercent,
          wholesaleMarkupPercent: product.wholesaleMarkupPercent,
          minimumWholesaleMarkupPercent: product.minimumWholesaleMarkupPercent,
          recommendedRetailMarkupPercent: product.recommendedRetailMarkupPercent,
          minimumSellingMarkupPercent: product.minimumSellingMarkupPercent,
          hqBranchWholesalePriceKgs: product.hqBranchWholesalePriceKgs,
          wholesalePriceKgs: product.wholesalePriceKgs,
          minimumWholesalePriceKgs: prices.minimumWholesalePriceKgs,
          recommendedRetailPriceKgs: product.recommendedRetailPriceKgs,
          minimumSellingPriceKgs: product.minimumSellingPriceKgs,
        },
      });
    }
  }

  private async restoreSnapshotToLive(
    tx: Prisma.TransactionClient,
    source: {
      categoryDiscountSnapshots: Array<{
        profileId: string;
        categoryId: string;
        discountPercent: Prisma.Decimal;
      }>;
      productSnapshots: Array<{
        productId: string;
        costPriceKgs: Prisma.Decimal;
        hqBranchWholesaleMarkupPercent: Prisma.Decimal;
        wholesaleMarkupPercent: Prisma.Decimal;
        minimumWholesaleMarkupPercent: Prisma.Decimal;
        recommendedRetailMarkupPercent: Prisma.Decimal;
        minimumSellingMarkupPercent: Prisma.Decimal;
        hqBranchWholesalePriceKgs: Prisma.Decimal;
        wholesalePriceKgs: Prisma.Decimal;
        minimumWholesalePriceKgs: Prisma.Decimal;
        recommendedRetailPriceKgs: Prisma.Decimal;
        minimumSellingPriceKgs: Prisma.Decimal;
      }>;
    },
  ) {
    for (const discount of source.categoryDiscountSnapshots) {
      await tx.branchPriceProfileCategoryDiscount.upsert({
        where: {
          profileId_categoryId: {
            profileId: discount.profileId,
            categoryId: discount.categoryId,
          },
        },
        create: {
          profileId: discount.profileId,
          categoryId: discount.categoryId,
          discountPercent: discount.discountPercent,
        },
        update: { discountPercent: discount.discountPercent },
      });
    }

    for (const snapshot of source.productSnapshots) {
      await tx.product.update({
        where: { id: snapshot.productId },
        data: {
          costPriceKgs: snapshot.costPriceKgs,
          hqBranchWholesaleMarkupPercent: snapshot.hqBranchWholesaleMarkupPercent,
          wholesaleMarkupPercent: snapshot.wholesaleMarkupPercent,
          minimumWholesaleMarkupPercent: snapshot.minimumWholesaleMarkupPercent,
          recommendedRetailMarkupPercent: snapshot.recommendedRetailMarkupPercent,
          minimumSellingMarkupPercent: snapshot.minimumSellingMarkupPercent,
          hqBranchWholesalePriceKgs: snapshot.hqBranchWholesalePriceKgs,
          wholesalePriceKgs: snapshot.wholesalePriceKgs,
          recommendedRetailPriceKgs: snapshot.recommendedRetailPriceKgs,
          minimumSellingPriceKgs: snapshot.minimumSellingPriceKgs,
        },
      });
    }
  }

  private assertCanView(user: AuthUser) {
    if (!canViewPricing(user)) throw new ForbiddenException('Insufficient permissions to view pricing');
  }

  private assertCanManage(user: AuthUser) {
    if (!canManagePricingPolicy(user)) {
      throw new ForbiddenException('Only CEO can manage pricing policy versions');
    }
  }

  private async auditInTx(
    tx: Prisma.TransactionClient,
    user: AuthUser,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ) {
    await tx.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action,
        entity: 'PricingPolicyVersion',
        entityId,
        metadata: {
          userId: user.id,
          role: user.role,
          roles: user.roles ?? [user.role],
          timestamp: new Date().toISOString(),
          ...metadata,
        } as Prisma.InputJsonValue,
      },
    });
  }
}
