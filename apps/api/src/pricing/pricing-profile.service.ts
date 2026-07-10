import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BranchPriceProfileStatus, BranchType, Prisma } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { canManagePricingPolicy, canViewPricing } from '../rbac/rbac';
import { AssignBranchPriceProfileDto, UpsertBranchPriceProfileDto } from './dto/branch-price-profile.dto';

@Injectable()
export class PricingProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthUser) {
    this.assertCanView(user);
    const profiles = await this.prisma.branchPriceProfile.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { branches: true } },
        branches: {
          where: { deletedAt: null },
          select: { id: true, name: true, code: true, branchType: true },
          orderBy: { name: 'asc' },
        },
      },
    });
    return profiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
      branchType: profile.branchType,
      defaultHqMarkupPercent: Number(profile.defaultHqMarkupPercent),
      status: profile.status,
      description: profile.description,
      branchCount: profile._count.branches,
      branches: profile.branches,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    }));
  }

  async create(user: AuthUser, dto: UpsertBranchPriceProfileDto) {
    this.assertCanManage(user);
    if (dto.defaultHqMarkupPercent < 0) {
      throw new BadRequestException('Markup must be >= 0');
    }
    const duplicate = await this.prisma.branchPriceProfile.findUnique({
      where: { name: dto.name.trim() },
    });
    if (duplicate) throw new BadRequestException('Profile name already exists');

    const created = await this.prisma.$transaction(async (tx) => {
      const profile = await tx.branchPriceProfile.create({
        data: {
          name: dto.name.trim(),
          branchType: dto.branchType ?? BranchType.FRANCHISE_BRANCH,
          defaultHqMarkupPercent: dto.defaultHqMarkupPercent,
          status: dto.status ?? BranchPriceProfileStatus.ACTIVE,
          description: dto.description?.trim() || null,
          createdById: user.id,
        },
      });
      await this.auditInTx(tx, user, 'PRICE_PROFILE_CREATED', 'BranchPriceProfile', profile.id, {
        profileId: profile.id,
        name: profile.name,
        defaultHqMarkupPercent: Number(profile.defaultHqMarkupPercent),
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
    if (dto.defaultHqMarkupPercent < 0) {
      throw new BadRequestException('Markup must be >= 0');
    }
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
          branchType: dto.branchType ?? profile.branchType,
          defaultHqMarkupPercent: dto.defaultHqMarkupPercent,
          status: dto.status ?? profile.status,
          description: dto.description?.trim() || null,
        },
      });
      await this.auditInTx(tx, user, 'PRICE_PROFILE_UPDATED', 'BranchPriceProfile', id, {
        profileId: id,
        oldMarkup: Number(profile.defaultHqMarkupPercent),
        newMarkup: dto.defaultHqMarkupPercent,
        reason: dto.reason,
      });
      await this.auditInTx(tx, user, 'PRICE_RECALCULATED', 'BranchPriceProfile', id, {
        profileId: id,
        reason: dto.reason ?? 'Price profile markup updated',
      });
      await tx.branch.updateMany({
        where: { priceProfileId: id, deletedAt: null },
        data: {
          hqToBranchMarkupPercent: dto.defaultHqMarkupPercent,
          hqToBranchMarkupUpdatedAt: new Date(),
        },
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
    if (branch.branchType === BranchType.HQ_BRANCH) {
      throw new BadRequestException('HQ branches always use cost pricing');
    }

    let profile = null;
    if (dto.profileId) {
      profile = await this.prisma.branchPriceProfile.findUnique({ where: { id: dto.profileId } });
      if (!profile) throw new NotFoundException('Price profile not found');
      if (profile.status !== BranchPriceProfileStatus.ACTIVE) {
        throw new BadRequestException('Only active profiles can be assigned');
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.branch.update({
        where: { id: branchId },
        data: {
          priceProfileId: dto.profileId ?? null,
          hqToBranchMarkupPercent: profile
            ? Number(profile.defaultHqMarkupPercent)
            : Number(branch.hqToBranchMarkupPercent),
          hqToBranchMarkupUpdatedAt: new Date(),
        },
        include: { priceProfile: true },
      });

      const action = branch.priceProfileId ? 'PRICE_PROFILE_CHANGED' : 'PRICE_PROFILE_ASSIGNED';
      await this.auditInTx(tx, user, action, 'Branch', branchId, {
        branchId,
        profileId: dto.profileId ?? null,
        oldProfileId: branch.priceProfileId,
        oldMarkup: branch.priceProfile ? Number(branch.priceProfile.defaultHqMarkupPercent) : null,
        newMarkup: profile ? Number(profile.defaultHqMarkupPercent) : null,
        reason: dto.reason,
      });
      await this.auditInTx(tx, user, 'PRICE_RECALCULATED', 'Branch', branchId, {
        branchId,
        profileId: dto.profileId ?? null,
        reason: dto.reason ?? 'Branch price profile assignment changed',
      });
      return next;
    });

    return {
      id: updated.id,
      name: updated.name,
      branchType: updated.branchType,
      priceProfileId: updated.priceProfileId,
      priceProfile: updated.priceProfile
        ? {
            id: updated.priceProfile.id,
            name: updated.priceProfile.name,
            defaultHqMarkupPercent: Number(updated.priceProfile.defaultHqMarkupPercent),
          }
        : null,
    };
  }

  async findOne(user: AuthUser, id: string) {
    this.assertCanView(user);
    const profile = await this.prisma.branchPriceProfile.findUnique({
      where: { id },
      include: {
        _count: { select: { branches: true } },
        branches: {
          where: { deletedAt: null },
          select: { id: true, name: true, code: true, branchType: true },
          orderBy: { name: 'asc' },
        },
      },
    });
    if (!profile) throw new NotFoundException('Price profile not found');
    return {
      id: profile.id,
      name: profile.name,
      branchType: profile.branchType,
      defaultHqMarkupPercent: Number(profile.defaultHqMarkupPercent),
      status: profile.status,
      description: profile.description,
      branchCount: profile._count.branches,
      branches: profile.branches,
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
