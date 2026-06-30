import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ProcurementOrderStatus, Role, StockMovementType } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { isFullAccessRole } from '../rbac/rbac';
import { activeHqWarehouseWhere, isHqWarehouse } from '../warehouse/warehouse.util';
import {
  buildLogisticsWithCargo,
  calculateLandedCosts,
  extractCargoConfig,
  extractLogisticsCosts,
  LandedCostItemResult,
  LandedCostOrderResult,
  mapStoredProcurementItemToLandedCostInput,
} from './landed-cost.util';

type PreparedProcurementItem = {
  productId: string;
  supplierId: string;
  factoryId: string | null;
  sku: string;
  productName: string;
  unit: string;
  quantity: number;
  purchasePriceYuan: number;
  yuanRate: number;
  weightKg: number;
  packagingWeightKg: number;
  packagingType?: string | null;
  directPackagingCostKgs: number;
  note?: string;
};

@Injectable()
export class ProcurementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
  ) {}

  createSupplier(dto: any) {
    return this.prisma.supplier.create({
      data: {
        name: dto.name,
        companyName: dto.companyName,
        country: dto.country ?? 'China',
        city: dto.city,
        address: dto.address,
        wechat: dto.wechat,
        phone: dto.phone,
        email: dto.email,
        website: dto.website,
        productTypes: dto.productTypes ?? [],
        reliabilityScore: Number(dto.reliabilityScore ?? 0),
        notes: dto.notes,
        isActive: dto.isActive ?? true,
      },
    });
  }

  suppliers() {
    return this.prisma.supplier.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' } });
  }

  supplier(id: string) {
    return this.prisma.supplier.findFirst({ where: { id, deletedAt: null }, include: { contacts: true, purchaseOrders: true, factories: true, procurementOrders: true } });
  }

  async updateSupplier(user: AuthUser, id: string, dto: any) {
    this.assertCanEditSupplier(user);
    this.validateSupplierPayload(dto);
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.supplier.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw new NotFoundException('Supplier not found');
      if (dto.name && dto.name !== existing.name) {
        const duplicate = await tx.supplier.findFirst({
          where: { name: dto.name, deletedAt: null, NOT: { id } },
          select: { id: true },
        });
        if (duplicate) throw new BadRequestException('Supplier name already exists');
      }
      const oldValue = this.pickSupplierAuditFields(existing);
      const nextNotes = this.mergeSupplierNotes(existing.notes, dto);
      const updated = await tx.supplier.update({
        where: { id },
        data: {
          name: dto.name,
          companyName: dto.companyName,
          country: dto.country,
          city: dto.city,
          address: dto.address,
          wechat: dto.wechat,
          phone: dto.phone ?? dto.mobile ?? dto.whatsapp,
          email: dto.email,
          website: dto.website,
          productTypes: Array.isArray(dto.productTypes) ? dto.productTypes : this.splitList(dto.productTypes),
          reliabilityScore: dto.reliabilityScore !== undefined ? Number(dto.reliabilityScore) : undefined,
          isActive: dto.status ? dto.status === 'ACTIVE' : dto.isActive,
          deletedAt: dto.status === 'ARCHIVED' ? new Date() : dto.status === 'ACTIVE' ? null : undefined,
          notes: nextNotes,
        },
      });
      await this.auditSupplierUpdate(tx, user, existing.id, this.changedFields(oldValue, this.pickSupplierAuditFields(updated)), oldValue, this.pickSupplierAuditFields(updated));
      return updated;
    });
  }

  async deleteSupplier(user: AuthUser, id: string, reason?: string) {
    if (!this.hasRole(user, Role.CEO)) {
      throw new ForbiddenException('Only CEO can delete suppliers');
    }

    return this.prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.findFirst({ where: { id, deletedAt: null } });
      if (!supplier) throw new NotFoundException('Supplier not found');

      const [procurementOrders, purchaseOrders, factories, contacts] = await Promise.all([
        tx.procurementOrder.count({ where: { supplierId: id } }),
        tx.purchaseOrder.count({ where: { supplierId: id } }),
        tx.factory.count({ where: { supplierId: id, deletedAt: null } }),
        tx.supplierContact.count({ where: { supplierId: id } }),
      ]);
      const hasPurchaseHistory = procurementOrders > 0 || purchaseOrders > 0 || factories > 0;
      const oldValue = {
        id: supplier.id,
        name: supplier.name,
        deletedAt: supplier.deletedAt,
        isActive: supplier.isActive,
      };

      if (hasPurchaseHistory) {
        const archived = await tx.supplier.update({
          where: { id },
          data: { isActive: false, deletedAt: new Date() },
        });
        await this.auditSupplierDelete(tx, user, supplier, oldValue, {
          deletedAt: archived.deletedAt,
          isActive: archived.isActive,
          archived: true,
        }, reason, { procurementOrders, purchaseOrders, factories, contacts });
        return {
          success: true,
          archived: true,
          message: 'Supplier has related purchase history. It was archived instead.',
        };
      }

      await tx.supplierContact.deleteMany({ where: { supplierId: id } });
      await tx.supplier.delete({ where: { id } });
      await this.auditSupplierDelete(tx, user, supplier, oldValue, {
        deleted: true,
        archived: false,
      }, reason, { procurementOrders, purchaseOrders, factories, contacts });
      return {
        success: true,
        archived: false,
        message: 'Supplier deleted successfully',
      };
    });
  }

  createSupplierContact(supplierId: string, dto: any) {
    return this.prisma.supplierContact.create({
      data: {
        supplierId,
        fullName: dto.fullName,
        position: dto.position,
        role: dto.position,
        wechat: dto.wechat,
        phone: dto.phone,
        email: dto.email,
        notes: dto.notes,
        isPrimary: dto.isPrimary ?? false,
      },
    });
  }

  supplierContacts(supplierId: string) {
    return this.prisma.supplierContact.findMany({
      where: { supplierId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
    });
  }

  updateSupplierContact(id: string, dto: any) {
    return this.prisma.supplierContact.update({
      where: { id },
      data: {
        fullName: dto.fullName,
        position: dto.position,
        role: dto.position,
        wechat: dto.wechat,
        phone: dto.phone,
        email: dto.email,
        notes: dto.notes,
        isPrimary: dto.isPrimary,
      },
    });
  }

  deleteSupplierContact(id: string) {
    return this.prisma.supplierContact.delete({ where: { id } });
  }

  createFactory(dto: any) {
    return this.prisma.factory.create({
      data: {
        supplierId: dto.supplierId,
        name: dto.name,
        city: dto.city,
        address: dto.address,
        productTypes: dto.productTypes ?? [],
        productionCapacity: dto.productionCapacity,
        notes: dto.notes,
        isActive: dto.isActive ?? true,
      },
      include: { supplier: true },
    });
  }

  factories() {
    return this.prisma.factory.findMany({
      where: { deletedAt: null },
      include: { supplier: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  factory(id: string) {
    return this.prisma.factory.findFirst({
      where: { id, deletedAt: null },
      include: { supplier: true, procurementOrders: true },
    });
  }

  updateFactory(id: string, dto: any) {
    return this.prisma.factory.update({ where: { id }, data: dto, include: { supplier: true } });
  }

  deleteFactory(id: string) {
    return this.prisma.factory.update({ where: { id }, data: { isActive: false, deletedAt: new Date() } });
  }

  createProcurementOrder(user: AuthUser, dto: any) {
    this.assertCanManageProcurement(user);
    return this.prisma.$transaction(async (tx) => {
      const [supplier, factory, warehouse] = await Promise.all([
        tx.supplier.findFirst({ where: { id: dto.supplierId, deletedAt: null } }),
        dto.factoryId ? tx.factory.findFirst({ where: { id: dto.factoryId, deletedAt: null } }) : Promise.resolve(null),
        tx.warehouse.findFirst({
          where: { id: dto.hqWarehouseId, ...activeHqWarehouseWhere },
        }),
      ]);
      if (!supplier) throw new NotFoundException('Supplier not found');
      if (dto.factoryId && !factory) throw new NotFoundException('Factory not found');
      if (!warehouse) throw new BadRequestException('Active HQ warehouse is required for procurement');

      const itemInputs = dto.items ?? [];
      if (!itemInputs.length) throw new BadRequestException('At least one product is required');

      const exchangeRate = Number(dto.defaultYuanRate ?? dto.exchangeRate ?? dto.yuanRate ?? 0);
      this.validateExchangeRate(exchangeRate);
      const { logistics, cargo } = this.resolveProcurementLogistics(dto);
      const preparedItems: PreparedProcurementItem[] = [];
      for (const item of itemInputs) {
        preparedItems.push(await this.resolveProcurementItemFromProduct(tx, item, supplier.id, factory?.id, exchangeRate));
      }

      const calculated = this.calculateProcurementLandedCosts(preparedItems, logistics, cargo);
      const orderTotals = this.buildProcurementOrderTotals(calculated, logistics, cargo);
      const order = await tx.procurementOrder.create({
        data: {
          orderNumber: dto.orderNumber ?? `PROC-${Date.now()}`,
          supplierId: supplier.id,
          factoryId: factory?.id,
          hqWarehouseId: warehouse.id,
          status: ProcurementOrderStatus.DRAFT,
          currency: dto.currency ?? 'CNY',
          defaultYuanRate: exchangeRate,
          purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : new Date(),
          ...orderTotals,
          estimatedArrivalDate: dto.estimatedArrivalDate ? new Date(dto.estimatedArrivalDate) : undefined,
          note: dto.note,
          createdById: user.id,
          items: {
            create: calculated.items.map((item, index) =>
              this.mapCalculatedItemToPersisted(preparedItems[index], item, exchangeRate),
            ),
          },
        },
        include: this.procurementOrderInclude(),
      });

      await this.auditProcurement(tx, user, 'CREATE_PROCUREMENT_ORDER', order.id, null, this.pickProcurementAuditFields(order));
      return order;
    });
  }

  procurementOrders() {
    return this.prisma.procurementOrder.findMany({
      where: { deletedAt: null },
      include: this.procurementOrderInclude(),
      orderBy: { createdAt: 'desc' },
    });
  }

  procurementOrder(id: string) {
    return this.prisma.procurementOrder.findFirst({
      where: { id, deletedAt: null },
      include: this.procurementOrderInclude(),
    });
  }

  updateProcurementOrder(user: AuthUser, id: string, dto: any) {
    this.assertCanManageProcurement(user);
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.procurementOrder.findFirst({
        where: { id, deletedAt: null },
        include: { items: true },
      });
      if (!existing) throw new NotFoundException('Procurement order not found');
      if (existing.hqStockMovementCreatedAt) {
        throw new BadRequestException('Received procurement orders cannot be edited');
      }

      const oldValue = this.pickProcurementAuditFields(existing);
      const exchangeRate = dto.defaultYuanRate !== undefined
        ? Number(dto.defaultYuanRate)
        : Number(existing.defaultYuanRate);
      this.validateExchangeRate(exchangeRate);
      const { logistics, cargo } = this.resolveProcurementLogistics(dto, existing);

      if (Array.isArray(dto.items)) {
        await tx.procurementOrderItem.deleteMany({ where: { orderId: id } });
        const preparedItems: PreparedProcurementItem[] = [];
        for (const item of dto.items) {
          preparedItems.push(await this.resolveProcurementItemFromProduct(
            tx,
            item,
            dto.supplierId ?? existing.supplierId,
            dto.factoryId ?? existing.factoryId,
            exchangeRate,
          ));
        }
        const calculated = this.calculateProcurementLandedCosts(preparedItems, logistics, cargo);
        const orderTotals = this.buildProcurementOrderTotals(calculated, logistics, cargo);
        await tx.procurementOrderItem.createMany({
          data: calculated.items.map((item, index) => ({
            orderId: id,
            ...this.mapCalculatedItemToPersisted(preparedItems[index], item, exchangeRate),
          })),
        });
        await tx.procurementOrder.update({
          where: { id },
          data: {
            supplierId: dto.supplierId ?? existing.supplierId,
            factoryId: dto.factoryId ?? existing.factoryId,
            hqWarehouseId: dto.hqWarehouseId ?? existing.hqWarehouseId,
            currency: dto.currency ?? existing.currency,
            defaultYuanRate: exchangeRate,
            purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : existing.purchaseDate,
            ...orderTotals,
            estimatedArrivalDate: dto.estimatedArrivalDate ? new Date(dto.estimatedArrivalDate) : existing.estimatedArrivalDate,
            note: dto.note ?? existing.note,
          },
        });
      } else {
        const recalculated = this.calculateProcurementLandedCosts(
          existing.items.map((item) => mapStoredProcurementItemToLandedCostInput({
            ...item,
            yuanRate: exchangeRate,
          })),
          logistics,
          cargo,
        );
        const orderTotals = this.buildProcurementOrderTotals(recalculated, logistics, cargo);
        for (const [index, item] of existing.items.entries()) {
          const next = recalculated.items[index];
          await tx.procurementOrderItem.update({
            where: { id: item.id },
            data: this.mapRecalculatedItemFields(next, exchangeRate),
          });
        }
        await tx.procurementOrder.update({
          where: { id },
          data: {
            supplierId: dto.supplierId ?? existing.supplierId,
            factoryId: dto.factoryId ?? existing.factoryId,
            hqWarehouseId: dto.hqWarehouseId ?? existing.hqWarehouseId,
            currency: dto.currency ?? existing.currency,
            defaultYuanRate: exchangeRate,
            purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : existing.purchaseDate,
            ...orderTotals,
            estimatedArrivalDate: dto.estimatedArrivalDate ? new Date(dto.estimatedArrivalDate) : existing.estimatedArrivalDate,
            note: dto.note ?? existing.note,
          },
        });
      }

      const updated = await tx.procurementOrder.findUnique({
        where: { id },
        include: this.procurementOrderInclude(),
      });
      await this.auditProcurement(
        tx,
        user,
        'UPDATE_PROCUREMENT_ORDER',
        id,
        oldValue,
        this.pickProcurementAuditFields(updated),
        dto.reason,
      );
      await this.auditProcurementLogisticsChanges(tx, user, id, oldValue, this.pickProcurementAuditFields(updated));
      return updated;
    });
  }

  recalculateProcurementOrder(user: AuthUser, id: string, reason?: string) {
    this.assertCanManageProcurement(user);
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.procurementOrder.findFirst({
        where: { id, deletedAt: null },
        include: { items: true },
      });
      if (!order) throw new NotFoundException('Procurement order not found');
      const oldValue = this.pickProcurementAuditFields(order);
      const { logistics, cargo } = this.resolveProcurementLogistics(order);
      const exchangeRate = Number(order.defaultYuanRate);
      const calculated = this.calculateProcurementLandedCosts(
        order.items.map((item) => mapStoredProcurementItemToLandedCostInput({
          ...item,
          yuanRate: exchangeRate,
        })),
        logistics,
        cargo,
      );
      const orderTotals = this.buildProcurementOrderTotals(calculated, logistics, cargo);
      for (const [index, item] of order.items.entries()) {
        const next = calculated.items[index];
        await tx.procurementOrderItem.update({
          where: { id: item.id },
          data: this.mapRecalculatedItemFields(next, exchangeRate),
        });
      }
      const updated = await tx.procurementOrder.update({
        where: { id },
        data: orderTotals,
        include: this.procurementOrderInclude(),
      });
      await this.auditProcurement(tx, user, 'RECALCULATE_PROCUREMENT_LANDED_COST', id, oldValue, this.pickProcurementAuditFields(updated), reason);
      return updated;
    });
  }

  procurementOrderAuditLogs(id: string) {
    return this.prisma.auditLog.findMany({
      where: {
        entity: 'ProcurementOrder',
        entityId: id,
      },
      include: { user: { select: { id: true, fullName: true, email: true } } },
      orderBy: { timestamp: 'desc' },
    });
  }

  updateProcurementStatus(user: AuthUser, id: string, status: ProcurementOrderStatus, reason?: string) {
    if (status === ProcurementOrderStatus.RECEIVED_TO_HQ_WAREHOUSE) {
      throw new BadRequestException('Use receive-to-hq workflow to post inventory into HQ warehouse');
    }
    if (status === ProcurementOrderStatus.ARRIVED) {
      return this.markProcurementArrived(user, id);
    }
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.procurementOrder.findFirst({ where: { id, deletedAt: null }, include: { items: true } });
      if (!existing) throw new NotFoundException('Procurement order not found');
      const oldValue = this.pickProcurementAuditFields(existing);
      const data: any = { status };
      if (status === ProcurementOrderStatus.APPROVED) {
        data.approvedById = user.id;
        data.approvedAt = new Date();
      }
      if (status === ProcurementOrderStatus.PAID) data.paidAt = new Date();
      if (status === ProcurementOrderStatus.SHIPPED_TO_YIWU) data.shippedAt = new Date();
      const updated = await tx.procurementOrder.update({ where: { id }, data, include: this.procurementOrderInclude() });
      await this.auditProcurement(tx, user, 'PROCUREMENT_STATUS_CHANGE', id, oldValue, this.pickProcurementAuditFields(updated), reason, { status });
      return updated;
    });
  }

  private markProcurementArrived(user: AuthUser, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.procurementOrder.findFirst({
        where: { id, deletedAt: null },
        include: { hqWarehouse: true },
      });
      if (!order) throw new NotFoundException('Procurement order not found');
      if (order.hqStockMovementCreatedAt || order.status === ProcurementOrderStatus.RECEIVED_TO_HQ_WAREHOUSE) {
        return this.prisma.procurementOrder.findUnique({ where: { id }, include: this.procurementOrderInclude() });
      }
      if (!order.hqWarehouse || !isHqWarehouse(order.hqWarehouse) || !order.hqWarehouse.isActive) {
        throw new BadRequestException('Procurement order must target an active HQ warehouse');
      }

      return tx.procurementOrder.update({
        where: { id },
        data: {
          status: ProcurementOrderStatus.ARRIVED,
          arrivedAt: new Date(),
          actualArrivalDate: new Date(),
        },
        include: this.procurementOrderInclude(),
      });
    });
  }

  createPurchaseOrder(user: AuthUser, dto: any) {
    const branchId = this.resolveBranchId(user, dto.branchId);
    const items = dto.items ?? [];
    const totalYuan = items.reduce((sum: number, item: any) => sum + Number(item.quantity ?? 0) * Number(item.unitPriceYuan ?? 0), 0);
    const totalKgs = Number(dto.totalKgs ?? 0);
    return this.prisma.purchaseOrder.create({
      data: {
        supplierId: dto.supplierId,
        branchId,
        orderNumber: dto.orderNumber ?? `PO-${Date.now()}`,
        status: dto.status,
        totalYuan,
        totalKgs,
        estimatedArrivalDate: dto.estimatedArrivalDate ? new Date(dto.estimatedArrivalDate) : undefined,
        items: { create: items.map((item: any) => ({
          productName: item.productName,
          sku: item.sku,
          quantity: Number(item.quantity ?? 0),
          unitPriceYuan: Number(item.unitPriceYuan ?? 0),
          totalYuan: Number(item.quantity ?? 0) * Number(item.unitPriceYuan ?? 0),
          weightKg: Number(item.weightKg ?? 0),
        })) },
      },
      include: { supplier: true, branch: true, items: true },
    });
  }

  purchaseOrders(user: AuthUser) {
    return this.prisma.purchaseOrder.findMany({
      where: this.canAccessAllProcurement(user) ? {} : { branchId: user.branchId },
      include: { supplier: true, branch: true, items: true, shipments: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  purchaseOrder(user: AuthUser, id: string) {
    return this.prisma.purchaseOrder.findFirst({
      where: { id, ...(this.canAccessAllProcurement(user) ? {} : { branchId: user.branchId }) },
      include: { supplier: true, branch: true, items: true, shipments: { include: { events: true } } },
    });
  }

  updateStatus(user: AuthUser, id: string, dto: any) {
    return this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: dto.status },
      include: { supplier: true, branch: true, items: true },
    });
  }

  createShipment(dto: any) {
    return this.prisma.logisticsShipment.create({
      data: {
        purchaseOrderId: dto.purchaseOrderId,
        shipmentNumber: dto.shipmentNumber ?? `SHIP-${Date.now()}`,
        carrier: dto.carrier,
        originCity: dto.originCity,
        destinationCity: dto.destinationCity,
        status: dto.status,
        estimatedArrivalDate: dto.estimatedArrivalDate ? new Date(dto.estimatedArrivalDate) : undefined,
      },
      include: { purchaseOrder: true },
    });
  }

  shipments() {
    return this.prisma.logisticsShipment.findMany({
      include: { purchaseOrder: true, events: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  private procurementOrderInclude() {
    return {
      supplier: true,
      factory: true,
      hqWarehouse: true,
      createdBy: { select: { id: true, fullName: true, role: true } },
      approvedBy: { select: { id: true, fullName: true, role: true } },
      items: { include: { product: true, supplier: true, factory: true }, orderBy: { createdAt: 'asc' as const } },
      receivings: { include: { items: true }, orderBy: { createdAt: 'desc' as const } },
      differenceReports: { orderBy: { createdAt: 'desc' as const } },
    };
  }

  private assertCanManageProcurement(user: AuthUser) {
    if (this.canManageProcurement(user)) return;
    throw new ForbiddenException('You do not have permission to manage procurement orders');
  }

  private canManageProcurement(user: AuthUser) {
    const roles = user.roles?.length ? user.roles : [user.role];
    return roles.some((role) =>
      isFullAccessRole(role) ||
      role === Role.PROCUREMENT_MANAGER ||
      role === Role.SUPPLY_CHAIN_MANAGER
    );
  }

  private canViewProcurementCosts(user: AuthUser) {
    const roles = user.roles?.length ? user.roles : [user.role];
    return this.canManageProcurement(user) ||
      roles.some((role) => role === Role.FINANCE_MANAGER || role === Role.ACCOUNTANT || role === Role.WAREHOUSE_MANAGER);
  }

  assertCanViewProcurement(user: AuthUser) {
    if (this.canViewProcurementCosts(user)) return;
    throw new ForbiddenException('You do not have permission to view procurement orders');
  }

  private pickProcurementAuditFields(order: any) {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      supplierId: order.supplierId,
      factoryId: order.factoryId,
      hqWarehouseId: order.hqWarehouseId,
      currency: order.currency,
      purchaseDate: order.purchaseDate,
      exchangeRate: order.defaultYuanRate?.toString?.() ?? order.defaultYuanRate,
      defaultYuanRate: order.defaultYuanRate?.toString?.() ?? order.defaultYuanRate,
      defaultUsdRate: order.defaultUsdRate?.toString?.() ?? order.defaultUsdRate,
      cargoRateUsdPerKg: order.cargoRateUsdPerKg?.toString?.() ?? order.cargoRateUsdPerKg,
      totalCargoCostUsd: order.totalCargoCostUsd?.toString?.() ?? order.totalCargoCostUsd,
      totalCargoCostKgs: order.totalCargoCostKgs?.toString?.() ?? order.totalCargoCostKgs,
      totalNetWeightKg: order.totalNetWeightKg?.toString?.() ?? order.totalNetWeightKg,
      totalPackagingWeightKg: order.totalPackagingWeightKg?.toString?.() ?? order.totalPackagingWeightKg,
      totalYuan: order.totalYuan?.toString?.() ?? order.totalYuan,
      totalTransportCostKgs: order.totalTransportCostKgs?.toString?.() ?? order.totalTransportCostKgs,
      totalCostKgs: order.totalCostKgs?.toString?.() ?? order.totalCostKgs,
      totalWeightKg: order.totalWeightKg?.toString?.() ?? order.totalWeightKg,
      costPerKg: order.costPerKg?.toString?.() ?? order.costPerKg,
      chinaDomesticTransportKgs: order.chinaDomesticTransportKgs?.toString?.() ?? order.chinaDomesticTransportKgs,
      chinaExportTransportKgs: order.chinaExportTransportKgs?.toString?.() ?? order.chinaExportTransportKgs,
      localTransportKgs: order.localTransportKgs?.toString?.() ?? order.localTransportKgs,
      packagingCostKgs: order.packagingCostKgs?.toString?.() ?? order.packagingCostKgs,
      customsCostKgs: order.customsCostKgs?.toString?.() ?? order.customsCostKgs,
      insuranceCostKgs: order.insuranceCostKgs?.toString?.() ?? order.insuranceCostKgs,
      bankFeeCostKgs: order.bankFeeCostKgs?.toString?.() ?? order.bankFeeCostKgs,
      otherExpenseKgs: order.otherExpenseKgs?.toString?.() ?? order.otherExpenseKgs,
      items: order.items?.map((item: any) => ({
        id: item.id,
        productId: item.productId,
        sku: item.sku,
        quantity: item.quantity,
        receivedQuantity: item.receivedQuantity,
        purchasePriceYuan: item.purchasePriceYuan?.toString?.() ?? item.purchasePriceYuan,
        yuanRate: item.yuanRate?.toString?.() ?? item.yuanRate,
        weightKg: item.weightKg?.toString?.() ?? item.weightKg,
        netWeightKg: item.netWeightKg?.toString?.() ?? item.netWeightKg,
        packagingWeightKg: item.packagingWeightKg?.toString?.() ?? item.packagingWeightKg,
        packagingType: item.packagingType,
        directPackagingCostKgs: item.directPackagingCostKgs?.toString?.() ?? item.directPackagingCostKgs,
        finalCostKgs: item.finalCostKgs?.toString?.() ?? item.finalCostKgs,
      })),
    };
  }

  private auditProcurement(
    tx: any,
    user: AuthUser,
    action: string,
    entityId: string,
    oldValue: unknown,
    newValue: unknown,
    reason?: string,
    extra?: Record<string, unknown>,
  ) {
    return tx.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action,
        entity: 'ProcurementOrder',
        entityId,
        metadata: {
          userId: user.id,
          userRole: user.role,
          roles: user.roles ?? [user.role],
          oldValue,
          newValue,
          reason: reason?.trim() || null,
          ...extra,
        },
      },
    });
  }

  private resolveBranchId(user: AuthUser, branchId?: string) {
    if (this.canAccessAllProcurement(user)) return branchId ?? user.branchId;
    if (branchId && branchId !== user.branchId) throw new ForbiddenException('Forbidden branch');
    return user.branchId;
  }

  private canAccessAllProcurement(user: AuthUser) {
    const roles = user.roles?.length ? user.roles : [user.role];
    return roles.some((role) =>
      isFullAccessRole(role) ||
      role === Role.PROCUREMENT_MANAGER ||
      role === Role.SUPPLY_CHAIN_MANAGER
    );
  }

  private hasRole(user: AuthUser, role: Role) {
    return (user.roles?.length ? user.roles : [user.role]).includes(role);
  }

  private assertCanEditSupplier(user: AuthUser) {
    if (!this.hasRole(user, Role.CEO) && !this.hasRole(user, Role.SUPPLY_CHAIN_MANAGER)) {
      throw new ForbiddenException('You do not have permission to edit suppliers');
    }
  }

  private validateExchangeRate(rate: number) {
    if (!rate || rate <= 0) {
      throw new BadRequestException('Exchange rate is required and must be greater than zero');
    }
  }

  private async resolveProcurementItemFromProduct(
    tx: any,
    item: {
      productId: string;
      quantity?: number;
      purchasePriceYuan?: number;
      note?: string;
      packagingWeightKg?: number;
      packagingType?: string;
      directPackagingCostKgs?: number;
    },
    orderSupplierId: string,
    orderFactoryId: string | null | undefined,
    exchangeRate: number,
  ): Promise<PreparedProcurementItem> {
    const product = await tx.product.findFirst({ where: { id: item.productId, deletedAt: null } });
    if (!product) throw new NotFoundException('Product not found');
    const weightKg = Number(product.weightKg);
    if (!weightKg || weightKg <= 0) {
      throw new BadRequestException(
        `Product weight is not configured for ${product.sku} (${product.name}). Please configure weight in Product Management.`,
      );
    }
    const quantity = Number(item.quantity ?? 0);
    if (quantity <= 0) {
      throw new BadRequestException(`Quantity must be greater than zero for ${product.sku}`);
    }
    return {
      productId: product.id,
      supplierId: product.defaultSupplierId ?? orderSupplierId,
      factoryId: product.defaultFactoryId ?? orderFactoryId ?? null,
      sku: product.sku,
      productName: product.name,
      unit: product.unit ?? 'pcs',
      quantity,
      purchasePriceYuan: Number(item.purchasePriceYuan ?? product.purchasePriceYuan ?? 0),
      yuanRate: exchangeRate,
      weightKg,
      packagingWeightKg: Number(item.packagingWeightKg ?? 0),
      packagingType: item.packagingType?.trim() || null,
      directPackagingCostKgs: Number(item.directPackagingCostKgs ?? 0),
      note: item.note,
    };
  }

  private resolveProcurementLogistics(dto: any, existing?: any) {
    const logistics = extractLogisticsCosts({
      chinaDomesticTransportKgs: dto.chinaDomesticTransportKgs ?? existing?.chinaDomesticTransportKgs,
      chinaExportTransportKgs: dto.chinaExportTransportKgs ?? existing?.chinaExportTransportKgs,
      localTransportKgs: dto.localTransportKgs ?? existing?.localTransportKgs,
      packagingCostKgs: dto.packagingCostKgs ?? existing?.packagingCostKgs,
      customsCostKgs: dto.customsCostKgs ?? existing?.customsCostKgs,
      insuranceCostKgs: dto.insuranceCostKgs ?? existing?.insuranceCostKgs,
      bankFeeCostKgs: dto.bankFeeCostKgs ?? existing?.bankFeeCostKgs,
      otherExpenseKgs: dto.otherExpenseKgs ?? existing?.otherExpenseKgs,
    });
    const cargo = extractCargoConfig({
      defaultUsdRate: dto.defaultUsdRate ?? existing?.defaultUsdRate,
      cargoRateUsdPerKg: dto.cargoRateUsdPerKg ?? existing?.cargoRateUsdPerKg,
    });
    this.validateCargoConfig(cargo);
    return { logistics, cargo };
  }

  private calculateProcurementLandedCosts(
    items: Array<{
      quantity: number;
      receivedQuantity?: number | null;
      purchasePriceYuan: number;
      yuanRate: number;
      weightKg: number;
      packagingWeightKg?: number;
      directPackagingCostKgs?: number;
    }>,
    logistics: ReturnType<typeof extractLogisticsCosts>,
    cargo: ReturnType<typeof extractCargoConfig>,
  ) {
    return calculateLandedCosts(items, logistics, { cargo });
  }

  private buildProcurementOrderTotals(
    calculated: LandedCostOrderResult,
    logistics: ReturnType<typeof extractLogisticsCosts>,
    cargo: ReturnType<typeof extractCargoConfig>,
  ) {
    const { logistics: resolvedLogistics } = buildLogisticsWithCargo(
      logistics,
      calculated.totalShipmentWeightKg,
      cargo,
    );
    return {
      ...resolvedLogistics,
      defaultUsdRate: cargo.usdRate,
      cargoRateUsdPerKg: cargo.cargoRateUsdPerKg,
      totalCargoCostUsd: calculated.totalCargoCostUsd,
      totalCargoCostKgs: calculated.totalCargoCostKgs,
      totalNetWeightKg: calculated.totalNetWeightKg,
      totalPackagingWeightKg: calculated.totalPackagingWeightKg,
      totalYuan: calculated.totalYuan,
      totalTransportCostKgs: calculated.totalTransportCostKgs,
      totalCostKgs: calculated.totalCostKgs,
      totalWeightKg: calculated.totalShipmentWeightKg,
      costPerKg: calculated.costPerKg,
    };
  }

  private mapCalculatedItemToPersisted(
    prepared: PreparedProcurementItem,
    item: LandedCostItemResult,
    exchangeRate: number,
  ) {
    return {
      productId: prepared.productId,
      supplierId: prepared.supplierId,
      factoryId: prepared.factoryId,
      sku: prepared.sku,
      productName: prepared.productName,
      unit: prepared.unit,
      quantity: prepared.quantity,
      purchasePriceYuan: item.purchasePriceYuan,
      yuanRate: exchangeRate,
      costKgs: item.costKgs,
      weightKg: item.netWeightKg,
      netWeightKg: item.netWeightKg,
      packagingWeightKg: item.packagingWeightKg ?? 0,
      packagingType: prepared.packagingType ?? null,
      directPackagingCostKgs: prepared.directPackagingCostKgs,
      totalWeightKg: item.totalWeightKg,
      chinaDomesticAllocKgs: item.chinaDomesticAllocKgs,
      chinaExportAllocKgs: item.chinaExportAllocKgs,
      localTransportAllocKgs: item.localTransportAllocKgs,
      packagingAllocKgs: item.packagingAllocKgs,
      customsAllocKgs: item.customsAllocKgs,
      insuranceAllocKgs: item.insuranceAllocKgs,
      bankFeeAllocKgs: item.bankFeeAllocKgs,
      otherAllocKgs: item.otherAllocKgs,
      transportCostKgs: item.transportCostKgs,
      finalCostKgs: item.finalCostKgs,
      totalYuan: item.totalYuan,
      totalCostKgs: item.totalCostKgs,
      note: prepared.note,
    };
  }

  private mapRecalculatedItemFields(item: LandedCostItemResult, exchangeRate: number) {
    return {
      yuanRate: exchangeRate,
      costKgs: item.costKgs,
      weightKg: item.netWeightKg,
      netWeightKg: item.netWeightKg,
      packagingWeightKg: item.packagingWeightKg ?? 0,
      totalWeightKg: item.totalWeightKg,
      chinaDomesticAllocKgs: item.chinaDomesticAllocKgs,
      chinaExportAllocKgs: item.chinaExportAllocKgs,
      localTransportAllocKgs: item.localTransportAllocKgs,
      packagingAllocKgs: item.packagingAllocKgs,
      customsAllocKgs: item.customsAllocKgs,
      insuranceAllocKgs: item.insuranceAllocKgs,
      bankFeeAllocKgs: item.bankFeeAllocKgs,
      otherAllocKgs: item.otherAllocKgs,
      transportCostKgs: item.transportCostKgs,
      finalCostKgs: item.finalCostKgs,
      totalYuan: item.totalYuan,
      totalCostKgs: item.totalCostKgs,
    };
  }

  private validateCargoConfig(cargo: ReturnType<typeof extractCargoConfig>) {
    if (cargo.cargoRateUsdPerKg > 0 && (!cargo.usdRate || cargo.usdRate <= 0)) {
      throw new BadRequestException('USD exchange rate is required when cargo rate is set');
    }
  }

  private auditProcurementLogisticsChanges(
    tx: any,
    user: AuthUser,
    entityId: string,
    oldValue: any,
    newValue: any,
  ) {
    const audits: Array<{ action: string; extra?: Record<string, unknown> }> = [];
    if (String(oldValue?.defaultUsdRate ?? '') !== String(newValue?.defaultUsdRate ?? '')) {
      audits.push({
        action: 'USD_RATE_CHANGED',
        extra: { oldUsdRate: oldValue?.defaultUsdRate, newUsdRate: newValue?.defaultUsdRate },
      });
    }
    if (String(oldValue?.cargoRateUsdPerKg ?? '') !== String(newValue?.cargoRateUsdPerKg ?? '')) {
      audits.push({
        action: 'CARGO_RATE_CHANGED',
        extra: {
          oldCargoRateUsdPerKg: oldValue?.cargoRateUsdPerKg,
          newCargoRateUsdPerKg: newValue?.cargoRateUsdPerKg,
        },
      });
    }
    const oldItems = JSON.stringify(oldValue?.items ?? []);
    const newItems = JSON.stringify(newValue?.items ?? []);
    if (oldItems !== newItems) {
      const packagingChanged = (oldValue?.items ?? []).some((item: any, index: number) => {
        const next = (newValue?.items ?? [])[index];
        return next && (
          String(item.packagingWeightKg ?? '') !== String(next.packagingWeightKg ?? '') ||
          String(item.packagingType ?? '') !== String(next.packagingType ?? '') ||
          String(item.directPackagingCostKgs ?? '') !== String(next.directPackagingCostKgs ?? '')
        );
      });
      if (packagingChanged) {
        audits.push({ action: 'PACKAGING_CHANGED' });
      }
      const transportChanged = String(oldValue?.chinaDomesticTransportKgs ?? '') !== String(newValue?.chinaDomesticTransportKgs ?? '') ||
        String(oldValue?.chinaExportTransportKgs ?? '') !== String(newValue?.chinaExportTransportKgs ?? '') ||
        String(oldValue?.localTransportKgs ?? '') !== String(newValue?.localTransportKgs ?? '') ||
        String(oldValue?.totalCargoCostKgs ?? '') !== String(newValue?.totalCargoCostKgs ?? '');
      if (transportChanged) {
        audits.push({ action: 'TRANSPORTATION_CHANGED' });
      }
      audits.push({ action: 'LANDED_COST_RECALCULATED' });
    }
    return Promise.all(audits.map((entry) =>
      this.auditProcurement(tx, user, entry.action, entityId, oldValue, newValue, undefined, entry.extra),
    ));
  }

  private validateSupplierPayload(dto: any) {
    if (!dto.name?.trim()) throw new BadRequestException('Supplier name is required');
    if (dto.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dto.email)) {
      throw new BadRequestException('Invalid email format');
    }
    const phone = dto.phone ?? dto.mobile ?? dto.whatsapp;
    if (phone && !/^[+\d\s().-]{5,}$/.test(String(phone))) {
      throw new BadRequestException('Invalid phone format');
    }
    if (dto.website && !/^https?:\/\/.+\..+/.test(dto.website)) {
      throw new BadRequestException('Invalid website format');
    }
  }

  private mergeSupplierNotes(existingNotes: string | null, dto: any) {
    const extras = {
      contactPerson: dto.contactPerson,
      mobile: dto.mobile,
      whatsapp: dto.whatsapp,
      telegram: dto.telegram,
      supplierType: dto.supplierType,
      moq: dto.moq,
      leadTimeDays: dto.leadTimeDays,
      currency: dto.currency,
      paymentTerms: dto.paymentTerms,
      incoterms: dto.incoterms,
      bankInformation: dto.bankInformation,
      taxNumber: dto.taxNumber,
      qualityScore: dto.qualityScore,
      deliveryScore: dto.deliveryScore,
      overallRating: dto.overallRating,
      publicNotes: dto.publicNotes,
      files: dto.files,
    };
    const cleanExtras = Object.fromEntries(
      Object.entries(extras).filter(([, value]) => value !== undefined && value !== ''),
    );
    const internalNotes = dto.notes ?? existingNotes ?? '';
    return JSON.stringify({ internalNotes, ...cleanExtras });
  }

  private splitList(value: unknown) {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return undefined;
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }

  private pickSupplierAuditFields(supplier: any) {
    return {
      name: supplier.name,
      companyName: supplier.companyName,
      country: supplier.country,
      city: supplier.city,
      address: supplier.address,
      wechat: supplier.wechat,
      phone: supplier.phone,
      email: supplier.email,
      website: supplier.website,
      productTypes: supplier.productTypes,
      reliabilityScore: supplier.reliabilityScore?.toString?.() ?? supplier.reliabilityScore,
      notes: supplier.notes,
      isActive: supplier.isActive,
      deletedAt: supplier.deletedAt,
    };
  }

  private changedFields(oldValue: Record<string, unknown>, newValue: Record<string, unknown>) {
    return Object.keys(newValue).filter((key) => JSON.stringify(oldValue[key]) !== JSON.stringify(newValue[key]));
  }

  private auditSupplierUpdate(
    tx: any,
    user: AuthUser,
    supplierId: string,
    changedFields: string[],
    oldValue: unknown,
    newValue: unknown,
  ) {
    return tx.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: 'UPDATE_SUPPLIER',
        entity: 'Supplier',
        entityId: supplierId,
        metadata: {
          userId: user.id,
          userRole: user.role,
          roles: user.roles ?? [user.role],
          supplierId,
          changedFields,
          oldValue,
          newValue,
        },
      },
    });
  }

  private auditSupplierDelete(
    tx: any,
    user: AuthUser,
    supplier: { id: string; name: string },
    oldValue: unknown,
    newValue: unknown,
    reason: string | undefined,
    relationCounts: Record<string, number>,
  ) {
    return tx.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: 'DELETE_SUPPLIER',
        entity: 'Supplier',
        entityId: supplier.id,
        metadata: {
          actorUserId: user.id,
          actorRole: Role.CEO,
          supplierId: supplier.id,
          supplierName: supplier.name,
          oldValue,
          newValue,
          reason: reason?.trim() || null,
          relationCounts,
        },
      },
    });
  }

  private roundMoney(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
