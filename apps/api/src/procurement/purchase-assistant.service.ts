import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  BranchRequestShortageStatus,
  ProcurementOrderStatus,
  Role,
  SaleStatus,
  WarehouseType,
} from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { hasAnyFullAccessRole } from '../rbac/rbac';
import { HQ_CATALOG_BRANCH_CODE } from '../warehouse/warehouse.util';
import {
  PurchaseAssistantAcceptDto,
  PurchaseAssistantModifyDto,
  PurchaseAssistantQueryDto,
} from './dto/purchase-assistant.dto';
import {
  calculatePurchaseRecommendation,
  normalizePeriodDays,
  normalizeReserveDays,
  prioritySortRank,
} from './purchase-assistant.util';

const IN_TRANSIT_EXCLUDED_STATUSES: ProcurementOrderStatus[] = [
  ProcurementOrderStatus.DRAFT,
  ProcurementOrderStatus.CANCELLED,
  ProcurementOrderStatus.CLOSED,
  ProcurementOrderStatus.RECEIVED_TO_HQ_WAREHOUSE,
];

const OPEN_SHORTAGE_STATUSES: BranchRequestShortageStatus[] = [
  BranchRequestShortageStatus.OPEN,
  BranchRequestShortageStatus.WAITING_STOCK,
  BranchRequestShortageStatus.PARTIALLY_FULFILLED,
];

@Injectable()
export class PurchaseAssistantService {
  constructor(private readonly prisma: PrismaService) {}

  async recommendations(user: AuthUser, query: PurchaseAssistantQueryDto) {
    this.assertCanAccess(user);

    const periodDays = normalizePeriodDays(query.periodDays);
    const reserveDays = normalizeReserveDays(query.reserveDays);
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - periodDays);

    const hqBranch = await this.prisma.branch.findFirst({
      where: { code: HQ_CATALOG_BRANCH_CODE, deletedAt: null },
      select: { id: true },
    });

    const [
      salesGroups,
      hqBalances,
      inboundItems,
      shortageGroups,
    ] = await Promise.all([
      this.prisma.saleItem.groupBy({
        by: ['productId'],
        where: {
          productId: { not: null },
          sale: {
            status: SaleStatus.FINALIZED,
            deletedAt: null,
            saleDate: { gte: since },
          },
        },
        _sum: { quantity: true },
      }),
      this.prisma.inventoryBalance.findMany({
        where: {
          warehouse: {
            warehouseType: WarehouseType.HQ,
            branchId: null,
            deletedAt: null,
            isActive: true,
          },
        },
        select: {
          productId: true,
          quantity: true,
          reservedQuantity: true,
          product: { select: { id: true, sku: true, deletedAt: true } },
        },
      }),
      this.prisma.procurementOrderItem.findMany({
        where: {
          status: 'ACTIVE',
          order: {
            deletedAt: null,
            hqStockMovementCreatedAt: null,
            status: { notIn: IN_TRANSIT_EXCLUDED_STATUSES },
          },
        },
        select: {
          productId: true,
          quantity: true,
          product: { select: { id: true, sku: true } },
        },
      }),
      this.prisma.branchRequestShortage.groupBy({
        by: ['productId'],
        where: { status: { in: OPEN_SHORTAGE_STATUSES } },
        _sum: { missingQty: true },
      }),
    ]);

    const catalogProducts = hqBranch
      ? await this.prisma.product.findMany({
          where: {
            branchId: hqBranch.id,
            deletedAt: null,
            isActive: true,
          },
          select: {
            id: true,
            sku: true,
            name: true,
            unit: true,
            purchasePriceYuan: true,
            defaultFactoryId: true,
            photoUrl: true,
          },
        })
      : [];

    const catalogById = new Map(catalogProducts.map((p) => [p.id, p]));
    const catalogIdBySku = new Map(
      catalogProducts
        .filter((p) => p.sku?.trim())
        .map((p) => [p.sku.trim().toUpperCase(), p.id] as const),
    );

