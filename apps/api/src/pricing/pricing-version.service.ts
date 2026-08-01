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
  SchedulePricingPolicyVersionDto,
  VersionActionDto,
} from './dto/pricing-policy-version.dto';
import { pricesFromMarkups } from './pricing-calculator.util';
import { BranchOrderPricingRevisionService } from './branch-order-pricing-revision.service';
import { PricingCatalogService } from './pricing-catalog.service';
import { PricingSchedulerService } from './pricing-scheduler.service';
import { PricingSettingsService } from './pricing-settings.service';
import { PricingValidationService } from './pricing-validation.service';

@Injectable()
export class PricingVersionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogService: PricingCatalogService,
    private readonly schedulerService: PricingSchedulerService,
    private readonly validationService: PricingValidationService,
    private readonly settingsService: PricingSettingsService,
    private readonly branchOrderPricingRevision: BranchOrderPricingRevisionService,
  ) {}

  async list(user: AuthUser) {
    this.assertCanView(user);
    await this.schedulerService.runDueActivations();
    const versions = await this.prisma.pricingPolicyVersion.findMany({
      orderBy: { versionNumber: 'desc' },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        publishedBy: { select: { id: true, fullName: true } },
        approvedBy: { select: { id: true, fullName: true } },
        _count: {
          select: {
            productSnapshots: true,
            categoryDiscountSnapshots: true,
            categoryRules: true,
            productRules: true,
            simulations: true,
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
      changeReason: version.changeReason,
      effectiveFrom: version.effectiveFrom,
      effectiveTimezone: version.effectiveTimezone,
      publishedAt: version.publishedAt,
      archivedAt: version.archivedAt,
      createdBy: version.createdBy,
      publishedBy: version.publishedBy,
      approvedBy: version.approvedBy,
      productSnapshotCount: version._count.productSnapshots,
      categoryRuleCount: version._count.categoryRules,
      productRuleCount: version._count.productRules,
      simulationCount: version._count.simulations,
      createdAt: version.createdAt,
      updatedAt: version.updatedAt,
    }));
  }

  async getActive(user: AuthUser) {
    this.assertCanView(user);
    await this.schedulerService.runDueActivations();
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

    const active = await this.prisma.pricingPolicyVersion.findFirst({
      where: { status: PricingPolicyVersionStatus.ACTIVE },
      include: { categoryRules: true, productRules: true },
    });

    const maxVersion = await this.prisma.pricingPolicyVersion.aggregate({ _max: { versionNumber: true } });
    const versionNumber = (maxVersion._max.versionNumber ?? 0) + 1;
    const label = dto.label?.trim() || `Pricing Policy v${versionNumber}`;

    const created = await this.prisma.$transaction(async (tx) => {
      const version = await tx.pricingPolicyVersion.create({
        data: {
          versionNumber,
          label,
          status: PricingPolicyVersionStatus.DRAFT,
          changeReason: dto.changeReason ?? null,
          changeReasonNote: dto.changeReasonNote ?? null,
          createdById: user.id,
        },
      });

      if (active) {
        for (const rule of active.categoryRules) {
          await tx.pricingCategoryRule.create({
            data: {
              pricingPolicyVersionId: version.id,
              pricingProfileId: rule.pricingProfileId,
              categoryId: rule.categoryId,
              discountPercent: rule.discountPercent,
              status: rule.status,
              reason: rule.reason,
              reasonNote: rule.reasonNote,
            },
          });
        }
        for (const rule of active.productRules) {
          await tx.pricingProductRule.create({
            data: {
              pricingPolicyVersionId: version.id,
              pricingProfileId: rule.pricingProfileId,
              productId: rule.productId,
              adjustmentMode: rule.adjustmentMode,
              adjustmentValue: rule.adjustmentValue,
              status: rule.status,
              reason: rule.reason,
              reasonNote: rule.reasonNote,
              createdById: rule.createdById,
            },
          });
        }
      }

      await this.auditInTx(tx, user, 'PRICE_POLICY_VERSION_CREATED', version.id, {
        version: versionNumber,
        label,
        reason: dto.reason ?? dto.changeReason,
      });
      return version;
    });

    return created;
  }

  async clone(user: AuthUser, id: string, dto: CreatePricingPolicyVersionDto) {
    this.assertCanManage(user);
    const source = await this.prisma.pricingPolicyVersion.findUnique({
      where: { id },
      include: { categoryRules: true, productRules: true },
    });
    if (!source) throw new NotFoundException('Pricing policy version not found');

    const existingDraft = await this.prisma.pricingPolicyVersion.findFirst({
      where: { status: PricingPolicyVersionStatus.DRAFT },
    });
    if (existingDraft) {
      throw new BadRequestException('A draft pricing policy version already exists');
    }

    const maxVersion = await this.prisma.pricingPolicyVersion.aggregate({ _max: { versionNumber: true } });
    const versionNumber = (maxVersion._max.versionNumber ?? 0) + 1;
    const label = dto.label?.trim() || `Pricing Policy v${versionNumber}`;

    const cloned = await this.prisma.$transaction(async (tx) => {
      const version = await tx.pricingPolicyVersion.create({
        data: {
          versionNumber,
          label,
          status: PricingPolicyVersionStatus.DRAFT,
          changeReason: dto.changeReason ?? source.changeReason,
          changeReasonNote: dto.changeReasonNote ?? source.changeReasonNote,
          createdById: user.id,
        },
      });

      for (const rule of source.categoryRules) {
        await tx.pricingCategoryRule.create({
          data: {
            pricingPolicyVersionId: version.id,
            pricingProfileId: rule.pricingProfileId,
            categoryId: rule.categoryId,
            discountPercent: rule.discountPercent,
            status: rule.status,
            reason: rule.reason,
            reasonNote: rule.reasonNote,
          },
        });
      }
      for (const rule of source.productRules) {
        await tx.pricingProductRule.create({
          data: {
            pricingPolicyVersionId: version.id,
            pricingProfileId: rule.pricingProfileId,
            productId: rule.productId,
            adjustmentMode: rule.adjustmentMode,
            adjustmentValue: rule.adjustmentValue,
            status: rule.status,
            reason: rule.reason,
            reasonNote: rule.reasonNote,
            createdById: user.id,
          },
        });
      }

      await this.auditInTx(tx, user, 'PRICE_POLICY_VERSION_CLONED', version.id, {
        version: versionNumber,
        clonedFromVersion: source.versionNumber,
        reason: dto.reason,
      });
      return version;
    });

    return cloned;
  }

  async submitForReview(user: AuthUser, id: string, dto: VersionActionDto) {
    this.assertCanManage(user);
    const version = await this.getEditableVersion(id);
    if (version.status !== PricingPolicyVersionStatus.DRAFT) {
      throw new BadRequestException('Only draft versions can be submitted for review');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.pricingPolicyVersion.update({
        where: { id },
        data: {
          status: PricingPolicyVersionStatus.READY_FOR_REVIEW,
          changeReason: dto.changeReason ?? version.changeReason,
          changeReasonNote: dto.changeReasonNote ?? version.changeReasonNote,
        },
      });
      await this.auditInTx(tx, user, 'PRICE_POLICY_READY_FOR_REVIEW', id, {
        version: version.versionNumber,
        reason: dto.reason,
      });
      return next;
    });
    return updated;
  }

  async approve(user: AuthUser, id: string, dto: VersionActionDto) {
    this.assertCanManage(user);
    const version = await this.prisma.pricingPolicyVersion.findUnique({ where: { id } });
    if (!version) throw new NotFoundException('Pricing policy version not found');
    if (version.status !== PricingPolicyVersionStatus.READY_FOR_REVIEW) {
      throw new BadRequestException('Only versions ready for review can be approved');
    }
    await this.assertHasSimulation(id);
    const validation = await this.validationService.validateVersion(id, { auditUser: user });
    if (!validation.valid) {
      throw new BadRequestException({
        message: 'Pricing policy version failed validation',
        validation,
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.pricingPolicyVersion.update({
        where: { id },
        data: {
          status: PricingPolicyVersionStatus.APPROVED,
          approvedById: user.id,
          changeReason: dto.changeReason ?? version.changeReason,
          changeReasonNote: dto.changeReasonNote ?? version.changeReasonNote,
        },
      });
      await this.auditInTx(tx, user, 'PRICE_POLICY_APPROVED', id, {
        version: version.versionNumber,
        reason: dto.reason,
      });
      return next;
    });
    return updated;
  }

  async schedule(user: AuthUser, id: string, dto: SchedulePricingPolicyVersionDto) {
    this.assertCanManage(user);
    const version = await this.prisma.pricingPolicyVersion.findUnique({ where: { id } });
    if (!version) throw new NotFoundException('Pricing policy version not found');
    if (version.status !== PricingPolicyVersionStatus.APPROVED) {
      throw new BadRequestException('Only approved versions can be scheduled');
    }
    await this.assertHasSimulation(id);
    const validation = await this.validationService.validateVersion(id, { auditUser: user });
    if (!validation.valid) {
      throw new BadRequestException({
        message: 'Pricing policy version failed validation',
        validation,
      });
    }

    const effectiveFrom = new Date(dto.effectiveFrom);
    if (Number.isNaN(effectiveFrom.getTime())) {
      throw new BadRequestException('Invalid effectiveFrom date');
    }

    const now = new Date();
    if (effectiveFrom.getTime() <= now.getTime()) {
      return this.activateNow(user, id, effectiveFrom);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.pricingPolicyVersion.update({
        where: { id },
        data: {
          status: PricingPolicyVersionStatus.SCHEDULED,
          effectiveFrom,
          effectiveTimezone:
            dto.effectiveTimezone ?? (await this.settingsService.getDefaultActivationTimezone()),
          scheduledById: user.id,
          scheduledAt: now,
          changeReason: dto.changeReason ?? version.changeReason,
        },
      });
      await this.auditInTx(tx, user, 'PRICE_POLICY_SCHEDULED', id, {
        version: version.versionNumber,
        effectiveFrom: effectiveFrom.toISOString(),
      });
      return next;
    });
    return updated;
  }

  async publish(user: AuthUser, id: string, dto: PublishPricingPolicyVersionDto) {
    this.assertCanManage(user);
    const version = await this.prisma.pricingPolicyVersion.findUnique({ where: { id } });
    if (!version) throw new NotFoundException('Pricing policy version not found');

    if (version.status === PricingPolicyVersionStatus.APPROVED) {
      const effectiveFrom = dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date();
      if (dto.effectiveFrom && effectiveFrom.getTime() > Date.now()) {
        return this.schedule(user, id, {
          effectiveFrom: dto.effectiveFrom,
          changeReason: version.changeReason ?? undefined,
        });
      }
      return this.activateNow(user, id, effectiveFrom, dto.reason);
    }

    if (version.status !== PricingPolicyVersionStatus.DRAFT) {
      throw new BadRequestException('Only draft or approved versions can be published');
    }
    await this.assertHasSimulation(id);

    return this.activateNow(user, id, new Date(), dto.reason);
  }

  async validate(user: AuthUser, id: string) {
    this.assertCanView(user);
    return this.validationService.validateVersion(id, { auditUser: user });
  }

  private async activateNow(user: AuthUser, id: string, effectiveFrom: Date, reason?: string) {
    const version = await this.prisma.pricingPolicyVersion.findUnique({ where: { id } });
    if (!version) throw new NotFoundException('Pricing policy version not found');

    const simulation = await this.prisma.pricingSimulation.findFirst({
      where: { pricingPolicyVersionId: id },
      orderBy: { createdAt: 'desc' },
    });
    if (simulation?.validationErrors) {
      const errors = simulation.validationErrors as string[];
      if (Array.isArray(errors) && errors.length) {
        throw new BadRequestException('Cannot publish version with validation errors');
      }
    }

    const validation = await this.validationService.validateVersion(id, { auditUser: user });
    if (!validation.valid) {
      throw new BadRequestException({
        message: 'Pricing policy version failed activation validation',
        validation,
      });
    }

    const published = await this.prisma.$transaction(async (tx) => {
      await this.snapshotCurrentState(tx, version.id);

      await tx.pricingPolicyVersion.updateMany({
        where: { status: PricingPolicyVersionStatus.ACTIVE },
        data: {
          status: PricingPolicyVersionStatus.ARCHIVED,
          archivedAt: new Date(),
        },
      });

      const next = await tx.pricingPolicyVersion.update({
        where: { id },
        data: {
          status: PricingPolicyVersionStatus.ACTIVE,
          isLocked: true,
          effectiveFrom,
          publishedAt: new Date(),
          publishedById: user.id,
          approvedById: version.approvedById ?? user.id,
        },
      });

      await this.auditInTx(tx, user, 'PRICE_POLICY_ACTIVATED', id, {
        version: version.versionNumber,
        reason,
      });

      return next;
    });

    await this.catalogService.refreshCostsAndAutoPrices(user);
    this.branchOrderPricingRevision.bump();
    return published;
  }

  async rollback(user: AuthUser, id: string, dto: RollbackPricingPolicyVersionDto) {
    return this.clone(user, id, { label: undefined, reason: dto.reason });
  }

  private async assertHasSimulation(versionId: string) {
    const simulation = await this.prisma.pricingSimulation.findFirst({
      where: { pricingPolicyVersionId: versionId },
      orderBy: { createdAt: 'desc' },
    });
    if (!simulation) {
      throw new BadRequestException('Pricing simulation is required before approval or publish');
    }
  }

  private async getEditableVersion(id: string) {
    const version = await this.prisma.pricingPolicyVersion.findUnique({ where: { id } });
    if (!version) throw new NotFoundException('Pricing policy version not found');
    if (version.isLocked) {
      throw new BadRequestException('Published versions are read-only');
    }
    return version;
  }

  private async snapshotCurrentState(tx: Prisma.TransactionClient, versionId: string) {
    const profiles = await tx.branchPriceProfile.findMany({
      include: { categoryDiscounts: true },
    });
    for (const profile of profiles) {
      for (const discount of profile.categoryDiscounts) {
        await tx.pricingPolicyVersionCategoryDiscount.upsert({
          where: {
            versionId_profileId_categoryId: {
              versionId,
              profileId: profile.id,
              categoryId: discount.categoryId,
            },
          },
          create: {
            versionId,
            profileId: profile.id,
            profileType: profile.profileType,
            categoryId: discount.categoryId,
            discountPercent: discount.discountPercent,
          },
          update: { discountPercent: discount.discountPercent },
        });
        await tx.pricingCategoryRule.upsert({
          where: {
            pricingPolicyVersionId_pricingProfileId_categoryId: {
              pricingPolicyVersionId: versionId,
              pricingProfileId: profile.id,
              categoryId: discount.categoryId,
            },
          },
          create: {
            pricingPolicyVersionId: versionId,
            pricingProfileId: profile.id,
            categoryId: discount.categoryId,
            discountPercent: discount.discountPercent,
            status: 'ACTIVE',
          },
          update: { discountPercent: discount.discountPercent, status: 'ACTIVE' },
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
        masterMarkupPercent: Number(product.masterMarkupPercent ?? 0),
        recommendedRetailMarkupPercent: Number(product.recommendedRetailMarkupPercent),
        minimumSellingMarkupPercent: Number(product.minimumSellingMarkupPercent),
      };
      const prices = pricesFromMarkups(Number(product.costPriceKgs), markups);
      await tx.pricingPolicyVersionProductSnapshot.upsert({
        where: { versionId_productId: { versionId, productId: product.id } },
        create: {
          versionId,
          productId: product.id,
          sku: product.sku,
          costPriceKgs: product.costPriceKgs,
          hqBranchWholesaleMarkupPercent: product.hqBranchWholesaleMarkupPercent,
          wholesaleMarkupPercent: product.wholesaleMarkupPercent,
          minimumWholesaleMarkupPercent: product.minimumWholesaleMarkupPercent,
          masterMarkupPercent: product.masterMarkupPercent,
          recommendedRetailMarkupPercent: product.recommendedRetailMarkupPercent,
          minimumSellingMarkupPercent: product.minimumSellingMarkupPercent,
          hqBranchWholesalePriceKgs: product.hqBranchWholesalePriceKgs,
          wholesalePriceKgs: product.wholesalePriceKgs,
          minimumWholesalePriceKgs: prices.minimumWholesalePriceKgs,
          masterPriceKgs: product.masterPriceKgs,
          recommendedRetailPriceKgs: product.recommendedRetailPriceKgs,
          minimumSellingPriceKgs: product.minimumSellingPriceKgs,
        },
        update: {
          costPriceKgs: product.costPriceKgs,
          hqBranchWholesaleMarkupPercent: product.hqBranchWholesaleMarkupPercent,
          wholesaleMarkupPercent: product.wholesaleMarkupPercent,
          minimumWholesaleMarkupPercent: product.minimumWholesaleMarkupPercent,
          masterMarkupPercent: product.masterMarkupPercent,
          recommendedRetailMarkupPercent: product.recommendedRetailMarkupPercent,
          minimumSellingMarkupPercent: product.minimumSellingMarkupPercent,
          hqBranchWholesalePriceKgs: product.hqBranchWholesalePriceKgs,
          wholesalePriceKgs: product.wholesalePriceKgs,
          minimumWholesalePriceKgs: prices.minimumWholesalePriceKgs,
          masterPriceKgs: product.masterPriceKgs,
          recommendedRetailPriceKgs: product.recommendedRetailPriceKgs,
          minimumSellingPriceKgs: product.minimumSellingPriceKgs,
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

