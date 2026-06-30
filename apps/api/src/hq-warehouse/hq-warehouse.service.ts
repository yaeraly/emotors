import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateHqWarehouseDto } from './dto/create-hq-warehouse.dto';
import { UpdateHqWarehouseDto } from './dto/update-hq-warehouse.dto';

@Injectable()
export class HqWarehouseService {
  constructor(private readonly prisma: PrismaService) {}

  dashboard(user: AuthUser) {
    this.assertCanView(user);
    return this.prisma.$transaction(async (tx) => {
      const warehouses = await tx.warehouse.count({
        where: { isHq: true, deletedAt: null },
      });
      const balances = await tx.inventoryBalance.findMany({
        where: { warehouse: { isHq: true, deletedAt: null, isActive: true } },
        include: { product: true },
      });
      const pendingTransfers = await tx.branchDistributionOrder.count({
        where: {
          deletedAt: null,
          sourceWarehouse: { isHq: true },
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
    return this.prisma.warehouse.findMany({
      where: { isHq: true, deletedAt: null },
      include: { branch: { select: { id: true, name: true, code: true, city: true } } },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
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
    await this.assertUniqueHqFields(dto.name, dto.code);
    const branch = await this.prisma.branch.findFirst({
      where: { id: dto.branchId, deletedAt: null },
    });
    if (!branch) throw new BadRequestException('Branch not found');

    const warehouse = await this.prisma.warehouse.create({
      data: {
        branchId: dto.branchId,
        name: dto.name.trim(),
        code: dto.code.trim().toUpperCase(),
        country: dto.country?.trim() || 'Kyrgyzstan',
        city: dto.city?.trim(),
        address: dto.address?.trim(),
        contactPerson: dto.contactPerson?.trim(),
        phone: dto.phone?.trim(),
        notes: dto.notes?.trim(),
        isHq: true,
        isActive: dto.isActive ?? true,
      },
      include: { branch: { select: { id: true, name: true, code: true, city: true } } },
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
      },
      include: { branch: { select: { id: true, name: true, code: true, city: true } } },
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
      include: { branch: { select: { id: true, name: true, code: true, city: true } } },
    });
    await this.audit(user, 'HQ_WAREHOUSE_DEACTIVATED', warehouse.id, { warehouse: existing });
    return warehouse;
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
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return balances.map((balance) => this.toInventoryRow(balance));
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
      where: { id: warehouseId, isHq: true, deletedAt: null, isActive: true },
    });
    if (!warehouse) {
      throw new BadRequestException('Active HQ warehouse is required');
    }
    return warehouse;
  }

  private async getHqWarehouse(user: AuthUser, id: string) {
    this.assertCanView(user);
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id, isHq: true, deletedAt: null },
      include: { branch: { select: { id: true, name: true, code: true, city: true } } },
    });
    if (!warehouse) throw new NotFoundException('HQ warehouse not found');
    return warehouse;
  }

  private async assertUniqueHqFields(name: string, code: string, excludeId?: string) {
    const existing = await this.prisma.warehouse.findFirst({
      where: {
        isHq: true,
        deletedAt: null,
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
    const allowed: Role[] = [Role.CEO, Role.SUPPLY_CHAIN_MANAGER, Role.WAREHOUSE_MANAGER, Role.OWNER, Role.SYSTEM_ADMINISTRATOR];
    return roles.some((role) => allowed.includes(role));
  }

  private hasManageRole(user: AuthUser) {
    const roles = user.roles?.length ? user.roles : [user.role];
    const allowed: Role[] = [Role.CEO, Role.SUPPLY_CHAIN_MANAGER, Role.OWNER, Role.SYSTEM_ADMINISTRATOR];
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
}
