import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { hasAnyFullAccessRole, hasAnyHqRole, resolveUserRoles } from '../rbac/rbac';
import { activeBranchWarehouseWhere, branchWarehouseWhere, isBranchWarehouse } from '../warehouse/warehouse.util';

@Injectable()
export class BranchWarehouseService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(user: AuthUser) {
    this.assertCanViewAll(user);
    const warehouses = await this.prisma.warehouse.findMany({
      where: activeBranchWarehouseWhere,
      include: { branch: { select: { id: true, name: true } } },
    });
    const metrics = await Promise.all(warehouses.map((warehouse) => this.buildMetrics(warehouse)));
    return {
      totalBranchWarehouses: warehouses.length,
      totalSku: metrics.reduce((sum, item) => sum + item.totalSkuCount, 0),
      totalQuantity: metrics.reduce((sum, item) => sum + item.totalProductQuantity, 0),
      totalInventoryValueKgs: Math.round(metrics.reduce((sum, item) => sum + item.totalStockValueKgs, 0) * 100) / 100,
    };
  }

  async list(user: AuthUser) {
    const where = this.buildListWhere(user);
    const warehouses = await this.prisma.warehouse.findMany({
      where,
      include: { branch: { select: { id: true, name: true, code: true, city: true } } },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
    return Promise.all(warehouses.map((warehouse) => this.buildMetrics(warehouse)));
  }

  async detail(user: AuthUser, id: string) {
    const warehouse = await this.getWarehouse(user, id);
    await this.audit(user, 'BRANCH_WAREHOUSE_VIEWED', id, { branchId: warehouse.branchId });
    const metrics = await this.buildMetrics(warehouse);
    return {
      ...warehouse,
      ...metrics,
    };
  }

  async inventory(user: AuthUser, id: string) {
    await this.getWarehouse(user, id);
    const balances = await this.prisma.inventoryBalance.findMany({
      where: { warehouseId: id },
      include: { product: { select: { id: true, name: true, sku: true, unit: true, isActive: true } } },
      orderBy: { product: { sku: 'asc' } },
    });
    return balances.map((balance) => this.mapBalance(balance));
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
    return balances.map((balance) => ({
      ...this.mapBalance(balance),
      categoryName: balance.product.productCategory?.nameRu ?? balance.product.category,
      supplierName: balance.product.defaultSupplier?.name ?? null,
      sellingPriceKgs: Number(balance.product.sellingPriceKgs),
      finalCostKgs: Number(balance.product.finalCostKgs),
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
    return this.prisma.inventoryCountSession.findMany({
      where: { warehouseId: id },
      include: {
        createdBy: { select: { fullName: true } },
        approvedBy: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async movements(user: AuthUser, id: string) {
    await this.getWarehouse(user, id);
    return this.prisma.stockMovement.findMany({
      where: { warehouseId: id, status: 'ACTIVE' },
      include: {
        product: { select: { sku: true, name: true } },
        createdBy: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  private async buildMetrics(warehouse: {
    id: string;
    name: string;
    code: string;
    city: string | null;
    address: string | null;
    branchId: string | null;
    isActive: boolean;
    warehouseType: import('@prisma/client').WarehouseType;
    branch?: { id: string; name: string; code?: string; city?: string | null } | null;
  }) {
    const balances = await this.prisma.inventoryBalance.findMany({
      where: { warehouseId: warehouse.id },
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

    return {
      id: warehouse.id,
      name: warehouse.name,
      code: warehouse.code,
      city: warehouse.city ?? warehouse.branch?.city ?? null,
      address: warehouse.address,
      branchId: warehouse.branchId,
      branchName: warehouse.branch?.name ?? null,
      branchCode: warehouse.branch?.code ?? null,
      isActive: warehouse.isActive,
      totalSkuCount: productIds.size,
      totalProductQuantity: totalQuantity,
      totalStockValueKgs: Math.round(totalStockValueKgs * 100) / 100,
      reservedQuantity,
      availableQuantity: Math.max(totalQuantity - reservedQuantity, 0),
      lastInventoryDate:
        lastInventory?.completedAt ?? lastInventory?.approvedAt ?? lastInventory?.finishDate ?? null,
    };
  }

  private mapBalance(balance: {
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
  }) {
    return {
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
      include: { branch: { select: { id: true, name: true, code: true, city: true } } },
    });
    if (!warehouse || !isBranchWarehouse(warehouse)) {
      throw new NotFoundException('Branch warehouse not found');
    }
    if (!this.canViewAll(user) && warehouse.branchId !== user.branchId) {
      throw new ForbiddenException('You can only access your own branch warehouse');
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
}
