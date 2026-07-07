import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProductPricingMode, Prisma } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { canManagePricingPolicy, canViewPricing } from '../rbac/rbac';
import { HQ_CATALOG_BRANCH_CODE } from '../warehouse/warehouse.util';
import { UpdateCategoryMarkupDto, UpdateProductPricingDto } from './dto/pricing-catalog.dto';
import { applyMarkup, deriveMarkupPercent, validatePricingTiers } from './pricing-calculator.util';
import { PricingFifoService } from './pricing-fifo.service';

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

      await this.refreshAutoProductsForCategory(tx, user, categoryId, dto.reason);
      return next;
    });

    return updated;
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
        productCategory: { select: { id: true, nameRu: true, nameKy: true, nameEn: true, code: true } },
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

  async updateProductPricing(user: AuthUser, productId: string, dto: UpdateProductPricingDto) {
    this.assertCanManage(user);

    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      include: { productCategory: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    const cost = await this.fifoService.getLatestHqCostPrice(product.id);
    const pricingMode = dto.pricingMode ?? product.pricingMode;

    let nextPrices = {
      wholesalePriceKgs: Number(product.wholesalePriceKgs),
      hqBranchWholesalePriceKgs: Number(product.hqBranchWholesalePriceKgs),
      recommendedRetailPriceKgs: Number(product.recommendedRetailPriceKgs),
      minimumSellingPriceKgs: Number(product.minimumSellingPriceKgs),
    };
    let nextMarkups = {
      wholesaleMarkupPercent: Number(product.wholesaleMarkupPercent),
      hqBranchWholesaleMarkupPercent: Number(product.hqBranchWholesaleMarkupPercent),
      recommendedRetailMarkupPercent: Number(product.recommendedRetailMarkupPercent),
      minimumSellingMarkupPercent: Number(product.minimumSellingMarkupPercent),
    };

    if (pricingMode === ProductPricingMode.MANUAL) {
      if (
        dto.wholesalePriceKgs !== undefined ||
        dto.hqBranchWholesalePriceKgs !== undefined ||
        dto.recommendedRetailPriceKgs !== undefined ||
        dto.minimumSellingPriceKgs !== undefined
      ) {
        nextPrices = {
          wholesalePriceKgs: dto.wholesalePriceKgs ?? nextPrices.wholesalePriceKgs,
          hqBranchWholesalePriceKgs: dto.hqBranchWholesalePriceKgs ?? nextPrices.hqBranchWholesalePriceKgs,
          recommendedRetailPriceKgs: dto.recommendedRetailPriceKgs ?? nextPrices.recommendedRetailPriceKgs,
          minimumSellingPriceKgs: dto.minimumSellingPriceKgs ?? nextPrices.minimumSellingPriceKgs,
        };
        nextMarkups = {
          wholesaleMarkupPercent: deriveMarkupPercent(cost.costPriceKgs, nextPrices.wholesalePriceKgs),
          hqBranchWholesaleMarkupPercent: deriveMarkupPercent(
            cost.costPriceKgs,
            nextPrices.hqBranchWholesalePriceKgs,
          ),
          recommendedRetailMarkupPercent: deriveMarkupPercent(
            cost.costPriceKgs,
            nextPrices.recommendedRetailPriceKgs,
          ),
          minimumSellingMarkupPercent: deriveMarkupPercent(
            cost.costPriceKgs,
            nextPrices.minimumSellingPriceKgs,
          ),
        };
      } else if (
        dto.wholesaleMarkupPercent !== undefined ||
        dto.hqBranchWholesaleMarkupPercent !== undefined ||
        dto.recommendedRetailMarkupPercent !== undefined ||
        dto.minimumSellingMarkupPercent !== undefined
      ) {
        nextMarkups = {
          wholesaleMarkupPercent: dto.wholesaleMarkupPercent ?? nextMarkups.wholesaleMarkupPercent,
          hqBranchWholesaleMarkupPercent:
            dto.hqBranchWholesaleMarkupPercent ?? nextMarkups.hqBranchWholesaleMarkupPercent,
          recommendedRetailMarkupPercent:
            dto.recommendedRetailMarkupPercent ?? nextMarkups.recommendedRetailMarkupPercent,
          minimumSellingMarkupPercent:
            dto.minimumSellingMarkupPercent ?? nextMarkups.minimumSellingMarkupPercent,
        };
        nextPrices = this.pricesFromMarkups(cost.costPriceKgs, nextMarkups);
      }
    } else {
      const category = product.productCategory;
      nextMarkups = {
        wholesaleMarkupPercent: Number(category.wholesaleMarkupPercent),
        hqBranchWholesaleMarkupPercent: Number(category.hqBranchWholesaleMarkupPercent),
        recommendedRetailMarkupPercent: Number(category.recommendedRetailMarkupPercent),
        minimumSellingMarkupPercent: Number(category.minimumSellingMarkupPercent),
      };
      nextPrices = this.pricesFromMarkups(cost.costPriceKgs, nextMarkups);
    }

    const validationError = validatePricingTiers(nextPrices);
    if (validationError) throw new BadRequestException(validationError);

    return this.prisma.$transaction(async (tx) => {
      const updated = await this.persistProductPricing(tx, user, product, {
        pricingMode,
        costPriceKgs: cost.costPriceKgs,
        ...nextPrices,
        ...nextMarkups,
        reason: dto.reason,
        action:
          pricingMode === ProductPricingMode.MANUAL ? 'PRODUCT_PRICE_OVERRIDE' : 'PRODUCT_PRICE_UPDATED',
      });

      await this.syncSkuProducts(tx, user, updated, dto.reason);
      return this.toProductPricingRow(updated, cost);
    });
  }

  async restoreProductAuto(user: AuthUser, productId: string, reason?: string) {
    this.assertCanManage(user);
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      include: { productCategory: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    const cost = await this.fifoService.getLatestHqCostPrice(product.id);
    const markups = {
      wholesaleMarkupPercent: Number(product.productCategory.wholesaleMarkupPercent),
      hqBranchWholesaleMarkupPercent: Number(product.productCategory.hqBranchWholesaleMarkupPercent),
      recommendedRetailMarkupPercent: Number(product.productCategory.recommendedRetailMarkupPercent),
      minimumSellingMarkupPercent: Number(product.productCategory.minimumSellingMarkupPercent),
    };
    const prices = this.pricesFromMarkups(cost.costPriceKgs, markups);
    const validationError = validatePricingTiers(prices);
    if (validationError) throw new BadRequestException(validationError);

    return this.prisma.$transaction(async (tx) => {
      const updated = await this.persistProductPricing(tx, user, product, {
        pricingMode: ProductPricingMode.AUTO,
        costPriceKgs: cost.costPriceKgs,
        ...prices,
        ...markups,
        reason,
        action: 'PRODUCT_PRICE_RESTORED',
      });
      await this.syncSkuProducts(tx, user, updated, reason);
      await this.auditInTx(tx, user, 'PRODUCT_PRICE_RESTORED', 'Product', productId, {
        sku: product.sku,
        reason,
      });
      return this.toProductPricingRow(updated, cost);
    });
  }

  async refreshCostsAndAutoPrices(user: AuthUser) {
    this.assertCanManage(user);
    await this.fifoService.syncFifoBatchesFromHqStockMovements();
    const hqBranch = await this.prisma.branch.findFirst({ where: { code: HQ_CATALOG_BRANCH_CODE } });
    if (!hqBranch) return { updated: 0 };

    const products = await this.prisma.product.findMany({
      where: { branchId: hqBranch.id, deletedAt: null, pricingMode: ProductPricingMode.AUTO },
      include: { productCategory: true },
    });

    let updated = 0;
    await this.prisma.$transaction(async (tx) => {
      for (const product of products) {
        const cost = await this.fifoService.getLatestHqCostPrice(product.id, tx);
        const oldCost = Number(product.costPriceKgs);
        if (Math.abs(oldCost - cost.costPriceKgs) > 0.01) {
          await this.auditInTx(tx, user, 'COST_PRICE_UPDATED', 'Product', product.id, {
            sku: product.sku,
            oldValue: oldCost,
            newValue: cost.costPriceKgs,
          });
          await this.auditInTx(tx, user, 'LANDED_COST_UPDATED', 'Product', product.id, {
            sku: product.sku,
            oldValue: oldCost,
            newValue: cost.costPriceKgs,
          });
        }
        const markups = {
          wholesaleMarkupPercent: Number(product.productCategory.wholesaleMarkupPercent),
          hqBranchWholesaleMarkupPercent: Number(product.productCategory.hqBranchWholesaleMarkupPercent),
          recommendedRetailMarkupPercent: Number(product.productCategory.recommendedRetailMarkupPercent),
          minimumSellingMarkupPercent: Number(product.productCategory.minimumSellingMarkupPercent),
        };
        const prices = this.pricesFromMarkups(cost.costPriceKgs, markups);
        const saved = await this.persistProductPricing(tx, user, product, {
          pricingMode: ProductPricingMode.AUTO,
          costPriceKgs: cost.costPriceKgs,
          ...prices,
          ...markups,
          action: 'PRODUCT_PRICE_UPDATED',
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

  private pricesFromMarkups(
    costPriceKgs: number,
    markups: {
      wholesaleMarkupPercent: number;
      hqBranchWholesaleMarkupPercent: number;
      recommendedRetailMarkupPercent: number;
      minimumSellingMarkupPercent: number;
    },
  ) {
    return {
      wholesalePriceKgs: applyMarkup(costPriceKgs, markups.wholesaleMarkupPercent),
      hqBranchWholesalePriceKgs: applyMarkup(costPriceKgs, markups.hqBranchWholesaleMarkupPercent),
      recommendedRetailPriceKgs: applyMarkup(costPriceKgs, markups.recommendedRetailMarkupPercent),
      minimumSellingPriceKgs: applyMarkup(costPriceKgs, markups.minimumSellingMarkupPercent),
    };
  }

  private async refreshAutoProductsForCategory(
    tx: PrismaTx,
    user: AuthUser,
    categoryId: string,
    reason?: string,
  ) {
    const products = await tx.product.findMany({
      where: { categoryId, deletedAt: null, pricingMode: ProductPricingMode.AUTO },
      include: { productCategory: true },
    });

    for (const product of products) {
      const cost = await this.fifoService.getLatestHqCostPrice(product.id, tx);
      const markups = {
        wholesaleMarkupPercent: Number(product.productCategory.wholesaleMarkupPercent),
        hqBranchWholesaleMarkupPercent: Number(product.productCategory.hqBranchWholesaleMarkupPercent),
        recommendedRetailMarkupPercent: Number(product.productCategory.recommendedRetailMarkupPercent),
        minimumSellingMarkupPercent: Number(product.productCategory.minimumSellingMarkupPercent),
      };
      const prices = this.pricesFromMarkups(cost.costPriceKgs, markups);
      const validationError = validatePricingTiers(prices);
      if (validationError) continue;
      const updated = await this.persistProductPricing(tx, user, product, {
        pricingMode: ProductPricingMode.AUTO,
        costPriceKgs: cost.costPriceKgs,
        ...prices,
        ...markups,
        reason,
        action: 'PRODUCT_PRICE_UPDATED',
      });
      await this.syncSkuProducts(tx, user, updated, reason);
    }
  }

  private async persistProductPricing(
    tx: PrismaTx,
    user: AuthUser,
    product: {
      id: string;
      sku: string;
      pricingMode: ProductPricingMode;
      wholesalePriceKgs: Prisma.Decimal;
      hqBranchWholesalePriceKgs: Prisma.Decimal;
      recommendedRetailPriceKgs: Prisma.Decimal;
      minimumSellingPriceKgs: Prisma.Decimal;
      wholesaleMarkupPercent: Prisma.Decimal;
      hqBranchWholesaleMarkupPercent: Prisma.Decimal;
      recommendedRetailMarkupPercent: Prisma.Decimal;
      minimumSellingMarkupPercent: Prisma.Decimal;
    },
    input: {
      pricingMode: ProductPricingMode;
      costPriceKgs: number;
      wholesalePriceKgs: number;
      hqBranchWholesalePriceKgs: number;
      recommendedRetailPriceKgs: number;
      minimumSellingPriceKgs: number;
      wholesaleMarkupPercent: number;
      hqBranchWholesaleMarkupPercent: number;
      recommendedRetailMarkupPercent: number;
      minimumSellingMarkupPercent: number;
      reason?: string;
      action: string;
    },
  ) {
    const updated = await tx.product.update({
      where: { id: product.id },
      data: {
        pricingMode: input.pricingMode,
        costPriceKgs: input.costPriceKgs,
        finalCostKgs: input.costPriceKgs,
        wholesalePriceKgs: input.wholesalePriceKgs,
        hqBranchWholesalePriceKgs: input.hqBranchWholesalePriceKgs,
        recommendedRetailPriceKgs: input.recommendedRetailPriceKgs,
        minimumSellingPriceKgs: input.minimumSellingPriceKgs,
        wholesaleMarkupPercent: input.wholesaleMarkupPercent,
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

    await tx.productPricingChangeHistory.create({
      data: {
        productId: product.id,
        sku: product.sku,
        fieldName: 'pricingBundle',
        oldValue: JSON.stringify({
          wholesalePriceKgs: Number(product.wholesalePriceKgs),
          recommendedRetailPriceKgs: Number(product.recommendedRetailPriceKgs),
        }),
        newValue: JSON.stringify({
          wholesalePriceKgs: input.wholesalePriceKgs,
          recommendedRetailPriceKgs: input.recommendedRetailPriceKgs,
        }),
        oldMarkup: JSON.stringify({
          wholesaleMarkupPercent: Number(product.wholesaleMarkupPercent),
        }),
        newMarkup: JSON.stringify({
          wholesaleMarkupPercent: input.wholesaleMarkupPercent,
        }),
        pricingMode: input.pricingMode,
        reason: input.reason,
        changedById: user.id,
      },
    });

    await this.auditInTx(tx, user, input.action, 'Product', product.id, {
      sku: product.sku,
      pricingMode: input.pricingMode,
      oldValue: {
        wholesalePriceKgs: Number(product.wholesalePriceKgs),
        pricingMode: product.pricingMode,
      },
      newValue: {
        wholesalePriceKgs: input.wholesalePriceKgs,
        pricingMode: input.pricingMode,
      },
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
      pricingMode: ProductPricingMode;
      costPriceKgs: Prisma.Decimal;
      wholesalePriceKgs: Prisma.Decimal;
      hqBranchWholesalePriceKgs: Prisma.Decimal;
      recommendedRetailPriceKgs: Prisma.Decimal;
      minimumSellingPriceKgs: Prisma.Decimal;
      wholesaleMarkupPercent: Prisma.Decimal;
      hqBranchWholesaleMarkupPercent: Prisma.Decimal;
      recommendedRetailMarkupPercent: Prisma.Decimal;
      minimumSellingMarkupPercent: Prisma.Decimal;
    },
    reason?: string,
  ) {
    const products = await tx.product.findMany({
      where: { sku: source.sku, deletedAt: null },
      include: { branch: { select: { code: true } } },
    });

    for (const product of products) {
      if (product.pricingMode === ProductPricingMode.MANUAL) continue;
      const isHqBranch = product.branch?.code === HQ_CATALOG_BRANCH_CODE;
      const sellingPriceKgs = isHqBranch
        ? Number(source.hqBranchWholesalePriceKgs)
        : Number(source.wholesalePriceKgs);

      await tx.product.update({
        where: { id: product.id },
        data: {
          pricingMode: ProductPricingMode.AUTO,
          costPriceKgs: source.costPriceKgs,
          finalCostKgs: source.costPriceKgs,
          wholesalePriceKgs: source.wholesalePriceKgs,
          hqBranchWholesalePriceKgs: source.hqBranchWholesalePriceKgs,
          recommendedRetailPriceKgs: source.recommendedRetailPriceKgs,
          minimumSellingPriceKgs: source.minimumSellingPriceKgs,
          wholesaleMarkupPercent: source.wholesaleMarkupPercent,
          hqBranchWholesaleMarkupPercent: source.hqBranchWholesaleMarkupPercent,
          recommendedRetailMarkupPercent: source.recommendedRetailMarkupPercent,
          minimumSellingMarkupPercent: source.minimumSellingMarkupPercent,
          sellingPriceKgs,
        },
      });
    }
  }

  private toProductPricingRow(
    product: {
      id: string;
      name: string;
      sku: string;
      isActive: boolean;
      categoryId: string;
      pricingMode: ProductPricingMode;
      costPriceKgs: Prisma.Decimal;
      wholesalePriceKgs: Prisma.Decimal;
      hqBranchWholesalePriceKgs: Prisma.Decimal;
      recommendedRetailPriceKgs: Prisma.Decimal;
      minimumSellingPriceKgs: Prisma.Decimal;
      wholesaleMarkupPercent: Prisma.Decimal;
      hqBranchWholesaleMarkupPercent: Prisma.Decimal;
      recommendedRetailMarkupPercent: Prisma.Decimal;
      minimumSellingMarkupPercent: Prisma.Decimal;
      productCategory?: { id: string; nameRu: string; nameKy: string; nameEn: string; code: string } | null;
    },
    cost: { costPriceKgs: number; source: string; batchId: string | null; receivedAt: Date | null },
  ) {
    return {
      id: product.id,
      name: product.name,
      sku: product.sku,
      categoryId: product.categoryId,
      categoryName: product.productCategory?.nameRu ?? product.productCategory?.nameEn ?? '-',
      isActive: product.isActive,
      pricingMode: product.pricingMode,
      costPriceKgs: cost.costPriceKgs,
      costSource: cost.source,
      costBatchId: cost.batchId,
      costReceivedAt: cost.receivedAt,
      wholesalePriceKgs: Number(product.wholesalePriceKgs),
      hqBranchWholesalePriceKgs: Number(product.hqBranchWholesalePriceKgs),
      recommendedRetailPriceKgs: Number(product.recommendedRetailPriceKgs),
      minimumSellingPriceKgs: Number(product.minimumSellingPriceKgs),
      wholesaleMarkupPercent: Number(product.wholesaleMarkupPercent),
      hqBranchWholesaleMarkupPercent: Number(product.hqBranchWholesaleMarkupPercent),
      recommendedRetailMarkupPercent: Number(product.recommendedRetailMarkupPercent),
      minimumSellingMarkupPercent: Number(product.minimumSellingMarkupPercent),
    };
  }

  private assertCanView(user: AuthUser) {
    if (!canViewPricing(user)) throw new ForbiddenException('Insufficient permissions to view pricing');
  }

  private assertCanManage(user: AuthUser) {
    if (!canManagePricingPolicy(user)) {
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
