import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BranchType, MaximumMarkupOverrideReasonCode, MaximumPricePolicy, MaximumPricePolicySource, PricingAppliedRuleType, PricingEnginePriceType, PricingPolicyVersionStatus, ProductPricingMode, Prisma } from '@prisma/client';
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
} from './pricing-calculator.util';
import { PricingFifoService } from './pricing-fifo.service';
import { PricingEngineService } from './pricing-engine.service';
import {
  PreviewRetailMarkupDto,
  PreviewWholesaleMarkupDto,
  type MarkupPreviewResult,
} from './dto/pricing-markup-preview.dto';
import {
  OverrideMaximumRetailMarkupDto,
  OverrideMaximumWholesaleMarkupDto,
} from './dto/product-maximum-markup-override.dto';
import {
  isMaximumPolicyActive,
  maximumPolicyToLegacyEnabled,
  resolveRetailMaximumMarkup,
  resolveRetailMaximumPolicy,
  resolveWholesaleMaximumMarkup,
  resolveWholesaleMaximumPolicy,
} from './pricing-policy-resolution.util';
import {
  buildRetailMarkupRow,
  buildWholesaleMarkupRow,
  calculateRetailPricesFromBranchPrice,
  calculateWholesalePricesFromBranchPrice,
  resolveEffectiveMaximumRetailMarkupPercent,
  resolveEffectiveMaximumWholesaleMarkupPercent,
  validateRetailMarkups,
  validateWholesaleMarkups,
  type RetailMarkupInput,
  type WholesaleMarkupInput,
} from './product-markup-resolution.util';

type PrismaTx = Prisma.TransactionClient;

const PRODUCT_CATEGORY_MARKUP_SELECT = {
  id: true,
  nameRu: true,
  nameKy: true,
  nameEn: true,
  defaultRetailMaximumPolicy: true,
  defaultWholesaleMaximumPolicy: true,
  defaultRetailMaximumMarkupPercent: true,
  defaultWholesaleMaximumMarkupPercent: true,
} as const;

