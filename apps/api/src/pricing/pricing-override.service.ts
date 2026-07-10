import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BranchType, Prisma, ProductPriceOverrideStatus } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { canManagePricingPolicy, canViewPricing } from '../rbac/rbac';
import { HQ_CATALOG_BRANCH_CODE } from '../warehouse/warehouse.util';
import {
  dateRangesOverlap,
  isProductOverrideEffective,
  resolveFinalBranchProductPrice,
} from './pricing-calculator.util';
import {
  ProductPriceOverrideQueryDto,
  UpdateProductPriceOverrideDto,
  UpsertProductPriceOverrideDto,
} from './dto/product-price-override.dto';
import { PricingFifoService } from './pricing-fifo.service';

@Injectable()
export class PricingOverrideService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fifoService: PricingFifoService,
  ) {}

  async list(user: AuthUser, query: ProductPriceOverrideQueryDto = {}) {
    this.assertCanView(user);
    await this.expireStaleOverrides();

    const rows = await this.prisma.productPriceOverride.findMany({
      where: {
        ...(query.branchId ? { branchId: query.branchId } : {}),
        ...(query.productId ? { productId: query.productId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      include: {
        branch: { select: { id: true, name: true, code: true, branchType: true } },
        product: { select: { id: true, name: true, sku: true } },
        createdBy: { select: { id: true, fullName: true } },
        approvedBy: { select: { id: true, fullName: true } },
      },
      orderBy: [{ status: 'asc' }, { endDate: 'desc' }],
    });

    return rows.map((row) => this.toResponse(row));
  }

  async findOne(user: AuthUser, id: string) {
    this.assertCanView(user);
    await this.expireStaleOverrides();
    const row = await this.prisma.productPriceOverride.findUnique({
      where: { id },
      include: {
        branch: { select: { id: true, name: true, code: true, branchType: true } },
        product: { select: { id: true, name: true, sku: true } },
        createdBy: { select: { id: true, fullName: true } },
        approvedBy: { select: { id: true, fullName: true } },
      },
    });
    if (!row) throw new NotFoundException('Product override not found');
    return this.toResponse(row);
  }

  async create(user: AuthUser, dto: UpsertProductPriceOverrideDto) {
    this.assertCanManage(user);
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    this.validateDates(startDate, endDate);
    if (dto.overridePriceKgs < 0) {
      throw new BadRequestException('Override price cannot be negative');
    }

    const branch = await this.prisma.branch.findFirst({
      where: { id: dto.branchId, deletedAt: null },
      include: { priceProfile: { include: { categoryDiscounts: true } } },
    });
    if (!branch) throw new NotFoundException('Branch not found');
    if (branch.code === HQ_CATALOG_BRANCH_CODE || branch.branchType === BranchType.HQ_BRANCH) {
      throw new BadRequestException('Overrides are only allowed for franchise branches');
    }

    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, deletedAt: null },
    });
    if (!product) throw new NotFoundException('Product not found');

    await this.assertNoOverlappingActiveOverride(dto.branchId, dto.productId, startDate, endDate);

    const standardPrice = await this.resolveStandardBranchPrice(branch, product);
    const created = await this.prisma.$transaction(async (tx) => {
      const override = await tx.productPriceOverride.create({
        data: {
          branchId: dto.branchId,
          productId: dto.productId,
          overridePriceKgs: dto.overridePriceKgs,
          startDate,
          endDate,
          reason: dto.reason.trim(),
          status: ProductPriceOverrideStatus.ACTIVE,
          createdById: user.id,
          approvedById: dto.approvedById ?? null,
        },
        include: {
          branch: { select: { id: true, name: true, code: true, branchType: true } },
          product: { select: { id: true, name: true, sku: true } },
          createdBy: { select: { id: true, fullName: true } },
          approvedBy: { select: { id: true, fullName: true } },
        },
      });

      await this.auditInTx(tx, user, 'PRODUCT_OVERRIDE_CREATED', override.id, {
        branchId: dto.branchId,
        productId: dto.productId,
        oldPrice: standardPrice,
        newPrice: dto.overridePriceKgs,
        reason: dto.reason.trim(),
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });

      if (dto.approvedById) {
        await this.auditInTx(tx, user, 'PRODUCT_OVERRIDE_APPROVED', override.id, {
          branchId: dto.branchId,
          productId: dto.productId,
          oldPrice: standardPrice,
          newPrice: dto.overridePriceKgs,
          reason: dto.reason.trim(),
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          approvedById: dto.approvedById,
        });
      }

      return override;
    });

    return this.toResponse(created);
  }

  async update(user: AuthUser, id: string, dto: UpdateProductPriceOverrideDto) {
    this.assertCanManage(user);
    const existing = await this.prisma.productPriceOverride.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Product override not found');
    if (existing.status !== ProductPriceOverrideStatus.ACTIVE) {
      throw new BadRequestException('Only active overrides can be edited');
    }

    const startDate = dto.startDate ? new Date(dto.startDate) : existing.startDate;
    const endDate = dto.endDate ? new Date(dto.endDate) : existing.endDate;
    this.validateDates(startDate, endDate);

    const nextPrice = dto.overridePriceKgs ?? Number(existing.overridePriceKgs);
    if (nextPrice < 0) throw new BadRequestException('Override price cannot be negative');

    await this.assertNoOverlappingActiveOverride(
      existing.branchId,
      existing.productId,
      startDate,
      endDate,
      id,
    );

    const updated = await this.prisma.$transaction(async (tx) => {
      const override = await tx.productPriceOverride.update({
        where: { id },
        data: {
          overridePriceKgs: nextPrice,
          startDate,
          endDate,
          reason: dto.reason?.trim() ?? existing.reason,
        },
        include: {
          branch: { select: { id: true, name: true, code: true, branchType: true } },
          product: { select: { id: true, name: true, sku: true } },
          createdBy: { select: { id: true, fullName: true } },
          approvedBy: { select: { id: true, fullName: true } },
        },
      });

      await this.auditInTx(tx, user, 'PRODUCT_OVERRIDE_UPDATED', id, {
        branchId: existing.branchId,
        productId: existing.productId,
        oldPrice: Number(existing.overridePriceKgs),
        newPrice: nextPrice,
        reason: override.reason,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });

      return override;
    });

    return this.toResponse(updated);
  }

  async approve(user: AuthUser, id: string) {
    this.assertCanManage(user);
    const existing = await this.prisma.productPriceOverride.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Product override not found');
    if (existing.status !== ProductPriceOverrideStatus.ACTIVE) {
      throw new BadRequestException('Only active overrides can be approved');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const override = await tx.productPriceOverride.update({
        where: { id },
        data: { approvedById: user.id },
        include: {
          branch: { select: { id: true, name: true, code: true, branchType: true } },
          product: { select: { id: true, name: true, sku: true } },
          createdBy: { select: { id: true, fullName: true } },
          approvedBy: { select: { id: true, fullName: true } },
        },
      });

      await this.auditInTx(tx, user, 'PRODUCT_OVERRIDE_APPROVED', id, {
        branchId: existing.branchId,
        productId: existing.productId,
        oldPrice: Number(existing.overridePriceKgs),
        newPrice: Number(existing.overridePriceKgs),
        reason: existing.reason,
        startDate: existing.startDate.toISOString(),
        endDate: existing.endDate.toISOString(),
        approvedById: user.id,
      });

      return override;
    });

    return this.toResponse(updated);
  }

  async cancel(user: AuthUser, id: string, reason?: string) {
    this.assertCanManage(user);
    const existing = await this.prisma.productPriceOverride.findUnique({
      where: { id },
      include: {
        branch: { include: { priceProfile: { include: { categoryDiscounts: true } } } },
        product: true,
      },
    });
    if (!existing) throw new NotFoundException('Product override not found');
    if (existing.status !== ProductPriceOverrideStatus.ACTIVE) {
      throw new BadRequestException('Only active overrides can be cancelled');
    }

    const standardPrice = await this.resolveStandardBranchPrice(existing.branch, existing.product);

    const updated = await this.prisma.$transaction(async (tx) => {
      const override = await tx.productPriceOverride.update({
        where: { id },
        data: { status: ProductPriceOverrideStatus.CANCELLED },
        include: {
          branch: { select: { id: true, name: true, code: true, branchType: true } },
          product: { select: { id: true, name: true, sku: true } },
          createdBy: { select: { id: true, fullName: true } },
          approvedBy: { select: { id: true, fullName: true } },
        },
      });

      await this.auditInTx(tx, user, 'PRODUCT_OVERRIDE_CANCELLED', id, {
        branchId: existing.branchId,
        productId: existing.productId,
        oldPrice: Number(existing.overridePriceKgs),
        newPrice: standardPrice,
        reason: reason ?? existing.reason,
        startDate: existing.startDate.toISOString(),
        endDate: existing.endDate.toISOString(),
      });
      await this.auditInTx(tx, user, 'PRICE_RECALCULATED', id, {
        branchId: existing.branchId,
        productId: existing.productId,
        reason: reason ?? 'Product override cancelled',
      });

      return override;
    });

    return this.toResponse(updated);
  }

  async getActiveOverridePrice(
    branchId: string,
    productId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number | null> {
    await this.expireStaleOverrides(tx);
    const client = tx ?? this.prisma;
    const override = await client.productPriceOverride.findFirst({
      where: {
        branchId,
        productId,
        status: ProductPriceOverrideStatus.ACTIVE,
        startDate: { lte: new Date() },
        endDate: { gte: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!override || !isProductOverrideEffective(override)) return null;
    return Number(override.overridePriceKgs);
  }

  async expireStaleOverrides(tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    const stale = await client.productPriceOverride.findMany({
      where: {
        status: ProductPriceOverrideStatus.ACTIVE,
        endDate: { lt: new Date() },
      },
    });
    if (!stale.length) return { expired: 0 };

    for (const row of stale) {
      const branch = await client.branch.findUnique({
        where: { id: row.branchId },
        include: { priceProfile: { include: { categoryDiscounts: true } } },
      });
      const product = await client.product.findUnique({ where: { id: row.productId } });
      const standardPrice =
        branch && product ? await this.resolveStandardBranchPrice(branch, product, client) : 0;

      await client.productPriceOverride.update({
        where: { id: row.id },
        data: { status: ProductPriceOverrideStatus.EXPIRED },
      });

      await client.auditLog.create({
        data: {
          userId: null,
          role: 'SYSTEM',
          action: 'PRODUCT_OVERRIDE_EXPIRED',
          entity: 'ProductPriceOverride',
          entityId: row.id,
          metadata: {
            userId: row.createdById,
            branchId: row.branchId,
            productId: row.productId,
            oldPrice: Number(row.overridePriceKgs),
            newPrice: standardPrice,
            reason: row.reason,
            startDate: row.startDate.toISOString(),
            endDate: row.endDate.toISOString(),
            timestamp: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      });
      await client.auditLog.create({
        data: {
          userId: null,
          role: 'SYSTEM',
          action: 'PRICE_RECALCULATED',
          entity: 'ProductPriceOverride',
          entityId: row.id,
          metadata: {
            branchId: row.branchId,
            productId: row.productId,
            reason: 'Product override expired',
            timestamp: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      });
    }

    return { expired: stale.length };
  }

  private async resolveStandardBranchPrice(
    branch: {
      branchType: BranchType;
      priceProfile?: {
        categoryDiscounts?: Array<{ categoryId: string; discountPercent: { toString(): string } | number }>;
      } | null;
    },
    product: {
      id: string;
      categoryId: string;
      hqBranchWholesaleMarkupPercent: { toString(): string } | number;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const cost = await this.fifoService.getLatestHqCostPrice(product.id, tx);
    const categoryDiscount = branch.priceProfile?.categoryDiscounts?.find(
      (row) => row.categoryId === product.categoryId,
    );
    const resolved = resolveFinalBranchProductPrice({
      costPriceKgs: cost.costPriceKgs,
      branchType: branch.branchType,
      baseFranchiseMarkupPercent: Number(product.hqBranchWholesaleMarkupPercent),
      categoryDiscountPercent: categoryDiscount ? Number(categoryDiscount.discountPercent) : 0,
    });
    return resolved.priceKgs;
  }

  private validateDates(startDate: Date, endDate: Date) {
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new BadRequestException('Invalid date');
    }
    if (endDate.getTime() < startDate.getTime()) {
      throw new BadRequestException('End date cannot be earlier than start date');
    }
  }

  private async assertNoOverlappingActiveOverride(
    branchId: string,
    productId: string,
    startDate: Date,
    endDate: Date,
    excludeId?: string,
  ) {
    const activeOverrides = await this.prisma.productPriceOverride.findMany({
      where: {
        branchId,
        productId,
        status: ProductPriceOverrideStatus.ACTIVE,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });

    const overlap = activeOverrides.find((row) =>
      dateRangesOverlap(startDate, endDate, row.startDate, row.endDate),
    );
    if (overlap) {
      throw new BadRequestException(
        'Only one active override is allowed for the same branch and product during the same period',
      );
    }
  }

  private toResponse(row: {
    id: string;
    branchId: string;
    productId: string;
    overridePriceKgs: { toString(): string } | number;
    startDate: Date;
    endDate: Date;
    reason: string;
    status: ProductPriceOverrideStatus;
    createdAt: Date;
    updatedAt: Date;
    branch: { id: string; name: string; code: string; branchType: BranchType };
    product: { id: string; name: string; sku: string };
    createdBy: { id: string; fullName: string };
    approvedBy: { id: string; fullName: string } | null;
  }) {
    return {
      id: row.id,
      branchId: row.branchId,
      productId: row.productId,
      overridePriceKgs: Number(row.overridePriceKgs),
      startDate: row.startDate,
      endDate: row.endDate,
      reason: row.reason,
      status: row.status,
      isEffective: isProductOverrideEffective(row),
      branch: row.branch,
      product: row.product,
      createdBy: row.createdBy,
      approvedBy: row.approvedBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private assertCanView(user: AuthUser) {
    if (!canViewPricing(user)) throw new ForbiddenException('Insufficient permissions to view pricing');
  }

  private assertCanManage(user: AuthUser) {
    if (!canManagePricingPolicy(user)) {
      throw new ForbiddenException('Only CEO can manage product overrides');
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
        entity: 'ProductPriceOverride',
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
