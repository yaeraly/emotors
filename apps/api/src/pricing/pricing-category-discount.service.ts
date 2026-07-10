import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { canManagePricingPolicy, canViewPricing } from '../rbac/rbac';
import { UpsertProfileCategoryDiscountsDto } from './dto/pricing-category-discount.dto';

@Injectable()
export class PricingCategoryDiscountService {
  constructor(private readonly prisma: PrismaService) {}

  async listForProfile(user: AuthUser, profileId: string) {
    this.assertCanView(user);
    const profile = await this.prisma.branchPriceProfile.findUnique({
      where: { id: profileId },
      include: {
        categoryDiscounts: {
          include: {
            category: { select: { id: true, code: true, nameRu: true, nameKy: true, nameEn: true } },
          },
          orderBy: { category: { nameRu: 'asc' } },
        },
      },
    });
    if (!profile) throw new NotFoundException('Price profile not found');
    return {
      profileId: profile.id,
      profileType: profile.profileType,
      name: profile.name,
      discounts: profile.categoryDiscounts.map((row) => ({
        id: row.id,
        categoryId: row.categoryId,
        category: row.category,
        discountPercent: Number(row.discountPercent),
      })),
    };
  }

  async upsertForProfile(user: AuthUser, profileId: string, dto: UpsertProfileCategoryDiscountsDto) {
    this.assertCanManage(user);
    const profile = await this.prisma.branchPriceProfile.findUnique({ where: { id: profileId } });
    if (!profile) throw new NotFoundException('Price profile not found');

    for (const item of dto.discounts) {
      if (item.discountPercent < 0) {
        throw new BadRequestException('Discount cannot be negative');
      }
      const category = await this.prisma.productCategory.findUnique({ where: { id: item.categoryId } });
      if (!category) throw new NotFoundException(`Category ${item.categoryId} not found`);
    }

    await this.prisma.$transaction(async (tx) => {
      for (const item of dto.discounts) {
        const existing = await tx.branchPriceProfileCategoryDiscount.findUnique({
          where: { profileId_categoryId: { profileId, categoryId: item.categoryId } },
        });
        const saved = await tx.branchPriceProfileCategoryDiscount.upsert({
          where: { profileId_categoryId: { profileId, categoryId: item.categoryId } },
          create: {
            profileId,
            categoryId: item.categoryId,
            discountPercent: item.discountPercent,
          },
          update: { discountPercent: item.discountPercent },
        });
        await this.auditInTx(tx, user, 'CATEGORY_DISCOUNT_UPDATED', saved.id, {
          profileId,
          categoryId: item.categoryId,
          oldValue: existing ? Number(existing.discountPercent) : 0,
          newValue: item.discountPercent,
          reason: dto.reason,
        });
      }
      await this.auditInTx(tx, user, 'PRICE_RECALCULATED', profileId, {
        profileId,
        reason: dto.reason ?? 'Category discounts updated',
      });
    });

    return this.listForProfile(user, profileId);
  }

  private assertCanView(user: AuthUser) {
    if (!canViewPricing(user)) throw new ForbiddenException('Insufficient permissions to view pricing');
  }

  private assertCanManage(user: AuthUser) {
    if (!canManagePricingPolicy(user)) {
      throw new ForbiddenException('Only CEO can manage category discounts');
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
        entity: 'BranchPriceProfileCategoryDiscount',
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
