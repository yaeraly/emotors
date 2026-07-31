import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  assessBranchWarehouseDeleteBlocking,
  assertCanHqCeoManageLifecycle,
  archiveBranchWarehouse,
  branchWarehouseHasDeleteHistory,
  hardDeleteBranchWarehouse,
} from '../lifecycle/hq-ceo-lifecycle.util';
import { BRANCH_WAREHOUSE_DELETE_BLOCKED_MESSAGE } from '../lifecycle/hq-ceo-lifecycle.constants';
import { canEditWarehouseInfo, hasAnyFullAccessRole, hasAnyHqRole, isBranchOwnerUser, isBranchWarehouseOperator, resolveUserRoles } from '../rbac/rbac';
import { activeBranchWarehouseWhere, branchWarehouseWhere, isBranchWarehouse } from '../warehouse/warehouse.util';
import { UpdateBranchWarehouseDto } from './dto/update-branch-warehouse.dto';
import {
  sanitizeBranchWarehouseRequest,
  sanitizeBranchWarehouseRequestDetail,
  sanitizeBranchWarehouseStockRow,
} from './branch-warehouse-operator.presenter';

@Injectable()
export class BranchWarehouseService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(user: AuthUser) {
    this.assertCanViewAll(user);
    const warehouses = await this.prisma.warehouse.findMany({
      where: activeBranchWarehouseWhere,
      include: { branch: { select: { id: true, name: true } } },
    });
    const metrics = await Promise.all(warehouses.map((warehouse) => this.buildMetrics(warehouse, user)));
    return {
      totalBranchWarehouses: warehouses.length,
      totalSku: metrics.reduce((sum, item) => sum + item.totalSkuCount, 0),
      totalQuantity: metrics.reduce((sum, item) => sum + item.totalProductQuantity, 0),
      totalInventoryValueKgs: Math.round(
        metrics.reduce((sum, item) => sum + Number(item.totalStockValueKgs ?? 0), 0) * 100,
      ) / 100,
    };
  }

  async list(user: AuthUser) {
    const where = this.buildListWhere(user);
    const warehouses = await this.prisma.warehouse.findMany({
      where,
      include: { branch: { select: { id: true, name: true, code: true, city: true, ownerName: true } } },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
    const result = await Promise.all(
      warehouses.map(async (warehouse) => {
        const metrics = await this.buildMetrics(warehouse, user);
        return metrics;
      }),
    );
    if (isBranchWarehouseOperator(user) && result[0]) {
      await this.audit(user, 'BRANCH_WAREHOUSE_SUMMARY_VIEWED', result[0].id, {
        branchId: user.branchId ?? undefined,
      });
    }
    return result;
  }

  async detail(user: AuthUser, id: string) {
    const warehouse = await this.getWarehouse(user, id);
    await this.audit(user, 'BRANCH_WAREHOUSE_VIEWED', id, { branchId: warehouse.branchId });
    const metrics = await this.buildMetrics(warehouse, user);
    return {
      ...warehouse,
      ...metrics,
      permissions: this.buildPermissions(user),
    };
  }

  async warehouseByBranchId(user: AuthUser, branchId: string) {
    this.assertBranchWarehouseBranchAccess(user, branchId);
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, deletedAt: null },
      select: { id: true, name: true, code: true },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { ...activeBranchWarehouseWhere, branchId },
      include: { branch: { select: { id: true, name: true, code: true, city: true, ownerName: true } } },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    });
    if (!warehouse || !isBranchWarehouse(warehouse)) {
      throw new NotFoundException('Склад филиала не найден');
    }
    return this.detail(user, warehouse.id);
  }

  async update(user: AuthUser, id: string, dto: UpdateBranchWarehouseDto) {
    if (!canEditWarehouseInfo(user)) {
      throw new ForbiddenException('Only CEO can update warehouse information');
    }
    const existing = await this.getWarehouse(user, id);
    if (dto.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: dto.branchId, deletedAt: null },
        select: { id: true },
      });
      if (!branch) {
        throw new NotFoundException('Branch not found');
      }
    }
    const nextBranchId = dto.branchId ?? existing.branchId;
    const nextCode = dto.code ? dto.code.trim().toUpperCase() : existing.code;
    if (nextBranchId) {
      const duplicate = await this.prisma.warehouse.findFirst({
        where: {
          id: { not: id },
          branchId: nextBranchId,
          code: nextCode,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new BadRequestException('Warehouse code already exists for this branch');
      }
    }
    const warehouse = await this.prisma.warehouse.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.code ? { code: dto.code.trim().toUpperCase() } : {}),
        ...(dto.branchId ? { branchId: dto.branchId } : {}),
        ...(dto.country !== undefined ? { country: dto.country.trim() } : {}),
        ...(dto.city !== undefined ? { city: dto.city?.trim() } : {}),
        ...(dto.address !== undefined ? { address: dto.address?.trim() } : {}),
        ...(dto.contactPerson !== undefined ? { contactPerson: dto.contactPerson?.trim() } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone?.trim() } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      include: { branch: { select: { id: true, name: true, code: true, city: true, ownerName: true } } },
    });
    await this.audit(user, 'BRANCH_WAREHOUSE_INFO_UPDATED', warehouse.id, {
      branchId: warehouse.branchId,
      oldValue: this.snapshotWarehouseInfo(existing),
      newValue: this.snapshotWarehouseInfo(warehouse),
    });
    const metrics = await this.buildMetrics(warehouse, user);
    return { ...warehouse, ...metrics };
  }

  async remove(user: AuthUser, id: string, reason?: string) {
    assertCanHqCeoManageLifecycle(user);

    const existing = await this.prisma.warehouse.findFirst({
      where: { id, ...branchWarehouseWhere },
      include: { branch: { select: { id: true, name: true, code: true } } },
    });
    if (!existing || !isBranchWarehouse(existing)) {
      throw new NotFoundException('Склад филиала не найден');
    }

    const trimmedReason = reason?.trim() || null;
    const previousStatus = existing.isActive;

    await this.audit(user, 'BRANCH_WAREHOUSE_DELETE_REQUESTED', id, {
      branchId: existing.branchId,
      warehouseCode: existing.code,
      oldStatus: previousStatus,
      reason: trimmedReason,
    });

    return this.prisma.$transaction(async (tx) => {
      const { blocked, reasons } = await assessBranchWarehouseDeleteBlocking(tx, id);
      if (blocked) {
        await this.auditInTx(tx, user, 'BRANCH_WAREHOUSE_DELETE_BLOCKED', id, {
          branchId: existing.branchId,
          warehouseCode: existing.code,
          blockingRecords: reasons,
        });
        throw new BadRequestException({
          message: BRANCH_WAREHOUSE_DELETE_BLOCKED_MESSAGE,
          blockingRecords: reasons,
        });
      }

      const hasHistory = await branchWarehouseHasDeleteHistory(tx, id);

      if (!hasHistory) {
        await hardDeleteBranchWarehouse(tx, id);
        await this.auditInTx(tx, user, 'BRANCH_WAREHOUSE_DELETED', id, {
          branchId: existing.branchId,
          warehouseCode: existing.code,
          oldStatus: previousStatus,
          newStatus: null,
          deletionType: 'hard_delete',
          reason: trimmedReason,
        });
        return { success: true, archived: false, message: 'Склад филиала удалён' };
      }

      if (!trimmedReason) {
        throw new BadRequestException('Укажите причину архивации склада с историей операций');
      }

      const archived = await archiveBranchWarehouse(tx, id);
      await this.auditInTx(tx, user, 'BRANCH_WAREHOUSE_ARCHIVED', id, {
        branchId: existing.branchId,
        warehouseCode: existing.code,
        oldStatus: previousStatus,
        newStatus: archived.isActive,
        reason: trimmedReason,
      });
      return { success: true, archived: true, message: 'Склад филиала архивирован' };
    });
  }

  async updateBranchCeoProfile(
    user: AuthUser,
    id: string,
    dto: {
      name?: string;
      city?: string;
      address?: string;
      contactPerson?: string;
      phone?: string;
      notes?: string;
    },
  ) {
    if (!isBranchOwnerUser(user)) {
      throw new ForbiddenException('Доступ только для Branch CEO');
    }
    const existing = await this.getWarehouse(user, id);
    if (!existing.branchId || existing.branchId !== user.branchId) {
      throw new ForbiddenException('У вас нет доступа к складу другого филиала');
    }
    const warehouse = await this.prisma.warehouse.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.city !== undefined ? { city: dto.city?.trim() ?? null } : {}),
        ...(dto.address !== undefined ? { address: dto.address?.trim() ?? null } : {}),
        ...(dto.contactPerson !== undefined ? { contactPerson: dto.contactPerson?.trim() ?? null } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone?.trim() ?? null } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() ?? null } : {}),
      },
      include: { branch: { select: { id: true, name: true, code: true, city: true, ownerName: true } } },
    });
    await this.audit(user, 'BRANCH_WAREHOUSE_PROFILE_UPDATED', warehouse.id, {
      branchId: warehouse.branchId,
      oldValue: this.snapshotWarehouseInfo(existing),
      newValue: this.snapshotWarehouseInfo(warehouse),
    });
    const metrics = await this.buildMetrics(warehouse, user);
    return { ...warehouse, ...metrics, permissions: { canEdit: true, readOnly: false } };
  }

  async inventory(user: AuthUser, id: string) {
    await this.getWarehouse(user, id);
    const balances = await this.prisma.inventoryBalance.findMany({
      where: { warehouseId: id },
      include: { product: { select: { id: true, name: true, sku: true, unit: true, isActive: true } } },
      orderBy: { product: { sku: 'asc' } },
    });
    return balances.map((balance) => this.mapBalance(balance, user));
  }

  async products(user: AuthUser, id: string) {
    await this.getWarehouse(user, id);
    const balances = await this.prisma.inventoryBalance.findMany({
      where: { warehouseId: id, quantity: { gt: 0 } },
      include: {
        product: {
          include: {
            productCategory: { select: { nameRu: true, nameKy: true, nameEn: true } },
            defaultSupplier: { select: { name: true } },
          },
        },
      },
      orderBy: { product: { sku: 'asc' } },
    });
    const productIds = balances.map((balance) => balance.productId);
    const lastMovements = productIds.length
      ? await this.prisma.stockMovement.findMany({
          where: { warehouseId: id, productId: { in: productIds }, status: 'ACTIVE' },
          orderBy: { createdAt: 'desc' },
          distinct: ['productId'],
          select: { productId: true, createdAt: true },
        })
      : [];
    const lastMovementMap = new Map(lastMovements.map((row) => [row.productId, row.createdAt]));

    return balances.map((balance) => ({
      ...this.mapBalance(balance, user),
      categoryName: balance.product.productCategory?.nameRu ?? balance.product.category,
      supplierName: balance.product.defaultSupplier?.name ?? null,
      lastMovementAt: lastMovementMap.get(balance.productId) ?? balance.updatedAt,
      ...(this.shouldHideLineItemCosts(user)
        ? {}
        : {
            sellingPriceKgs: Number(balance.product.sellingPriceKgs),
            finalCostKgs: Number(balance.product.finalCostKgs),
          }),
      status: balance.product.isActive ? 'ACTIVE' : 'INACTIVE',
    }));
  }

  async receivings(user: AuthUser, id: string) {
    const warehouse = await this.getWarehouse(user, id);
    return this.prisma.goodsReceiving.findMany({
      where: { warehouseId: id, branchId: warehouse.branchId ?? undefined, deletedAt: null },
      include: {
        distributionOrder: { select: { id: true, orderNumber: true, status: true } },
        items: { select: { id: true, receivedQuantity: true } },
      },
      orderBy: { receivedAt: 'desc' },
      take: 100,
    });
  }

  async distribution(user: AuthUser, id: string) {
    const warehouse = await this.getWarehouse(user, id);
    return this.prisma.branchDistributionOrder.findMany({
      where: {
        deletedAt: null,
        OR: [
          { destinationWarehouseId: id },
          { branchId: warehouse.branchId ?? undefined },
        ],
      },
      include: {
        branch: { select: { name: true } },
        sourceWarehouse: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async inventoryHistory(user: AuthUser, id: string) {
    await this.getWarehouse(user, id);
    const sessions = await this.prisma.inventoryCountSession.findMany({
      where: { warehouseId: id, deletedAt: null },
      include: {
        createdBy: { select: { fullName: true } },
        approvedBy: { select: { fullName: true } },
        items: { select: { differenceQuantity: true, differenceValueKgs: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return sessions.map((session) => this.mapInventorySession(session));
  }

  async movements(user: AuthUser, id: string) {
    await this.getWarehouse(user, id);
    return this.prisma.stockMovement.findMany({
      where: { warehouseId: id, status: 'ACTIVE' },
      include: {
        product: { select: { sku: true, name: true } },
        createdBy: { select: { fullName: true } },
        warehouse: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async listBranchRequests(user: AuthUser) {
    this.assertBranchWarehouseOperator(user);
    if (!user.branchId) {
      throw new ForbiddenException('Branch is required');
    }
    const rows = await this.prisma.branchPurchaseRequest.findMany({
      where: { deletedAt: null, branchId: user.branchId },
      include: {
        items: { select: { quantity: true, approvedQuantity: true, lineStatus: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const orderMap = await this.loadConvertedOrdersForRequests(rows);
    await this.audit(user, 'BRANCH_REQUEST_VIEWED', user.branchId, { branchId: user.branchId });
    return rows.map((row) =>
      sanitizeBranchWarehouseRequest(this.attachConvertedOrder(row, orderMap)),
    );
  }

  async getBranchRequest(user: AuthUser, id: string) {
    this.assertBranchWarehouseOperator(user);
    if (!user.branchId) {
      throw new ForbiddenException('Branch is required');
    }
    const request = await this.prisma.branchPurchaseRequest.findFirst({
      where: { id, deletedAt: null, branchId: user.branchId },
      include: {
        items: {
          select: {
            id: true,
            productId: true,
            sku: true,
            productName: true,
            quantity: true,
            approvedQuantity: true,
            lineStatus: true,
            unit: true,
            note: true,
          },
        },
      },
    });
    if (!request) throw new NotFoundException('Заявка не найдена');
    const orderMap = await this.loadConvertedOrdersForRequests([request]);
    const enriched = this.attachConvertedOrder(request, orderMap);
    await this.audit(user, 'BRANCH_REQUEST_VIEWED', request.id, {
      branchId: request.branchId,
      requestNumber: request.requestNumber,
    });
    return sanitizeBranchWarehouseRequestDetail(enriched);
  }

  async listOperationalStock(user: AuthUser) {
    this.assertBranchWarehouseOperator(user);
    const warehouse = await this.getOperatorWarehouse(user);
    const balances = await this.prisma.inventoryBalance.findMany({
      where: { warehouseId: warehouse.id, branchId: user.branchId! },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            unit: true,
            minStockLevel: true,
            isActive: true,
            category: true,
            productCategory: { select: { nameRu: true } },
          },
        },
      },
      orderBy: { product: { sku: 'asc' } },
    });
    await this.audit(user, 'BRANCH_STOCK_VIEWED', warehouse.id, { branchId: user.branchId });
    return {
      warehouse: { id: warehouse.id, name: warehouse.name, code: warehouse.code },
      items: balances.map((balance) => sanitizeBranchWarehouseStockRow(balance)),
    };
  }

  async warehouseSummary(user: AuthUser) {
    this.assertBranchWarehouseOperator(user);
    const warehouse = await this.getOperatorWarehouse(user);
    const balances = await this.prisma.inventoryBalance.findMany({
      where: { warehouseId: warehouse.id, branchId: user.branchId! },
      select: {
        productId: true,
        quantity: true,
        reservedQuantity: true,
      },
    });

    const totalQuantity = balances.reduce((sum, item) => sum + item.quantity, 0);
    const reservedQuantity = balances.reduce((sum, item) => sum + item.reservedQuantity, 0);
    const skuCount = new Set(balances.filter((item) => item.quantity > 0).map((item) => item.productId)).size;

    return {
      warehouse: { id: warehouse.id, name: warehouse.name, code: warehouse.code },
      skuCount,
      totalQuantity,
      reservedQuantity,
      availableQuantity: Math.max(totalQuantity - reservedQuantity, 0),
    };
  }

  private async loadConvertedOrdersForRequests(
    requests: Array<{ convertedOrderId: string | null }>,
  ) {
    const orderIds = [
      ...new Set(
        requests
          .map((request) => request.convertedOrderId)
          .filter((orderId): orderId is string => Boolean(orderId)),
      ),
    ];
    if (!orderIds.length) {
      return new Map<
        string,
        {
          orderNumber: string;
          status: string;
          sentAt: Date | null;
          items: Array<{ quantity: number }>;
          goodsReceivings: Array<{ items: Array<{ receivedQuantity: number }> }>;
        }
      >();
    }
    const orders = await this.prisma.branchDistributionOrder.findMany({
      where: { id: { in: orderIds }, deletedAt: null },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        sentAt: true,
        items: { select: { quantity: true } },
        goodsReceivings: {
          where: { deletedAt: null },
          select: { items: { select: { receivedQuantity: true } } },
        },
      },
    });
    return new Map(orders.map((order) => [order.id, order]));
  }

  private attachConvertedOrder<T extends { convertedOrderId: string | null }>(
    request: T,
    orderMap: Awaited<ReturnType<BranchWarehouseService['loadConvertedOrdersForRequests']>>,
  ) {
    return {
      ...request,
      convertedOrder: request.convertedOrderId ? orderMap.get(request.convertedOrderId) ?? null : null,
    };
  }

  private async getOperatorWarehouse(user: AuthUser) {
    if (!user.branchId) {
      throw new ForbiddenException('Branch is required');
    }
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { ...activeBranchWarehouseWhere, branchId: user.branchId, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!warehouse || !isBranchWarehouse(warehouse)) {
      throw new NotFoundException('Для вашего филиала склад не настроен');
    }
    return warehouse;
  }

  private assertBranchWarehouseOperator(user: AuthUser) {
    if (!isBranchWarehouseOperator(user)) {
      throw new ForbiddenException('Доступ только для кладовщика филиала');
    }
  }

  private async buildMetrics(
    warehouse: {
    id: string;
    name: string;
    code: string;
    city: string | null;
    address: string | null;
    branchId: string | null;
    isActive: boolean;
    warehouseType: import('@prisma/client').WarehouseType;
    branch?: { id: string; name: string; code?: string; city?: string | null; ownerName?: string | null } | null;
  },
    user?: AuthUser,
  ) {
    const balances = await this.prisma.inventoryBalance.findMany({
      where: { warehouseId: warehouse.id },
      include: { product: { select: { minStockLevel: true } } },
    });
    const lastInventory = await this.prisma.inventoryCountSession.findFirst({
      where: { warehouseId: warehouse.id, status: { in: ['COMPLETED', 'APPROVED'] } },
      orderBy: { completedAt: 'desc' },
      select: { completedAt: true, approvedAt: true, finishDate: true },
    });

    const totalQuantity = balances.reduce((sum, item) => sum + item.quantity, 0);
    const reservedQuantity = balances.reduce((sum, item) => sum + item.reservedQuantity, 0);
    const totalStockValueKgs = balances.reduce((sum, item) => sum + Number(item.totalValueKgs), 0);
    const productIds = new Set(balances.filter((b) => b.quantity > 0).map((b) => b.productId));
    const lowStockSkuCount = balances.filter(
      (balance) => balance.quantity <= (balance.product?.minStockLevel ?? 0),
    ).length;
    const lastMovement = await this.prisma.stockMovement.findFirst({
      where: { warehouseId: warehouse.id, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    return {
      id: warehouse.id,
      name: warehouse.name,
      code: warehouse.code,
      city: warehouse.city ?? warehouse.branch?.city ?? null,
      address: warehouse.address,
      branchId: warehouse.branchId,
      branchName: warehouse.branch?.name ?? null,
      branchCode: warehouse.branch?.code ?? null,
      branchOwnerName: warehouse.branch?.ownerName ?? null,
      isActive: warehouse.isActive,
      totalSkuCount: productIds.size,
      totalProductQuantity: totalQuantity,
      lowStockSkuCount,
      ...(user && this.shouldHideLineItemCosts(user)
        ? {}
        : { totalStockValueKgs: Math.round(totalStockValueKgs * 100) / 100 }),
      reservedQuantity,
      availableQuantity: Math.max(totalQuantity - reservedQuantity, 0),
      lastInventoryDate:
        lastInventory?.completedAt ?? lastInventory?.approvedAt ?? lastInventory?.finishDate ?? null,
      lastMovementAt: lastMovement?.createdAt ?? null,
    };
  }

  private mapInventorySession(session: {
    id: string;
    sessionNumber: string;
    inventoryType: string;
    status: string;
    createdAt: Date;
    approvedAt: Date | null;
    finishDate: Date | null;
    createdBy?: { fullName: string } | null;
    approvedBy?: { fullName: string } | null;
    items: Array<{ differenceQuantity: number; differenceValueKgs: Prisma.Decimal }>;
  }) {
    const shortages = session.items.filter((item) => item.differenceQuantity < 0);
    const overages = session.items.filter((item) => item.differenceQuantity > 0);
    const shortageValueKgs = shortages.reduce(
      (sum, item) => sum + Math.abs(Number(item.differenceValueKgs)),
      0,
    );
    const surplusValueKgs = overages.reduce((sum, item) => sum + Number(item.differenceValueKgs), 0);
    const netDifferenceValueKgs = session.items.reduce(
      (sum, item) => sum + Number(item.differenceValueKgs),
      0,
    );

    return {
      id: session.id,
      sessionNumber: session.sessionNumber,
      inventoryType: session.inventoryType,
      status: session.status,
      createdAt: session.createdAt,
      approvedAt: session.approvedAt,
      finishDate: session.finishDate,
      createdBy: session.createdBy,
      approvedBy: session.approvedBy,
      productCount: session.items.length,
      shortageValueKgs: Math.round(shortageValueKgs * 100) / 100,
      surplusValueKgs: Math.round(surplusValueKgs * 100) / 100,
      netDifferenceValueKgs: Math.round(netDifferenceValueKgs * 100) / 100,
    };
  }

  private buildPermissions(user: AuthUser) {
    return {
      canEdit: canEditWarehouseInfo(user) || isBranchOwnerUser(user),
      readOnly: !(canEditWarehouseInfo(user) || isBranchOwnerUser(user)),
    };
  }

  private assertBranchWarehouseBranchAccess(user: AuthUser, branchId: string) {
    if (this.canViewAll(user)) {
      return;
    }
    if (!user.branchId) {
      throw new ForbiddenException('У вас нет доступа к складу этого филиала');
    }
    if (user.branchId !== branchId) {
      throw new ForbiddenException('У вас нет доступа к складу этого филиала');
    }
  }

  private mapBalance(
    balance: {
    id: string;
    warehouseId: string;
    productId: string;
    quantity: number;
    reservedQuantity: number;
    averageCostKgs: Prisma.Decimal;
    landedCostKgs: Prisma.Decimal;
    totalValueKgs: Prisma.Decimal;
    lastReceivingAt: Date | null;
    updatedAt: Date;
    product: { id: string; name: string; sku: string; unit: string; isActive: boolean };
  },
    user?: AuthUser,
  ) {
    const response = {
      id: balance.id,
      warehouseId: balance.warehouseId,
      productId: balance.productId,
      product: balance.product,
      sku: balance.product.sku,
      quantity: balance.quantity,
      reservedQuantity: balance.reservedQuantity,
      availableQuantity: Math.max(balance.quantity - balance.reservedQuantity, 0),
      averageCostKgs: Number(balance.averageCostKgs),
      landedCostKgs: Number(balance.landedCostKgs || balance.averageCostKgs),
      totalValueKgs: Number(balance.totalValueKgs),
      lastReceivingAt: balance.lastReceivingAt,
      updatedAt: balance.updatedAt,
    };
    if (user && this.shouldHideLineItemCosts(user)) {
      const { averageCostKgs, landedCostKgs, totalValueKgs, ...rest } = response;
      return rest;
    }
    return response;
  }

  private shouldHideLineItemCosts(user: AuthUser) {
    return isBranchWarehouseOperator(user);
  }

  private buildListWhere(user: AuthUser): Prisma.WarehouseWhereInput {
    if (this.canViewAll(user)) {
      return branchWarehouseWhere;
    }
    if (!user.branchId) {
      throw new ForbiddenException('Branch is required');
    }
    return { ...activeBranchWarehouseWhere, branchId: user.branchId };
  }

  private async getWarehouse(user: AuthUser, id: string) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id, ...branchWarehouseWhere },
      include: { branch: { select: { id: true, name: true, code: true, city: true, ownerName: true } } },
    });
    if (!warehouse || !isBranchWarehouse(warehouse)) {
      throw new NotFoundException('Склад филиала не найден');
    }
    if (!this.canViewAll(user) && warehouse.branchId !== user.branchId) {
      await this.auditAccessDenied(user, id, warehouse.branchId);
      throw new ForbiddenException('У вас нет доступа к складу этого филиала');
    }
    return warehouse;
  }

  private canViewAll(user: AuthUser) {
    const roles = resolveUserRoles(user);
    return hasAnyFullAccessRole(roles) || hasAnyHqRole(roles);
  }

  private assertCanViewAll(user: AuthUser) {
    if (!this.canViewAll(user)) {
      throw new ForbiddenException('Only HQ users can view all branch warehouses');
    }
  }

  private auditInTx(
    tx: Prisma.TransactionClient,
    user: AuthUser,
    action: string,
    warehouseId: string,
    metadata?: Record<string, unknown>,
  ) {
    return tx.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action,
        entity: 'Warehouse',
        entityId: warehouseId,
        metadata: {
          actorUserId: user.id,
          userId: user.id,
          role: user.role,
          warehouseId,
          roles: user.roles ?? [user.role],
          timestamp: new Date().toISOString(),
          ...metadata,
        } as Prisma.InputJsonValue,
      },
    });
  }

  private audit(user: AuthUser, action: string, warehouseId: string, metadata?: Record<string, unknown>) {
    return this.prisma.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action,
        entity: 'Warehouse',
        entityId: warehouseId,
        metadata: {
          userId: user.id,
          role: user.role,
          warehouseId,
          roles: user.roles ?? [user.role],
          timestamp: new Date().toISOString(),
          ...metadata,
        } as Prisma.InputJsonValue,
      },
    });
  }

  private snapshotWarehouseInfo(warehouse: {
    name: string;
    code: string;
    branchId: string | null;
    country: string;
    city: string | null;
    address: string | null;
    contactPerson: string | null;
    phone: string | null;
    notes: string | null;
    isActive: boolean;
  }) {
    return {
      name: warehouse.name,
      code: warehouse.code,
      branchId: warehouse.branchId,
      country: warehouse.country,
      city: warehouse.city,
      address: warehouse.address,
      contactPerson: warehouse.contactPerson,
      phone: warehouse.phone,
      notes: warehouse.notes,
      isActive: warehouse.isActive,
    };
  }

  private auditAccessDenied(user: AuthUser, warehouseId: string, branchId: string | null) {
    return this.prisma.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: 'BRANCH_WAREHOUSE_ACCESS_DENIED',
        entity: 'Warehouse',
        entityId: warehouseId,
        metadata: {
          userId: user.id,
          role: user.role,
          branchId: user.branchId ?? undefined,
          warehouseId,
          requestedBranchId: branchId ?? undefined,
          roles: user.roles ?? [user.role],
          timestamp: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    });
  }
}