    const resolveCatalogId = (productId: string, sku?: string | null) => {
      if (catalogById.has(productId)) return productId;
      const key = sku?.trim().toUpperCase();
      if (key && catalogIdBySku.has(key)) return catalogIdBySku.get(key)!;
      return null;
    };

    const salesByProduct = new Map<string, number>();
    const unresolvedSaleProductIds = salesGroups
      .map((row) => row.productId)
      .filter((id): id is string => !!id && !catalogById.has(id));
    const saleSkuById = new Map<string, string>();
    if (unresolvedSaleProductIds.length) {
      const products = await this.prisma.product.findMany({
        where: { id: { in: unresolvedSaleProductIds } },
        select: { id: true, sku: true },
      });
      for (const product of products) saleSkuById.set(product.id, product.sku);
    }
    for (const row of salesGroups) {
      if (!row.productId) continue;
      const catalogId = resolveCatalogId(row.productId, saleSkuById.get(row.productId));
      if (!catalogId) continue;
      salesByProduct.set(
        catalogId,
        (salesByProduct.get(catalogId) ?? 0) + Number(row._sum.quantity ?? 0),
      );
    }

    const hqStockByProduct = new Map<string, number>();
    for (const balance of hqBalances) {
      if (balance.product.deletedAt) continue;
      const catalogId = resolveCatalogId(balance.productId, balance.product.sku);
      if (!catalogId) continue;
      const available = Math.max(balance.quantity - (balance.reservedQuantity ?? 0), 0);
      hqStockByProduct.set(catalogId, (hqStockByProduct.get(catalogId) ?? 0) + available);
    }

    const onTheWayByProduct = new Map<string, number>();
    for (const item of inboundItems) {
      const catalogId = resolveCatalogId(item.productId, item.product?.sku);
      if (!catalogId) continue;
      onTheWayByProduct.set(
        catalogId,
        (onTheWayByProduct.get(catalogId) ?? 0) + Number(item.quantity ?? 0),
      );
    }

    const branchOrdersByProduct = new Map<string, number>();
    const unresolvedShortageIds = shortageGroups
      .map((row) => row.productId)
      .filter((id) => !catalogById.has(id));
    const shortageSkuById = new Map<string, string>();
    if (unresolvedShortageIds.length) {
      const products = await this.prisma.product.findMany({
        where: { id: { in: unresolvedShortageIds } },
        select: { id: true, sku: true },
      });
      for (const product of products) shortageSkuById.set(product.id, product.sku);
    }
    for (const row of shortageGroups) {
      const catalogId = resolveCatalogId(row.productId, shortageSkuById.get(row.productId));
      if (!catalogId) continue;
      branchOrdersByProduct.set(
        catalogId,
        (branchOrdersByProduct.get(catalogId) ?? 0) + Number(row._sum.missingQty ?? 0),
      );
    }

    const productIds = new Set<string>([
      ...salesByProduct.keys(),
      ...branchOrdersByProduct.keys(),
      ...onTheWayByProduct.keys(),
    ]);

