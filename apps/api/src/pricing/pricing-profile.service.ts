import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BranchPriceProfileStatus, BranchPriceProfileType, BranchType, Prisma } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { canManagePricingPolicy, canViewPricing } from '../rbac/rbac';
import { AssignBranchPriceProfileDto, UpsertBranchPriceProfileDto } from './dto/branch-price-profile.dto';
import {
  getBranchTypeForProfileType,
  getProfileCode,
  getProfileHierarchyOrder,
  isProfileCompatibleWithBranch,
  PRESET_PROFILE_TYPES,
  resolveDefaultPriceProfileId,
} from './pricing-profile-defaults.util';

import { BranchOrderPricingRevisionService } from './branch-order-pricing-revision.service';

@Injectable()
export class PricingProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchOrderPricingRevision: BranchOrderPricingRevisionService,
  ) {}

  async list(user: AuthUser) {
    this.assertCanView(user);
    const profiles = await this.prisma.branchPriceProfile.findMany({
      include: {
        _count: { select: { branches: true, categoryDiscounts: true } },
        branches: {
          where: { deletedAt: null },
          select: { id: true, name: true, code: true, branchType: true },
          orderBy: { name: 'asc' },
        },
        categoryDiscounts: {
          include: { category: { select: { id: true, code: true, nameRu: true, nameEn: true } } },
        },
      },
    });
    return profiles
      .sort(
        (left, right) =>
          getProfileHierarchyOrder(left.profileType) - getProfileHierarchyOrder(right.profileType),
      )
      .map((profile) => this.toResponse(profile));
  }

  async create(user: AuthUser, dto: UpsertBranchPriceProfileDto) {
    this.assertCanManage(user);
    if (!PRESET_PROFILE_TYPES.includes(dto.profileType)) {
      throw new BadRequestException('Unsupported price profile type');
    }
    const duplicateType = await this.prisma.branchPriceProfile.findUnique({
      where: { profileType: dto.profileType },
    });
    if (duplicateType) throw new BadRequestException('Price profile type already exists');
    const duplicate = await this.prisma.branchPriceProfile.findUnique({
      where: { name: dto.name.trim() },
    });
    if (duplicate) throw new BadRequestException('Profile name already exists');
    const profileCode = getProfileCode(dto.profileType);
    const duplicateCode = await this.prisma.branchPriceProfile.findUnique({
      where: { code: profileCode },
    });
    if (duplicateCode) throw new BadRequestException('Profile code already exists');

    const created = await this.prisma.$transaction(async (tx) => {
      const profile = await tx.branchPriceProfile.create({
        data: {
          name: dto.name.trim(),
          code: profileCode,
          profileType: dto.profileType,
          branchType: getBranchTypeForProfileType(dto.profileType),
          defaultHqMarkupPercent: dto.defaultHqMarkupPercent ?? 0,
          status: dto.status ?? BranchPriceProfileStatus.ACTIVE,
          description: dto.description?.trim() || null,
          createdById: user.id,
        },
      });
      await this.auditInTx(tx, user, 'PRICE_PROFILE_CREATED', 'BranchPriceProfile', profile.id, {
        profileId: profile.id,
        profileType: profile.profileType,
        name: profile.name,
        reason: dto.reason,
      });
      return profile;
    });

    return this.findOne(user, created.id);
  }

  async update(user: AuthUser, id: string, dto: UpsertBranchPriceProfileDto) {
    this.assertCanManage(user);
    const profile = await this.prisma.branchPriceProfile.findUnique({ where: { id } });
    if (!profile) throw new NotFoundException('Price profile not found');
    if (dto.name.trim() !== profile.name) {
      const duplicate = await this.prisma.branchPriceProfile.findUnique({
        where: { name: dto.name.trim() },
      });
      if (duplicate) throw new BadRequestException('Profile name already exists');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.branchPriceProfile.update({
        where: { id },
        data: {
          name: dto.name.trim(),
          status: dto.status ?? profile.status,
          description: dto.description?.trim() || null,
        },
      });
      await this.auditInTx(tx, user, 'PRICE_PROFILE_UPDATED', 'BranchPriceProfile', id, {
        profileId: id,
        profileType: profile.profileType,
        reason: dto.reason,
      });
      return next;
    });

    return this.findOne(user, updated.id);
  }

  async remove(user: AuthUser, id: string, reason?: string) {
    this.assertCanManage(user);
    const profile = await this.prisma.branchPriceProfile.findUnique({
      where: { id },
      include: { _count: { select: { branches: true } } },
    });
    if (!profile) throw new NotFoundException('Price profile not found');
    if (PRESET_PROFILE_TYPES.includes(profile.profileType)) {
      throw new BadRequestException('Preset price profiles cannot be deleted');
    }
    if (profile.status === BranchPriceProfileStatus.ACTIVE && profile._count.branches > 0) {
      throw new BadRequestException('Cannot delete an active profile assigned to branches');
    }
    if (profile._count.branches > 0) {
      throw new BadRequestException('Cannot delete a profile assigned to branches');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.branchPriceProfile.delete({ where: { id } });
      await this.auditInTx(tx, user, 'PRICE_PROFILE_UPDATED', 'BranchPriceProfile', id, {
        profileId: id,
        deleted: true,
        reason,
      });
    });

    return { success: true };
  }

  async assignBranch(user: AuthUser, branchId: string, dto: AssignBranchPriceProfileDto) {
    this.assertCanManage(user);
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, deletedAt: null },
      include: { priceProfile: true },
    });
    if (!branch) throw new NotFoundException('Branch not found');

    const targetProfileId =
      dto.profileId ??
      (await resolveDefaultPriceProfileId(this.prisma, branch.branchType));

    let profile = null;
    if (targetProfileId) {
      profile = await this.prisma.branchPriceProfile.findUnique({ where: { id: targetProfileId } });
      if (!profile) throw new NotFoundException('Price profile not found');
      if (profile.status !== BranchPriceProfileStatus.ACTIVE) {
        throw new BadRequestException('Only active profiles can be assigned');
      }
      if (!isProfileCompatibleWithBranch(branch.branchType, profile.profileType)) {
        throw new BadRequestException('Profile is not compatible with branch type');
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.branch.update({
        where: { id: branchId },
        data: { priceProfileId: targetProfileId },
        include: { priceProfile: true },
      });

      const action = branch.priceProfileId ? 'PRICE_PROFILE_CHANGED' : 'PRICE_PROFILE_ASSIGNED';
      await this.auditInTx(tx, user, action, 'Branch', branchId, {
        branchId,
        profileId: targetProfileId,
        oldProfileId: branch.priceProfileId,
        reason: dto.reason,
      });
      await this.auditInTx(tx, user, 'PRICE_RECALCULATED', 'Branch', branchId, {
        branchId,
        profileId: targetProfileId,
        reason: dto.reason ?? 'Branch price profile assignment changed',
      });
      return next;
    });

    this.branchOrderPricingRevision.bump();
    return {
      id: updated.id,
      name: updated.name,
      branchType: updated.branchType,
      priceProfileId: updated.priceProfileId,
      priceProfile: updated.priceProfile
        ? {
            id: updated.priceProfile.id,
            name: updated.priceProfile.name,
            profileType: updated.priceProfile.profileType,
          }
        : null,
    };
  }

  async findOne(user: AuthUser, id: string) {
    this.assertCanView(user);
    const profile = await this.prisma.branchPriceProfile.findUnique({
      where: { id },
      include: {
        _count: { select: { branches: true, categoryDiscounts: true } },
        branches: {
          where: { deletedAt: null },
          select: { id: true, name: true, code: true, branchType: true },
          orderBy: { name: 'asc' },
        },
        categoryDiscounts: {
          include: { category: { select: { id: true, code: true, nameRu: true, nameEn: true } } },
        },
      },
    });
    if (!profile) throw new NotFoundException('Price profile not found');
    return this.toResponse(profile);
  }

  private toResponse(profile: {
    id: string;
    name: string;
    code: string;
    profileType: BranchPriceProfileType;
    branchType: BranchType;
    defaultHqMarkupPercent: { toString(): string } | number;
    status: BranchPriceProfileStatus;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
    _count: { branches: number; categoryDiscounts: number };
    branches: Array<{ id: string; name: string; code: string; branchType: BranchType }>;
    categoryDiscounts: Array<{
      id: string;
      categoryId: string;
      discountPercent: { toString(): string } | number;
      category: { id: string; code: string; nameRu: string; nameEn: string };
    }>;
  }) {
    return {
      id: profile.id,
      name: profile.name,
      code: profile.code,
      profileType: profile.profileType,
      branchType: profile.branchType,
      defaultHqMarkupPercent: Number(profile.defaultHqMarkupPercent),
      status: profile.status,
      description: profile.description,
      branchCount: profile._count.branches,
      categoryDiscountCount: profile._count.categoryDiscounts,
      branches: profile.branches,
      categoryDiscounts: profile.categoryDiscounts.map((row) => ({
        id: row.id,
        categoryId: row.categoryId,
        category: row.category,
        discountPercent: Number(row.discountPercent),
      })),
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }

  private assertCanView(user: AuthUser) {
    if (!canViewPricing(user)) throw new ForbiddenException('Insufficient permissions to view pricing');
  }

  private assertCanManage(user: AuthUser) {
    if (!canManagePricingPolicy(user)) {
      throw new ForbiddenException('Only CEO can manage pricing profiles');
    }
  }

  private async auditInTx(
    tx: Prisma.TransactionClient,
    user: AuthUser,
    action: string,
    entity: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ) {
    await tx.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action,
        entity,
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