@Injectable()
export class PricingCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fifoService: PricingFifoService,
    private readonly pricingEngine: PricingEngineService,
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

  async listFranchiseSalesProducts(user: AuthUser, branchId?: string) {
    const displayBranch = await this.resolveCatalogDisplayBranch(branchId);
    const rows = await this.listProducts(user);
    return Promise.all(
      rows.map(async (row) => {
        const engine = displayBranch
          ? await this.pricingEngine.resolvePrice({
              productId: row.id,
              branchId: displayBranch.id,
              priceType: PricingEnginePriceType.BRANCH_PURCHASE,
            })
          : null;

        const masterBranchPriceKgs = engine?.baseBranchPriceKgs ?? row.hqBranchWholesalePriceKgs;
        const effectiveBranchPriceKgs = engine?.resolvedPriceKgs ?? masterBranchPriceKgs;
        const ruleApplied = this.isRuleApplied(engine?.appliedRuleType, masterBranchPriceKgs, effectiveBranchPriceKgs);

        return {
          id: row.id,
          name: row.name,
          sku: row.sku,
          categoryId: row.categoryId,
          categoryName: row.categoryName,
          isActive: row.isActive,
          costPriceKgs: engine?.baseCostKgs ?? row.costPriceKgs,
          hqMarkupPercent: row.hqBranchWholesaleMarkupPercent,
          /** @deprecated use effectiveBranchPriceKgs — kept for backward-compatible clients */
          branchPriceKgs: effectiveBranchPriceKgs,
          masterBranchPriceKgs,
          effectiveBranchPriceKgs,
          ruleApplied,
          appliedRuleType: engine?.appliedRuleType ?? null,
          pricingProfileId: engine?.pricingProfileId ?? displayBranch?.priceProfileId ?? null,
          pricingProfileName: engine?.pricingProfileName ?? displayBranch?.priceProfile?.name ?? null,
          pricingPolicyVersionId: engine?.pricingPolicyVersionId ?? null,
          displayBranchId: displayBranch?.id ?? null,
          displayBranchName: displayBranch?.name ?? null,
          lastUpdated: row.updatedAt,
        };
      }),
    );
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
    // Persist derived master prices for storage/history only — display after save uses Engine.
    const prices = pricesFromMarkups(cost.costPriceKgs, nextMarkups);

    await this.prisma.$transaction(async (tx) => {
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
    });

    const rows = await this.listFranchiseSalesProducts(user);
    const row = rows.find((item) => item.id === productId);
    if (!row) throw new NotFoundException('Product not found after update');
    return row;
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

  async listRetailProducts(user: AuthUser, branchId?: string) {
    this.assertCanView(user);
    await this.fifoService.syncFifoBatchesFromHqStockMovements();

    const displayBranch = await this.resolveCatalogDisplayBranch(branchId);
    const hqBranch = await this.prisma.branch.findFirst({
      where: { code: HQ_CATALOG_BRANCH_CODE },
      select: { id: true },
    });
    if (!hqBranch) return [];

    const products = await this.prisma.product.findMany({
      where: { branchId: hqBranch.id, deletedAt: null, isActive: true },
      include: {
        productCategory: {
          select: {
            id: true,
            nameRu: true,
            nameKy: true,
            nameEn: true,
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
      products.map(async (product) => this.toEngineRetailCatalogRow(product, displayBranch)),
    );
  }

  async listWholesaleProducts(user: AuthUser, branchId?: string) {
    this.assertCanView(user);
    await this.fifoService.syncFifoBatchesFromHqStockMovements();

    const displayBranch = await this.resolveCatalogDisplayBranch(branchId);
    const hqBranch = await this.prisma.branch.findFirst({
      where: { code: HQ_CATALOG_BRANCH_CODE },
      select: { id: true },
    });
    if (!hqBranch) return [];

    const products = await this.prisma.product.findMany({
      where: { branchId: hqBranch.id, deletedAt: null, isActive: true },
      include: {
        productCategory: {
          select: {
            id: true,
            nameRu: true,
            nameKy: true,
            nameEn: true,
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
      products.map(async (product) => this.toEngineWholesaleCatalogRow(product, displayBranch)),
    );
  }

  async previewRetailPricing(
    user: AuthUser,
    productId: string,
    dto: PreviewRetailMarkupDto,
  ): Promise<MarkupPreviewResult> {
    this.assertCanManage(user);

    const context = await this.resolveRetailMarkupContext(productId);
    const previewProduct = {
      ...context.product,
      minimumSellingMarkupPercent: dto.minimumSellingMarkupPercent,
      recommendedRetailMarkupPercent: dto.recommendedRetailMarkupPercent,
      maximumRetailMarkupOverridePercent:
        dto.maximumRetailMarkupOverridePercent !== undefined
          ? dto.maximumRetailMarkupOverridePercent
          : context.product.maximumRetailMarkupOverridePercent,
    };
    const markupRow = buildRetailMarkupRow(
      previewProduct,
      context.category,
      context.effectiveBranchPriceKgs,
    );

    if (markupRow.validationStatus === 'ERROR') {
      return {
        productId,
        validationStatus: 'ERROR',
        validationErrors: markupRow.validationErrors,
        preview: null,
      };
    }

    return {
      productId,
      validationStatus: 'OK',
      validationErrors: [],
      preview: {
        minimumPriceKgs: markupRow.minimumRetailPriceKgs,
        recommendedPriceKgs: markupRow.recommendedRetailPriceKgs,
        maximumPriceKgs: markupRow.maximumRetailPriceKgs,
        effectiveMaximumMarkupPercent: markupRow.effectiveMaximumRetailMarkupPercent,
        inheritedMaximumMarkupPercent: markupRow.inheritedMaximumRetailMarkupPercent,
        maximumMarkupOverridePercent: markupRow.maximumRetailMarkupOverridePercent,
        maximumMarkupSource: markupRow.maximumRetailMarkupSource,
      },
    };
  }

  async previewWholesalePricing(
    user: AuthUser,
    productId: string,
    dto: PreviewWholesaleMarkupDto,
  ): Promise<MarkupPreviewResult> {
    this.assertCanManage(user);

    const context = await this.resolveWholesaleMarkupContext(productId);
    const previewProduct = {
      ...context.product,
      minimumWholesaleMarkupPercent: dto.minimumWholesaleMarkupPercent,
      wholesaleMarkupPercent: dto.recommendedWholesaleMarkupPercent,
      maximumWholesaleMarkupOverridePercent:
        dto.maximumWholesaleMarkupOverridePercent !== undefined
          ? dto.maximumWholesaleMarkupOverridePercent
          : context.product.maximumWholesaleMarkupOverridePercent,
    };
    const markupRow = buildWholesaleMarkupRow(
      previewProduct,
      context.category,
      context.effectiveBranchPriceKgs,
    );

    if (markupRow.validationStatus === 'ERROR') {
      return {
        productId,
        validationStatus: 'ERROR',
        validationErrors: markupRow.validationErrors,
        preview: null,
      };
    }

    return {
      productId,
      validationStatus: 'OK',
      validationErrors: [],
      preview: {
        minimumPriceKgs: markupRow.minimumWholesalePriceKgs,
        recommendedPriceKgs: markupRow.recommendedWholesalePriceKgs,
        maximumPriceKgs: markupRow.maximumWholesalePriceKgs,
        effectiveMaximumMarkupPercent: markupRow.effectiveMaximumWholesaleMarkupPercent,
        inheritedMaximumMarkupPercent: markupRow.inheritedMaximumWholesaleMarkupPercent,
        maximumMarkupOverridePercent: markupRow.maximumWholesaleMarkupOverridePercent,
        maximumMarkupSource: markupRow.maximumWholesaleMarkupSource,
      },
    };
  }

  async updateRetailPricing(user: AuthUser, productId: string, dto: UpdateRetailPricingDto) {
    this.assertCanManage(user);

    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      include: { productCategory: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    const category = product.productCategory ?? {
      defaultRetailMaximumPolicy: MaximumPricePolicy.DISABLED,
      defaultWholesaleMaximumPolicy: MaximumPricePolicy.DISABLED,
      defaultRetailMaximumMarkupPercent: 0,
      defaultWholesaleMaximumMarkupPercent: 0,
    };

    const inheritedMaximumRetailMarkupPercent = resolveRetailMaximumMarkup(product, category);
    const previousOverride =
      product.maximumRetailMarkupOverridePercent != null
        ? Number(product.maximumRetailMarkupOverridePercent)
        : null;

    let nextOverride = previousOverride;
    let nextEffectiveMax = resolveEffectiveMaximumRetailMarkupPercent(product, category);
    let nextMaxSource: 'INHERITED' | 'CEO_PRODUCT_OVERRIDE' =
      previousOverride != null ? 'CEO_PRODUCT_OVERRIDE' : 'INHERITED';

    if (dto.restoreMaximumRetailInheritance || dto.maximumRetailMarkupOverridePercent === null) {
      nextOverride = null;
      nextEffectiveMax = inheritedMaximumRetailMarkupPercent;
      nextMaxSource = 'INHERITED';
    } else if (dto.maximumRetailMarkupOverridePercent !== undefined) {
      const requested = dto.maximumRetailMarkupOverridePercent;
      if (Math.abs(requested - inheritedMaximumRetailMarkupPercent) < 0.001) {
        nextOverride = null;
        nextEffectiveMax = inheritedMaximumRetailMarkupPercent;
        nextMaxSource = 'INHERITED';
      } else {
        nextOverride = requested;
        nextEffectiveMax = requested;
        nextMaxSource = 'CEO_PRODUCT_OVERRIDE';
      }
    }

    const validation = validateRetailMarkups({
      minimumRetailMarkupPercent: dto.minimumSellingMarkupPercent,
      recommendedRetailMarkupPercent: dto.recommendedRetailMarkupPercent,
      inheritedMaximumRetailMarkupPercent,
      effectiveMaximumRetailMarkupPercent: nextEffectiveMax,
      maximumRetailMarkupSource: nextMaxSource,
    });
    if (validation.validationStatus === 'ERROR') {
      throw new BadRequestException(validation.validationErrors[0]);
    }

    const cost = await this.fifoService.getLatestHqCostPrice(product.id);
    const basePrices = pricesFromMarkups(cost.costPriceKgs, {
      wholesaleMarkupPercent: Number(product.wholesaleMarkupPercent),
      minimumWholesaleMarkupPercent: Number(product.minimumWholesaleMarkupPercent),
      hqBranchWholesaleMarkupPercent: Number(product.hqBranchWholesaleMarkupPercent),
      recommendedRetailMarkupPercent: dto.recommendedRetailMarkupPercent,
      minimumSellingMarkupPercent: dto.minimumSellingMarkupPercent,
    });
    const retailPrices = calculateRetailPricesFromBranchPrice(basePrices.hqBranchWholesalePriceKgs, {
      minimumRetailMarkupPercent: dto.minimumSellingMarkupPercent,
      recommendedRetailMarkupPercent: dto.recommendedRetailMarkupPercent,
      effectiveMaximumRetailMarkupPercent: nextEffectiveMax,
    });

    const resolvedRetailPolicy = resolveRetailMaximumPolicy(product, category);
    const enableMaximumRetailPrice = maximumPolicyToLegacyEnabled(resolvedRetailPolicy);
    const pricingPolicyVersionId = await this.getActivePricingPolicyVersionId();

    return this.prisma.$transaction(async (tx) => {
      const oldMin = Number(product.minimumSellingMarkupPercent);
      const oldRecommended = Number(product.recommendedRetailMarkupPercent);
      const oldEffectiveMax = resolveEffectiveMaximumRetailMarkupPercent(product, category);

      await this.persistProductPricing(tx, user, product, {
        costPriceKgs: cost.costPriceKgs,
        wholesalePriceKgs: basePrices.wholesalePriceKgs,
        hqBranchWholesalePriceKgs: basePrices.hqBranchWholesalePriceKgs,
        recommendedRetailPriceKgs: retailPrices.recommendedRetailPriceKgs,
        minimumSellingPriceKgs: retailPrices.minimumRetailPriceKgs,
        maximumRetailPriceKgs: retailPrices.maximumRetailPriceKgs,
        enableMaximumRetailPrice,
        maximumRetailMarkupPercent: nextEffectiveMax,
        wholesaleMarkupPercent: Number(product.wholesaleMarkupPercent),
        minimumWholesaleMarkupPercent: Number(product.minimumWholesaleMarkupPercent),
        hqBranchWholesaleMarkupPercent: Number(product.hqBranchWholesaleMarkupPercent),
        recommendedRetailMarkupPercent: dto.recommendedRetailMarkupPercent,
        minimumSellingMarkupPercent: dto.minimumSellingMarkupPercent,
        reason: dto.reason,
        historyFieldName: 'retailMarkup',
        auditAction: 'RETAIL_MARKUP_UPDATED',
      });

      const updated = await tx.product.update({
        where: { id: product.id },
        data:
          nextOverride != null
            ? {
                maximumRetailMarkupOverridePercent: nextOverride,
                retailMaximumOverrideReasonCode: MaximumMarkupOverrideReasonCode.MANAGEMENT_DECISION,
                retailMaximumOverriddenById: user.id,
                retailMaximumOverriddenAt: new Date(),
                maximumRetailPriceKgs: retailPrices.maximumRetailPriceKgs,
                maximumRetailMarkupPercent: nextEffectiveMax,
              }
            : {
                maximumRetailMarkupOverridePercent: null,
                retailMaximumOverrideReasonCode: null,
                retailMaximumOverrideReasonComment: null,
                retailMaximumOverriddenById: null,
                retailMaximumOverriddenAt: null,
                maximumRetailPriceKgs: retailPrices.maximumRetailPriceKgs,
                maximumRetailMarkupPercent: nextEffectiveMax,
              },
      });

      await this.auditInTx(tx, user, 'PRODUCT_RETAIL_MARKUPS_UPDATED', 'Product', product.id, {
        userId: user.id,
        productId: product.id,
        pricingPolicyVersionId,
        priceType: 'RETAIL',
        oldMinimumMarkupPercent: oldMin,
        newMinimumMarkupPercent: dto.minimumSellingMarkupPercent,
        oldRecommendedMarkupPercent: oldRecommended,
        newRecommendedMarkupPercent: dto.recommendedRetailMarkupPercent,
        oldMaximumMarkupPercent: oldEffectiveMax,
        newMaximumMarkupPercent: nextEffectiveMax,
        effectiveBranchPriceKgs: basePrices.hqBranchWholesalePriceKgs,
        timestamp: new Date().toISOString(),
      });
      await this.auditInTx(tx, user, 'PRODUCT_RETAIL_PRICES_RECALCULATED', 'Product', product.id, {
        userId: user.id,
        productId: product.id,
        pricingPolicyVersionId,
        priceType: 'RETAIL',
        effectiveBranchPriceKgs: basePrices.hqBranchWholesalePriceKgs,
        calculatedMinimumPriceKgs: retailPrices.minimumRetailPriceKgs,
        calculatedRecommendedPriceKgs: retailPrices.recommendedRetailPriceKgs,
        calculatedMaximumPriceKgs: retailPrices.maximumRetailPriceKgs,
        timestamp: new Date().toISOString(),
      });

      if (previousOverride != null && nextOverride == null) {
        await this.auditMarkupChange(tx, user, product.id, {
          action: 'PRODUCT_MAXIMUM_MARKUP_INHERITANCE_RESTORED',
          priceType: 'RETAIL',
          inheritedValue: inheritedMaximumRetailMarkupPercent,
          previousOverrideValue: previousOverride,
          newOverrideValue: null,
          effectiveValue: inheritedMaximumRetailMarkupPercent,
          reasonCode: null,
          reasonComment: dto.reason ?? null,
        });
      } else if (
        nextOverride != null &&
        (previousOverride == null || Math.abs(previousOverride - nextOverride) > 0.01)
      ) {
        await this.auditMarkupChange(tx, user, product.id, {
          action: 'PRODUCT_MAXIMUM_MARKUP_OVERRIDDEN',
          priceType: 'RETAIL',
          inheritedValue: inheritedMaximumRetailMarkupPercent,
          previousOverrideValue: previousOverride,
          newOverrideValue: nextOverride,
          effectiveValue: nextOverride,
          reasonCode: MaximumMarkupOverrideReasonCode.MANAGEMENT_DECISION,
          reasonComment: dto.reason ?? null,
        });
      }

      await this.syncSkuProducts(tx, user, updated, dto.reason);
      return this.loadRetailProductRowFromTx(tx, product.id);
    });
  }

  async overrideRetailMaximumMarkup(
    user: AuthUser,
    productId: string,
    dto: OverrideMaximumRetailMarkupDto,
  ) {
    this.assertCanManage(user);
    if (
      dto.overrideReasonCode === MaximumMarkupOverrideReasonCode.OTHER &&
      !dto.overrideReasonComment?.trim()
    ) {
      throw new BadRequestException('Комментарий обязателен при выборе причины «Другое»');
    }

    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      include: { productCategory: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    const category = product.productCategory ?? {
      defaultRetailMaximumPolicy: MaximumPricePolicy.DISABLED,
      defaultWholesaleMaximumPolicy: MaximumPricePolicy.DISABLED,
      defaultRetailMaximumMarkupPercent: 0,
      defaultWholesaleMaximumMarkupPercent: 0,
    };
    const inheritedMaximumRetailMarkupPercent = resolveRetailMaximumMarkup(product, category);
    const minimumRetailMarkupPercent = Number(product.minimumSellingMarkupPercent);
    const recommendedRetailMarkupPercent = Number(product.recommendedRetailMarkupPercent);

    const validation = validateRetailMarkups({
      minimumRetailMarkupPercent,
      recommendedRetailMarkupPercent,
      inheritedMaximumRetailMarkupPercent,
      effectiveMaximumRetailMarkupPercent: dto.maximumRetailMarkupOverridePercent,
      maximumRetailMarkupSource: 'CEO_PRODUCT_OVERRIDE',
    });
    if (validation.validationStatus === 'ERROR') {
      throw new BadRequestException(validation.validationErrors[0]);
    }

    const cost = await this.fifoService.getLatestHqCostPrice(product.id);
    const basePrices = pricesFromMarkups(cost.costPriceKgs, {
      wholesaleMarkupPercent: Number(product.wholesaleMarkupPercent),
      minimumWholesaleMarkupPercent: Number(product.minimumWholesaleMarkupPercent),
      hqBranchWholesaleMarkupPercent: Number(product.hqBranchWholesaleMarkupPercent),
      recommendedRetailMarkupPercent,
      minimumSellingMarkupPercent: minimumRetailMarkupPercent,
    });
    const retailPrices = calculateRetailPricesFromBranchPrice(basePrices.hqBranchWholesalePriceKgs, {
      minimumRetailMarkupPercent,
      recommendedRetailMarkupPercent,
      effectiveMaximumRetailMarkupPercent: dto.maximumRetailMarkupOverridePercent,
    });

    return this.prisma.$transaction(async (tx) => {
      const previousOverride = product.maximumRetailMarkupOverridePercent
        ? Number(product.maximumRetailMarkupOverridePercent)
        : null;
      const updated = await tx.product.update({
        where: { id: product.id },
        data: {
          maximumRetailMarkupOverridePercent: dto.maximumRetailMarkupOverridePercent,
          retailMaximumOverrideReasonCode: dto.overrideReasonCode,
          retailMaximumOverrideReasonComment: dto.overrideReasonComment?.trim() ?? null,
          retailMaximumOverriddenById: user.id,
          retailMaximumOverriddenAt: new Date(),
          maximumRetailPriceKgs: retailPrices.maximumRetailPriceKgs,
        },
      });

      await this.auditMarkupChange(tx, user, product.id, {
        action: 'PRODUCT_RETAIL_MAXIMUM_MARKUP_OVERRIDDEN',
        priceType: 'RETAIL',
        inheritedValue: inheritedMaximumRetailMarkupPercent,
        previousOverrideValue: previousOverride,
        newOverrideValue: dto.maximumRetailMarkupOverridePercent,
        effectiveValue: dto.maximumRetailMarkupOverridePercent,
        reasonCode: dto.overrideReasonCode,
        reasonComment: dto.overrideReasonComment?.trim() ?? null,
      });

      await this.syncSkuProducts(tx, user, updated, dto.overrideReasonComment);
      return this.loadRetailProductRowFromTx(tx, product.id);
    });
  }

  async restoreRetailMaximumMarkupInheritance(user: AuthUser, productId: string) {
    this.assertCanManage(user);

    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      include: { productCategory: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    const category = product.productCategory ?? {
      defaultRetailMaximumPolicy: MaximumPricePolicy.DISABLED,
      defaultWholesaleMaximumPolicy: MaximumPricePolicy.DISABLED,
      defaultRetailMaximumMarkupPercent: 0,
      defaultWholesaleMaximumMarkupPercent: 0,
    };
    const inheritedMaximumRetailMarkupPercent = resolveRetailMaximumMarkup(product, category);
    const previousOverride = product.maximumRetailMarkupOverridePercent
      ? Number(product.maximumRetailMarkupOverridePercent)
      : null;

    const minimumRetailMarkupPercent = Number(product.minimumSellingMarkupPercent);
    const recommendedRetailMarkupPercent = Number(product.recommendedRetailMarkupPercent);
    const validation = validateRetailMarkups({
      minimumRetailMarkupPercent,
      recommendedRetailMarkupPercent,
      inheritedMaximumRetailMarkupPercent,
      effectiveMaximumRetailMarkupPercent: inheritedMaximumRetailMarkupPercent,
      maximumRetailMarkupSource: 'INHERITED',
    });

    const cost = await this.fifoService.getLatestHqCostPrice(product.id);
    const basePrices = pricesFromMarkups(cost.costPriceKgs, {
      wholesaleMarkupPercent: Number(product.wholesaleMarkupPercent),
      minimumWholesaleMarkupPercent: Number(product.minimumWholesaleMarkupPercent),
      hqBranchWholesaleMarkupPercent: Number(product.hqBranchWholesaleMarkupPercent),
      recommendedRetailMarkupPercent,
      minimumSellingMarkupPercent: minimumRetailMarkupPercent,
    });
    const retailPrices = calculateRetailPricesFromBranchPrice(basePrices.hqBranchWholesalePriceKgs, {
      minimumRetailMarkupPercent,
      recommendedRetailMarkupPercent,
      effectiveMaximumRetailMarkupPercent: inheritedMaximumRetailMarkupPercent,
    });

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id: product.id },
        data: {
          maximumRetailMarkupOverridePercent: null,
          retailMaximumOverrideReasonCode: null,
          retailMaximumOverrideReasonComment: null,
          retailMaximumOverriddenById: null,
          retailMaximumOverriddenAt: null,
          maximumRetailPriceKgs: retailPrices.maximumRetailPriceKgs,
        },
      });

      await this.auditMarkupChange(tx, user, product.id, {
        action: 'PRODUCT_RETAIL_MAXIMUM_MARKUP_INHERITANCE_RESTORED',
        priceType: 'RETAIL',
        inheritedValue: inheritedMaximumRetailMarkupPercent,
        previousOverrideValue: previousOverride,
        newOverrideValue: null,
        effectiveValue: inheritedMaximumRetailMarkupPercent,
        reasonCode: null,
        reasonComment: null,
      });

      await this.syncSkuProducts(tx, user, updated);
      const row = await this.loadRetailProductRowFromTx(tx, product.id);
      return { ...row, validationStatus: validation.validationStatus, validationErrors: validation.validationErrors };
    });
  }

  async updateWholesalePricing(user: AuthUser, productId: string, dto: UpdateWholesalePricingDto) {
    this.assertCanManage(user);

    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      include: { productCategory: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    const category = product.productCategory ?? {
      defaultRetailMaximumPolicy: MaximumPricePolicy.DISABLED,
      defaultWholesaleMaximumPolicy: MaximumPricePolicy.DISABLED,
      defaultRetailMaximumMarkupPercent: 0,
      defaultWholesaleMaximumMarkupPercent: 0,
    };

    const inheritedMaximumWholesaleMarkupPercent = resolveWholesaleMaximumMarkup(product, category);
    const previousOverride =
      product.maximumWholesaleMarkupOverridePercent != null
        ? Number(product.maximumWholesaleMarkupOverridePercent)
        : null;

    let nextOverride = previousOverride;
    let nextEffectiveMax = resolveEffectiveMaximumWholesaleMarkupPercent(product, category);
    let nextMaxSource: 'INHERITED' | 'CEO_PRODUCT_OVERRIDE' =
      previousOverride != null ? 'CEO_PRODUCT_OVERRIDE' : 'INHERITED';

    if (dto.restoreMaximumWholesaleInheritance || dto.maximumWholesaleMarkupOverridePercent === null) {
      nextOverride = null;
      nextEffectiveMax = inheritedMaximumWholesaleMarkupPercent;
      nextMaxSource = 'INHERITED';
    } else if (dto.maximumWholesaleMarkupOverridePercent !== undefined) {
      const requested = dto.maximumWholesaleMarkupOverridePercent;
      if (Math.abs(requested - inheritedMaximumWholesaleMarkupPercent) < 0.001) {
        nextOverride = null;
        nextEffectiveMax = inheritedMaximumWholesaleMarkupPercent;
        nextMaxSource = 'INHERITED';
      } else {
        nextOverride = requested;
        nextEffectiveMax = requested;
        nextMaxSource = 'CEO_PRODUCT_OVERRIDE';
      }
    }

    const validation = validateWholesaleMarkups({
      minimumWholesaleMarkupPercent: dto.minimumWholesaleMarkupPercent,
      recommendedWholesaleMarkupPercent: dto.recommendedWholesaleMarkupPercent,
      inheritedMaximumWholesaleMarkupPercent,
      effectiveMaximumWholesaleMarkupPercent: nextEffectiveMax,
      maximumWholesaleMarkupSource: nextMaxSource,
    });
    if (validation.validationStatus === 'ERROR') {
      throw new BadRequestException(validation.validationErrors[0]);
    }

    const cost = await this.fifoService.getLatestHqCostPrice(product.id);
    const basePrices = pricesFromMarkups(cost.costPriceKgs, {
      wholesaleMarkupPercent: dto.recommendedWholesaleMarkupPercent,
      minimumWholesaleMarkupPercent: dto.minimumWholesaleMarkupPercent,
      hqBranchWholesaleMarkupPercent: Number(product.hqBranchWholesaleMarkupPercent),
      recommendedRetailMarkupPercent: Number(product.recommendedRetailMarkupPercent),
      minimumSellingMarkupPercent: Number(product.minimumSellingMarkupPercent),
    });
    const wholesalePrices = calculateWholesalePricesFromBranchPrice(
      basePrices.hqBranchWholesalePriceKgs,
      {
        minimumWholesaleMarkupPercent: dto.minimumWholesaleMarkupPercent,
        recommendedWholesaleMarkupPercent: dto.recommendedWholesaleMarkupPercent,
        effectiveMaximumWholesaleMarkupPercent: nextEffectiveMax,
      },
    );

    const resolvedWholesalePolicy = resolveWholesaleMaximumPolicy(product, category);
    const enableMaximumWholesalePrice = maximumPolicyToLegacyEnabled(resolvedWholesalePolicy);
    const pricingPolicyVersionId = await this.getActivePricingPolicyVersionId();

    return this.prisma.$transaction(async (tx) => {
      const oldMin = Number(product.minimumWholesaleMarkupPercent);
      const oldRecommended = Number(product.wholesaleMarkupPercent);
      const oldEffectiveMax = resolveEffectiveMaximumWholesaleMarkupPercent(product, category);

      await this.persistProductPricing(tx, user, product, {
        costPriceKgs: cost.costPriceKgs,
        wholesalePriceKgs: wholesalePrices.recommendedWholesalePriceKgs,
        hqBranchWholesalePriceKgs: basePrices.hqBranchWholesalePriceKgs,
        recommendedRetailPriceKgs: basePrices.recommendedRetailPriceKgs,
        minimumSellingPriceKgs: basePrices.minimumSellingPriceKgs,
        maximumWholesalePriceKgs: wholesalePrices.maximumWholesalePriceKgs,
        enableMaximumWholesalePrice,
        maximumWholesaleMarkupPercent: nextEffectiveMax,
        wholesaleMarkupPercent: dto.recommendedWholesaleMarkupPercent,
        minimumWholesaleMarkupPercent: dto.minimumWholesaleMarkupPercent,
        hqBranchWholesaleMarkupPercent: Number(product.hqBranchWholesaleMarkupPercent),
        recommendedRetailMarkupPercent: Number(product.recommendedRetailMarkupPercent),
        minimumSellingMarkupPercent: Number(product.minimumSellingMarkupPercent),
        reason: dto.reason,
        historyFieldName: 'wholesaleMarkup',
        auditAction: 'WHOLESALE_MARKUP_UPDATED',
      });

      const updated = await tx.product.update({
        where: { id: product.id },
        data:
          nextOverride != null
            ? {
                maximumWholesaleMarkupOverridePercent: nextOverride,
                wholesaleMaximumOverrideReasonCode: MaximumMarkupOverrideReasonCode.MANAGEMENT_DECISION,
                wholesaleMaximumOverriddenById: user.id,
                wholesaleMaximumOverriddenAt: new Date(),
                maximumWholesalePriceKgs: wholesalePrices.maximumWholesalePriceKgs,
                maximumWholesaleMarkupPercent: nextEffectiveMax,
              }
            : {
                maximumWholesaleMarkupOverridePercent: null,
                wholesaleMaximumOverrideReasonCode: null,
                wholesaleMaximumOverrideReasonComment: null,
                wholesaleMaximumOverriddenById: null,
                wholesaleMaximumOverriddenAt: null,
                maximumWholesalePriceKgs: wholesalePrices.maximumWholesalePriceKgs,
                maximumWholesaleMarkupPercent: nextEffectiveMax,
              },
      });

      await this.auditInTx(tx, user, 'PRODUCT_WHOLESALE_MARKUPS_UPDATED', 'Product', product.id, {
        userId: user.id,
        productId: product.id,
        pricingPolicyVersionId,
        priceType: 'WHOLESALE',
        oldMinimumMarkupPercent: oldMin,
        newMinimumMarkupPercent: dto.minimumWholesaleMarkupPercent,
        oldRecommendedMarkupPercent: oldRecommended,
        newRecommendedMarkupPercent: dto.recommendedWholesaleMarkupPercent,
        oldMaximumMarkupPercent: oldEffectiveMax,
        newMaximumMarkupPercent: nextEffectiveMax,
        effectiveBranchPriceKgs: basePrices.hqBranchWholesalePriceKgs,
        timestamp: new Date().toISOString(),
      });
      await this.auditInTx(tx, user, 'PRODUCT_WHOLESALE_PRICES_RECALCULATED', 'Product', product.id, {
        userId: user.id,
        productId: product.id,
        pricingPolicyVersionId,
        priceType: 'WHOLESALE',
        effectiveBranchPriceKgs: basePrices.hqBranchWholesalePriceKgs,
        calculatedMinimumPriceKgs: wholesalePrices.minimumWholesalePriceKgs,
        calculatedRecommendedPriceKgs: wholesalePrices.recommendedWholesalePriceKgs,
        calculatedMaximumPriceKgs: wholesalePrices.maximumWholesalePriceKgs,
        timestamp: new Date().toISOString(),
      });

      if (previousOverride != null && nextOverride == null) {
        await this.auditMarkupChange(tx, user, product.id, {
          action: 'PRODUCT_MAXIMUM_MARKUP_INHERITANCE_RESTORED',
          priceType: 'WHOLESALE',
          inheritedValue: inheritedMaximumWholesaleMarkupPercent,
          previousOverrideValue: previousOverride,
          newOverrideValue: null,
          effectiveValue: inheritedMaximumWholesaleMarkupPercent,
          reasonCode: null,
          reasonComment: dto.reason ?? null,
        });
      } else if (
        nextOverride != null &&
        (previousOverride == null || Math.abs(previousOverride - nextOverride) > 0.01)
      ) {
        await this.auditMarkupChange(tx, user, product.id, {
          action: 'PRODUCT_MAXIMUM_MARKUP_OVERRIDDEN',
          priceType: 'WHOLESALE',
          inheritedValue: inheritedMaximumWholesaleMarkupPercent,
          previousOverrideValue: previousOverride,
          newOverrideValue: nextOverride,
          effectiveValue: nextOverride,
          reasonCode: MaximumMarkupOverrideReasonCode.MANAGEMENT_DECISION,
          reasonComment: dto.reason ?? null,
        });
      }

      await this.syncSkuProducts(tx, user, updated, dto.reason);
      return this.loadWholesaleProductRowFromTx(tx, product.id);
    });
  }

  async overrideWholesaleMaximumMarkup(
    user: AuthUser,
    productId: string,
    dto: OverrideMaximumWholesaleMarkupDto,
  ) {
    this.assertCanManage(user);
    if (
      dto.overrideReasonCode === MaximumMarkupOverrideReasonCode.OTHER &&
      !dto.overrideReasonComment?.trim()
    ) {
      throw new BadRequestException('Комментарий обязателен при выборе причины «Другое»');
    }

    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      include: { productCategory: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    const category = product.productCategory ?? {
      defaultRetailMaximumPolicy: MaximumPricePolicy.DISABLED,
      defaultWholesaleMaximumPolicy: MaximumPricePolicy.DISABLED,
      defaultRetailMaximumMarkupPercent: 0,
      defaultWholesaleMaximumMarkupPercent: 0,
    };
    const inheritedMaximumWholesaleMarkupPercent = resolveWholesaleMaximumMarkup(product, category);
    const minimumWholesaleMarkupPercent = Number(product.minimumWholesaleMarkupPercent);
    const recommendedWholesaleMarkupPercent = Number(product.wholesaleMarkupPercent);

    const validation = validateWholesaleMarkups({
      minimumWholesaleMarkupPercent,
      recommendedWholesaleMarkupPercent,
      inheritedMaximumWholesaleMarkupPercent,
      effectiveMaximumWholesaleMarkupPercent: dto.maximumWholesaleMarkupOverridePercent,
      maximumWholesaleMarkupSource: 'CEO_PRODUCT_OVERRIDE',
    });
    if (validation.validationStatus === 'ERROR') {
      throw new BadRequestException(validation.validationErrors[0]);
    }

    const cost = await this.fifoService.getLatestHqCostPrice(product.id);
    const basePrices = pricesFromMarkups(cost.costPriceKgs, {
      wholesaleMarkupPercent: recommendedWholesaleMarkupPercent,
      minimumWholesaleMarkupPercent,
      hqBranchWholesaleMarkupPercent: Number(product.hqBranchWholesaleMarkupPercent),
      recommendedRetailMarkupPercent: Number(product.recommendedRetailMarkupPercent),
      minimumSellingMarkupPercent: Number(product.minimumSellingMarkupPercent),
    });
    const wholesalePrices = calculateWholesalePricesFromBranchPrice(
      basePrices.hqBranchWholesalePriceKgs,
      {
        minimumWholesaleMarkupPercent,
        recommendedWholesaleMarkupPercent,
        effectiveMaximumWholesaleMarkupPercent: dto.maximumWholesaleMarkupOverridePercent,
      },
    );

    return this.prisma.$transaction(async (tx) => {
      const previousOverride = product.maximumWholesaleMarkupOverridePercent
        ? Number(product.maximumWholesaleMarkupOverridePercent)
        : null;
      const updated = await tx.product.update({
        where: { id: product.id },
        data: {
          maximumWholesaleMarkupOverridePercent: dto.maximumWholesaleMarkupOverridePercent,
          wholesaleMaximumOverrideReasonCode: dto.overrideReasonCode,
          wholesaleMaximumOverrideReasonComment: dto.overrideReasonComment?.trim() ?? null,
          wholesaleMaximumOverriddenById: user.id,
          wholesaleMaximumOverriddenAt: new Date(),
          maximumWholesalePriceKgs: wholesalePrices.maximumWholesalePriceKgs,
        },
      });

      await this.auditMarkupChange(tx, user, product.id, {
        action: 'PRODUCT_WHOLESALE_MAXIMUM_MARKUP_OVERRIDDEN',
        priceType: 'WHOLESALE',
        inheritedValue: inheritedMaximumWholesaleMarkupPercent,
        previousOverrideValue: previousOverride,
        newOverrideValue: dto.maximumWholesaleMarkupOverridePercent,
        effectiveValue: dto.maximumWholesaleMarkupOverridePercent,
        reasonCode: dto.overrideReasonCode,
        reasonComment: dto.overrideReasonComment?.trim() ?? null,
      });

      await this.syncSkuProducts(tx, user, updated, dto.overrideReasonComment);
      return this.loadWholesaleProductRowFromTx(tx, product.id);
    });
  }

  async restoreWholesaleMaximumMarkupInheritance(user: AuthUser, productId: string) {
    this.assertCanManage(user);

    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      include: { productCategory: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    const category = product.productCategory ?? {
      defaultRetailMaximumPolicy: MaximumPricePolicy.DISABLED,
      defaultWholesaleMaximumPolicy: MaximumPricePolicy.DISABLED,
      defaultRetailMaximumMarkupPercent: 0,
      defaultWholesaleMaximumMarkupPercent: 0,
    };
    const inheritedMaximumWholesaleMarkupPercent = resolveWholesaleMaximumMarkup(product, category);
    const previousOverride = product.maximumWholesaleMarkupOverridePercent
      ? Number(product.maximumWholesaleMarkupOverridePercent)
      : null;

    const minimumWholesaleMarkupPercent = Number(product.minimumWholesaleMarkupPercent);
    const recommendedWholesaleMarkupPercent = Number(product.wholesaleMarkupPercent);
    const validation = validateWholesaleMarkups({
      minimumWholesaleMarkupPercent,
      recommendedWholesaleMarkupPercent,
      inheritedMaximumWholesaleMarkupPercent,
      effectiveMaximumWholesaleMarkupPercent: inheritedMaximumWholesaleMarkupPercent,
      maximumWholesaleMarkupSource: 'INHERITED',
    });

    const cost = await this.fifoService.getLatestHqCostPrice(product.id);
    const basePrices = pricesFromMarkups(cost.costPriceKgs, {
      wholesaleMarkupPercent: recommendedWholesaleMarkupPercent,
      minimumWholesaleMarkupPercent,
      hqBranchWholesaleMarkupPercent: Number(product.hqBranchWholesaleMarkupPercent),
      recommendedRetailMarkupPercent: Number(product.recommendedRetailMarkupPercent),
      minimumSellingMarkupPercent: Number(product.minimumSellingMarkupPercent),
    });
    const wholesalePrices = calculateWholesalePricesFromBranchPrice(
      basePrices.hqBranchWholesalePriceKgs,
      {
        minimumWholesaleMarkupPercent,
        recommendedWholesaleMarkupPercent,
        effectiveMaximumWholesaleMarkupPercent: inheritedMaximumWholesaleMarkupPercent,
      },
    );

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id: product.id },
        data: {
          maximumWholesaleMarkupOverridePercent: null,
          wholesaleMaximumOverrideReasonCode: null,
          wholesaleMaximumOverrideReasonComment: null,
          wholesaleMaximumOverriddenById: null,
          wholesaleMaximumOverriddenAt: null,
          maximumWholesalePriceKgs: wholesalePrices.maximumWholesalePriceKgs,
        },
      });

      await this.auditMarkupChange(tx, user, product.id, {
        action: 'PRODUCT_WHOLESALE_MAXIMUM_MARKUP_INHERITANCE_RESTORED',
        priceType: 'WHOLESALE',
        inheritedValue: inheritedMaximumWholesaleMarkupPercent,
        previousOverrideValue: previousOverride,
        newOverrideValue: null,
        effectiveValue: inheritedMaximumWholesaleMarkupPercent,
        reasonCode: null,
        reasonComment: null,
      });

      await this.syncSkuProducts(tx, user, updated);
      const row = await this.loadWholesaleProductRowFromTx(tx, product.id);
      return { ...row, validationStatus: validation.validationStatus, validationErrors: validation.validationErrors };
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
      maximumRetailMarkupOverridePercent?: Prisma.Decimal | null;
      maximumWholesaleMarkupOverridePercent?: Prisma.Decimal | null;
      retailMaximumOverrideReasonCode?: MaximumMarkupOverrideReasonCode | null;
      retailMaximumOverrideReasonComment?: string | null;
      retailMaximumOverriddenById?: string | null;
      retailMaximumOverriddenAt?: Date | null;
      wholesaleMaximumOverrideReasonCode?: MaximumMarkupOverrideReasonCode | null;
      wholesaleMaximumOverrideReasonComment?: string | null;
      wholesaleMaximumOverriddenById?: string | null;
      wholesaleMaximumOverriddenAt?: Date | null;
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
          maximumRetailMarkupOverridePercent: source.maximumRetailMarkupOverridePercent ?? null,
          maximumWholesaleMarkupOverridePercent: source.maximumWholesaleMarkupOverridePercent ?? null,
          retailMaximumOverrideReasonCode: source.retailMaximumOverrideReasonCode ?? null,
          retailMaximumOverrideReasonComment: source.retailMaximumOverrideReasonComment ?? null,
          retailMaximumOverriddenById: source.retailMaximumOverriddenById ?? null,
          retailMaximumOverriddenAt: source.retailMaximumOverriddenAt ?? null,
          wholesaleMaximumOverrideReasonCode: source.wholesaleMaximumOverrideReasonCode ?? null,
          wholesaleMaximumOverrideReasonComment: source.wholesaleMaximumOverrideReasonComment ?? null,
          wholesaleMaximumOverriddenById: source.wholesaleMaximumOverriddenById ?? null,
          wholesaleMaximumOverriddenAt: source.wholesaleMaximumOverriddenAt ?? null,
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

  private async resolveRetailMarkupContext(productId: string) {
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

    const cost = await this.fifoService.getLatestHqCostPrice(product.id);
    const prices = pricesFromMarkups(cost.costPriceKgs, {
      wholesaleMarkupPercent: Number(product.wholesaleMarkupPercent),
      minimumWholesaleMarkupPercent: Number(product.minimumWholesaleMarkupPercent),
      hqBranchWholesaleMarkupPercent: Number(product.hqBranchWholesaleMarkupPercent),
      recommendedRetailMarkupPercent: Number(product.recommendedRetailMarkupPercent),
      minimumSellingMarkupPercent: Number(product.minimumSellingMarkupPercent),
    });

    return {
      product,
      category: product.productCategory ?? {
        defaultRetailMaximumPolicy: MaximumPricePolicy.DISABLED,
        defaultWholesaleMaximumPolicy: MaximumPricePolicy.DISABLED,
        defaultRetailMaximumMarkupPercent: 0,
        defaultWholesaleMaximumMarkupPercent: 0,
      },
      effectiveBranchPriceKgs: prices.hqBranchWholesalePriceKgs,
    };
  }

  private async resolveWholesaleMarkupContext(productId: string) {
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

    const cost = await this.fifoService.getLatestHqCostPrice(product.id);
    const prices = pricesFromMarkups(cost.costPriceKgs, {
      wholesaleMarkupPercent: Number(product.wholesaleMarkupPercent),
      minimumWholesaleMarkupPercent: Number(product.minimumWholesaleMarkupPercent),
      hqBranchWholesaleMarkupPercent: Number(product.hqBranchWholesaleMarkupPercent),
      recommendedRetailMarkupPercent: Number(product.recommendedRetailMarkupPercent),
      minimumSellingMarkupPercent: Number(product.minimumSellingMarkupPercent),
    });

    return {
      product,
      category: product.productCategory ?? {
        defaultRetailMaximumPolicy: MaximumPricePolicy.DISABLED,
        defaultWholesaleMaximumPolicy: MaximumPricePolicy.DISABLED,
        defaultRetailMaximumMarkupPercent: 0,
        defaultWholesaleMaximumMarkupPercent: 0,
      },
      effectiveBranchPriceKgs: prices.hqBranchWholesalePriceKgs,
    };
  }

  private defaultCategoryMaximumFields(
    category?: {
      defaultRetailMaximumPolicy: MaximumPricePolicy;
      defaultWholesaleMaximumPolicy: MaximumPricePolicy;
      defaultRetailMaximumMarkupPercent: Prisma.Decimal;
      defaultWholesaleMaximumMarkupPercent: Prisma.Decimal;
      nameRu?: string | null;
      nameEn?: string | null;
      nameKy?: string | null;
    } | null,
  ) {
    return (
      category ?? {
        defaultRetailMaximumPolicy: MaximumPricePolicy.DISABLED,
        defaultWholesaleMaximumPolicy: MaximumPricePolicy.DISABLED,
        defaultRetailMaximumMarkupPercent: new Prisma.Decimal(0),
        defaultWholesaleMaximumMarkupPercent: new Prisma.Decimal(0),
      }
    );
  }

  private formatRetailCatalogRow(
    product: {
      id: string;
      name: string;
      sku: string;
      categoryId: string;
      isActive: boolean;
      updatedAt: Date;
      wholesaleMarkupPercent: Prisma.Decimal;
      minimumWholesaleMarkupPercent: Prisma.Decimal;
      hqBranchWholesaleMarkupPercent: Prisma.Decimal;
      recommendedRetailMarkupPercent: Prisma.Decimal;
      minimumSellingMarkupPercent: Prisma.Decimal;
      maximumRetailMarkupOverridePercent?: Prisma.Decimal | null;
      productCategory?: {
        id: string;
        nameRu: string;
        nameKy: string;
        nameEn: string;
        defaultRetailMaximumPolicy: MaximumPricePolicy;
        defaultWholesaleMaximumPolicy: MaximumPricePolicy;
        defaultRetailMaximumMarkupPercent: Prisma.Decimal;
        defaultWholesaleMaximumMarkupPercent: Prisma.Decimal;
      } | null;
    },
    effectiveBranchPriceKgs: number,
  ) {
    const category = this.defaultCategoryMaximumFields(product.productCategory);
    const markupRow = buildRetailMarkupRow(
      product as unknown as RetailMarkupInput & { id: string },
      category,
      effectiveBranchPriceKgs,
    );

    return {
      ...markupRow,
      id: product.id,
      name: product.name,
      sku: product.sku,
      categoryId: product.categoryId,
      categoryName: category.nameRu ?? category.nameEn ?? '-',
      isActive: product.isActive,
      maximumRetailMarkupPercent: markupRow.maximumRetailMarkupOverridePercent,
      lastUpdated: product.updatedAt,
      updatedAt: product.updatedAt,
    };
  }

  private formatWholesaleCatalogRow(
    product: {
      id: string;
      name: string;
      sku: string;
      categoryId: string;
      isActive: boolean;
      updatedAt: Date;
      wholesaleMarkupPercent: Prisma.Decimal;
      minimumWholesaleMarkupPercent: Prisma.Decimal;
      hqBranchWholesaleMarkupPercent: Prisma.Decimal;
      recommendedRetailMarkupPercent: Prisma.Decimal;
      minimumSellingMarkupPercent: Prisma.Decimal;
      maximumWholesaleMarkupOverridePercent?: Prisma.Decimal | null;
      productCategory?: {
        id: string;
        nameRu: string;
        nameKy: string;
        nameEn: string;
        defaultRetailMaximumPolicy: MaximumPricePolicy;
        defaultWholesaleMaximumPolicy: MaximumPricePolicy;
        defaultRetailMaximumMarkupPercent: Prisma.Decimal;
        defaultWholesaleMaximumMarkupPercent: Prisma.Decimal;
      } | null;
    },
    effectiveBranchPriceKgs: number,
  ) {
    const category = this.defaultCategoryMaximumFields(product.productCategory);
    const markupRow = buildWholesaleMarkupRow(
      product as unknown as WholesaleMarkupInput & { id: string },
      category,
      effectiveBranchPriceKgs,
    );

    return {
      ...markupRow,
      id: product.id,
      name: product.name,
      sku: product.sku,
      categoryId: product.categoryId,
      categoryName: category.nameRu ?? category.nameEn ?? '-',
      isActive: product.isActive,
      maximumWholesaleMarkupPercent: markupRow.maximumWholesaleMarkupOverridePercent,
      lastUpdated: product.updatedAt,
      updatedAt: product.updatedAt,
    };
  }

  private async loadRetailProductRowFromTx(tx: PrismaTx, productId: string) {
    const product = await tx.product.findFirst({
      where: { id: productId, deletedAt: null },
      include: {
        productCategory: {
          select: PRODUCT_CATEGORY_MARKUP_SELECT,
        },
      },
    });
    if (!product) throw new NotFoundException('Product not found');
    const displayBranch = await this.resolveCatalogDisplayBranch();
    return this.toEngineRetailCatalogRow(product, displayBranch);
  }

  private async loadWholesaleProductRowFromTx(tx: PrismaTx, productId: string) {
    const product = await tx.product.findFirst({
      where: { id: productId, deletedAt: null },
      include: {
        productCategory: {
          select: PRODUCT_CATEGORY_MARKUP_SELECT,
        },
      },
    });
    if (!product) throw new NotFoundException('Product not found');
    const displayBranch = await this.resolveCatalogDisplayBranch();
    return this.toEngineWholesaleCatalogRow(product, displayBranch);
  }

  private async getRetailProductRow(user: AuthUser, productId: string) {
    this.assertCanView(user);
    return this.loadRetailProductRowFromTx(this.prisma, productId);
  }

  private async getWholesaleProductRow(user: AuthUser, productId: string) {
    this.assertCanView(user);
    return this.loadWholesaleProductRowFromTx(this.prisma, productId);
  }

  private async getActivePricingPolicyVersionId() {
    const active = await this.prisma.pricingPolicyVersion.findFirst({
      where: { status: PricingPolicyVersionStatus.ACTIVE },
      orderBy: { versionNumber: 'desc' },
      select: { id: true },
    });
    return active?.id ?? null;
  }

  private async auditMarkupChange(
    tx: PrismaTx,
    user: AuthUser,
    productId: string,
    input: {
      action: string;
      priceType: 'RETAIL' | 'WHOLESALE';
      inheritedValue: number;
      previousOverrideValue: number | null;
      newOverrideValue: number | null;
      effectiveValue: number;
      reasonCode: MaximumMarkupOverrideReasonCode | null;
      reasonComment: string | null;
    },
  ) {
    const pricingPolicyVersionId = await this.getActivePricingPolicyVersionId();
    await this.auditInTx(tx, user, input.action, 'Product', productId, {
      userId: user.id,
      productId,
      pricingPolicyVersionId,
      priceType: input.priceType,
      inheritedValue: input.inheritedValue,
      previousOverrideValue: input.previousOverrideValue,
      newOverrideValue: input.newOverrideValue,
      effectiveValue: input.effectiveValue,
      reasonCode: input.reasonCode,
      reasonComment: input.reasonComment,
      timestamp: new Date().toISOString(),
    });
  }

  private async resolveCatalogDisplayBranch(branchId?: string) {
    if (branchId) {
      return this.prisma.branch.findFirst({
        where: { id: branchId, deletedAt: null, code: { not: HQ_CATALOG_BRANCH_CODE } },
        include: { priceProfile: { select: { id: true, name: true } } },
      });
    }

    return this.prisma.branch.findFirst({
      where: {
        deletedAt: null,
        code: { not: HQ_CATALOG_BRANCH_CODE },
        priceProfileId: { not: null },
        branchType: { not: BranchType.HQ_BRANCH },
      },
      orderBy: { name: 'asc' },
      include: { priceProfile: { select: { id: true, name: true } } },
    });
  }

  private isRuleApplied(
    appliedRuleType: PricingAppliedRuleType | null | undefined,
    masterPriceKgs: number,
    effectivePriceKgs: number,
  ) {
    if (!appliedRuleType) return Math.abs(masterPriceKgs - effectivePriceKgs) > 0.001;
    return (
      appliedRuleType === PricingAppliedRuleType.TEMP_OVERRIDE ||
      appliedRuleType === PricingAppliedRuleType.PRODUCT_RULE ||
      appliedRuleType === PricingAppliedRuleType.CATEGORY_RULE ||
      appliedRuleType === PricingAppliedRuleType.PRICING_PROFILE ||
      Math.abs(masterPriceKgs - effectivePriceKgs) > 0.001
    );
  }

  private async toEngineRetailCatalogRow(
    product: Parameters<PricingCatalogService['formatRetailCatalogRow']>[0],
    displayBranch: Awaited<ReturnType<PricingCatalogService['resolveCatalogDisplayBranch']>>,
  ) {
    const cost = await this.fifoService.getLatestHqCostPrice(product.id);
    const masterPrices = pricesFromMarkups(cost.costPriceKgs, {
      wholesaleMarkupPercent: Number(product.wholesaleMarkupPercent),
      minimumWholesaleMarkupPercent: Number(product.minimumWholesaleMarkupPercent),
      hqBranchWholesaleMarkupPercent: Number(product.hqBranchWholesaleMarkupPercent),
      recommendedRetailMarkupPercent: Number(product.recommendedRetailMarkupPercent),
      minimumSellingMarkupPercent: Number(product.minimumSellingMarkupPercent),
    });

    // Markup-derived row for editable fields only; displayed prices overwritten by Engine.
    const baseRow = this.formatRetailCatalogRow(product, masterPrices.hqBranchWholesalePriceKgs);

    if (!displayBranch) {
      return {
        ...baseRow,
        masterBranchPriceKgs: masterPrices.hqBranchWholesalePriceKgs,
        masterMinimumRetailPriceKgs: baseRow.minimumRetailPriceKgs,
        masterRecommendedRetailPriceKgs: baseRow.recommendedRetailPriceKgs,
        masterMaximumRetailPriceKgs: baseRow.maximumRetailPriceKgs,
        ruleApplied: false,
        appliedRuleType: null,
        pricingProfileId: null,
        pricingProfileName: null,
        pricingPolicyVersionId: null,
        displayBranchId: null,
        displayBranchName: null,
      };
    }

    const [branchPurchase, retailMin, retailRec, retailMax] = await Promise.all([
      this.pricingEngine.resolvePrice({
        productId: product.id,
        branchId: displayBranch.id,
        priceType: PricingEnginePriceType.BRANCH_PURCHASE,
      }),
      this.pricingEngine.resolvePrice({
        productId: product.id,
        branchId: displayBranch.id,
        priceType: PricingEnginePriceType.RETAIL_MINIMUM,
      }),
      this.pricingEngine.resolvePrice({
        productId: product.id,
        branchId: displayBranch.id,
        priceType: PricingEnginePriceType.RETAIL_RECOMMENDED,
      }),
      this.pricingEngine.resolvePrice({
        productId: product.id,
        branchId: displayBranch.id,
        priceType: PricingEnginePriceType.RETAIL_MAXIMUM,
      }),
    ]);

    const masterBranchPriceKgs = branchPurchase.baseBranchPriceKgs;
    const effectiveBranchPriceKgs = branchPurchase.resolvedPriceKgs;

    return {
      ...baseRow,
      effectiveBranchPriceKgs,
      minimumRetailPriceKgs: retailMin.resolvedPriceKgs,
      recommendedRetailPriceKgs: retailRec.resolvedPriceKgs,
      maximumRetailPriceKgs: retailMax.resolvedPriceKgs,
      masterBranchPriceKgs,
      masterMinimumRetailPriceKgs: baseRow.minimumRetailPriceKgs,
      masterRecommendedRetailPriceKgs: baseRow.recommendedRetailPriceKgs,
      masterMaximumRetailPriceKgs: baseRow.maximumRetailPriceKgs,
      ruleApplied: this.isRuleApplied(
        branchPurchase.appliedRuleType,
        masterBranchPriceKgs,
        effectiveBranchPriceKgs,
      ),
      appliedRuleType: branchPurchase.appliedRuleType,
      pricingProfileId: branchPurchase.pricingProfileId,
      pricingProfileName: branchPurchase.pricingProfileName,
      pricingPolicyVersionId: branchPurchase.pricingPolicyVersionId,
      displayBranchId: displayBranch.id,
      displayBranchName: displayBranch.name,
    };
  }

  private async toEngineWholesaleCatalogRow(
    product: Parameters<PricingCatalogService['formatWholesaleCatalogRow']>[0],
    displayBranch: Awaited<ReturnType<PricingCatalogService['resolveCatalogDisplayBranch']>>,
  ) {
    const cost = await this.fifoService.getLatestHqCostPrice(product.id);
    const masterPrices = pricesFromMarkups(cost.costPriceKgs, {
      wholesaleMarkupPercent: Number(product.wholesaleMarkupPercent),
      minimumWholesaleMarkupPercent: Number(product.minimumWholesaleMarkupPercent),
      hqBranchWholesaleMarkupPercent: Number(product.hqBranchWholesaleMarkupPercent),
      recommendedRetailMarkupPercent: Number(product.recommendedRetailMarkupPercent),
      minimumSellingMarkupPercent: Number(product.minimumSellingMarkupPercent),
    });

    const baseRow = this.formatWholesaleCatalogRow(product, masterPrices.hqBranchWholesalePriceKgs);

    if (!displayBranch) {
      return {
        ...baseRow,
        masterBranchPriceKgs: masterPrices.hqBranchWholesalePriceKgs,
        masterMinimumWholesalePriceKgs: baseRow.minimumWholesalePriceKgs,
        masterRecommendedWholesalePriceKgs: baseRow.recommendedWholesalePriceKgs,
        masterMaximumWholesalePriceKgs: baseRow.maximumWholesalePriceKgs,
        ruleApplied: false,
        appliedRuleType: null,
        pricingProfileId: null,
        pricingProfileName: null,
        pricingPolicyVersionId: null,
        displayBranchId: null,
        displayBranchName: null,
      };
    }

    const [branchPurchase, wholesaleMin, wholesaleRec, wholesaleMax] = await Promise.all([
      this.pricingEngine.resolvePrice({
        productId: product.id,
        branchId: displayBranch.id,
        priceType: PricingEnginePriceType.BRANCH_PURCHASE,
      }),
      this.pricingEngine.resolvePrice({
        productId: product.id,
        branchId: displayBranch.id,
        priceType: PricingEnginePriceType.WHOLESALE_MINIMUM,
      }),
      this.pricingEngine.resolvePrice({
        productId: product.id,
        branchId: displayBranch.id,
        priceType: PricingEnginePriceType.WHOLESALE_RECOMMENDED,
      }),
      this.pricingEngine.resolvePrice({
        productId: product.id,
        branchId: displayBranch.id,
        priceType: PricingEnginePriceType.WHOLESALE_MAXIMUM,
      }),
    ]);

    const masterBranchPriceKgs = branchPurchase.baseBranchPriceKgs;
    const effectiveBranchPriceKgs = branchPurchase.resolvedPriceKgs;

    return {
      ...baseRow,
      effectiveBranchPriceKgs,
      minimumWholesalePriceKgs: wholesaleMin.resolvedPriceKgs,
      recommendedWholesalePriceKgs: wholesaleRec.resolvedPriceKgs,
      maximumWholesalePriceKgs: wholesaleMax.resolvedPriceKgs,
      masterBranchPriceKgs,
      masterMinimumWholesalePriceKgs: baseRow.minimumWholesalePriceKgs,
      masterRecommendedWholesalePriceKgs: baseRow.recommendedWholesalePriceKgs,
      masterMaximumWholesalePriceKgs: baseRow.maximumWholesalePriceKgs,
      ruleApplied: this.isRuleApplied(
        branchPurchase.appliedRuleType,
        masterBranchPriceKgs,
        effectiveBranchPriceKgs,
      ),
      appliedRuleType: branchPurchase.appliedRuleType,
      pricingProfileId: branchPurchase.pricingProfileId,
      pricingProfileName: branchPurchase.pricingProfileName,
      pricingPolicyVersionId: branchPurchase.pricingPolicyVersionId,
      displayBranchId: displayBranch.id,
      displayBranchName: displayBranch.name,
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
