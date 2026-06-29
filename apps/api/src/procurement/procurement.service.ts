import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  LandedCostAllocationMethod,
  ProcurementAuditAction,
  ProcurementOrderStatus,
  ProcurementQuantityType,
  Role,
  StockMovementType,
} from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { isFullAccessRole } from '../rbac/rbac';
import { LandedCostEngineService } from './landed-cost/landed-cost-engine.service';
import {
  buildProcurementItemInput,
  persistLandedCostRecalculation,
  PROCUREMENT_STATUS_CHANGE_ROLES,
  userHasAnyRole,
} from './procurement-landed-cost.helpers';

@Injectable()
export class ProcurementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly landedCostEngine: LandedCostEngineService,
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
    return this.prisma.$transaction(async (tx) => {
      const [supplier, factory, warehouse] = await Promise.all([
        tx.supplier.findFirst({ where: { id: dto.supplierId, deletedAt: null } }),
        dto.factoryId ? tx.factory.findFirst({ where: { id: dto.factoryId, deletedAt: null } }) : Promise.resolve(null),
        tx.warehouse.findUnique({ where: { id: dto.hqWarehouseId } }),
      ]);
      if (!supplier) throw new NotFoundException('Supplier not found');
      if (dto.factoryId && !factory) throw new NotFoundException('Factory not found');
      if (!warehouse) throw new NotFoundException('HQ warehouse not found');

      const itemInputs = dto.items ?? [];
      const items = [];
      for (const item of itemInputs) {
        const product = await tx.product.findFirst({ where: { id: item.productId, deletedAt: null } });
        if (!product) throw new NotFoundException('Product not found');
        items.push(buildProcurementItemInput(item, product, supplier.id, factory?.id, this.roundMoney.bind(this)));
      }

      const order = await tx.procurementOrder.create({
        data: {
          orderNumber: dto.orderNumber ?? `PROC-${Date.now()}`,
          supplierId: supplier.id,
          factoryId: factory?.id,
          hqWarehouseId: warehouse.id,
          status: ProcurementOrderStatus.DRAFT,
          allocationMethod: dto.allocationMethod ?? LandedCostAllocationMethod.BY_WEIGHT,
          chinaLocalShippingKgs: Number(dto.chinaLocalShippingKgs ?? 0),
          packagingCostKgs: Number(dto.packagingCostKgs ?? 0),
          internationalShippingKgs: Number(dto.internationalShippingKgs ?? 0),
          insuranceKgs: Number(dto.insuranceKgs ?? 0),
          customsKgs: Number(dto.customsKgs ?? 0),
          bankFeesKgs: Number(dto.bankFeesKgs ?? 0),
          otherExpensesKgs: Number(dto.otherExpensesKgs ?? 0),
          estimatedArrivalDate: dto.estimatedArrivalDate ? new Date(dto.estimatedArrivalDate) : undefined,
          note: dto.note,
          createdById: user.id,
          items: { create: items },
        },
        include: { items: true },
      });

      await persistLandedCostRecalculation(tx, user, order, 'ORDER_CREATED', this.landedCostDeps());
      await tx.procurementStatusHistory.create({
        data: {
          procurementOrderId: order.id,
          oldStatus: null,
          newStatus: ProcurementOrderStatus.DRAFT,
          changedById: user.id,
          reason: 'Order created',
        },
      });

      return tx.procurementOrder.findUnique({
        where: { id: order.id },
        include: this.procurementOrderInclude(),
      });
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
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.procurementOrder.findFirst({ where: { id, deletedAt: null }, include: { items: true } });
      if (!order) throw new NotFoundException('Procurement order not found');

      const oldSupplierId = order.supplierId;
      const oldFactoryId = order.factoryId;

      await tx.procurementOrder.update({
        where: { id },
        data: {
          supplierId: dto.supplierId,
          factoryId: dto.factoryId,
          estimatedArrivalDate: dto.estimatedArrivalDate ? new Date(dto.estimatedArrivalDate) : undefined,
          note: dto.note,
        },
      });

      if (dto.supplierId && dto.supplierId !== oldSupplierId) {
        await this.auditProcurement(tx, user, id, ProcurementAuditAction.SUPPLIER_CHANGE, { supplierId: oldSupplierId }, { supplierId: dto.supplierId }, dto.reason);
      }
      if (dto.factoryId && dto.factoryId !== oldFactoryId) {
        await this.auditProcurement(tx, user, id, ProcurementAuditAction.FACTORY_CHANGE, { factoryId: oldFactoryId }, { factoryId: dto.factoryId }, dto.reason);
      }

      const updated = await tx.procurementOrder.findUnique({ where: { id }, include: { items: true } });
      await persistLandedCostRecalculation(tx, user, updated!, 'ORDER_UPDATED', this.landedCostDeps());
      return tx.procurementOrder.findUnique({ where: { id }, include: this.procurementOrderInclude() });
    });
  }

  updateProcurementTransportCosts(user: AuthUser, id: string, dto: any) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.procurementOrder.findFirst({ where: { id, deletedAt: null }, include: { items: true } });
      if (!order) throw new NotFoundException('Procurement order not found');

      const oldValue = {
        chinaLocalShippingKgs: order.chinaLocalShippingKgs,
        packagingCostKgs: order.packagingCostKgs,
        internationalShippingKgs: order.internationalShippingKgs,
        insuranceKgs: order.insuranceKgs,
        customsKgs: order.customsKgs,
        bankFeesKgs: order.bankFeesKgs,
        otherExpensesKgs: order.otherExpensesKgs,
      };

      const updated = await tx.procurementOrder.update({
        where: { id },
        data: {
          chinaLocalShippingKgs: dto.chinaLocalShippingKgs ?? order.chinaLocalShippingKgs,
          packagingCostKgs: dto.packagingCostKgs ?? order.packagingCostKgs,
          internationalShippingKgs: dto.internationalShippingKgs ?? order.internationalShippingKgs,
          insuranceKgs: dto.insuranceKgs ?? order.insuranceKgs,
          customsKgs: dto.customsKgs ?? order.customsKgs,
          bankFeesKgs: dto.bankFeesKgs ?? order.bankFeesKgs,
          otherExpensesKgs: dto.otherExpensesKgs ?? order.otherExpensesKgs,
        },
        include: { items: true },
      });

      await this.auditProcurement(tx, user, id, ProcurementAuditAction.TRANSPORTATION_CHANGE, oldValue, {
        chinaLocalShippingKgs: updated.chinaLocalShippingKgs,
        packagingCostKgs: updated.packagingCostKgs,
        internationalShippingKgs: updated.internationalShippingKgs,
        insuranceKgs: updated.insuranceKgs,
        customsKgs: updated.customsKgs,
        bankFeesKgs: updated.bankFeesKgs,
        otherExpensesKgs: updated.otherExpensesKgs,
      }, dto.reason);

      await persistLandedCostRecalculation(tx, user, updated, 'TRANSPORT_COSTS_UPDATED', this.landedCostDeps());
      return tx.procurementOrder.findUnique({ where: { id }, include: this.procurementOrderInclude() });
    });
  }

  updateAllocationMethod(user: AuthUser, id: string, allocationMethod: LandedCostAllocationMethod, reason?: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.procurementOrder.findFirst({ where: { id, deletedAt: null }, include: { items: true } });
      if (!order) throw new NotFoundException('Procurement order not found');

      const updated = await tx.procurementOrder.update({
        where: { id },
        data: { allocationMethod },
        include: { items: true },
      });

      await this.auditProcurement(tx, user, id, ProcurementAuditAction.ALLOCATION_METHOD_CHANGE, { allocationMethod: order.allocationMethod }, { allocationMethod }, reason);
      await persistLandedCostRecalculation(tx, user, updated, 'ALLOCATION_METHOD_CHANGED', this.landedCostDeps());
      return tx.procurementOrder.findUnique({ where: { id }, include: this.procurementOrderInclude() });
    });
  }

  recalculateLandedCost(user: AuthUser, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.procurementOrder.findFirst({ where: { id, deletedAt: null }, include: { items: true } });
      if (!order) throw new NotFoundException('Procurement order not found');
      await persistLandedCostRecalculation(tx, user, order, 'MANUAL_RECALCULATION', this.landedCostDeps());
      return tx.procurementOrder.findUnique({ where: { id }, include: this.procurementOrderInclude() });
    });
  }

  updateProcurementItem(user: AuthUser, orderId: string, itemId: string, dto: any) {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.procurementOrderItem.findFirst({ where: { id: itemId, orderId } });
      if (!item) throw new NotFoundException('Procurement item not found');

      const updates: any = {};
      if (dto.purchasePriceYuan != null && Number(dto.purchasePriceYuan) !== Number(item.purchasePriceYuan)) {
        const oldPrice = Number(item.purchasePriceYuan);
        const newPrice = Number(dto.purchasePriceYuan);
        updates.purchasePriceYuan = newPrice;
        await tx.procurementPriceHistory.create({
          data: {
            procurementItemId: item.id,
            oldPriceYuan: oldPrice,
            newPriceYuan: newPrice,
            reason: dto.reason,
            changedById: user.id,
          },
        });
        await this.auditProcurement(tx, user, orderId, ProcurementAuditAction.PRICE_CHANGE, { itemId, oldPrice }, { itemId, newPrice }, dto.reason, itemId);
      }

      const quantityFields: Array<[ProcurementQuantityType, string, keyof typeof item]> = [
        [ProcurementQuantityType.ORDERED, 'quantity', 'quantity'],
        [ProcurementQuantityType.CONFIRMED, 'confirmedQuantity', 'confirmedQuantity'],
        [ProcurementQuantityType.SHIPPED, 'shippedQuantity', 'shippedQuantity'],
        [ProcurementQuantityType.RECEIVED, 'receivedQuantity', 'receivedQuantity'],
      ];

      for (const [type, dtoKey, field] of quantityFields) {
        if (dto[dtoKey] != null && Number(dto[dtoKey]) !== Number(item[field] ?? 0)) {
          const oldQty = Number(item[field] ?? item.quantity);
          const newQty = Number(dto[dtoKey]);
          updates[dtoKey] = newQty;
          await tx.procurementQuantityHistory.create({
            data: {
              procurementItemId: item.id,
              quantityType: type,
              oldQuantity: oldQty,
              newQuantity: newQty,
              reason: dto.reason,
              changedById: user.id,
            },
          });
          await this.auditProcurement(tx, user, orderId, ProcurementAuditAction.QUANTITY_CHANGE, { itemId, type, oldQty }, { itemId, type, newQty }, dto.reason, itemId);
        }
      }

      if (dto.factoryId != null) updates.factoryId = dto.factoryId;
      if (dto.supplierId != null) updates.supplierId = dto.supplierId;
      if (dto.currency != null) updates.currency = dto.currency;
      if (dto.moq != null) updates.moq = Number(dto.moq);
      if (dto.weightKg != null) updates.weightKg = Number(dto.weightKg);
      if (dto.yuanRate != null) updates.yuanRate = Number(dto.yuanRate);
      if (dto.estimatedArrivalDate != null) updates.estimatedArrivalDate = new Date(dto.estimatedArrivalDate);
      if (dto.notes != null) updates.notes = dto.notes;
      if (dto.manualAllocationKgs != null) updates.manualAllocationKgs = Number(dto.manualAllocationKgs);

      if (Object.keys(updates).length) {
        await tx.procurementOrderItem.update({ where: { id: itemId }, data: updates });
      }

      const order = await tx.procurementOrder.findUnique({ where: { id: orderId }, include: { items: true } });
      await persistLandedCostRecalculation(tx, user, order!, 'ITEM_UPDATED', this.landedCostDeps());
      return tx.procurementOrder.findUnique({ where: { id: orderId }, include: this.procurementOrderInclude() });
    });
  }

  procurementOrderHistory(orderId: string) {
    return this.prisma.$transaction([
      this.prisma.procurementStatusHistory.findMany({
        where: { procurementOrderId: orderId },
        include: { changedBy: { select: { id: true, fullName: true, role: true } } },
        orderBy: { changedAt: 'asc' },
      }),
      this.prisma.procurementAuditEntry.findMany({
        where: { procurementOrderId: orderId },
        include: { user: { select: { id: true, fullName: true, role: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.procurementCostRecalculation.findMany({
        where: { procurementOrderId: orderId },
        orderBy: { recalculatedAt: 'desc' },
        take: 20,
      }),
      this.prisma.procurementPriceHistory.findMany({
        where: { procurementItem: { orderId } },
        include: { changedBy: { select: { id: true, fullName: true, role: true } }, procurementItem: { select: { sku: true, productName: true } } },
        orderBy: { changedAt: 'desc' },
      }),
      this.prisma.procurementQuantityHistory.findMany({
        where: { procurementItem: { orderId } },
        include: { changedBy: { select: { id: true, fullName: true, role: true } }, procurementItem: { select: { sku: true, productName: true } } },
        orderBy: { changedAt: 'desc' },
      }),
      this.prisma.procurementDifferenceReport.findMany({
        where: { procurementOrderId: orderId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.procurementGoodsReceiving.findMany({
        where: { procurementOrderId: orderId, deletedAt: null },
        include: { items: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]).then(([statusHistory, auditHistory, costRecalculations, priceHistory, quantityHistory, shortageReports, receivings]) => ({
      statusHistory,
      auditHistory,
      costRecalculations,
      priceHistory,
      quantityHistory,
      shortageReports,
      receivings,
    }));
  }

  updateProcurementStatus(user: AuthUser, id: string, status: ProcurementOrderStatus, reason?: string) {
    if (!userHasAnyRole(user, PROCUREMENT_STATUS_CHANGE_ROLES) && !isFullAccessRole(user.role)) {
      throw new ForbiddenException('Only CEO or Supply Chain Manager can change procurement status');
    }

    if (status === ProcurementOrderStatus.ARRIVED || status === ProcurementOrderStatus.RECEIVED_TO_HQ_WAREHOUSE) {
      return this.markProcurementArrived(user, id);
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.procurementOrder.findFirst({ where: { id, deletedAt: null } });
      if (!order) throw new NotFoundException('Procurement order not found');

      const data: any = { status };
      if (status === ProcurementOrderStatus.APPROVED || status === ProcurementOrderStatus.SUPPLIER_CONFIRMED) {
        data.approvedById = user.id;
        data.approvedAt = new Date();
      }
      if (status === ProcurementOrderStatus.PAID) data.paidAt = new Date();
      if (status === ProcurementOrderStatus.SHIPPED_TO_YIWU || status === ProcurementOrderStatus.READY_TO_SHIP) data.shippedAt = new Date();
      if (status === ProcurementOrderStatus.ARRIVED_AT_HQ_WAREHOUSE) data.arrivedAt = new Date();

      await tx.procurementStatusHistory.create({
        data: {
          procurementOrderId: id,
          oldStatus: order.status,
          newStatus: status,
          reason,
          changedById: user.id,
        },
      });
      await this.auditProcurement(tx, user, id, ProcurementAuditAction.STATUS_CHANGE, { status: order.status }, { status }, reason);

      return tx.procurementOrder.update({ where: { id }, data, include: this.procurementOrderInclude() });
    });
  }

  private markProcurementArrived(user: AuthUser, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.procurementOrder.findFirst({
        where: { id, deletedAt: null },
        include: { items: true, hqWarehouse: true },
      });
      if (!order) throw new NotFoundException('Procurement order not found');
      if (order.hqStockMovementCreatedAt || order.status === ProcurementOrderStatus.RECEIVED_TO_HQ_WAREHOUSE) {
        return this.prisma.procurementOrder.findUnique({ where: { id }, include: this.procurementOrderInclude() });
      }

      for (const item of order.items) {
        await this.inventoryService.createStockMovementInTx(tx, user, {
          productId: item.productId,
          warehouseId: order.hqWarehouseId,
          type: StockMovementType.IN,
          quantity: item.quantity,
          unitCostKgs: Number(item.finalCostKgs),
          referenceType: 'PROCUREMENT_ORDER',
          referenceId: order.id,
          note: `Procurement ${order.orderNumber}`,
        });
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (product) {
          const sellingPriceKgs = Number(product.sellingPriceKgs);
          const marginAmount = this.roundMoney(sellingPriceKgs - Number(item.finalCostKgs));
          const marginPercent = sellingPriceKgs === 0 ? 0 : this.roundMoney((marginAmount / sellingPriceKgs) * 100);
          await tx.product.update({
            where: { id: item.productId },
            data: {
              purchasePriceYuan: item.purchasePriceYuan,
              latestYuanRate: item.yuanRate,
              purchaseCostKgs: item.costKgs,
              transportCostKgs: item.transportCostKgs,
              finalCostKgs: item.finalCostKgs,
              marginAmount,
              marginPercent,
              priceHistory: {
                create: {
                  purchasePriceYuan: item.purchasePriceYuan,
                  yuanRate: item.yuanRate,
                  purchaseCostKgs: item.costKgs,
                  transportCostKgs: item.transportCostKgs,
                  finalCostKgs: item.finalCostKgs,
                  sellingPriceKgs,
                  marginAmount,
                  marginPercent,
                  createdById: user.id,
                },
              },
            },
          });
        }
      }

      return tx.procurementOrder.update({
        where: { id },
        data: {
          status: ProcurementOrderStatus.RECEIVED_TO_HQ_WAREHOUSE,
          arrivedAt: new Date(),
          actualArrivalDate: new Date(),
          receivedToHqAt: new Date(),
          hqStockMovementCreatedAt: new Date(),
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
      items: {
        include: {
          product: true,
          priceHistory: { orderBy: { changedAt: 'desc' as const }, take: 5 },
          quantityHistory: { orderBy: { changedAt: 'desc' as const }, take: 5 },
        },
      },
      statusHistory: {
        include: { changedBy: { select: { id: true, fullName: true, role: true } } },
        orderBy: { changedAt: 'asc' as const },
      },
      costRecalculations: { orderBy: { recalculatedAt: 'desc' as const }, take: 5 },
    };
  }

  private landedCostDeps() {
    return {
      landedCostEngine: this.landedCostEngine,
      roundMoney: this.roundMoney.bind(this),
      procurementOrderInclude: this.procurementOrderInclude.bind(this),
    };
  }

  private async auditProcurement(
    tx: any,
    user: AuthUser,
    orderId: string,
    action: ProcurementAuditAction,
    oldValue: unknown,
    newValue: unknown,
    reason?: string,
    entityId?: string,
  ) {
    return tx.procurementAuditEntry.create({
      data: {
        procurementOrderId: orderId,
        action,
        entityType: entityId ? 'ProcurementOrderItem' : 'ProcurementOrder',
        entityId,
        oldValue: oldValue as any,
        newValue: newValue as any,
        reason,
        userId: user.id,
        userRole: user.role,
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
