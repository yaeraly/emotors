import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InventoryCountStatus,
  InventoryCountType,
  Prisma,
  Role,
  StockMovementType,
} from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { hasAnyFullAccessRole, isFullAccessRole } from '../rbac/rbac';
import { activeHqWarehouseWhere, isHqWarehouse } from '../warehouse/warehouse.util';
import {
  BulkUpdateInventoryCountItemsDto,
  CreateInventoryCountDto,
  RejectInventoryCountDto,
  UpdateInventoryCountItemDto,
} from './dto/inventory-count.dto';
import { InventoryCountQueryDto } from './dto/inventory-count-query.dto';

type PrismaTx = Prisma.TransactionClient;

@Injectable()
export class InventoryCountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
  ) {}

  list(user: AuthUser, query: InventoryCountQueryDto) {
    this.assertCanView(user);
    const where: Prisma.InventoryCountSessionWhereInput = {
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search?.trim()
        ? { sessionNumber: { contains: query.search.trim(), mode: 'insensitive' } }
        : {}),
    };
    return this.prisma.inventoryCountSession.findMany({
      where,
      include: this.sessionInclude(),
      orderBy: { createdAt: 'desc' },
    }).then((sessions) => sessions.map((session) => this.toSessionResponse(session)));
  }

  async detail(user: AuthUser, id: string) {
    const session = await this.getSession(user, id);
    return this.toSessionResponse(session);
  }

  async summary(user: AuthUser, id: string) {
    const session = await this.getSession(user, id);
    return this.buildSummary(session);
  }

  search(user: AuthUser, warehouseId: string, q: string) {
    this.assertCanView(user);
    const term = q.trim();
    if (!term) return [];

    return this.prisma.inventoryBalance.findMany({
      where: {
        warehouseId,
        warehouse: activeHqWarehouseWhere,
        OR: [
          { product: { sku: { contains: term, mode: 'insensitive' } } },
          { product: { name: { contains: term, mode: 'insensitive' } } },
          { product: { barcode: { equals: term, mode: 'insensitive' } } },
        ],
      },
      include: {
        product: { include: { productCategory: true, defaultSupplier: true } },
        warehouse: true,
      },
      take: 20,
    }).then((rows) =>
      rows.map((row) => ({
        productId: row.productId,
        sku: row.product.sku,
        barcode: row.product.barcode,
        productName: row.product.name,
        categoryName: row.product.productCategory?.nameRu ?? row.product.category,
        shelf: row.shelf,
        zone: row.zone,
        systemQuantity: row.quantity,
        unitCostKgs: Number(row.landedCostKgs || row.averageCostKgs || row.product.finalCostKgs),
      })),
    );
  }

  create(user: AuthUser, dto: CreateInventoryCountDto) {
    this.assertCanCount(user);
    return this.prisma.$transaction(async (tx) => {
      const warehouse = await tx.warehouse.findFirst({
        where: { id: dto.warehouseId, ...activeHqWarehouseWhere },
      });
      if (!warehouse || !isHqWarehouse(warehouse)) {
        throw new BadRequestException('Inventory count requires an active HQ warehouse');
      }

      this.validateTypeFilters(dto);

      const session = await tx.inventoryCountSession.create({
        data: {
          sessionNumber: await this.generateSessionNumber(tx),
          warehouseId: warehouse.id,
          inventoryType: dto.inventoryType,
          status: InventoryCountStatus.COUNTING,
          startDate: new Date(),
          categoryId: dto.categoryId ?? dto.filterCategoryId,
          shelf: dto.shelf ?? dto.filterShelf,
          zone: dto.zone ?? dto.filterZone,
          filterCategoryId: dto.filterCategoryId ?? dto.categoryId,
          filterShelf: dto.filterShelf ?? dto.shelf,
          filterZone: dto.filterZone ?? dto.zone,
          filterBrand: dto.filterBrand,
          filterSupplierId: dto.filterSupplierId,
          filterProductIds: dto.filterProductIds?.length
            ? dto.filterProductIds
            : undefined,
          notes: dto.notes,
          createdById: user.id,
        },
      });

      const items = await this.buildSessionItems(tx, session, dto);
      if (items.length === 0) {
        throw new BadRequestException('No products match the selected inventory filters');
      }

      await tx.inventoryCountItem.createMany({ data: items });

      await this.audit(tx, user, 'INVENTORY_CREATED', session.id, {
        warehouseId: warehouse.id,
        newValue: {
          inventoryType: dto.inventoryType,
          itemCount: items.length,
          status: InventoryCountStatus.COUNTING,
        },
      });

      await this.audit(tx, user, 'INVENTORY_STARTED', session.id, {
        warehouseId: warehouse.id,
        newValue: { status: InventoryCountStatus.COUNTING },
      });

      const created = await tx.inventoryCountSession.findUniqueOrThrow({
        where: { id: session.id },
        include: this.sessionInclude(),
      });
      return this.toSessionResponse(created);
    });
  }

  async start(user: AuthUser, id: string) {
    this.assertCanCount(user);
    return this.transition(user, id, [InventoryCountStatus.DRAFT, InventoryCountStatus.REJECTED], {
      status: InventoryCountStatus.COUNTING,
      startDate: new Date(),
      rejectedBy: { disconnect: true },
      rejectionReason: null,
      submittedAt: null,
      approvedBy: { disconnect: true },
      approvedAt: null,
      completedAt: null,
      rejectedAt: null,
    }, 'INVENTORY_STARTED');
  }

  async updateItem(user: AuthUser, sessionId: string, itemId: string, dto: UpdateInventoryCountItemDto) {
    this.assertCanCount(user);
    const session = await this.getSessionForWrite(user, sessionId);
    if (session.status !== InventoryCountStatus.COUNTING) {
      throw new BadRequestException('Items can only be updated while counting');
    }

    const item = session.items.find((entry) => entry.id === itemId);
    if (!item) throw new NotFoundException('Inventory count item not found');

    const actualQuantity = Math.max(0, Math.floor(dto.actualQuantity));
    const differenceQuantity = actualQuantity - item.systemQuantity;
    const unitCost = Number(item.unitCostKgs);
    const differenceValueKgs = this.roundMoney(differenceQuantity * unitCost);

    const updated = await this.prisma.inventoryCountItem.update({
      where: { id: itemId },
      data: {
        actualQuantity,
        differenceQuantity,
        differenceValueKgs,
        remark: dto.remark,
        countedAt: new Date(),
      },
    });

    await this.audit(this.prisma, user, 'PRODUCT_COUNT_UPDATED', sessionId, {
      warehouseId: session.warehouseId,
      productId: item.productId,
      oldValue: item.actualQuantity,
      newValue: actualQuantity,
      extra: {
        sku: item.sku,
        systemQuantity: item.systemQuantity,
        differenceQuantity,
      },
    });

    return updated;
  }

  async bulkUpdateItems(user: AuthUser, sessionId: string, dto: BulkUpdateInventoryCountItemsDto) {
    this.assertCanCount(user);
    const session = await this.getSessionForWrite(user, sessionId);
    if (session.status !== InventoryCountStatus.COUNTING) {
      throw new BadRequestException('Items can only be updated while counting');
    }

    for (const entry of dto.items) {
      const item = session.items.find((row) => row.id === entry.itemId);
      if (!item) throw new NotFoundException(`Inventory count item not found: ${entry.itemId}`);
      const actualQuantity = Math.max(0, Math.floor(entry.actualQuantity));
      const differenceQuantity = actualQuantity - item.systemQuantity;
      await this.prisma.inventoryCountItem.update({
        where: { id: entry.itemId },
        data: {
          actualQuantity,
          differenceQuantity,
          differenceValueKgs: this.roundMoney(differenceQuantity * Number(item.unitCostKgs)),
          remark: entry.remark,
          countedAt: new Date(),
        },
      });
    }

    await this.audit(this.prisma, user, 'PRODUCT_COUNT_UPDATED', sessionId, {
      warehouseId: session.warehouseId,
      newValue: { bulkCount: dto.items.length },
    });

    return this.detail(user, sessionId);
  }

  async submit(user: AuthUser, id: string) {
    this.assertCanCount(user);
    return this.prisma.$transaction(async (tx) => {
      const session = await this.getSessionForWriteInTx(tx, user, id);
      if (session.status !== InventoryCountStatus.COUNTING) {
        throw new BadRequestException('Only counting sessions can be submitted');
      }

      const uncounted = session.items.filter((item) => item.actualQuantity === null);
      if (uncounted.length > 0) {
        throw new BadRequestException(
          `All products must be counted before submit. Remaining: ${uncounted.length}`,
        );
      }

      const updated = await tx.inventoryCountSession.update({
        where: { id },
        data: {
          status: InventoryCountStatus.SUBMITTED,
          submittedAt: new Date(),
          finishDate: new Date(),
        },
        include: this.sessionInclude(),
      });

      await this.audit(tx, user, 'INVENTORY_SUBMITTED', id, {
        warehouseId: session.warehouseId,
        newValue: this.buildSummary(updated),
      });
      return this.toSessionResponse(updated);
    });
  }

  async approve(user: AuthUser, id: string) {
    this.assertCanApprove(user);
    return this.prisma.$transaction(async (tx) => {
      const session = await this.getSessionForWriteInTx(tx, user, id);
      if (session.status !== InventoryCountStatus.SUBMITTED) {
        throw new BadRequestException('Only submitted inventory can be approved');
      }

      for (const item of session.items) {
        const difference = item.differenceQuantity;
        if (difference === 0) continue;

        const movementType =
          difference > 0
            ? StockMovementType.INVENTORY_ADJUSTMENT_IN
            : StockMovementType.INVENTORY_ADJUSTMENT_OUT;

        await this.inventoryService.createStockMovementInTx(tx, user, {
          productId: item.productId,
          warehouseId: session.warehouseId,
          type: movementType,
          quantity: Math.abs(difference),
          unitCostKgs: Number(item.unitCostKgs),
          referenceType: 'INVENTORY_COUNT',
          referenceId: session.id,
          note: `Inventory count ${session.sessionNumber} adjustment for SKU ${item.sku}`,
        });

        await this.audit(tx, user, 'STOCK_ADJUSTED', session.id, {
          warehouseId: session.warehouseId,
          productId: item.productId,
          oldValue: item.systemQuantity,
          newValue: item.actualQuantity,
          extra: {
            sku: item.sku,
            differenceQuantity: difference,
            movementType,
          },
        });
      }

      const updated = await tx.inventoryCountSession.update({
        where: { id },
        data: {
          status: InventoryCountStatus.COMPLETED,
          approvedById: user.id,
          approvedAt: new Date(),
          completedAt: new Date(),
        },
        include: this.sessionInclude(),
      });

      await this.audit(tx, user, 'INVENTORY_APPROVED', id, {
        warehouseId: session.warehouseId,
        newValue: this.buildSummary(updated),
      });
      return this.toSessionResponse(updated);
    });
  }

  async reject(user: AuthUser, id: string, dto: RejectInventoryCountDto) {
    this.assertCanApprove(user);
    return this.prisma.$transaction(async (tx) => {
      const session = await this.getSessionForWriteInTx(tx, user, id);
      if (session.status !== InventoryCountStatus.SUBMITTED) {
        throw new BadRequestException('Only submitted inventory can be rejected');
      }

      const updated = await tx.inventoryCountSession.update({
        where: { id },
        data: {
          status: InventoryCountStatus.COUNTING,
          rejectedById: user.id,
          rejectedAt: new Date(),
          rejectionReason: dto.reason,
          submittedAt: null,
          finishDate: null,
        },
        include: this.sessionInclude(),
      });

      await this.audit(tx, user, 'INVENTORY_REJECTED', id, {
        warehouseId: session.warehouseId,
        oldValue: InventoryCountStatus.SUBMITTED,
        newValue: InventoryCountStatus.COUNTING,
        extra: { reason: dto.reason },
      });
      return this.toSessionResponse(updated);
    });
  }

  private async buildSessionItems(
    tx: PrismaTx,
    session: { id: string; warehouseId: string },
    dto: CreateInventoryCountDto,
  ) {
    const balances = await tx.inventoryBalance.findMany({
      where: {
        warehouseId: session.warehouseId,
        ...(dto.filterCategoryId || dto.categoryId
          ? { product: { categoryId: dto.filterCategoryId ?? dto.categoryId } }
          : {}),
        ...(dto.filterShelf || dto.shelf ? { shelf: dto.filterShelf ?? dto.shelf } : {}),
        ...(dto.filterZone || dto.zone ? { zone: dto.filterZone ?? dto.zone } : {}),
        ...(dto.filterSupplierId
          ? { product: { defaultSupplierId: dto.filterSupplierId } }
          : {}),
        ...(dto.filterBrand
          ? {
              product: {
                OR: [
                  { name: { contains: dto.filterBrand, mode: 'insensitive' } },
                  { category: { contains: dto.filterBrand, mode: 'insensitive' } },
                ],
              },
            }
          : {}),
        ...(dto.inventoryType === InventoryCountType.PRODUCT && dto.filterProductIds?.length
          ? { productId: { in: dto.filterProductIds } }
          : {}),
      },
      include: {
        product: { include: { productCategory: true } },
      },
      orderBy: { product: { sku: 'asc' } },
    });

    return balances.map((balance) => ({
      sessionId: session.id,
      productId: balance.productId,
      sku: balance.product.sku,
      productName: balance.product.name,
      categoryName: balance.product.productCategory?.nameRu ?? balance.product.category,
      shelf: balance.shelf,
      zone: balance.zone,
      systemQuantity: balance.quantity,
      actualQuantity: null,
      differenceQuantity: 0,
      unitCostKgs: Number(balance.landedCostKgs || balance.averageCostKgs || balance.product.finalCostKgs),
      differenceValueKgs: 0,
    }));
  }

  private validateTypeFilters(dto: CreateInventoryCountDto) {
    if (dto.inventoryType === InventoryCountType.CATEGORY && !dto.categoryId && !dto.filterCategoryId) {
      throw new BadRequestException('Category inventory requires categoryId');
    }
    if (dto.inventoryType === InventoryCountType.SHELF && !dto.shelf && !dto.filterShelf) {
      throw new BadRequestException('Shelf inventory requires shelf');
    }
    if (dto.inventoryType === InventoryCountType.ZONE && !dto.zone && !dto.filterZone) {
      throw new BadRequestException('Zone inventory requires zone');
    }
    if (dto.inventoryType === InventoryCountType.PRODUCT && !dto.filterProductIds?.length) {
      throw new BadRequestException('Product inventory requires at least one product');
    }
  }

  private async transition(
    user: AuthUser,
    id: string,
    allowed: InventoryCountStatus[],
    data: Prisma.InventoryCountSessionUpdateInput,
    action: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const session = await this.getSessionForWriteInTx(tx, user, id);
      if (!allowed.includes(session.status)) {
        throw new BadRequestException(`Session must be one of: ${allowed.join(', ')}`);
      }
      const updated = await tx.inventoryCountSession.update({
        where: { id },
        data,
        include: this.sessionInclude(),
      });
      await this.audit(tx, user, action, id, {
        warehouseId: session.warehouseId,
        oldValue: session.status,
        newValue: updated.status,
      });
      return this.toSessionResponse(updated);
    });
  }

  private async getSession(user: AuthUser, id: string) {
    this.assertCanView(user);
    const session = await this.prisma.inventoryCountSession.findUnique({
      where: { id },
      include: this.sessionInclude(),
    });
    if (!session) throw new NotFoundException('Inventory count session not found');
    return session;
  }

  private async getSessionForWrite(user: AuthUser, id: string) {
    this.assertCanCount(user);
    const session = await this.prisma.inventoryCountSession.findUnique({
      where: { id },
      include: { items: true, warehouse: true },
    });
    if (!session) throw new NotFoundException('Inventory count session not found');
    if (session.status === InventoryCountStatus.COMPLETED) {
      throw new BadRequestException('Completed inventory cannot be modified');
    }
    return session;
  }

  private async getSessionForWriteInTx(tx: PrismaTx, user: AuthUser, id: string) {
    const session = await tx.inventoryCountSession.findUnique({
      where: { id },
      include: { items: true, warehouse: true },
    });
    if (!session) throw new NotFoundException('Inventory count session not found');
    if (session.status === InventoryCountStatus.COMPLETED) {
      throw new BadRequestException('Completed inventory cannot be modified');
    }
    return session;
  }

  private buildSummary(session: {
    items: Array<{
      systemQuantity: number;
      actualQuantity: number | null;
      differenceQuantity: number;
      differenceValueKgs: Prisma.Decimal;
    }>;
  }) {
    const totalProducts = session.items.length;
    const countedProducts = session.items.filter((item) => item.actualQuantity !== null).length;
    const shortages = session.items.filter((item) => item.differenceQuantity < 0).length;
    const overages = session.items.filter((item) => item.differenceQuantity > 0).length;
    const totalDifferenceValue = session.items.reduce(
      (sum, item) => sum + Number(item.differenceValueKgs),
      0,
    );

    return {
      totalProducts,
      countedProducts,
      remainingProducts: totalProducts - countedProducts,
      shortages,
      overages,
      matched: session.items.filter((item) => item.differenceQuantity === 0 && item.actualQuantity !== null).length,
      totalDifferenceValueKgs: this.roundMoney(totalDifferenceValue),
    };
  }

  private sessionInclude() {
    return {
      warehouse: true,
      category: true,
      createdBy: { select: { id: true, fullName: true, role: true } },
      approvedBy: { select: { id: true, fullName: true, role: true } },
      rejectedBy: { select: { id: true, fullName: true, role: true } },
      items: {
        include: { product: { select: { id: true, sku: true, barcode: true } } },
        orderBy: { sku: 'asc' as const },
      },
    };
  }

  private toSessionResponse(session: any) {
    return {
      ...session,
      summary: this.buildSummary(session),
      items: session.items?.map((item: any) => ({
        ...item,
        unitCostKgs: Number(item.unitCostKgs),
        differenceValueKgs: Number(item.differenceValueKgs),
        differenceType:
          item.differenceQuantity < 0
            ? 'SHORTAGE'
            : item.differenceQuantity > 0
              ? 'OVERAGE'
              : item.actualQuantity !== null
                ? 'MATCHED'
                : null,
      })),
    };
  }

  private async generateSessionNumber(tx: PrismaTx) {
    const count = await tx.inventoryCountSession.count();
    return `IC-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(count + 1).padStart(5, '0')}`;
  }

  private assertCanView(user: AuthUser) {
    const roles = user.roles?.length ? user.roles : [user.role];
    const allowed = hasAnyFullAccessRole(roles) ||
      roles.includes(Role.SUPPLY_CHAIN_MANAGER) ||
      roles.includes(Role.WAREHOUSE_MANAGER);
    if (!allowed) throw new ForbiddenException('Forbidden resource');
  }

  private assertCanCount(user: AuthUser) {
    const roles = user.roles?.length ? user.roles : [user.role];
    if (!roles.includes(Role.WAREHOUSE_MANAGER)) {
      throw new ForbiddenException('Only Warehouse Manager can perform inventory counts');
    }
  }

  private assertCanApprove(user: AuthUser) {
    const roles = user.roles?.length ? user.roles : [user.role];
    if (!roles.some((role) => isFullAccessRole(role))) {
      throw new ForbiddenException('Only CEO can approve or reject inventory counts');
    }
  }

  private audit(
    tx: PrismaTx | PrismaService,
    user: AuthUser,
    action: string,
    inventorySessionId: string,
    opts?: {
      warehouseId?: string;
      productId?: string;
      oldValue?: unknown;
      newValue?: unknown;
      extra?: Record<string, unknown>;
    },
  ) {
    return (tx as PrismaTx).auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action,
        entity: 'InventoryCountSession',
        entityId: inventorySessionId,
        metadata: {
          roles: user.roles ?? [user.role],
          inventorySessionId,
          ...(opts?.warehouseId ? { warehouseId: opts.warehouseId } : {}),
          ...(opts?.productId ? { productId: opts.productId } : {}),
          ...(opts?.oldValue !== undefined ? { oldValue: opts.oldValue } : {}),
          ...(opts?.newValue !== undefined ? { newValue: opts.newValue } : {}),
          ...opts?.extra,
        },
      },
    });
  }

  private roundMoney(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
