import { ForbiddenException, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProcurementService {
  constructor(private readonly prisma: PrismaService) {}

  createSupplier(dto: any) {
    return this.prisma.supplier.create({
      data: {
        name: dto.name,
        companyName: dto.companyName,
        country: dto.country ?? 'China',
        city: dto.city,
        wechat: dto.wechat,
        phone: dto.phone,
        email: dto.email,
        productTypes: dto.productTypes ?? [],
        reliabilityScore: Number(dto.reliabilityScore ?? 0),
        notes: dto.notes,
        isActive: dto.isActive ?? true,
      },
    });
  }

  suppliers() {
    return this.prisma.supplier.findMany({ orderBy: { createdAt: 'desc' } });
  }

  supplier(id: string) {
    return this.prisma.supplier.findUnique({ where: { id }, include: { contacts: true, purchaseOrders: true } });
  }

  updateSupplier(id: string, dto: any) {
    return this.prisma.supplier.update({ where: { id }, data: dto });
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

  private resolveBranchId(user: AuthUser, branchId?: string) {
    if (user.role === Role.OWNER) return branchId ?? user.branchId;
    if (branchId && branchId !== user.branchId) throw new ForbiddenException('Forbidden branch');
    return user.branchId;
  }
}
