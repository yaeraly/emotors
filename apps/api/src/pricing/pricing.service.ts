import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PricingPolicyStatus, Prisma } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  canManagePricingPolicy,
  canViewPricing,
  hasAnyFullAccessRole,
  resolveUserRoles,
} from '../rbac/rbac';
import { HQ_CATALOG_BRANCH_CODE } from '../warehouse/warehouse.util';
import { UpsertPricingPolicyDto } from './dto/upsert-pricing-policy.dto';
import {
  DISCOUNT_EXCEEDS_ALLOWED_LIMIT,
  PRICE_BELOW_MINIMUM,
  PRICING_POLICY_FIELDS,
  PricingPolicyField,
} from './pricing-policy.util';

type PrismaTx = Prisma.TransactionClient;

type SaleItemInput = {
  productId?: string;
  productSku?: string;
  unitPrice: number;
};

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  list(user: AuthUser) {
    this.assertCanView(user);
    return this.prisma.productPricingPolicy.findMany({
      include: {
        createdBy: { select: { id: true, fullName: true, role: true } },
        updatedBy: { select: { id: true, fullName: true, role: true } },
      },
      orderBy: [{ status: 'asc' }, { sku: 'asc' }],
    });
  }

  async findOne(user: AuthUser, id: string) {
    this.assertCanView(user);
    const policy = await this.prisma.productPricingPolicy.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, fullName: true, role: true } },
        updatedBy: { select: { id: true, fullName: true, role: true } },
        history: {
          include: { changedBy: { select: { id: true, fullName: true, role: true } } },
          orderBy: { createdAt: 'desc' },
          take: 100,
        },
      },
    });
    if (!policy) throw new NotFoundException('Pricing policy not found');
    return policy;
  }

  async findBySku(user: AuthUser, sku: string) {
    this.assertCanView(user);
    const policy = await this.prisma.productPricingPolicy.findUnique({
      where: { sku },
      include: {
        createdBy: { select: { id: true, fullName: true, role: true } },
        updatedBy: { select: { id: true, fullName: true, role: true } },
      },
    });
    if (!policy) throw new NotFoundException('Pricing policy not found');
    return policy;
  }

  async create(user: AuthUser, dto: UpsertPricingPolicyDto) {
    this.assertCanManage(user);
    this.validatePolicyValues(dto);

    const hqProduct = await this.resolveHqCatalogProduct(dto.sku, dto.hqCatalogProductId);

    const existing = await this.prisma.productPricingPolicy.findUnique({
      where: { sku: dto.sku },
    });
    if (existing) {
      throw new BadRequestException('Pricing policy for this SKU already exists');
    }

    const policy = await this.prisma.$transaction(async (tx) => {
      const created = await tx.productPricingPolicy.create({
        data: {
          sku: dto.sku,
          productName: dto.productName ?? hqProduct?.name ?? dto.sku,
          hqCatalogProductId: hqProduct?.id ?? dto.hqCatalogProductId ?? null,
          purchasePriceYuan: dto.purchasePriceYuan,
          landedCostKgs: dto.landedCostKgs,
          wholesalePriceKgs: dto.wholesalePriceKgs,
          hqBranchWholesalePriceKgs: dto.hqBranchWholesalePriceKgs,
          recommendedRetailPriceKgs: dto.recommendedRetailPriceKgs,
          minimumSellingPriceKgs: dto.minimumSellingPriceKgs,
          maximumDiscountPercent: dto.maximumDiscountPercent,
          status: dto.status ?? PricingPolicyStatus.DRAFT,
          reason: dto.reason,
          createdById: user.id,
          updatedById: user.id,
        },
      });

      await this.recordPolicyFieldHistory(tx, user, created.id, dto.sku, null, created, dto.reason);
      await this.auditInTx(tx, user, 'PRICE_POLICY_CREATED', 'ProductPricingPolicy', created.id, {
        productId: hqProduct?.id,
        sku: dto.sku,
        newValue: this.policySnapshot(created),
        reason: dto.reason,
      });

      if (created.status === PricingPolicyStatus.ACTIVE) {
        await this.syncPolicyToBranches(tx, user, created, dto.reason);
      }

      return created;
    });

    return this.findOne(user, policy.id);
  }

  async update(user: AuthUser, id: string, dto: UpsertPricingPolicyDto) {
    this.assertCanManage(user);
    this.validatePolicyValues(dto);

    const current = await this.prisma.productPricingPolicy.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Pricing policy not found');
    if (current.status === PricingPolicyStatus.ARCHIVED) {
      throw new BadRequestException('Archived pricing policy cannot be edited');
    }
    if (dto.sku !== current.sku) {
      throw new BadRequestException('SKU cannot be changed for an existing pricing policy');
    }

    const hqProduct = await this.resolveHqCatalogProduct(dto.sku, dto.hqCatalogProductId ?? current.hqCatalogProductId);

    const policy = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.productPricingPolicy.update({
        where: { id },
        data: {
          productName: dto.productName ?? hqProduct?.name ?? current.productName,
          hqCatalogProductId: hqProduct?.id ?? dto.hqCatalogProductId ?? current.hqCatalogProductId,
          purchasePriceYuan: dto.purchasePriceYuan,
          landedCostKgs: dto.landedCostKgs,
          wholesalePriceKgs: dto.wholesalePriceKgs,
          hqBranchWholesalePriceKgs: dto.hqBranchWholesalePriceKgs,
          recommendedRetailPriceKgs: dto.recommendedRetailPriceKgs,
          minimumSellingPriceKgs: dto.minimumSellingPriceKgs,
          maximumDiscountPercent: dto.maximumDiscountPercent,
          reason: dto.reason ?? current.reason,
          updatedById: user.id,
        },
      });

      await this.recordPolicyFieldHistory(tx, user, updated.id, updated.sku, current, updated, dto.reason);
      await this.auditInTx(tx, user, 'PRICE_POLICY_UPDATED', 'ProductPricingPolicy', updated.id, {
        productId: hqProduct?.id,
        sku: updated.sku,
        oldValue: this.policySnapshot(current),
        newValue: this.policySnapshot(updated),
        reason: dto.reason,
      });

      if (updated.status === PricingPolicyStatus.ACTIVE) {
        await this.syncPolicyToBranches(tx, user, updated, dto.reason);
      }

      return updated;
    });

    return this.findOne(user, policy.id);
  }

  async activate(user: AuthUser, id: string, reason?: string) {
    this.assertCanManage(user);
    const current = await this.prisma.productPricingPolicy.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Pricing policy not found');

    const policy = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.productPricingPolicy.update({
        where: { id },
        data: {
          status: PricingPolicyStatus.ACTIVE,
          effectiveFrom: new Date(),
          reason: reason ?? current.reason,
          updatedById: user.id,
        },
      });

      await this.auditInTx(tx, user, 'SELLING_PRICE_CREATED', 'ProductPricingPolicy', updated.id, {
        sku: updated.sku,
        newValue: this.policySnapshot(updated),
        reason,
      });

      await this.syncPolicyToBranches(tx, user, updated, reason);
      return updated;
    });

    return this.findOne(user, policy.id);
  }

  async archive(user: AuthUser, id: string, reason?: string) {
    this.assertCanManage(user);
    const current = await this.prisma.productPricingPolicy.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Pricing policy not found');

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.productPricingPolicy.update({
        where: { id },
        data: {
          status: PricingPolicyStatus.ARCHIVED,
          reason: reason ?? current.reason,
          updatedById: user.id,
        },
      });

      await this.auditInTx(tx, user, 'SELLING_PRICE_ARCHIVED', 'ProductPricingPolicy', updated.id, {
        sku: updated.sku,
        oldValue: this.policySnapshot(current),
        newValue: this.policySnapshot(updated),
        reason,
      });
    });

    return this.findOne(user, id);
  }

  history(user: AuthUser, id: string) {
    this.assertCanView(user);
    return this.prisma.productPricingChangeHistory.findMany({
      where: { policyId: id },
      include: {
        changedBy: { select: { id: true, fullName: true, role: true } },
        product: { select: { id: true, name: true, sku: true, branchId: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async validateSaleItems(user: AuthUser, branchId: string, items: SaleItemInput[]) {
    if (hasAnyFullAccessRole(resolveUserRoles(user))) return;

    for (const item of items) {
      if (!item.productId) continue;
      const product = await this.prisma.product.findFirst({
        where: { id: item.productId, branchId, deletedAt: null },
      });
      if (!product) continue;

      const listPrice = Number(product.recommendedRetailPriceKgs || product.sellingPriceKgs);
      const minPrice = Number(product.minimumSellingPriceKgs || 0);
      const maxDiscount = Number(product.maximumDiscountPercent || 0);

      if (item.unitPrice + 0.01 < minPrice) {
        await this.audit(user, 'PRICE_CHANGE_DENIED', 'Product', product.id, {
          branchId,
          productId: product.id,
          reason: PRICE_BELOW_MINIMUM,
          oldValue: { minimumSellingPriceKgs: minPrice },
          newValue: { unitPrice: item.unitPrice },
        });
        throw new BadRequestException(PRICE_BELOW_MINIMUM);
      }

      if (listPrice > 0) {
        const discountPercent = ((listPrice - item.unitPrice) / listPrice) * 100;
        if (discountPercent > maxDiscount + 0.01) {
          await this.audit(user, 'PRICE_CHANGE_DENIED', 'Product', product.id, {
            branchId,
            productId: product.id,
            reason: DISCOUNT_EXCEEDS_ALLOWED_LIMIT,
            oldValue: { maximumDiscountPercent: maxDiscount, listPrice },
            newValue: { unitPrice: item.unitPrice, discountPercent },
          });
          throw new BadRequestException(DISCOUNT_EXCEEDS_ALLOWED_LIMIT);
        }
      }
    }
  }

  async assertPriceEditAllowed(user: AuthUser, productId: string) {
    if (canManagePricingPolicy(user)) return;
    await this.audit(user, 'PRICE_CHANGE_DENIED', 'Product', productId, {
      productId,
      reason: 'Only CEO can change selling prices',
    });
    throw new ForbiddenException('Only CEO can change selling prices');
  }

  getEffectiveWholesalePrice(
    product: {
      wholesalePriceKgs: Prisma.Decimal | number;
      hqBranchWholesalePriceKgs: Prisma.Decimal | number;
      sellingPriceKgs: Prisma.Decimal | number;
    },
    branchCode?: string | null,
  ) {
    if (branchCode === HQ_CATALOG_BRANCH_CODE) {
      return Number(product.hqBranchWholesalePriceKgs || product.sellingPriceKgs);
    }
    return Number(product.wholesalePriceKgs || product.sellingPriceKgs);
  }

  private validatePolicyValues(dto: UpsertPricingPolicyDto) {
    if (dto.minimumSellingPriceKgs > dto.recommendedRetailPriceKgs + 0.01) {
      throw new BadRequestException('Minimum selling price cannot exceed recommended retail price');
    }
    if (dto.hqBranchWholesalePriceKgs > dto.wholesalePriceKgs + 0.01) {
      throw new BadRequestException('HQ branch wholesale price cannot exceed regular wholesale price');
    }
    if (dto.maximumDiscountPercent < 0 || dto.maximumDiscountPercent > 100) {
      throw new BadRequestException('Maximum discount percent must be between 0 and 100');
    }
  }

  private async resolveHqCatalogProduct(sku: string, hqCatalogProductId?: string | null) {
    if (hqCatalogProductId) {
      return this.prisma.product.findFirst({
        where: { id: hqCatalogProductId, deletedAt: null },
      });
    }

    const hqBranch = await this.prisma.branch.findFirst({
      where: { code: HQ_CATALOG_BRANCH_CODE },
      select: { id: true },
    });
    if (!hqBranch) return null;

    return this.prisma.product.findFirst({
      where: { branchId: hqBranch.id, sku, deletedAt: null },
    });
  }

  private async syncPolicyToBranches(
    tx: PrismaTx,
    user: AuthUser,
    policy: {
      id: string;
      sku: string;
      wholesalePriceKgs: Prisma.Decimal;
      hqBranchWholesalePriceKgs: Prisma.Decimal;
      recommendedRetailPriceKgs: Prisma.Decimal;
      minimumSellingPriceKgs: Prisma.Decimal;
      maximumDiscountPercent: Prisma.Decimal;
      purchasePriceYuan: Prisma.Decimal;
      landedCostKgs: Prisma.Decimal;
    },
    reason?: string | null,
  ) {
    const products = await tx.product.findMany({
      where: { sku: policy.sku, deletedAt: null },
      include: { branch: { select: { id: true, code: true } } },
    });

    for (const product of products) {
      const isHqBranch = product.branch?.code === HQ_CATALOG_BRANCH_CODE;
      const nextSellingPrice = isHqBranch
        ? Number(policy.hqBranchWholesalePriceKgs)
        : Number(policy.wholesalePriceKgs);
      const marginAmount = this.roundMoney(nextSellingPrice - Number(product.finalCostKgs));
      const marginPercent =
        nextSellingPrice === 0
          ? 0
          : this.roundMoney((marginAmount / nextSellingPrice) * 100);

      const oldValues = {
        sellingPriceKgs: Number(product.sellingPriceKgs),
        wholesalePriceKgs: Number(product.wholesalePriceKgs),
        hqBranchWholesalePriceKgs: Number(product.hqBranchWholesalePriceKgs),
        recommendedRetailPriceKgs: Number(product.recommendedRetailPriceKgs),
        minimumSellingPriceKgs: Number(product.minimumSellingPriceKgs),
        maximumDiscountPercent: Number(product.maximumDiscountPercent),
      };

      await tx.product.update({
        where: { id: product.id },
        data: {
          wholesalePriceKgs: policy.wholesalePriceKgs,
          hqBranchWholesalePriceKgs: policy.hqBranchWholesalePriceKgs,
          recommendedRetailPriceKgs: policy.recommendedRetailPriceKgs,
          minimumSellingPriceKgs: policy.minimumSellingPriceKgs,
          maximumDiscountPercent: policy.maximumDiscountPercent,
          sellingPriceKgs: nextSellingPrice,
          marginAmount,
          marginPercent,
        },
      });

      for (const field of PRICING_POLICY_FIELDS) {
        const oldValue = String(oldValues[field]);
        const newValue = String(Number(policy[field]));
        if (oldValue === newValue) continue;
        await tx.productPricingChangeHistory.create({
          data: {
            policyId: policy.id,
            productId: product.id,
            sku: policy.sku,
            fieldName: field,
            oldValue,
            newValue,
            reason: reason ?? undefined,
            changedById: user.id,
          },
        });
      }

      if (oldValues.sellingPriceKgs !== nextSellingPrice) {
        await tx.productPricingChangeHistory.create({
          data: {
            policyId: policy.id,
            productId: product.id,
            sku: policy.sku,
            fieldName: 'sellingPriceKgs',
            oldValue: String(oldValues.sellingPriceKgs),
            newValue: String(nextSellingPrice),
            reason: reason ?? undefined,
            changedById: user.id,
          },
        });
      }

      await this.auditInTx(tx, user, 'BRANCH_PRICE_SYNCED', 'Product', product.id, {
        productId: product.id,
        branchId: product.branchId,
        sku: policy.sku,
        oldValue: oldValues,
        newValue: {
          sellingPriceKgs: nextSellingPrice,
          wholesalePriceKgs: Number(policy.wholesalePriceKgs),
          hqBranchWholesalePriceKgs: Number(policy.hqBranchWholesalePriceKgs),
          recommendedRetailPriceKgs: Number(policy.recommendedRetailPriceKgs),
          minimumSellingPriceKgs: Number(policy.minimumSellingPriceKgs),
          maximumDiscountPercent: Number(policy.maximumDiscountPercent),
        },
        reason,
      });

      if (isHqBranch) {
        await this.auditInTx(tx, user, 'HQ_BRANCH_PRICE_UPDATED', 'Product', product.id, {
          productId: product.id,
          sku: policy.sku,
          oldValue: { hqBranchWholesalePriceKgs: oldValues.hqBranchWholesalePriceKgs },
          newValue: { hqBranchWholesalePriceKgs: Number(policy.hqBranchWholesalePriceKgs) },
          reason,
        });
      }
    }
  }

  private async recordPolicyFieldHistory(
    tx: PrismaTx,
    user: AuthUser,
    policyId: string,
    sku: string,
    before: Record<string, unknown> | null,
    after: Record<string, unknown>,
    reason?: string | null,
  ) {
    const fields: PricingPolicyField[] = [...PRICING_POLICY_FIELDS];
    for (const field of fields) {
      const oldValue = before ? String(before[field] ?? '') : null;
      const newValue = String(after[field] ?? '');
      if (before && oldValue === newValue) continue;
      await tx.productPricingChangeHistory.create({
        data: {
          policyId,
          sku,
          fieldName: field,
          oldValue,
          newValue,
          reason: reason ?? undefined,
          changedById: user.id,
        },
      });
      await this.auditInTx(
        tx,
        user,
        before ? 'SELLING_PRICE_UPDATED' : 'SELLING_PRICE_CREATED',
        'ProductPricingPolicy',
        policyId,
        {
          sku,
          field,
          oldValue,
          newValue,
          reason,
        },
      );
      if (field === 'maximumDiscountPercent') {
        await this.auditInTx(tx, user, 'DISCOUNT_LIMIT_UPDATED', 'ProductPricingPolicy', policyId, {
          sku,
          oldValue,
          newValue,
          reason,
        });
      }
    }
  }

  private policySnapshot(policy: Record<string, unknown>) {
    return {
      wholesalePriceKgs: Number(policy.wholesalePriceKgs),
      hqBranchWholesalePriceKgs: Number(policy.hqBranchWholesalePriceKgs),
      recommendedRetailPriceKgs: Number(policy.recommendedRetailPriceKgs),
      minimumSellingPriceKgs: Number(policy.minimumSellingPriceKgs),
      maximumDiscountPercent: Number(policy.maximumDiscountPercent),
      status: policy.status,
    };
  }

  private roundMoney(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private assertCanView(user: AuthUser) {
    if (!canViewPricing(user)) {
      throw new ForbiddenException('Insufficient permissions to view pricing');
    }
  }

  private assertCanManage(user: AuthUser) {
    if (!canManagePricingPolicy(user)) {
      void this.audit(user, 'PRICE_CHANGE_DENIED', 'ProductPricingPolicy', undefined, {
        reason: 'Only CEO can manage pricing policy',
      });
      throw new ForbiddenException('Only CEO can manage pricing policy');
    }
  }

  private audit(
    user: AuthUser,
    action: string,
    entity: string,
    entityId: string | undefined,
    metadata?: Record<string, unknown>,
  ) {
    return this.prisma.auditLog.create({
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

  private auditInTx(
    tx: PrismaTx,
    user: AuthUser,
    action: string,
    entity: string,
    entityId: string,
    metadata?: Record<string, unknown>,
  ) {
    return tx.auditLog.create({
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
