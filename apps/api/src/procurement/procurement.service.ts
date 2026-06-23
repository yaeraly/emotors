import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ProcurementOrderStatus, Role, StockMovementType } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';

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

  updateSupplier(id: string, dto: any) {
    return this.prisma.supplier.update({ where: { id }, data: dto });
  }

  deleteSupplier(id: string) {
    return this.prisma.supplier.update({ where: { id }, data: { isActive: false, deletedAt: new Date() } });
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
        const quantity = Number(item.quantity ?? 0);
        const purchasePriceYuan = Number(item.purchasePriceYuan ?? 0);
        const yuanRate = Number(item.yuanRate ?? 0);
        const costKgs = this.roundMoney(purchasePriceYuan * yuanRate);
        const transportCostKgs = Number(item.transportCostKgs ?? 0);
        const finalCostKgs = this.roundMoney(costKgs + transportCostKgs);
        items.push({
          productId: product.id,
          sku: product.sku,
          productName: product.name,
          quantity,
          purchasePriceYuan,
          yuanRate,
          costKgs,
          weightKg: Number(item.weightKg ?? 0),
          transportCostKgs,
          finalCostKgs,
          totalYuan: this.roundMoney(quantity * purchasePriceYuan),
          totalCostKgs: this.roundMoney(quantity * finalCostKgs),
        });
      }
      const totalYuan = this.roundMoney(items.reduce((sum, item) => sum + item.totalYuan, 0));
      const totalTransportCostKgs = this.roundMoney(items.reduce((sum, item) => sum + item.transportCostKgs * item.quantity, 0));
      const totalCostKgs = this.roundMoney(items.reduce((sum, item) => sum + item.totalCostKgs, 0));

      return tx.procurementOrder.create({
        data: {
          orderNumber: dto.orderNumber ?? `PROC-${Date.now()}`,
          supplierId: supplier.id,
          factoryId: factory?.id,
          hqWarehouseId: warehouse.id,
          status: ProcurementOrderStatus.DRAFT,
          totalYuan,
          totalTransportCostKgs,
          totalCostKgs,
          estimatedArrivalDate: dto.estimatedArrivalDate ? new Date(dto.estimatedArrivalDate) : undefined,
          note: dto.note,
          createdById: user.id,
          items: { create: items },
        },
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

  updateProcurementOrder(id: string, dto: any) {
    return this.prisma.procurementOrder.update({
      where: { id },
      data: {
        estimatedArrivalDate: dto.estimatedArrivalDate ? new Date(dto.estimatedArrivalDate) : undefined,
        note: dto.note,
      },
      include: this.procurementOrderInclude(),
    });
  }

  updateProcurementStatus(user: AuthUser, id: string, status: ProcurementOrderStatus) {
    if (status === ProcurementOrderStatus.ARRIVED) {
      return this.markProcurementArrived(user, id);
    }
    const data: any = { status };
    if (status === ProcurementOrderStatus.APPROVED) {
      data.approvedById = user.id;
      data.approvedAt = new Date();
    }
    if (status === ProcurementOrderStatus.PAID) data.paidAt = new Date();
    if (status === ProcurementOrderStatus.SHIPPED_TO_YIWU) data.shippedAt = new Date();
    return this.prisma.procurementOrder.update({ where: { id }, data, include: this.procurementOrderInclude() });
  }

  private markProcurementArrived(user: AuthUser, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.procurementOrder.findFirst({
        where: { id, deletedAt: null },
        include: { items: true, hqWarehouse: true },
      });
      if (!order) throw new NotFoundException('Procurement order not found');
      if (order.status === ProcurementOrderStatus.ARRIVED) {
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
      where: user.role === Role.OWNER ? {} : { branchId: user.branchId },
      include: { supplier: true, branch: true, items: true, shipments: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  purchaseOrder(user: AuthUser, id: string) {
    return this.prisma.purchaseOrder.findFirst({
      where: { id, ...(user.role === Role.OWNER ? {} : { branchId: user.branchId }) },
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
      items: { include: { product: true } },
    };
  }

  private resolveBranchId(user: AuthUser, branchId?: string) {
    if (user.role === Role.OWNER) return branchId ?? user.branchId;
    if (branchId && branchId !== user.branchId) throw new ForbiddenException('Forbidden branch');
    return user.branchId;
  }

  private roundMoney(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
