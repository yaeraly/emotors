import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProcurementOrderStatus, Role, StockMovementStatus, StockMovementType, WarehouseType } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  activeHqWarehouseWhere,
  hqWarehouseWhere,
  isHqWarehouse,
} from '../warehouse/warehouse.util';
import { canDeleteHqGoodsReceiving, canDeleteHqWarehouse } from '../rbac/rbac';
import { CreateHqWarehouseDto } from './dto/create-hq-warehouse.dto';
import { UpdateHqWarehouseDto } from './dto/update-hq-warehouse.dto';
import { hasHqReceivingDownstreamUsage, HQ_RECEIVING_ARCHIVED_MESSAGE } from './hq-receiving-delete.util';

@Injectable()
export class HqWarehouseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
  ) {}

  dashboard(user: AuthUser) {
    this.assertCanView(user);
    return this.prisma.$transaction(async (tx) => {
      const warehouses = await tx.warehouse.count({ where: hqWarehouseWhere });
      const balances = await tx.inventoryBalance.findMany({
        where: { warehouse: activeHqWarehouseWhere },
        include: { product: true },
      });
      const pendingTransfers = await tx.branchDistributionOrder.count({
        where: {
          deletedAt: null,
          sourceWarehouse: hqWarehouseWhere,
          status: {
            in: ['DRAFT', 'APPROVED', 'PICKING', 'PACKED', 'SHIPPED', 'SENT'],
          },
        },
      });
      const totalQuantity = balances.reduce((sum, item) => sum + item.quantity, 0);
      const totalStockValueKgs = balances.reduce(
        (sum, item) => sum + Number(item.totalValueKgs),
        0,
      );
      const productIds = new Set(balances.filter((b) => b.quantity > 0).map((b) => b.productId));

      return {
        totalHqWarehouses: warehouses,
        totalProducts: productIds.size,
        totalStock: totalQuantity,
        totalInventoryValueKgs: Math.round(totalStockValueKgs * 100) / 100,
        pendingTransfers,
      };
    });
  }

  list(user: AuthUser) {
    this.assertCanView(user);
    return this.prisma.$transaction(async (tx) => {
      const warehouses = await tx.warehouse.findMany({
        where: hqWarehouseWhere,
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      });
      const results = [];
      for (const warehouse of warehouses) {
        results.push(await this.buildWarehouseMetrics(tx, warehouse));
      }
      return results;
    });
  }

  private async buildWarehouseMetrics(
    tx: Prisma.TransactionClient,
    warehouse: {
      id: string;
      name: string;
      code: string;
      city: string | null;
      address: string | null;
      country: string;
      isActive: boolean;
      warehouseType: import('@prisma/client').WarehouseType;
      branchId: string | null;
      contactPerson: string | null;
      phone: string | null;
      notes: string | null;
      createdAt: Date;
      updatedAt: Date;
      deletedAt: Date | null;
    },
  ) {
    const balances = await tx.inventoryBalance.findMany({
      where: { warehouseId: warehouse.id },
      include: { product: { select: { sellingPriceKgs: true } } },
    });
    const pendingOutgoing = await tx.branchDistributionOrder.count({
      where: {
        sourceWarehouseId: warehouse.id,
        deletedAt: null,
        status: {
          in: [
            'SENT_TO_WAREHOUSE',
            'PICKING',
            'PACKED',
            'APPROVED',
            'INVOICED',
            'PAYMENT_PENDING',
            'PAID',
          ],
        },
      },
    });
    const pendingReceiving = await tx.procurementOrder.count({
      where: {
        hqWarehouseId: warehouse.id,
        deletedAt: null,
        hqStockMovementCreatedAt: null,
        status: {
          notIn: ['DRAFT', 'CANCELLED', 'RECEIVED_TO_HQ_WAREHOUSE', 'CLOSED'],
        },
      },
    });
    const distributedAggregate = await tx.branchDistributionOrder.aggregate({
      where: {
        sourceWarehouseId: warehouse.id,
        deletedAt: null,
        status: { in: ['SHIPPED', 'RECEIVED', 'RECEIVED_BY_BRANCH', 'RECEIVED_WITH_DIFFERENCE', 'COMPLETED', 'CLOSED'] },
      },
      _sum: { totalAmount: true },
    });

    const totalQuantity = balances.reduce((sum, item) => sum + item.quantity, 0);
    const reservedQuantity = balances.reduce((sum, item) => sum + item.reservedQuantity, 0);
    const totalStockValueKgs = balances.reduce((sum, item) => sum + Number(item.totalValueKgs), 0);
    const availableStockValueKgs = balances.reduce((sum, item) => {
      const available = Math.max(item.quantity - item.reservedQuantity, 0);
      return sum + available * Number(item.landedCostKgs || item.averageCostKgs);
    }, 0);
    const reservedStockValueKgs = balances.reduce((sum, item) => {
      return sum + item.reservedQuantity * Number(item.landedCostKgs || item.averageCostKgs);
    }, 0);

    return {
      ...warehouse,
      totalProductQuantity: totalQuantity,
      totalStockValueKgs: Math.round(totalStockValueKgs * 100) / 100,
      totalPurchaseCostKgs: Math.round(totalStockValueKgs * 100) / 100,
      totalDistributedValueKgs: Math.round(Number(distributedAggregate._sum.totalAmount ?? 0) * 100) / 100,
      availableStockValueKgs: Math.round(availableStockValueKgs * 100) / 100,
      reservedStockValueKgs: Math.round(reservedStockValueKgs * 100) / 100,
      reservedQuantity,
      availableQuantity: Math.max(totalQuantity - reservedQuantity, 0),
      pendingOutgoingOrders: pendingOutgoing,
      pendingReceivingOrders: pendingReceiving,
    };
  }

  async detail(user: AuthUser, id: string) {
    const warehouse = await this.getHqWarehouse(user, id);
    const [inventoryCount, pendingTransfers] = await Promise.all([
      this.prisma.inventoryBalance.count({
        where: { warehouseId: id, quantity: { gt: 0 } },
      }),
      this.prisma.branchDistributionOrder.count({
        where: {
          sourceWarehouseId: id,
          deletedAt: null,
          status: { in: ['DRAFT', 'APPROVED', 'PICKING', 'PACKED', 'SHIPPED', 'SENT'] },
        },
      }),
    ]);
    return { ...warehouse, inventoryCount, pendingTransfers };
  }

  async create(user: AuthUser, dto: CreateHqWarehouseDto) {
    this.assertCanManage(user);
    if (dto.branchId?.trim()) {
      throw new BadRequestException('HQ warehouse cannot be linked to a branch.');
    }
    await this.assertUniqueHqFields(dto.name, dto.code);

    const warehouse = await this.prisma.warehouse.create({
      data: {
        branchId: null,
        warehouseType: WarehouseType.HQ,
        name: dto.name.trim(),
        code: dto.code.trim().toUpperCase(),
        country: dto.country?.trim() || 'Kyrgyzstan',
        city: dto.city?.trim(),
        address: dto.address?.trim(),
        contactPerson: dto.contactPerson?.trim(),
        phone: dto.phone?.trim(),
        notes: dto.notes?.trim(),
        isActive: dto.isActive ?? true,
      },
    });
    await this.audit(user, 'HQ_WAREHOUSE_CREATED', warehouse.id, { warehouse });
    return warehouse;
  }

  async update(user: AuthUser, id: string, dto: UpdateHqWarehouseDto) {
    this.assertCanManage(user);
    const existing = await this.getHqWarehouse(user, id);
    if (dto.name || dto.code) {
      await this.assertUniqueHqFields(dto.name ?? existing.name, dto.code ?? existing.code, id);
    }
    const warehouse = await this.prisma.warehouse.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.code ? { code: dto.code.trim().toUpperCase() } : {}),
        ...(dto.country !== undefined ? { country: dto.country.trim() } : {}),
        ...(dto.city !== undefined ? { city: dto.city?.trim() } : {}),
        ...(dto.address !== undefined ? { address: dto.address?.trim() } : {}),
        ...(dto.contactPerson !== undefined ? { contactPerson: dto.contactPerson?.trim() } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone?.trim() } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        branchId: null,
        warehouseType: WarehouseType.HQ,
      },
    });
    await this.audit(user, 'HQ_WAREHOUSE_UPDATED', warehouse.id, { before: existing, after: warehouse });
    return warehouse;
  }

  async deactivate(user: AuthUser, id: string) {
    this.assertCanManage(user);
    const existing = await this.getHqWarehouse(user, id);
    const hasStock = await this.prisma.inventoryBalance.findFirst({
      where: { warehouseId: id, quantity: { gt: 0 } },
    });
    if (hasStock) {
      throw new BadRequestException('Cannot deactivate HQ warehouse while inventory exists');
    }
    const warehouse = await this.prisma.warehouse.update({
      where: { id },
      data: { isActive: false },
    });
    await this.audit(user, 'HQ_WAREHOUSE_DEACTIVATED', warehouse.id, { oldValue: existing, newValue: warehouse });
    return warehouse;
  }

  async remove(user: AuthUser, id: string, reason?: string) {
    if (!canDeleteHqWarehouse(user)) {
      throw new ForbiddenException('Only CEO can delete HQ warehouses');
    }

    return this.prisma.$transaction(async (tx) => {
      const warehouse = await tx.warehouse.findFirst({
        where: { id, ...hqWarehouseWhere },
      });
      if (!warehouse || !isHqWarehouse(warehouse)) {
        throw new NotFoundException('HQ warehouse not found');
      }

      const [
        stockAggregate,
        stockMovements,
        receivings,
        distributionOrders,
        procurementOrders,
        goodsReceivings,
      ] = await Promise.all([
        tx.inventoryBalance.aggregate({
          where: { warehouseId: id },
          _sum: { quantity: true },
        }),
        tx.stockMovement.count({ where: { warehouseId: id } }),
        tx.procurementGoodsReceiving.count({ where: { hqWarehouseId: id, deletedAt: null } }),
        tx.branchDistributionOrder.count({
          where: {
            deletedAt: null,
            OR: [{ sourceWarehouseId: id }, { destinationWarehouseId: id }],
          },
        }),
        tx.procurementOrder.count({ where: { hqWarehouseId: id, deletedAt: null } }),
        tx.goodsReceiving.count({ where: { warehouseId: id } }),
      ]);

      const totalStock = stockAggregate._sum.quantity ?? 0;
      const hasHistory =
        totalStock > 0 ||
        stockMovements > 0 ||
        receivings > 0 ||
        distributionOrders > 0 ||
        procurementOrders > 0 ||
        goodsReceivings > 0;

      const oldValue = { ...warehouse };

      if (!hasHistory) {
        await tx.warehouse.delete({ where: { id } });
        await this.audit(user, 'HQ_WAREHOUSE_DELETED', id, {
          entityType: 'Warehouse',
          oldValue,
          newValue: { deleted: true },
          reason: reason?.trim() || null,
        });
        return { success: true, archived: false };
      }

      const trimmedReason = reason?.trim();
      if (!trimmedReason) {
        throw new BadRequestException('Reason is required when archiving an HQ warehouse with related records');
      }

      const archived = await tx.warehouse.update({
        where: { id },
        data: { isActive: false, deletedAt: new Date() },
      });
      await this.audit(user, 'HQ_WAREHOUSE_ARCHIVED', id, {
        entityType: 'Warehouse',
        oldValue,
        newValue: archived,
        reason: trimmedReason,
      });
      return { success: true, archived: true };
    });
  }

  async inventory(user: AuthUser, id: string) {
    await this.getHqWarehouse(user, id);
    const balances = await this.prisma.inventoryBalance.findMany({
      where: { warehouseId: id },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            unit: true,
            isActive: true,
            sellingPriceKgs: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return balances.map((balance) => ({
      ...this.toInventoryRow(balance),
      wholesalePriceKgs: Number(balance.product.sellingPriceKgs ?? 0),
    }));
  }

  async receivings(user: AuthUser, id: string) {
    await this.getHqWarehouse(user, id);
    return this.prisma.procurementGoodsReceiving.findMany({
      where: { hqWarehouseId: id, deletedAt: null },
      include: {
        items: true,
        procurementOrder: {
          select: { id: true, orderNumber: true, status: true },
        },
      },
      orderBy: { receivedAt: 'desc' },
    });
  }

  async deleteReceiving(user: AuthUser, warehouseId: string, receivingId: string, reason?: string) {
    if (!canDeleteHqGoodsReceiving(user)) {
      throw new ForbiddenException('Only CEO can delete HQ goods receiving records');
    }
    const trimmedReason = reason?.trim();
    if (!trimmedReason) {
      throw new BadRequestException('Deletion reason is required');
    }

    return this.prisma.$transaction(async (tx) => {
      await this.getHqWarehouse(user, warehouseId);
      const receiving = await tx.procurementGoodsReceiving.findFirst({
        where: { id: receivingId, hqWarehouseId: warehouseId, deletedAt: null },
        include: {
          items: true,
          procurementOrder: {
            include: { items: true },
          },
        },
      });
      if (!receiving) {
        throw new NotFoundException('Goods receiving record not found');
      }

      const auditBase = {
        userId: user.id,
        roles: user.roles ?? [user.role],
        goodsReceivingId: receiving.id,
        procurementOrderId: receiving.procurementOrderId,
        reason: trimmedReason,
      };

      const hasDownstream = await hasHqReceivingDownstreamUsage(tx, receiving);
      const inMovements = await tx.stockMovement.findMany({
        where: {
          referenceType: 'PROCUREMENT_GOODS_RECEIVING',
          referenceId: receiving.id,
          type: StockMovementType.IN,
          status: StockMovementStatus.ACTIVE,
        },
      });

      let canRollbackStock = true;
      for (const movement of inMovements) {
        const balance = await tx.inventoryBalance.findUnique({
          where: {
            branchId_warehouseId_productId: {
              branchId: movement.branchId,
              warehouseId: movement.warehouseId,
              productId: movement.productId,
            },
          },
        });
        const available = (balance?.quantity ?? 0) - (balance?.reservedQuantity ?? 0);
        if (available < movement.quantity) {
          canRollbackStock = false;
          break;
        }
      }

      if (hasDownstream || !canRollbackStock) {
        const archived = await tx.procurementGoodsReceiving.update({
          where: { id: receiving.id },
          data: { deletedAt: new Date() },
        });
        await this.auditReceiving(
          tx,
          user,
          'HQ_RECEIVING_ARCHIVED',
          receiving.id,
          receiving,
          archived,
          auditBase,
        );
        return {
          success: true,
          archived: true,
          deleted: false,
          message: HQ_RECEIVING_ARCHIVED_MESSAGE,
        };
      }

      for (const movement of inMovements) {
        await this.inventoryService.createStockMovementInTx(tx, user, {
          productId: movement.productId,
          warehouseId: movement.warehouseId,
          type: StockMovementType.OUT,
          quantity: movement.quantity,
          unitCostKgs: Number(movement.unitCostKgs),
          referenceType: 'HQ_RECEIVING_STOCK_ROLLBACK',
          referenceId: receiving.id,
          note: `Rollback procurement receiving ${receiving.receivingNumber}`,
        });
        await tx.stockMovement.update({
          where: { id: movement.id },
          data: { status: StockMovementStatus.VOID },
        });
        await this.auditReceiving(
          tx,
          user,
          'HQ_RECEIVING_STOCK_ROLLBACK',
          receiving.id,
          { stockMovementId: movement.id, quantity: movement.quantity },
          { rolledBack: true },
          {
            ...auditBase,
            productId: movement.productId,
            quantity: movement.quantity,
          },
        );
      }

      await tx.procurementDifferenceReport.deleteMany({ where: { receivingId: receiving.id } });
      await tx.procurementGoodsReceivingItem.deleteMany({ where: { receivingId: receiving.id } });
      await tx.procurementGoodsReceiving.delete({ where: { id: receiving.id } });

      const remainingReceivings = await tx.procurementGoodsReceiving.count({
        where: {
          procurementOrderId: receiving.procurementOrderId,
          deletedAt: null,
        },
      });
      if (!remainingReceivings) {
        await tx.procurementOrderItem.updateMany({
          where: { orderId: receiving.procurementOrderId },
          data: { receivedQuantity: null },
        });
        await tx.procurementOrder.update({
          where: { id: receiving.procurementOrderId },
          data: {
            status: ProcurementOrderStatus.ARRIVED_IN_KYRGYZSTAN,
            receivedToHqAt: null,
            hqStockMovementCreatedAt: null,
          },
        });
      }

      await this.auditReceiving(
        tx,
        user,
        'HQ_RECEIVING_DELETED',
        receiving.id,
        receiving,
        { deleted: true },
        auditBase,
      );

      return {
        success: true,
        archived: false,
        deleted: true,
      };
    });
  }

  async transfers(user: AuthUser, id: string) {
    await this.getHqWarehouse(user, id);
    return this.prisma.branchDistributionOrder.findMany({
      where: { sourceWarehouseId: id, deletedAt: null },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        destinationWarehouse: { select: { id: true, name: true, code: true } },
        items: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async history(user: AuthUser, id: string) {
    await this.getHqWarehouse(user, id);
    return this.prisma.auditLog.findMany({
      where: {
        OR: [
          { entity: 'Warehouse', entityId: id },
          {
            metadata: {
              path: ['warehouseId'],
              equals: id,
            },
          },
        ],
      },
      include: { user: { select: { id: true, fullName: true, role: true } } },
      orderBy: { timestamp: 'desc' },
      take: 200,
    });
  }

  async assertActiveHqWarehouse(warehouseId: string) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: warehouseId, ...activeHqWarehouseWhere },
    });
    if (!warehouse || !isHqWarehouse(warehouse)) {
      throw new BadRequestException('Active HQ warehouse is required');
    }
    return warehouse;
  }

  private async getHqWarehouse(user: AuthUser, id: string) {
    this.assertCanView(user);
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id, ...hqWarehouseWhere },
    });
    if (!warehouse || !isHqWarehouse(warehouse)) {
      throw new NotFoundException('HQ warehouse not found');
    }
    return warehouse;
  }

  private async assertUniqueHqFields(name: string, code: string, excludeId?: string) {
    const existing = await this.prisma.warehouse.findFirst({
      where: {
        ...hqWarehouseWhere,
        id: excludeId ? { not: excludeId } : undefined,
        OR: [
          { name: { equals: name.trim(), mode: 'insensitive' } },
          { code: { equals: code.trim().toUpperCase(), mode: 'insensitive' } },
        ],
      },
    });
    if (existing) {
      throw new BadRequestException('HQ warehouse name and code must be unique');
    }
  }

  private toInventoryRow(balance: {
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
    const quantity = balance.quantity;
    const reservedQuantity = balance.reservedQuantity;
    return {
      id: balance.id,
      warehouseId: balance.warehouseId,
      productId: balance.productId,
      product: balance.product,
      sku: balance.product.sku,
      quantity,
      reservedQuantity,
      availableQuantity: Math.max(quantity - reservedQuantity, 0),
      averageCostKgs: Number(balance.averageCostKgs),
      landedCostKgs: Number(balance.landedCostKgs || balance.averageCostKgs),
      totalValueKgs: Number(balance.totalValueKgs),
      lastReceivingAt: balance.lastReceivingAt,
      updatedAt: balance.updatedAt,
    };
  }

  private assertCanView(user: AuthUser) {
    if (!this.hasViewRole(user)) {
      throw new ForbiddenException('You do not have access to HQ warehouses');
    }
  }

  private assertCanManage(user: AuthUser) {
    if (!this.hasManageRole(user)) {
      throw new ForbiddenException('Only CEO and Supply Chain Manager can manage HQ warehouses');
    }
  }

  private hasViewRole(user: AuthUser) {
    const roles = user.roles?.length ? user.roles : [user.role];
    const allowed: Role[] = [Role.CEO, Role.SUPPLY_CHAIN_MANAGER, Role.WAREHOUSE_MANAGER];
    return roles.some((role) => allowed.includes(role));
  }

  private hasManageRole(user: AuthUser) {
    const roles = user.roles?.length ? user.roles : [user.role];
    const allowed: Role[] = [Role.CEO, Role.SUPPLY_CHAIN_MANAGER];
    return roles.some((role) => allowed.includes(role));
  }

  private audit(user: AuthUser, action: string, entityId: string, metadata?: Record<string, unknown>) {
    return this.prisma.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action,
        entity: 'Warehouse',
        entityId,
        metadata: {
          warehouseId: entityId,
          roles: user.roles ?? [user.role],
          ...metadata,
        } as Prisma.InputJsonValue,
      },
    });
  }

  private auditReceiving(
    tx: Prisma.TransactionClient,
    user: AuthUser,
    action: string,
    entityId: string,
    oldValue: unknown,
    newValue: unknown,
    extra?: Record<string, unknown>,
  ) {
    return tx.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action,
        entity: 'ProcurementGoodsReceiving',
        entityId,
        metadata: {
          userId: user.id,
          roles: user.roles ?? [user.role],
          oldValue,
          newValue,
          ...extra,
        } as Prisma.InputJsonValue,
      },
    });
  }
}
