import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BranchType, MaximumPricePolicy, MaximumPricePolicySource, ProductPricingMode, Prisma } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { canManagePricingPolicy, canViewPricing } from '../rbac/rbac';
import { HQ_CATALOG_BRANCH_CODE } from '../warehouse/warehouse.util';
import { UpdateCategoryMarkupDto, UpdateProductPricingDto } from './dto/pricing-catalog.dto';
import { UpdateCategoryMaximumPolicyDto } from './dto/category-maximum-policy.dto';
import { UpdateProductMaximumPolicyDto } from './dto/product-maximum-policy.dto';
import {
  PricingHistoryQueryDto,
  UpdateBranchPricingDto,
  UpdateFranchiseSalesDto,
  UpdateRetailPricingDto,
  UpdateWholesalePricingDto,
} from './dto/pricing-branch.dto';
import {
  pricesFromMarkups,
  resolveHqToBranchPrice,
  validateMarkups,
  validateRetailCurrentPrice,
  validateWholesaleCurrentPrice,
} from './pricing-calculator.util';
import { PricingFifoService } from './pricing-fifo.service';
import {
  isMaximumPolicyActive,
  maximumPolicyToLegacyEnabled,
  resolveRetailMaximumMarkup,
  resolveRetailMaximumPolicy,
  resolveWholesaleMaximumMarkup,
  resolveWholesaleMaximumPolicy,
} from './pricing-policy-resolution.util';

type PrismaTx = Prisma.TransactionClient;