    const items = Array.from(productIds)
      .map((productId) => {
        const product = catalogById.get(productId);
        if (!product) return null;
        const calc = calculatePurchaseRecommendation({
          salesQuantity: salesByProduct.get(productId) ?? 0,
          periodDays,
          reserveDays,
          hqAvailableQuantity: hqStockByProduct.get(productId) ?? 0,
          onTheWayQuantity: onTheWayByProduct.get(productId) ?? 0,
          approvedBranchOrderQuantity: branchOrdersByProduct.get(productId) ?? 0,
        });
        return {
          productId: product.id,
          sku: product.sku,
          name: product.name,
          unit: product.unit,
          purchasePriceYuan: Number(product.purchasePriceYuan ?? 0),
          defaultFactoryId: product.defaultFactoryId ?? null,
          photoUrl: product.photoUrl ?? null,
          hqStock: calc.hqAvailableQuantity,
          salesQuantity: calc.salesQuantity,
          onTheWay: calc.onTheWayQuantity,
          branchOrders: calc.approvedBranchOrderQuantity,
          requiredStock: calc.requiredStock,
          averageDailySales: Number(calc.averageDailySales.toFixed(4)),
          recommendedQuantity: calc.recommendedQuantity,
          orderingRequired: calc.orderingRequired,
          priority: calc.priority,
          messageKey: calc.orderingRequired
            ? null
            : 'procurement.purchaseAssistant.orderingNotRequired',
        };
      })
      .filter((row): row is NonNullable<typeof row> => !!row)
      .sort((a, b) => {
        const byPriority = prioritySortRank(a.priority) - prioritySortRank(b.priority);
        if (byPriority !== 0) return byPriority;
        return b.recommendedQuantity - a.recommendedQuantity || a.name.localeCompare(b.name);
      });

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: 'PURCHASE_RECOMMENDATION_GENERATED',
        entity: 'PurchaseAssistant',
        entityId: `period-${periodDays}-reserve-${reserveDays}`,
        metadata: {
          userId: user.id,
          userRole: user.role,
          roles: user.roles ?? [user.role],
          periodDays,
          reserveDays,
          productCount: items.length,
          recommendedCount: items.filter((item) => item.orderingRequired).length,
          timestamp: new Date().toISOString(),
        },
      },
    });

    return {
      periodDays,
      reserveDays,
      generatedAt: new Date().toISOString(),
      items,
    };
  }

  async acceptRecommendations(user: AuthUser, dto: PurchaseAssistantAcceptDto) {
    this.assertCanAccess(user);
    const items = Array.isArray(dto.items) ? dto.items : [];
    for (const item of items) {
      await this.writeRecommendationAudit(user, 'PURCHASE_RECOMMENDATION_ACCEPTED', item);
    }
    return { success: true, count: items.length };
  }

  async modifyRecommendation(user: AuthUser, dto: PurchaseAssistantModifyDto) {
    this.assertCanAccess(user);
    if (!dto.item?.productId) {
      throw new ForbiddenException('Product is required');
    }
    await this.writeRecommendationAudit(user, 'PURCHASE_RECOMMENDATION_MODIFIED', dto.item);
    return { success: true };
  }

  private writeRecommendationAudit(
    user: AuthUser,
    action: 'PURCHASE_RECOMMENDATION_ACCEPTED' | 'PURCHASE_RECOMMENDATION_MODIFIED',
    item: {
      productId: string;
      recommendedQuantity: number;
      finalQuantity: number;
      reason?: string;
      periodDays: number;
      reserveDays: number;
      hqStock: number;
      onTheWay: number;
      branchOrders: number;
      salesQuantity: number;
    },
  ) {
    return this.prisma.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action,
        entity: 'PurchaseAssistant',
        entityId: item.productId,
        metadata: {
          userId: user.id,
          userRole: user.role,
          roles: user.roles ?? [user.role],
          productId: item.productId,
          recommendedQuantity: Number(item.recommendedQuantity ?? 0),
          finalQuantity: Number(item.finalQuantity ?? 0),
          analysisPeriod: Number(item.periodDays ?? 30),
          reserveDays: Number(item.reserveDays ?? 10),
          hqStock: Number(item.hqStock ?? 0),
          onTheWay: Number(item.onTheWay ?? 0),
          branchOrders: Number(item.branchOrders ?? 0),
          salesQuantity: Number(item.salesQuantity ?? 0),
          reason: item.reason?.trim() || null,
          timestamp: new Date().toISOString(),
        },
      },
    });
  }

  private assertCanAccess(user: AuthUser) {
    const roles = user.roles?.length ? user.roles : [user.role];
    const allowed =
      roles.includes(Role.SUPPLY_CHAIN_MANAGER) || hasAnyFullAccessRole(roles);
    if (!allowed) {
      throw new ForbiddenException('Only Supply Manager can access Purchase Assistant');
    }
  }
}