@Injectable()
export class PricingCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fifoService: PricingFifoService,
  ) {}

  async listCategories(user: AuthUser) {
    this.assertCanView(user);
    return this.prisma.productCategory.findMany({
      orderBy: { nameRu: 'asc' },
      include: { _count: { select: { products: true } } },
    });
  }

  async updateCategoryMarkup(user: AuthUser, categoryId: string, dto: UpdateCategoryMarkupDto) {
    this.assertCanManage(user);

    const category = await this.prisma.productCategory.findUnique({ where: { id: categoryId } });
    if (!category) throw new NotFoundException('Category not found');

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.productCategory.update({
        where: { id: categoryId },
        data: {
          wholesaleMarkupPercent: dto.wholesaleMarkupPercent,
          hqBranchWholesaleMarkupPercent: dto.hqBranchWholesaleMarkupPercent,
          recommendedRetailMarkupPercent: dto.recommendedRetailMarkupPercent,
          minimumSellingMarkupPercent: dto.minimumSellingMarkupPercent,
        },
      });

      await this.auditInTx(tx, user, 'CATEGORY_MARKUP_UPDATED', 'ProductCategory', categoryId, {
        oldValue: {
          wholesaleMarkupPercent: Number(category.wholesaleMarkupPercent),
          hqBranchWholesaleMarkupPercent: Number(category.hqBranchWholesaleMarkupPercent),
          recommendedRetailMarkupPercent: Number(category.recommendedRetailMarkupPercent),
          minimumSellingMarkupPercent: Number(category.minimumSellingMarkupPercent),
        },
        newValue: {
          wholesaleMarkupPercent: dto.wholesaleMarkupPercent,
          hqBranchWholesaleMarkupPercent: dto.hqBranchWholesaleMarkupPercent,
          recommendedRetailMarkupPercent: dto.recommendedRetailMarkupPercent,
          minimumSellingMarkupPercent: dto.minimumSellingMarkupPercent,
        },
        reason: dto.reason,
      });

      return next;
    });

    return updated;
  }

  async updateCategoryMaximumPolicy(
    user: AuthUser,
    categoryId: string,
    dto: UpdateCategoryMaximumPolicyDto,
  ) {
    this.assertCanManage(user);

    const category = await this.prisma.productCategory.findUnique({ where: { id: categoryId } });
    if (!category) throw new NotFoundException('Category not found');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.productCategory.update({
        where: { id: categoryId },
        data: {
          defaultRetailMaximumPolicy: dto.defaultRetailMaximumPolicy,
          defaultWholesaleMaximumPolicy: dto.defaultWholesaleMaximumPolicy,
          defaultRetailMaximumMarkupPercent: dto.defaultRetailMaximumMarkupPercent,
          defaultWholesaleMaximumMarkupPercent: dto.defaultWholesaleMaximumMarkupPercent,
        },
      });

      await this.auditInTx(tx, user, 'CATEGORY_DEFAULT_POLICY_CHANGED', 'ProductCategory', categoryId, {
        oldValue: {
          defaultRetailMaximumPolicy: category.defaultRetailMaximumPolicy,
          defaultWholesaleMaximumPolicy: category.defaultWholesaleMaximumPolicy,
          defaultRetailMaximumMarkupPercent: Number(category.defaultRetailMaximumMarkupPercent),
          defaultWholesaleMaximumMarkupPercent: Number(category.defaultWholesaleMaximumMarkupPercent),
        },
        newValue: {
          defaultRetailMaximumPolicy: dto.defaultRetailMaximumPolicy,
          defaultWholesaleMaximumPolicy: dto.defaultWholesaleMaximumPolicy,
          defaultRetailMaximumMarkupPercent: dto.defaultRetailMaximumMarkupPercent,
          defaultWholesaleMaximumMarkupPercent: dto.defaultWholesaleMaximumMarkupPercent,
        },
        reason: dto.reason,
      });

      await this.syncInheritedCategoryPolicies(tx, user, categoryId, updated, dto.reason);
      return updated;
    });
  }

  async getProductMaximumPolicy(user: AuthUser, productId: string) {
    this.assertCanView(user);

    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      include: {
        productCategory: {
          select: {
            id: true,
            nameRu: true,
            nameEn: true,
            defaultRetailMaximumPolicy: true,
            defaultWholesaleMaximumPolicy: true,
            defaultRetailMaximumMarkupPercent: true,
            defaultWholesaleMaximumMarkupPercent: true,
          },
        },
      },
    });
    if (!product) throw new NotFoundException('Product not found');

    const category = product.productCategory;
    return {
      productId: product.id,
      categoryId: product.categoryId,
      categoryName: category?.nameRu ?? category?.nameEn ?? '-',
      retailMaximumPolicySource: product.retailMaximumPolicySource,
      wholesaleMaximumPolicySource: product.wholesaleMaximumPolicySource,
      retailMaximumPolicy: product.retailMaximumPolicy,
      wholesaleMaximumPolicy: product.wholesaleMaximumPolicy,
      maximumRetailMarkupPercent: Number(product.maximumRetailMarkupPercent),
      maximumWholesaleMarkupPercent: Number(product.maximumWholesaleMarkupPercent),
      resolvedRetailMaximumPolicy: category
        ? resolveRetailMaximumPolicy(product, category)
        : product.retailMaximumPolicy,
      resolvedWholesaleMaximumPolicy: category
        ? resolveWholesaleMaximumPolicy(product, category)
        : product.wholesaleMaximumPolicy,
      resolvedRetailMaximumMarkupPercent: category
        ? resolveRetailMaximumMarkup(product, category)
        : Number(product.maximumRetailMarkupPercent),
      resolvedWholesaleMaximumMarkupPercent: category
        ? resolveWholesaleMaximumMarkup(product, category)
        : Number(product.maximumWholesaleMarkupPercent),
      categoryDefaultRetailMaximumPolicy: category?.defaultRetailMaximumPolicy ?? null,
      categoryDefaultWholesaleMaximumPolicy: category?.defaultWholesaleMaximumPolicy ?? null,
      categoryDefaultRetailMaximumMarkupPercent: category
        ? Number(category.defaultRetailMaximumMarkupPercent)
        : null,
      categoryDefaultWholesaleMaximumMarkupPercent: category
        ? Number(category.defaultWholesaleMaximumMarkupPercent)
        : null,
    };
  }

  async updateProductMaximumPolicy(user: AuthUser, productId: string, dto: UpdateProductMaximumPolicyDto) {
    this.assertCanManage(user);

    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      include: { productCategory: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    const nextRetailSource = dto.retailMaximumPolicySource ?? product.retailMaximumPolicySource;
    const nextWholesaleSource = dto.wholesaleMaximumPolicySource ?? product.wholesaleMaximumPolicySource;

    if (
      nextRetailSource === MaximumPricePolicySource.CATEGORY &&
      (dto.retailMaximumPolicy !== undefined || dto.maximumRetailMarkupPercent !== undefined)
    ) {
      throw new BadRequestException('Retail maximum policy is inherited from category');
    }
    if (
      nextWholesaleSource === MaximumPricePolicySource.CATEGORY &&
      (dto.wholesaleMaximumPolicy !== undefined || dto.maximumWholesaleMarkupPercent !== undefined)
    ) {
      throw new BadRequestException('Wholesale maximum policy is inherited from category');
    }

    const nextRetailPolicy =
      nextRetailSource === MaximumPricePolicySource.CATEGORY
        ? resolveRetailMaximumPolicy(
            { ...product, retailMaximumPolicySource: nextRetailSource },
            product.productCategory ?? {
              defaultRetailMaximumPolicy: 'DISABLED',
              defaultWholesaleMaximumPolicy: 'DISABLED',
              defaultRetailMaximumMarkupPercent: 0,
              defaultWholesaleMaximumMarkupPercent: 0,
            },
          )
        : (dto.retailMaximumPolicy ?? product.retailMaximumPolicy);
    const nextWholesalePolicy =
      nextWholesaleSource === MaximumPricePolicySource.CATEGORY
        ? resolveWholesaleMaximumPolicy(
            { ...product, wholesaleMaximumPolicySource: nextWholesaleSource },
            product.productCategory ?? {
              defaultRetailMaximumPolicy: 'DISABLED',
              defaultWholesaleMaximumPolicy: 'DISABLED',
              defaultRetailMaximumMarkupPercent: 0,
              defaultWholesaleMaximumMarkupPercent: 0,
            },
          )
        : (dto.wholesaleMaximumPolicy ?? product.wholesaleMaximumPolicy);
    const nextRetailMarkup =
      nextRetailSource === MaximumPricePolicySource.PRODUCT
        ? (dto.maximumRetailMarkupPercent ?? Number(product.maximumRetailMarkupPercent))
        : resolveRetailMaximumMarkup(
            { ...product, retailMaximumPolicySource: nextRetailSource },
            product.productCategory ?? {
              defaultRetailMaximumPolicy: 'DISABLED',
              defaultWholesaleMaximumPolicy: 'DISABLED',
              defaultRetailMaximumMarkupPercent: 0,
              defaultWholesaleMaximumMarkupPercent: 0,
            },
          );
    const nextWholesaleMarkup =
      nextWholesaleSource === MaximumPricePolicySource.PRODUCT
        ? (dto.maximumWholesaleMarkupPercent ?? Number(product.maximumWholesaleMarkupPercent))
        : resolveWholesaleMaximumMarkup(
            { ...product, wholesaleMaximumPolicySource: nextWholesaleSource },
            product.productCategory ?? {
              defaultRetailMaximumPolicy: 'DISABLED',
              defaultWholesaleMaximumPolicy: 'DISABLED',
              defaultRetailMaximumMarkupPercent: 0,
              defaultWholesaleMaximumMarkupPercent: 0,
            },
          );

    const cost = await this.fifoService.getLatestHqCostPrice(product.id);
    const prices = pricesFromMarkups(cost.costPriceKgs, {
      wholesaleMarkupPercent: Number(product.wholesaleMarkupPercent),
      minimumWholesaleMarkupPercent: Number(product.minimumWholesaleMarkupPercent),
      hqBranchWholesaleMarkupPercent: Number(product.hqBranchWholesaleMarkupPercent),
      recommendedRetailMarkupPercent: Number(product.recommendedRetailMarkupPercent),
      minimumSellingMarkupPercent: Number(product.minimumSellingMarkupPercent),
      enableMaximumRetailPrice: maximumPolicyToLegacyEnabled(nextRetailPolicy),
      maximumRetailMarkupPercent: nextRetailMarkup,
      enableMaximumWholesalePrice: maximumPolicyToLegacyEnabled(nextWholesalePolicy),
      maximumWholesaleMarkupPercent: nextWholesaleMarkup,
    });

    return this.prisma.$transaction(async (tx) => {
      const sourceChanged =
        (dto.retailMaximumPolicySource !== undefined &&
          dto.retailMaximumPolicySource !== product.retailMaximumPolicySource) ||
        (dto.wholesaleMaximumPolicySource !== undefined &&
          dto.wholesaleMaximumPolicySource !== product.wholesaleMaximumPolicySource);

      const updated = await tx.product.update({
        where: { id: product.id },
        data: {
          retailMaximumPolicySource: nextRetailSource,
          wholesaleMaximumPolicySource: nextWholesaleSource,
          retailMaximumPolicy:
            nextRetailSource === MaximumPricePolicySource.PRODUCT
              ? nextRetailPolicy
              : product.retailMaximumPolicy,
          wholesaleMaximumPolicy:
            nextWholesaleSource === MaximumPricePolicySource.PRODUCT
              ? nextWholesalePolicy
              : product.wholesaleMaximumPolicy,
          maximumRetailMarkupPercent: nextRetailMarkup,
          maximumWholesaleMarkupPercent: nextWholesaleMarkup,
          enableMaximumRetailPrice: maximumPolicyToLegacyEnabled(nextRetailPolicy),
          enableMaximumWholesalePrice: maximumPolicyToLegacyEnabled(nextWholesalePolicy),
          maximumRetailPriceKgs: prices.maximumRetailPriceKgs,
          maximumWholesalePriceKgs: prices.maximumWholesalePriceKgs,
        },
      });

      if (sourceChanged) {
        await this.auditInTx(tx, user, 'PRODUCT_POLICY_SOURCE_CHANGED', 'Product', product.id, {
          oldValue: {
            retailMaximumPolicySource: product.retailMaximumPolicySource,
            wholesaleMaximumPolicySource: product.wholesaleMaximumPolicySource,
          },
          newValue: {
            retailMaximumPolicySource: nextRetailSource,
            wholesaleMaximumPolicySource: nextWholesaleSource,
          },
          reason: dto.reason,
        });
      } else {
        await this.auditInTx(tx, user, 'PRODUCT_POLICY_CHANGED', 'Product', product.id, {
          oldValue: {
            retailMaximumPolicy: product.retailMaximumPolicy,
            wholesaleMaximumPolicy: product.wholesaleMaximumPolicy,
            maximumRetailMarkupPercent: Number(product.maximumRetailMarkupPercent),
            maximumWholesaleMarkupPercent: Number(product.maximumWholesaleMarkupPercent),
          },
          newValue: {
            retailMaximumPolicy: nextRetailPolicy,
            wholesaleMaximumPolicy: nextWholesalePolicy,
            maximumRetailMarkupPercent: nextRetailMarkup,
            maximumWholesaleMarkupPercent: nextWholesaleMarkup,
          },
          reason: dto.reason,
        });
      }

      await this.syncSkuProducts(tx, user, updated, dto.reason);
      return this.getProductMaximumPolicy(user, product.id);
    });
  }

  async listProducts(user: AuthUser) {
    this.assertCanView(user);
    await this.fifoService.syncFifoBatchesFromHqStockMovements();

    const hqBranch = await this.prisma.branch.findFirst({
      where: { code: HQ_CATALOG_BRANCH_CODE },
      select: { id: true },
    });
    if (!hqBranch) return [];

    const products = await this.prisma.product.findMany({
      where: { branchId: hqBranch.id, deletedAt: null },
      include: {
        productCategory: {
          select: {
            id: true,
            nameRu: true,
            nameKy: true,
            nameEn: true,
            code: true,
            defaultRetailMaximumPolicy: true,
            defaultWholesaleMaximumPolicy: true,
            defaultRetailMaximumMarkupPercent: true,
            defaultWholesaleMaximumMarkupPercent: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return Promise.all(
      products.map(async (product) => {
        const cost = await this.fifoService.getLatestHqCostPrice(product.id);
        return this.toProductPricingRow(product, cost);
      }),
    );
  }

  async listFranchiseSalesProducts(user: AuthUser) {
    const rows = await this.listProducts(user);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      sku: row.sku,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      isActive: row.isActive,
      costPriceKgs: row.costPriceKgs,
      hqMarkupPercent: row.hqBranchWholesaleMarkupPercent,
      branchPriceKgs: row.hqBranchWholesalePriceKgs,
      lastUpdated: row.updatedAt,
    }));
  }

  async updateFranchiseSalesProduct(user: AuthUser, productId: string, dto: UpdateFranchiseSalesDto) {
    this.assertCanManage(user);
    if (dto.hqBranchWholesaleMarkupPercent < 0) {
      throw new BadRequestException('Markup must be >= 0');
    }

    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      include: { productCategory: { select: { nameRu: true } } },
    });
    if (!product) throw new NotFoundException('Product not found');

    const cost = await this.fifoService.getLatestHqCostPrice(product.id);
    const nextMarkups = {
      wholesaleMarkupPercent: Number(product.wholesaleMarkupPercent),
      minimumWholesaleMarkupPercent: Number(product.minimumWholesaleMarkupPercent),
      hqBranchWholesaleMarkupPercent: dto.hqBranchWholesaleMarkupPercent,
      recommendedRetailMarkupPercent: Number(product.recommendedRetailMarkupPercent),
      minimumSellingMarkupPercent: Number(product.minimumSellingMarkupPercent),
    };
    const validationError = validateMarkups(cost.costPriceKgs, nextMarkups);
    if (validationError) throw new BadRequestException(validationError);
    const prices = pricesFromMarkups(cost.costPriceKgs, nextMarkups);

    return this.prisma.$transaction(async (tx) => {
      const updated = await this.persistProductPricing(tx, user, product, {
        costPriceKgs: cost.costPriceKgs,
        ...prices,
        ...nextMarkups,
        reason: dto.reason,
        historyFieldName: 'hqBranchWholesaleMarkupPercent',
        auditAction: 'HQ_MARKUP_UPDATED',
      });
      await this.syncSkuProducts(tx, user, updated, dto.reason);
      await this.auditInTx(tx, user, 'PRICE_RECALCULATED', 'Product', product.id, {
        sku: product.sku,
        reason: dto.reason ?? 'HQ franchise markup update',
      });
      return {
        id: updated.id,
        name: updated.name,
        sku: updated.sku,
        categoryName: product.productCategory?.nameRu ?? product.category ?? '-',
        costPriceKgs: cost.costPriceKgs,
        hqMarkupPercent: Number(updated.hqBranchWholesaleMarkupPercent),
        branchPriceKgs: Number(updated.hqBranchWholesalePriceKgs),
        lastUpdated: updated.updatedAt,
      };
    });
  }

  async listBranches(user: AuthUser) {
    this.assertCanView(user);
    await this.fifoService.syncFifoBatchesFromHqStockMovements();

    const hqBranch = await this.prisma.branch.findFirst({
      where: { code: HQ_CATALOG_BRANCH_CODE },
      select: { id: true },
    });
    const avgCost = hqBranch
      ? await this.resolveAverageCatalogCost(hqBranch.id)
      : 0;

    const branches = await this.prisma.branch.findMany({
      where: { deletedAt: null, code: { not: HQ_CATALOG_BRANCH_CODE } },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        ownerName: true,
        branchType: true,
        hqToBranchMarkupPercent: true,
        hqToBranchMarkupUpdatedAt: true,
        updatedAt: true,
      },
    });

    return branches.map((branch) => ({
      id: branch.id,
      name: branch.name,
      ownerName: branch.ownerName,
      branchType: branch.branchType,
      hqToBranchMarkupPercent: Number(branch.hqToBranchMarkupPercent),
      calculatedPriceKgs:
        branch.branchType === BranchType.HQ_BRANCH
          ? avgCost
          : resolveHqToBranchPrice(avgCost, branch.branchType, Number(branch.hqToBranchMarkupPercent)),
      referenceCostKgs: avgCost,
      lastUpdated: branch.hqToBranchMarkupUpdatedAt ?? branch.updatedAt,
    }));
  }

  async updateBranchPricing(user: AuthUser, branchId: string, dto: UpdateBranchPricingDto) {
    this.assertCanManage(user);

    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, deletedAt: null },
    });
    if (!branch) throw new NotFoundException('Branch not found');
    if (branch.code === HQ_CATALOG_BRANCH_CODE) {
      throw new BadRequestException('HQ catalog branch pricing is fixed at cost');
    }
    if (branch.branchType === BranchType.HQ_BRANCH) {
      throw new BadRequestException('HQ branch type does not use markup');
    }

    const oldMarkup = Number(branch.hqToBranchMarkupPercent);
    const nextMarkup = dto.hqToBranchMarkupPercent ?? oldMarkup;
    if (nextMarkup < 0) throw new BadRequestException('Markup must be >= 0');

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.branch.update({
        where: { id: branchId },
        data: {
          hqToBranchMarkupPercent: nextMarkup,
          hqToBranchMarkupUpdatedAt: new Date(),
        },
      });

      await tx.productPricingChangeHistory.create({
        data: {
          branchId,
          sku: branch.code,
          fieldName: 'hqToBranchMarkupPercent',
          oldMarkup: String(oldMarkup),
          newMarkup: String(nextMarkup),
          reason: dto.reason,
          changedById: user.id,
        },
      });

      await this.auditInTx(tx, user, 'BRANCH_MARKUP_UPDATED', 'Branch', branchId, {
        oldValue: oldMarkup,
        newValue: nextMarkup,
        reason: dto.reason,
      });
      await this.auditInTx(tx, user, 'PRICE_POLICY_UPDATED', 'Branch', branchId, {
        branchType: branch.branchType,
        oldValue: oldMarkup,
        newValue: nextMarkup,
        reason: dto.reason,
      });

      return next;
    });

    const avgCost = await this.resolveAverageCatalogCost();
    return {
      id: updated.id,
      name: updated.name,
      ownerName: updated.ownerName,
      branchType: updated.branchType,
      hqToBranchMarkupPercent: Number(updated.hqToBranchMarkupPercent),
      calculatedPriceKgs: resolveHqToBranchPrice(
        avgCost,
        updated.branchType,
        Number(updated.hqToBranchMarkupPercent),
      ),
      referenceCostKgs: avgCost,
      lastUpdated: updated.hqToBranchMarkupUpdatedAt ?? updated.updatedAt,
    };
  }

  async listRetailProducts(user: AuthUser) {
    const rows = await this.listProducts(user);
    return rows.map((row) => {
      const category = row.productCategory;
      const productPolicy = {
        retailMaximumPolicySource: row.retailMaximumPolicySource ?? MaximumPricePolicySource.CATEGORY,
        retailMaximumPolicy: row.retailMaximumPolicy ?? MaximumPricePolicy.DISABLED,
        maximumRetailMarkupPercent: row.maximumRetailMarkupPercent,
      };
      const categoryPolicy = {
        defaultRetailMaximumPolicy: category?.defaultRetailMaximumPolicy ?? MaximumPricePolicy.DISABLED,
        defaultWholesaleMaximumPolicy: category?.defaultWholesaleMaximumPolicy ?? MaximumPricePolicy.DISABLED,
        defaultRetailMaximumMarkupPercent: category?.defaultRetailMaximumMarkupPercent ?? 0,
        defaultWholesaleMaximumMarkupPercent: category?.defaultWholesaleMaximumMarkupPercent ?? 0,
      };
      const resolvedRetailPolicy = category
        ? resolveRetailMaximumPolicy(productPolicy, categoryPolicy)
        : productPolicy.retailMaximumPolicy;
      const resolvedRetailMarkup = category
        ? resolveRetailMaximumMarkup(productPolicy, categoryPolicy)
        : Number(row.maximumRetailMarkupPercent ?? 0);
      const policyActive = isMaximumPolicyActive(resolvedRetailPolicy);
      const branchPurchasePriceKgs = row.hqBranchWholesalePriceKgs;
      const maximumRetailPriceKgs = policyActive
        ? pricesFromMarkups(row.costPriceKgs, {
            wholesaleMarkupPercent: Number(row.wholesaleMarkupPercent),
            hqBranchWholesaleMarkupPercent: Number(row.hqBranchWholesaleMarkupPercent),
            recommendedRetailMarkupPercent: Number(row.recommendedRetailMarkupPercent),
            minimumSellingMarkupPercent: Number(row.minimumSellingMarkupPercent),
            enableMaximumRetailPrice: true,
            maximumRetailMarkupPercent: resolvedRetailMarkup,
          }).maximumRetailPriceKgs
        : 0;

      return {
        id: row.id,
        name: row.name,
        sku: row.sku,
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        isActive: row.isActive,
        costPriceKgs: row.costPriceKgs,
        branchPurchasePriceKgs,
        minimumSellingMarkupPercent: row.minimumSellingMarkupPercent,
        recommendedRetailMarkupPercent: row.recommendedRetailMarkupPercent,
        retailMaximumPolicySource: row.retailMaximumPolicySource,
        resolvedRetailMaximumPolicy: resolvedRetailPolicy,
        inheritedRetailPolicy: row.retailMaximumPolicySource === 'CATEGORY',
        categoryDefaultRetailMaximumPolicy: category?.defaultRetailMaximumPolicy ?? MaximumPricePolicy.DISABLED,
        enableMaximumRetailPrice: policyActive,
        maximumRetailMarkupPercent: resolvedRetailMarkup,
        retailPriceKgs: row.recommendedRetailPriceKgs,
        minimumRetailPriceKgs: row.minimumSellingPriceKgs,
        maximumRetailPriceKgs,
        currentPriceKgs: row.recommendedRetailPriceKgs,
      };
    });
  }

  async listWholesaleProducts(user: AuthUser) {
    const rows = await this.listProducts(user);
    return rows.map((row) => {
      const category = row.productCategory;
      const productPolicy = {
        wholesaleMaximumPolicySource: row.wholesaleMaximumPolicySource ?? MaximumPricePolicySource.CATEGORY,
        wholesaleMaximumPolicy: row.wholesaleMaximumPolicy ?? MaximumPricePolicy.DISABLED,
        maximumWholesaleMarkupPercent: row.maximumWholesaleMarkupPercent,
      };
      const categoryPolicy = {
        defaultRetailMaximumPolicy: category?.defaultRetailMaximumPolicy ?? MaximumPricePolicy.DISABLED,
        defaultWholesaleMaximumPolicy: category?.defaultWholesaleMaximumPolicy ?? MaximumPricePolicy.DISABLED,
        defaultRetailMaximumMarkupPercent: category?.defaultRetailMaximumMarkupPercent ?? 0,
        defaultWholesaleMaximumMarkupPercent: category?.defaultWholesaleMaximumMarkupPercent ?? 0,
      };
      const resolvedWholesalePolicy = category
        ? resolveWholesaleMaximumPolicy(productPolicy, categoryPolicy)
        : productPolicy.wholesaleMaximumPolicy;
      const resolvedWholesaleMarkup = category
        ? resolveWholesaleMaximumMarkup(productPolicy, categoryPolicy)
        : Number(row.maximumWholesaleMarkupPercent ?? 0);
      const policyActive = isMaximumPolicyActive(resolvedWholesalePolicy);
      const maximumWholesalePriceKgs = policyActive
        ? pricesFromMarkups(row.costPriceKgs, {
            wholesaleMarkupPercent: Number(row.wholesaleMarkupPercent),
            minimumWholesaleMarkupPercent: Number(row.minimumWholesaleMarkupPercent),
            hqBranchWholesaleMarkupPercent: Number(row.hqBranchWholesaleMarkupPercent),
            recommendedRetailMarkupPercent: Number(row.recommendedRetailMarkupPercent),
            minimumSellingMarkupPercent: Number(row.minimumSellingMarkupPercent),
            enableMaximumWholesalePrice: true,
            maximumWholesaleMarkupPercent: resolvedWholesaleMarkup,
          }).maximumWholesalePriceKgs
        : 0;

      return {
        id: row.id,
        name: row.name,
        sku: row.sku,
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        isActive: row.isActive,
        costPriceKgs: row.costPriceKgs,
        branchPurchasePriceKgs: row.hqBranchWholesalePriceKgs,
        minimumWholesaleMarkupPercent: row.minimumWholesaleMarkupPercent,
        recommendedWholesaleMarkupPercent: row.wholesaleMarkupPercent,
        wholesaleMaximumPolicySource: row.wholesaleMaximumPolicySource,
        resolvedWholesaleMaximumPolicy: resolvedWholesalePolicy,
        inheritedWholesalePolicy: row.wholesaleMaximumPolicySource === 'CATEGORY',
        categoryDefaultWholesaleMaximumPolicy: category?.defaultWholesaleMaximumPolicy ?? MaximumPricePolicy.DISABLED,
        enableMaximumWholesalePrice: policyActive,
        maximumWholesaleMarkupPercent: resolvedWholesaleMarkup,
        wholesalePriceKgs: row.wholesalePriceKgs,
        minimumWholesalePriceKgs: row.minimumWholesalePriceKgs,
        maximumWholesalePriceKgs,
        currentPriceKgs: row.wholesalePriceKgs,
      };
    });
  }

  async updateRetailPricing(user: AuthUser, productId: string, dto: UpdateRetailPricingDto) {
    this.assertCanManage(user);

    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      include: { productCategory: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    if (product.retailMaximumPolicySource === MaximumPricePolicySource.CATEGORY) {
      if (
        dto.enableMaximumRetailPrice !== undefined ||
        (dto.maximumRetailMarkupPercent !== undefined && dto.maximumRetailMarkupPercent > 0)
      ) {
        throw new BadRequestException('Maximum retail policy is inherited from category');
      }
    }

    if (dto.minimumSellingMarkupPercent > dto.recommendedRetailMarkupPercent + 0.01) {
      throw new BadRequestException('Minimum retail markup cannot exceed recommended retail markup');
    }

    const category = product.productCategory ?? {
      defaultRetailMaximumPolicy: 'DISABLED' as const,
      defaultWholesaleMaximumPolicy: 'DISABLED' as const,
      defaultRetailMaximumMarkupPercent: 0,
      defaultWholesaleMaximumMarkupPercent: 0,
    };
    const resolvedRetailPolicy = resolveRetailMaximumPolicy(product, category);
    const resolvedRetailMarkup = resolveRetailMaximumMarkup(product, category);
    const enableMaximumRetailPrice =
      product.retailMaximumPolicySource === MaximumPricePolicySource.PRODUCT
        ? (dto.enableMaximumRetailPrice ?? maximumPolicyToLegacyEnabled(resolvedRetailPolicy))
        : maximumPolicyToLegacyEnabled(resolvedRetailPolicy);
    const maximumRetailMarkupPercent =
      product.retailMaximumPolicySource === MaximumPricePolicySource.PRODUCT
        ? (dto.maximumRetailMarkupPercent ?? resolvedRetailMarkup)
        : resolvedRetailMarkup;

    if (
      enableMaximumRetailPrice &&
      maximumRetailMarkupPercent < dto.recommendedRetailMarkupPercent - 0.01
    ) {
      throw new BadRequestException('Maximum retail markup cannot be below recommended retail markup');
    }

    const cost = await this.fifoService.getLatestHqCostPrice(product.id);
    const prices = pricesFromMarkups(cost.costPriceKgs, {
      wholesaleMarkupPercent: Number(product.wholesaleMarkupPercent),
      minimumWholesaleMarkupPercent: Number(product.minimumWholesaleMarkupPercent),
      hqBranchWholesaleMarkupPercent: Number(product.hqBranchWholesaleMarkupPercent),
      recommendedRetailMarkupPercent: dto.recommendedRetailMarkupPercent,
      minimumSellingMarkupPercent: dto.minimumSellingMarkupPercent,
      enableMaximumRetailPrice,
      maximumRetailMarkupPercent,
    });

    const currentPrice = Number(product.recommendedRetailPriceKgs);
    const retailValidation = validateRetailCurrentPrice(
      prices.hqBranchWholesalePriceKgs,
      dto.minimumSellingMarkupPercent,
      dto.recommendedRetailMarkupPercent,
      currentPrice,
      {
        enableMaximumPrice: enableMaximumRetailPrice,
        maximumMarkupPercent: maximumRetailMarkupPercent,
      },
    );
    if (retailValidation) throw new BadRequestException(retailValidation);

    return this.prisma.$transaction(async (tx) => {
      const updated = await this.persistProductPricing(tx, user, product, {
        costPriceKgs: cost.costPriceKgs,
        wholesalePriceKgs: prices.wholesalePriceKgs,
        hqBranchWholesalePriceKgs: prices.hqBranchWholesalePriceKgs,
        recommendedRetailPriceKgs: prices.recommendedRetailPriceKgs,
        minimumSellingPriceKgs: prices.minimumSellingPriceKgs,
        maximumRetailPriceKgs: prices.maximumRetailPriceKgs,
        enableMaximumRetailPrice,
        maximumRetailMarkupPercent,
        wholesaleMarkupPercent: Number(product.wholesaleMarkupPercent),
        minimumWholesaleMarkupPercent: Number(product.minimumWholesaleMarkupPercent),
        hqBranchWholesaleMarkupPercent: Number(product.hqBranchWholesaleMarkupPercent),
        recommendedRetailMarkupPercent: dto.recommendedRetailMarkupPercent,
        minimumSellingMarkupPercent: dto.minimumSellingMarkupPercent,
        reason: dto.reason,
        historyFieldName: 'retailMarkup',
        auditAction: 'RETAIL_MARKUP_UPDATED',
      });
      await this.syncSkuProducts(tx, user, updated, dto.reason);
      await this.auditInTx(tx, user, 'PRICE_RECALCULATED', 'Product', product.id, {
        sku: product.sku,
        reason: dto.reason ?? 'Retail markup update',
      });
      return this.toRetailRow(updated, cost);
    });
  }

  async updateWholesalePricing(user: AuthUser, productId: string, dto: UpdateWholesalePricingDto) {
    this.assertCanManage(user);

    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      include: { productCategory: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    if (product.wholesaleMaximumPolicySource === MaximumPricePolicySource.CATEGORY) {
      if (
        dto.enableMaximumWholesalePrice !== undefined ||
        (dto.maximumWholesaleMarkupPercent !== undefined && dto.maximumWholesaleMarkupPercent > 0)
      ) {
        throw new BadRequestException('Maximum wholesale policy is inherited from category');
      }
    }

    if (dto.minimumWholesaleMarkupPercent > dto.recommendedWholesaleMarkupPercent + 0.01) {
      throw new BadRequestException('Minimum wholesale markup cannot exceed recommended wholesale markup');
    }

    const category = product.productCategory ?? {
      defaultRetailMaximumPolicy: 'DISABLED' as const,
      defaultWholesaleMaximumPolicy: 'DISABLED' as const,
      defaultRetailMaximumMarkupPercent: 0,
      defaultWholesaleMaximumMarkupPercent: 0,
    };
    const resolvedWholesalePolicy = resolveWholesaleMaximumPolicy(product, category);
    const resolvedWholesaleMarkup = resolveWholesaleMaximumMarkup(product, category);
    const enableMaximumWholesalePrice =
      product.wholesaleMaximumPolicySource === MaximumPricePolicySource.PRODUCT
        ? (dto.enableMaximumWholesalePrice ?? maximumPolicyToLegacyEnabled(resolvedWholesalePolicy))
        : maximumPolicyToLegacyEnabled(resolvedWholesalePolicy);
    const maximumWholesaleMarkupPercent =
      product.wholesaleMaximumPolicySource === MaximumPricePolicySource.PRODUCT
        ? (dto.maximumWholesaleMarkupPercent ?? resolvedWholesaleMarkup)
        : resolvedWholesaleMarkup;

    if (
      enableMaximumWholesalePrice &&
      maximumWholesaleMarkupPercent < dto.recommendedWholesaleMarkupPercent - 0.01
    ) {
      throw new BadRequestException('Maximum wholesale markup cannot be below recommended wholesale markup');
    }

    const cost = await this.fifoService.getLatestHqCostPrice(product.id);
    const prices = pricesFromMarkups(cost.costPriceKgs, {
      wholesaleMarkupPercent: dto.recommendedWholesaleMarkupPercent,
      minimumWholesaleMarkupPercent: dto.minimumWholesaleMarkupPercent,
      hqBranchWholesaleMarkupPercent: Number(product.hqBranchWholesaleMarkupPercent),
      recommendedRetailMarkupPercent: Number(product.recommendedRetailMarkupPercent),
      minimumSellingMarkupPercent: Number(product.minimumSellingMarkupPercent),
      enableMaximumWholesalePrice,
      maximumWholesaleMarkupPercent,
    });

    const currentPrice = Number(product.wholesalePriceKgs);
    const wholesaleValidation = validateWholesaleCurrentPrice(
      prices.hqBranchWholesalePriceKgs,
      dto.minimumWholesaleMarkupPercent,
      dto.recommendedWholesaleMarkupPercent,
      currentPrice,
      {
        enableMaximumPrice: enableMaximumWholesalePrice,
        maximumMarkupPercent: maximumWholesaleMarkupPercent,
      },
    );
    if (wholesaleValidation) throw new BadRequestException(wholesaleValidation);

    return this.prisma.$transaction(async (tx) => {
      const updated = await this.persistProductPricing(tx, user, product, {
        costPriceKgs: cost.costPriceKgs,
        wholesalePriceKgs: prices.wholesalePriceKgs,
        hqBranchWholesalePriceKgs: prices.hqBranchWholesalePriceKgs,
        recommendedRetailPriceKgs: prices.recommendedRetailPriceKgs,
        minimumSellingPriceKgs: prices.minimumSellingPriceKgs,
        maximumWholesalePriceKgs: prices.maximumWholesalePriceKgs,
        enableMaximumWholesalePrice,
        maximumWholesaleMarkupPercent,
        wholesaleMarkupPercent: dto.recommendedWholesaleMarkupPercent,
        minimumWholesaleMarkupPercent: dto.minimumWholesaleMarkupPercent,
        hqBranchWholesaleMarkupPercent: Number(product.hqBranchWholesaleMarkupPercent),
        recommendedRetailMarkupPercent: Number(product.recommendedRetailMarkupPercent),
        minimumSellingMarkupPercent: Number(product.minimumSellingMarkupPercent),
        reason: dto.reason,
        historyFieldName: 'wholesaleMarkup',
        auditAction: 'WHOLESALE_MARKUP_UPDATED',
      });
      await this.syncSkuProducts(tx, user, updated, dto.reason);
      await this.auditInTx(tx, user, 'PRICE_RECALCULATED', 'Product', product.id, {
        sku: product.sku,
        reason: dto.reason ?? 'Wholesale markup update',
      });
      return this.toWholesaleRow(updated, cost);
    });
  }

  async listPricingHistory(user: AuthUser, query: PricingHistoryQueryDto = {}) {
    this.assertCanView(user);

    const where: Prisma.ProductPricingChangeHistoryWhereInput = {};
    if (query.productId) where.productId = query.productId;
    if (query.branchId) where.branchId = query.branchId;
    if (query.changedById) where.changedById = query.changedById;
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) where.createdAt.gte = new Date(query.dateFrom);
      if (query.dateTo) where.createdAt.lte = new Date(query.dateTo);
    }

    const rows = await this.prisma.productPricingChangeHistory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: {
        product: { select: { id: true, name: true, sku: true } },
        branch: { select: { id: true, name: true, code: true } },
        changedBy: { select: { id: true, fullName: true } },
      },
    });

    return rows.map((row) => {
      let oldPrice: number | null = null;
      let newPrice: number | null = null;
      try {
        const oldParsed = row.oldValue ? JSON.parse(row.oldValue) : null;
        const newParsed = row.newValue ? JSON.parse(row.newValue) : null;
        oldPrice = oldParsed?.recommendedRetailPriceKgs ?? oldParsed?.wholesalePriceKgs ?? null;
        newPrice = newParsed?.recommendedRetailPriceKgs ?? newParsed?.wholesalePriceKgs ?? null;
      } catch {
        oldPrice = row.oldValue ? Number(row.oldValue) : null;
        newPrice = row.newValue ? Number(row.newValue) : null;
      }

      return {
        id: row.id,
        createdAt: row.createdAt,
        productId: row.productId,
        productName: row.product?.name ?? row.sku,
        productSku: row.product?.sku ?? row.sku,
        branchId: row.branchId,
        branchName: row.branch?.name ?? null,
        oldMarkup: row.oldMarkup,
        newMarkup: row.newMarkup,
        oldPriceKgs: oldPrice,
        newPriceKgs: newPrice,
        changedById: row.changedById,
        changedByName: row.changedBy.fullName,
        reason: row.reason,
        fieldName: row.fieldName,
      };
    });
  }

  async updateProductPricing(user: AuthUser, productId: string, dto: UpdateProductPricingDto) {
    this.assertCanManage(user);

    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
    });
    if (!product) throw new NotFoundException('Product not found');

    const cost = await this.fifoService.getLatestHqCostPrice(product.id);
    const nextMarkups = {
      wholesaleMarkupPercent:
        dto.wholesaleMarkupPercent ?? Number(product.wholesaleMarkupPercent),
      hqBranchWholesaleMarkupPercent:
        dto.hqBranchWholesaleMarkupPercent ?? Number(product.hqBranchWholesaleMarkupPercent),
      recommendedRetailMarkupPercent:
        dto.recommendedRetailMarkupPercent ?? Number(product.recommendedRetailMarkupPercent),
      minimumSellingMarkupPercent:
        dto.minimumSellingMarkupPercent ?? Number(product.minimumSellingMarkupPercent),
    };

    const validationError = validateMarkups(cost.costPriceKgs, nextMarkups);
    if (validationError) throw new BadRequestException(validationError);

    const nextPrices = pricesFromMarkups(cost.costPriceKgs, nextMarkups);

    return this.prisma.$transaction(async (tx) => {
      const updated = await this.persistProductPricing(tx, user, product, {
        costPriceKgs: cost.costPriceKgs,
        ...nextPrices,
        ...nextMarkups,
        reason: dto.reason,
      });

      await this.syncSkuProducts(tx, user, updated, dto.reason);
      return this.toProductPricingRow(updated, cost);
    });
  }

  async restoreProductAuto(user: AuthUser, productId: string, reason?: string) {
    this.assertCanManage(user);
    throw new BadRequestException('Automatic pricing mode is no longer supported. Edit markups directly.');
  }

  async refreshCostsAndAutoPrices(user: AuthUser) {
    this.assertCanManage(user);
    await this.fifoService.syncFifoBatchesFromHqStockMovements(undefined, user.id);
    const hqBranch = await this.prisma.branch.findFirst({ where: { code: HQ_CATALOG_BRANCH_CODE } });
    if (!hqBranch) return { updated: 0 };

    const products = await this.prisma.product.findMany({
      where: { branchId: hqBranch.id, deletedAt: null },
    });

    let updated = 0;
    await this.prisma.$transaction(async (tx) => {
      for (const product of products) {
        const cost = await this.fifoService.getLatestHqCostPrice(product.id, tx);
        const markups = {
          wholesaleMarkupPercent: Number(product.wholesaleMarkupPercent),
          minimumWholesaleMarkupPercent: Number(product.minimumWholesaleMarkupPercent),
          hqBranchWholesaleMarkupPercent: Number(product.hqBranchWholesaleMarkupPercent),
          recommendedRetailMarkupPercent: Number(product.recommendedRetailMarkupPercent),
          minimumSellingMarkupPercent: Number(product.minimumSellingMarkupPercent),
        };
        const prices = pricesFromMarkups(cost.costPriceKgs, markups);
        const validationError = validateMarkups(cost.costPriceKgs, markups);
        if (validationError) continue;

        const oldCost = Number(product.costPriceKgs);
        if (Math.abs(oldCost - cost.costPriceKgs) > 0.01) {
          await this.auditInTx(tx, user, 'COST_PRICE_UPDATED', 'Product', product.id, {
            sku: product.sku,
            oldValue: oldCost,
            newValue: cost.costPriceKgs,
          });
        }

        const saved = await this.persistProductPricing(tx, user, product, {
          costPriceKgs: cost.costPriceKgs,
          ...prices,
          ...markups,
          reason: 'Cost refresh',
          skipMarkupAudit: true,
        });
        await this.syncSkuProducts(tx, user, saved);
        updated += 1;
      }
    });

    return { updated };
  }

  async applyFifoCostsOnFinalize(
    tx: PrismaTx,
    user: AuthUser,
    sale: { id: string; branchId: string; items: Array<{ id: string; productId: string | null; quantity: number; unitCost: Prisma.Decimal; unitPrice: Prisma.Decimal; totalPrice: Prisma.Decimal }> },
    resolveWarehouseId: (productId: string) => Promise<string>,
  ) {
    for (const item of sale.items) {
      if (!item.productId) continue;
      const warehouseId = await resolveWarehouseId(item.productId);
      const fifo = await this.fifoService.consumeFifo(tx, {
        productId: item.productId,
        warehouseId,
        quantity: item.quantity,
        saleId: sale.id,
        saleItemId: item.id,
        userId: user.id,
      });
      if (fifo.consumedQty <= 0) continue;

      const totalCost = fifo.totalCost;
      const totalPrice = Number(item.totalPrice);
      await tx.saleItem.update({
        where: { id: item.id },
        data: {
          unitCost: fifo.unitCost,
          totalCost,
          profitAmount: Math.round((totalPrice - totalCost + Number.EPSILON) * 100) / 100,
        },
      });
    }

    const refreshedItems = await tx.saleItem.findMany({ where: { saleId: sale.id } });
    const totalCost = refreshedItems.reduce((sum, row) => sum + Number(row.totalCost), 0);
    const totalAmount = refreshedItems.reduce((sum, row) => sum + Number(row.totalPrice), 0);
    await tx.sale.update({
      where: { id: sale.id },
      data: {
        totalCost,
        profitAmount: Math.round((totalAmount - totalCost + Number.EPSILON) * 100) / 100,
      },
    });
  }

  private async persistProductPricing(
    tx: PrismaTx,
    user: AuthUser,
    product: {
      id: string;
      sku: string;
      wholesalePriceKgs: Prisma.Decimal;
      hqBranchWholesalePriceKgs: Prisma.Decimal;
      recommendedRetailPriceKgs: Prisma.Decimal;
      minimumSellingPriceKgs: Prisma.Decimal;
      wholesaleMarkupPercent: Prisma.Decimal;
      minimumWholesaleMarkupPercent: Prisma.Decimal;
      hqBranchWholesaleMarkupPercent: Prisma.Decimal;
      recommendedRetailMarkupPercent: Prisma.Decimal;
      minimumSellingMarkupPercent: Prisma.Decimal;
    },
    input: {
      costPriceKgs: number;
      wholesalePriceKgs: number;
      hqBranchWholesalePriceKgs: number;
      recommendedRetailPriceKgs: number;
      minimumSellingPriceKgs: number;
      maximumRetailPriceKgs?: number;
      maximumWholesalePriceKgs?: number;
      enableMaximumRetailPrice?: boolean;
      enableMaximumWholesalePrice?: boolean;
      maximumRetailMarkupPercent?: number;
      maximumWholesaleMarkupPercent?: number;
      wholesaleMarkupPercent: number;
      minimumWholesaleMarkupPercent?: number;
      hqBranchWholesaleMarkupPercent: number;
      recommendedRetailMarkupPercent: number;
      minimumSellingMarkupPercent: number;
      reason?: string;
      skipMarkupAudit?: boolean;
      historyFieldName?: string;
      auditAction?: string;
      branchId?: string;
    },
  ) {
    const oldMarkups = {
      wholesaleMarkupPercent: Number(product.wholesaleMarkupPercent),
      minimumWholesaleMarkupPercent: Number(product.minimumWholesaleMarkupPercent),
      hqBranchWholesaleMarkupPercent: Number(product.hqBranchWholesaleMarkupPercent),
      recommendedRetailMarkupPercent: Number(product.recommendedRetailMarkupPercent),
      minimumSellingMarkupPercent: Number(product.minimumSellingMarkupPercent),
    };
    const oldPrices = {
      wholesalePriceKgs: Number(product.wholesalePriceKgs),
      hqBranchWholesalePriceKgs: Number(product.hqBranchWholesalePriceKgs),
      recommendedRetailPriceKgs: Number(product.recommendedRetailPriceKgs),
      minimumSellingPriceKgs: Number(product.minimumSellingPriceKgs),
    };
    const newMarkups = {
      wholesaleMarkupPercent: input.wholesaleMarkupPercent,
      minimumWholesaleMarkupPercent:
        input.minimumWholesaleMarkupPercent ?? Number(product.minimumWholesaleMarkupPercent),
      hqBranchWholesaleMarkupPercent: input.hqBranchWholesaleMarkupPercent,
      recommendedRetailMarkupPercent: input.recommendedRetailMarkupPercent,
      minimumSellingMarkupPercent: input.minimumSellingMarkupPercent,
    };
    const newPrices = {
      wholesalePriceKgs: input.wholesalePriceKgs,
      hqBranchWholesalePriceKgs: input.hqBranchWholesalePriceKgs,
      recommendedRetailPriceKgs: input.recommendedRetailPriceKgs,
      minimumSellingPriceKgs: input.minimumSellingPriceKgs,
    };

    const updated = await tx.product.update({
      where: { id: product.id },
      data: {
        pricingMode: ProductPricingMode.MANUAL,
        costPriceKgs: input.costPriceKgs,
        finalCostKgs: input.costPriceKgs,
        wholesalePriceKgs: input.wholesalePriceKgs,
        hqBranchWholesalePriceKgs: input.hqBranchWholesalePriceKgs,
        recommendedRetailPriceKgs: input.recommendedRetailPriceKgs,
        minimumSellingPriceKgs: input.minimumSellingPriceKgs,
        maximumRetailPriceKgs: input.maximumRetailPriceKgs ?? 0,
        maximumWholesalePriceKgs: input.maximumWholesalePriceKgs ?? 0,
        enableMaximumRetailPrice: input.enableMaximumRetailPrice ?? false,
        enableMaximumWholesalePrice: input.enableMaximumWholesalePrice ?? false,
        maximumRetailMarkupPercent: input.maximumRetailMarkupPercent ?? 0,
        maximumWholesaleMarkupPercent: input.maximumWholesaleMarkupPercent ?? 0,
        wholesaleMarkupPercent: input.wholesaleMarkupPercent,
        minimumWholesaleMarkupPercent:
          input.minimumWholesaleMarkupPercent ?? Number(product.minimumWholesaleMarkupPercent),
        hqBranchWholesaleMarkupPercent: input.hqBranchWholesaleMarkupPercent,
        recommendedRetailMarkupPercent: input.recommendedRetailMarkupPercent,
        minimumSellingMarkupPercent: input.minimumSellingMarkupPercent,
        sellingPriceKgs: input.wholesalePriceKgs,
        marginAmount: Math.round((input.wholesalePriceKgs - input.costPriceKgs + Number.EPSILON) * 100) / 100,
        marginPercent:
          input.wholesalePriceKgs === 0
            ? 0
            : Math.round(
                (((input.wholesalePriceKgs - input.costPriceKgs) / input.wholesalePriceKgs) * 100 + Number.EPSILON) *
                  100,
              ) / 100,
      },
    });

    if (!input.skipMarkupAudit) {
      await tx.productPricingChangeHistory.create({
        data: {
          productId: product.id,
          branchId: input.branchId,
          sku: product.sku,
          fieldName: input.historyFieldName ?? 'markupBundle',
          oldValue: JSON.stringify(oldPrices),
          newValue: JSON.stringify(newPrices),
          oldMarkup: JSON.stringify(oldMarkups),
          newMarkup: JSON.stringify(newMarkups),
          pricingMode: ProductPricingMode.MANUAL,
          reason: input.reason,
          changedById: user.id,
        },
      });

      await this.auditInTx(tx, user, input.auditAction ?? 'PRICE_POLICY_UPDATED', 'Product', product.id, {
        sku: product.sku,
        oldValue: oldMarkups,
        newValue: newMarkups,
        reason: input.reason,
      });
    }

    await this.auditInTx(tx, user, 'PRICE_RECALCULATED', 'Product', product.id, {
      sku: product.sku,
      costPriceKgs: input.costPriceKgs,
      oldValue: oldPrices,
      newValue: newPrices,
      reason: input.reason,
    });
    await this.auditInTx(tx, user, 'PRICE_HISTORY_CREATED', 'Product', product.id, {
      sku: product.sku,
      reason: input.reason,
    });

    return updated;
  }

  private async syncSkuProducts(
    tx: PrismaTx,
    user: AuthUser,
    source: {
      sku: string;
      costPriceKgs: Prisma.Decimal;
      wholesalePriceKgs: Prisma.Decimal;
      hqBranchWholesalePriceKgs: Prisma.Decimal;
      recommendedRetailPriceKgs: Prisma.Decimal;
      minimumSellingPriceKgs: Prisma.Decimal;
      wholesaleMarkupPercent: Prisma.Decimal;
      minimumWholesaleMarkupPercent: Prisma.Decimal;
      hqBranchWholesaleMarkupPercent: Prisma.Decimal;
      recommendedRetailMarkupPercent: Prisma.Decimal;
      minimumSellingMarkupPercent: Prisma.Decimal;
      enableMaximumRetailPrice?: boolean;
      enableMaximumWholesalePrice?: boolean;
      maximumRetailMarkupPercent?: Prisma.Decimal;
      maximumWholesaleMarkupPercent?: Prisma.Decimal;
      maximumRetailPriceKgs?: Prisma.Decimal;
      maximumWholesalePriceKgs?: Prisma.Decimal;
      retailMaximumPolicySource?: MaximumPricePolicySource;
      wholesaleMaximumPolicySource?: MaximumPricePolicySource;
      retailMaximumPolicy?: MaximumPricePolicy;
      wholesaleMaximumPolicy?: MaximumPricePolicy;
    },
    reason?: string,
  ) {
    const products = await tx.product.findMany({
      where: { sku: source.sku, deletedAt: null },
      include: { branch: { select: { code: true } } },
    });

    for (const product of products) {
      const isHqBranch = product.branch?.code === HQ_CATALOG_BRANCH_CODE;
      const sellingPriceKgs = isHqBranch
        ? Number(source.hqBranchWholesalePriceKgs)
        : Number(source.wholesalePriceKgs);

      await tx.product.update({
        where: { id: product.id },
        data: {
          costPriceKgs: source.costPriceKgs,
          finalCostKgs: source.costPriceKgs,
          wholesalePriceKgs: source.wholesalePriceKgs,
          hqBranchWholesalePriceKgs: source.hqBranchWholesalePriceKgs,
          recommendedRetailPriceKgs: source.recommendedRetailPriceKgs,
          minimumSellingPriceKgs: source.minimumSellingPriceKgs,
          wholesaleMarkupPercent: source.wholesaleMarkupPercent,
          minimumWholesaleMarkupPercent: source.minimumWholesaleMarkupPercent,
          hqBranchWholesaleMarkupPercent: source.hqBranchWholesaleMarkupPercent,
          recommendedRetailMarkupPercent: source.recommendedRetailMarkupPercent,
          minimumSellingMarkupPercent: source.minimumSellingMarkupPercent,
          enableMaximumRetailPrice: source.enableMaximumRetailPrice ?? false,
          enableMaximumWholesalePrice: source.enableMaximumWholesalePrice ?? false,
          maximumRetailMarkupPercent: source.maximumRetailMarkupPercent ?? 0,
          maximumWholesaleMarkupPercent: source.maximumWholesaleMarkupPercent ?? 0,
          maximumRetailPriceKgs: source.maximumRetailPriceKgs ?? 0,
          maximumWholesalePriceKgs: source.maximumWholesalePriceKgs ?? 0,
          retailMaximumPolicySource: source.retailMaximumPolicySource,
          wholesaleMaximumPolicySource: source.wholesaleMaximumPolicySource,
          retailMaximumPolicy: source.retailMaximumPolicy,
          wholesaleMaximumPolicy: source.wholesaleMaximumPolicy,
          sellingPriceKgs,
        },
      });
    }
  }

  private async resolveAverageCatalogCost(hqBranchId?: string) {
    const branchId =
      hqBranchId ??
      (
        await this.prisma.branch.findFirst({
          where: { code: HQ_CATALOG_BRANCH_CODE },
          select: { id: true },
        })
      )?.id;
    if (!branchId) return 0;

    const products = await this.prisma.product.findMany({
      where: { branchId, deletedAt: null, isActive: true },
      select: { id: true },
      take: 50,
    });
    if (!products.length) return 0;

    let total = 0;
    let count = 0;
    for (const product of products) {
      const cost = await this.fifoService.getLatestHqCostPrice(product.id);
      if (cost.costPriceKgs > 0) {
        total += cost.costPriceKgs;
        count += 1;
      }
    }
    return count > 0 ? Math.round((total / count + Number.EPSILON) * 100) / 100 : 0;
  }

  private toRetailRow(
    product: {
      id: string;
      name: string;
      sku: string;
      isActive: boolean;
      categoryId: string;
      minimumSellingMarkupPercent: Prisma.Decimal;
      recommendedRetailMarkupPercent: Prisma.Decimal;
      recommendedRetailPriceKgs: Prisma.Decimal;
      minimumSellingPriceKgs: Prisma.Decimal;
      enableMaximumRetailPrice?: boolean;
      maximumRetailMarkupPercent?: Prisma.Decimal;
      maximumRetailPriceKgs?: Prisma.Decimal;
      hqBranchWholesalePriceKgs?: Prisma.Decimal;
      productCategory?: { id: string; nameRu: string; nameKy: string; nameEn: string; code: string } | null;
    },
    cost: { costPriceKgs: number },
  ) {
    const branchPurchasePriceKgs = Number(
      product.hqBranchWholesalePriceKgs ??
        pricesFromMarkups(cost.costPriceKgs, {
          wholesaleMarkupPercent: 0,
          hqBranchWholesaleMarkupPercent: 0,
          recommendedRetailMarkupPercent: Number(product.recommendedRetailMarkupPercent),
          minimumSellingMarkupPercent: Number(product.minimumSellingMarkupPercent),
        }).hqBranchWholesalePriceKgs,
    );
    return {
      id: product.id,
      name: product.name,
      sku: product.sku,
      categoryId: product.categoryId,
      categoryName: product.productCategory?.nameRu ?? product.productCategory?.nameEn ?? '-',
      isActive: product.isActive,
      costPriceKgs: cost.costPriceKgs,
      branchPurchasePriceKgs,
      minimumSellingMarkupPercent: Number(product.minimumSellingMarkupPercent),
      recommendedRetailMarkupPercent: Number(product.recommendedRetailMarkupPercent),
      retailPriceKgs: Number(product.recommendedRetailPriceKgs),
      minimumRetailPriceKgs: Number(product.minimumSellingPriceKgs),
      enableMaximumRetailPrice: Boolean(product.enableMaximumRetailPrice),
      maximumRetailMarkupPercent: Number(product.maximumRetailMarkupPercent ?? 0),
      maximumRetailPriceKgs: Number(product.maximumRetailPriceKgs ?? 0),
      currentPriceKgs: Number(product.recommendedRetailPriceKgs),
    };
  }

  private toWholesaleRow(
    product: {
      id: string;
      name: string;
      sku: string;
      isActive: boolean;
      categoryId: string;
      wholesaleMarkupPercent: Prisma.Decimal;
      minimumWholesaleMarkupPercent: Prisma.Decimal;
      wholesalePriceKgs: Prisma.Decimal;
      enableMaximumWholesalePrice?: boolean;
      maximumWholesaleMarkupPercent?: Prisma.Decimal;
      maximumWholesalePriceKgs?: Prisma.Decimal;
      hqBranchWholesaleMarkupPercent?: Prisma.Decimal;
      productCategory?: { id: string; nameRu: string; nameKy: string; nameEn: string; code: string } | null;
    },
    cost: { costPriceKgs: number },
  ) {
    const prices = pricesFromMarkups(cost.costPriceKgs, {
      wholesaleMarkupPercent: Number(product.wholesaleMarkupPercent),
      minimumWholesaleMarkupPercent: Number(product.minimumWholesaleMarkupPercent),
      hqBranchWholesaleMarkupPercent: Number(product.hqBranchWholesaleMarkupPercent ?? 0),
      recommendedRetailMarkupPercent: 0,
      minimumSellingMarkupPercent: 0,
      enableMaximumWholesalePrice: Boolean(product.enableMaximumWholesalePrice),
      maximumWholesaleMarkupPercent: Number(product.maximumWholesaleMarkupPercent ?? 0),
    });
    return {
      id: product.id,
      name: product.name,
      sku: product.sku,
      categoryId: product.categoryId,
      categoryName: product.productCategory?.nameRu ?? product.productCategory?.nameEn ?? '-',
      isActive: product.isActive,
      costPriceKgs: cost.costPriceKgs,
      branchPurchasePriceKgs: prices.hqBranchWholesalePriceKgs,
      minimumWholesaleMarkupPercent: Number(product.minimumWholesaleMarkupPercent),
      recommendedWholesaleMarkupPercent: Number(product.wholesaleMarkupPercent),
      enableMaximumWholesalePrice: Boolean(product.enableMaximumWholesalePrice),
      maximumWholesaleMarkupPercent: Number(product.maximumWholesaleMarkupPercent ?? 0),
      wholesalePriceKgs: Number(product.wholesalePriceKgs),
      minimumWholesalePriceKgs: prices.minimumWholesalePriceKgs,
      maximumWholesalePriceKgs: Number(product.maximumWholesalePriceKgs ?? prices.maximumWholesalePriceKgs),
      currentPriceKgs: Number(product.wholesalePriceKgs),
    };
  }

  private toProductPricingRow(
    product: {
      id: string;
      name: string;
      sku: string;
      isActive: boolean;
      categoryId: string;
      wholesaleMarkupPercent: Prisma.Decimal;
      minimumWholesaleMarkupPercent: Prisma.Decimal;
      hqBranchWholesaleMarkupPercent: Prisma.Decimal;
      recommendedRetailMarkupPercent: Prisma.Decimal;
      minimumSellingMarkupPercent: Prisma.Decimal;
      enableMaximumRetailPrice?: boolean;
      enableMaximumWholesalePrice?: boolean;
      maximumRetailMarkupPercent?: Prisma.Decimal;
      maximumWholesaleMarkupPercent?: Prisma.Decimal;
      retailMaximumPolicySource?: MaximumPricePolicySource;
      wholesaleMaximumPolicySource?: MaximumPricePolicySource;
      retailMaximumPolicy?: MaximumPricePolicy;
      wholesaleMaximumPolicy?: MaximumPricePolicy;
      wholesalePriceKgs?: Prisma.Decimal;
      recommendedRetailPriceKgs?: Prisma.Decimal;
      sellingPriceKgs?: Prisma.Decimal;
      updatedAt?: Date;
      productCategory?: {
        id: string;
        nameRu: string;
        nameKy: string;
        nameEn: string;
        code: string;
        defaultRetailMaximumPolicy?: MaximumPricePolicy;
        defaultWholesaleMaximumPolicy?: MaximumPricePolicy;
        defaultRetailMaximumMarkupPercent?: Prisma.Decimal;
        defaultWholesaleMaximumMarkupPercent?: Prisma.Decimal;
      } | null;
    },
    cost: { costPriceKgs: number; source: string; batchId: string | null; receivedAt: Date | null },
  ) {
    const markups = {
      wholesaleMarkupPercent: Number(product.wholesaleMarkupPercent),
      minimumWholesaleMarkupPercent: Number(product.minimumWholesaleMarkupPercent),
      hqBranchWholesaleMarkupPercent: Number(product.hqBranchWholesaleMarkupPercent),
      recommendedRetailMarkupPercent: Number(product.recommendedRetailMarkupPercent),
      minimumSellingMarkupPercent: Number(product.minimumSellingMarkupPercent),
      enableMaximumRetailPrice: Boolean(product.enableMaximumRetailPrice),
      enableMaximumWholesalePrice: Boolean(product.enableMaximumWholesalePrice),
      maximumRetailMarkupPercent: Number(product.maximumRetailMarkupPercent ?? 0),
      maximumWholesaleMarkupPercent: Number(product.maximumWholesaleMarkupPercent ?? 0),
    };
    const prices = pricesFromMarkups(cost.costPriceKgs, markups);

    return {
      id: product.id,
      name: product.name,
      sku: product.sku,
      categoryId: product.categoryId,
      categoryName: product.productCategory?.nameRu ?? product.productCategory?.nameEn ?? '-',
      isActive: product.isActive,
      costPriceKgs: cost.costPriceKgs,
      costSource: cost.source,
      costBatchId: cost.batchId,
      costReceivedAt: cost.receivedAt,
      ...prices,
      ...markups,
      enableMaximumRetailPrice: markups.enableMaximumRetailPrice,
      enableMaximumWholesalePrice: markups.enableMaximumWholesalePrice,
      retailMaximumPolicySource:
        product.retailMaximumPolicySource ?? MaximumPricePolicySource.CATEGORY,
      wholesaleMaximumPolicySource:
        product.wholesaleMaximumPolicySource ?? MaximumPricePolicySource.CATEGORY,
      retailMaximumPolicy: product.retailMaximumPolicy ?? MaximumPricePolicy.DISABLED,
      wholesaleMaximumPolicy: product.wholesaleMaximumPolicy ?? MaximumPricePolicy.DISABLED,
      productCategory: product.productCategory ?? null,
      currentRetailPriceKgs: Number(product.recommendedRetailPriceKgs ?? prices.recommendedRetailPriceKgs),
      currentWholesalePriceKgs: Number(product.wholesalePriceKgs ?? prices.wholesalePriceKgs),
      updatedAt: product.updatedAt ?? null,
    };
  }

  private assertCanView(user: AuthUser) {
    if (!canViewPricing(user)) throw new ForbiddenException('Insufficient permissions to view pricing');
  }

  private async syncInheritedCategoryPolicies(
    tx: PrismaTx,
    user: AuthUser,
    categoryId: string,
    category: {
      defaultRetailMaximumPolicy: MaximumPricePolicy;
      defaultWholesaleMaximumPolicy: MaximumPricePolicy;
      defaultRetailMaximumMarkupPercent: Prisma.Decimal;
      defaultWholesaleMaximumMarkupPercent: Prisma.Decimal;
    },
    reason?: string,
  ) {
    const products = await tx.product.findMany({
      where: {
        categoryId,
        deletedAt: null,
        OR: [
          { retailMaximumPolicySource: MaximumPricePolicySource.CATEGORY },
          { wholesaleMaximumPolicySource: MaximumPricePolicySource.CATEGORY },
        ],
      },
    });

    for (const product of products) {
      const retailPolicy =
        product.retailMaximumPolicySource === MaximumPricePolicySource.CATEGORY
          ? category.defaultRetailMaximumPolicy
          : product.retailMaximumPolicy;
      const wholesalePolicy =
        product.wholesaleMaximumPolicySource === MaximumPricePolicySource.CATEGORY
          ? category.defaultWholesaleMaximumPolicy
          : product.wholesaleMaximumPolicy;
      const retailMarkup =
        product.retailMaximumPolicySource === MaximumPricePolicySource.CATEGORY
          ? Number(category.defaultRetailMaximumMarkupPercent)
          : Number(product.maximumRetailMarkupPercent);
      const wholesaleMarkup =
        product.wholesaleMaximumPolicySource === MaximumPricePolicySource.CATEGORY
          ? Number(category.defaultWholesaleMaximumMarkupPercent)
          : Number(product.maximumWholesaleMarkupPercent);

      const prices = pricesFromMarkups(Number(product.costPriceKgs), {
        wholesaleMarkupPercent: Number(product.wholesaleMarkupPercent),
        minimumWholesaleMarkupPercent: Number(product.minimumWholesaleMarkupPercent),
        hqBranchWholesaleMarkupPercent: Number(product.hqBranchWholesaleMarkupPercent),
        recommendedRetailMarkupPercent: Number(product.recommendedRetailMarkupPercent),
        minimumSellingMarkupPercent: Number(product.minimumSellingMarkupPercent),
        enableMaximumRetailPrice: isMaximumPolicyActive(retailPolicy),
        maximumRetailMarkupPercent: retailMarkup,
        enableMaximumWholesalePrice: isMaximumPolicyActive(wholesalePolicy),
        maximumWholesaleMarkupPercent: wholesaleMarkup,
      });

      const updated = await tx.product.update({
        where: { id: product.id },
        data: {
          maximumRetailMarkupPercent: retailMarkup,
          maximumWholesaleMarkupPercent: wholesaleMarkup,
          enableMaximumRetailPrice: maximumPolicyToLegacyEnabled(retailPolicy),
          enableMaximumWholesalePrice: maximumPolicyToLegacyEnabled(wholesalePolicy),
          maximumRetailPriceKgs: prices.maximumRetailPriceKgs,
          maximumWholesalePriceKgs: prices.maximumWholesalePriceKgs,
        },
      });

      await this.syncSkuProducts(tx, user, updated, reason);
    }
  }

  private assertCanManage(user: AuthUser) {
    if (!canManagePricingPolicy(user)) {
      void this.prisma.auditLog
        .create({
          data: {
            userId: user.id,
            role: user.role,
            action: 'PRICE_UPDATE_DENIED',
            entity: 'PricingPolicy',
            entityId: user.id,
            metadata: {
              userId: user.id,
              role: user.role,
              roles: user.roles ?? [user.role],
              timestamp: new Date().toISOString(),
            } as Prisma.InputJsonValue,
          },
        })
        .catch(() => undefined);
      throw new ForbiddenException('Only CEO can manage pricing policy');
    }
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
