import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CustomerEventType,
  Prisma,
  RepairStatus,
  Role,
  ServiceOrderStatus,
  StockMovementType,
  WarrantyStatus,
} from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { CommissionsService } from '../commissions/commissions.service';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { AddDiagnosisDto } from './dto/add-diagnosis.dto';
import { AddPartsDto } from './dto/add-parts.dto';
import { AddRepairDto } from './dto/add-repair.dto';
import { CompleteServiceOrderDto } from './dto/complete-service-order.dto';
import { CreateServiceOrderDto } from './dto/create-service-order.dto';

type PrismaTx = Prisma.TransactionClient;

@Injectable()
export class ServiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly commissionsService: CommissionsService,
  ) {}

  async create(user: AuthUser, dto: CreateServiceOrderDto) {
    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findFirst({
        where: { id: dto.customerId, deletedAt: null },
      });
      if (!customer) throw new NotFoundException('Customer not found');
      const branchId = this.resolveBranchId(user, dto.branchId ?? customer.branchId);
      if (customer.branchId !== branchId) {
        throw new BadRequestException('Customer does not belong to branch');
      }
      const master = await tx.user.findFirst({
        where: { id: dto.masterId, role: Role.MASTER, branchId },
      });
      if (!master) throw new NotFoundException('Master not found');
      const order = await tx.serviceOrder.create({
        data: {
          orderNumber: await this.generateOrderNumber(tx),
          branchId,
          customerId: customer.id,
          masterId: master.id,
          problemDescription: dto.problemDescription,
          status: ServiceOrderStatus.NEW,
          createdById: user.id,
        },
        include: this.include(),
      });
      return this.toResponse(order);
    });
  }

  list(user: AuthUser, branchId?: string) {
    const where: Prisma.ServiceOrderWhereInput = {
      deletedAt: null,
      ...(this.orderAccessWhere(user, branchId)),
    };
    return this.prisma.serviceOrder.findMany({
      where,
      include: this.include(),
      orderBy: { createdAt: 'desc' },
    }).then((orders) => orders.map((order) => this.toResponse(order)));
  }

  masters(user: AuthUser, branchId?: string) {
    return this.prisma.user.findMany({
      where: {
        role: Role.MASTER,
        ...(user.role === Role.OWNER
          ? branchId
            ? { branchId }
            : {}
          : { branchId: user.branchId }),
      },
      select: { id: true, fullName: true, email: true, role: true, branchId: true },
      orderBy: { fullName: 'asc' },
    });
  }

  async detail(user: AuthUser, id: string) {
    const order = await this.getOrder(user, id);
    return this.toResponse(order);
  }

  async update(user: AuthUser, id: string, dto: Partial<CreateServiceOrderDto>) {
    const order = await this.getOrder(user, id);
    const data: Prisma.ServiceOrderUpdateInput = {
      problemDescription: dto.problemDescription,
    };
    if (dto.masterId) {
      const master = await this.prisma.user.findFirst({
        where: { id: dto.masterId, role: Role.MASTER, branchId: order.branchId },
      });
      if (!master) throw new NotFoundException('Master not found');
      data.master = { connect: { id: master.id } };
    }
    return this.prisma.serviceOrder.update({
      where: { id },
      data,
      include: this.include(),
    }).then((updated) => this.toResponse(updated));
  }

  addDiagnosis(user: AuthUser, id: string, dto: AddDiagnosisDto) {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.getOrderInTx(tx, user, id);
      const diagnosisFee = this.roundMoney(dto.diagnosisFee ?? 0);
      await tx.diagnosis.create({
        data: {
          serviceOrderId: order.id,
          masterId: order.masterId,
          problem: dto.problem,
          result: dto.result,
          recommendedRepair: dto.recommendedRepair,
          diagnosisFee,
        },
      });
      const updated = await tx.serviceOrder.update({
        where: { id: order.id },
        data: {
          status: ServiceOrderStatus.DIAGNOSIS,
          diagnosisResult: dto.result,
          laborCost: { increment: diagnosisFee },
          totalAmount: { increment: diagnosisFee },
          debtAmount: { increment: diagnosisFee },
        },
        include: this.include(),
      });
      return this.toResponse(updated);
    });
  }

  addRepair(user: AuthUser, id: string, dto: AddRepairDto) {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.getOrderInTx(tx, user, id);
      const laborCost = this.roundMoney(dto.laborCost ?? 0);
      await tx.repair.create({
        data: {
          serviceOrderId: order.id,
          masterId: order.masterId,
          description: dto.description,
          laborCost,
          status: RepairStatus.IN_PROGRESS,
          startedAt: new Date(),
        },
      });
      const updated = await tx.serviceOrder.update({
        where: { id: order.id },
        data: {
          status: ServiceOrderStatus.IN_REPAIR,
          laborCost: { increment: laborCost },
          totalAmount: { increment: laborCost },
          debtAmount: { increment: laborCost },
        },
        include: this.include(),
      });
      return this.toResponse(updated);
    });
  }

  addParts(user: AuthUser, id: string, dto: AddPartsDto) {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.getOrderInTx(tx, user, id);
      const product = await tx.product.findFirst({
        where: { id: dto.productId, branchId: order.branchId, deletedAt: null },
      });
      if (!product) throw new NotFoundException('Product not found');
      const warehouse = await tx.warehouse.findFirst({
        where: { id: dto.warehouseId, branchId: order.branchId },
      });
      if (!warehouse) throw new NotFoundException('Warehouse not found');
      const unitCost = Number(product.finalCostKgs);
      const unitPrice = Number(dto.unitPrice ?? product.sellingPriceKgs);
      const totalCost = this.roundMoney(unitCost * dto.quantity);
      const totalPrice = this.roundMoney(unitPrice * dto.quantity);
      await this.inventoryService.createStockMovementInTx(tx, user, {
        productId: product.id,
        warehouseId: warehouse.id,
        type: StockMovementType.SERVICE_USE,
        quantity: dto.quantity,
        unitCostKgs: unitCost,
        referenceType: 'SERVICE_ORDER',
        referenceId: order.id,
        note: `Service order ${order.orderNumber}`,
      });
      await tx.partsConsumption.create({
        data: {
          serviceOrderId: order.id,
          productId: product.id,
          warehouseId: warehouse.id,
          quantity: dto.quantity,
          unitCost,
          unitPrice,
          totalCost,
          totalPrice,
          createdById: user.id,
        },
      });
      const updated = await tx.serviceOrder.update({
        where: { id: order.id },
        data: {
          status: ServiceOrderStatus.IN_REPAIR,
          partsCost: { increment: totalCost },
          totalAmount: { increment: totalPrice },
          debtAmount: { increment: totalPrice },
        },
        include: this.include(),
      });
      return this.toResponse(updated);
    });
  }

  complete(user: AuthUser, id: string, dto: CompleteServiceOrderDto) {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.getOrderInTx(tx, user, id);
      const updated = await tx.serviceOrder.update({
        where: { id: order.id },
        data: {
          status: ServiceOrderStatus.COMPLETED,
          completedAt: new Date(),
          warrantyUntil: dto.warrantyUntil,
        },
        include: this.include(),
      });
      if (dto.warrantyUntil) {
        const firstPart = order.parts[0];
        await tx.warranty.create({
          data: {
            serviceOrderId: order.id,
            customerId: order.customerId,
            productId: firstPart?.productId,
            branchId: order.branchId,
            warrantyNumber: await this.generateWarrantyNumber(tx),
            startsAt: new Date(),
            expiresAt: dto.warrantyUntil,
            status: WarrantyStatus.ACTIVE,
          },
        });
      }
      await tx.customerEvent.create({
        data: {
          customerId: order.customerId,
          branchId: order.branchId,
          type: CustomerEventType.SERVICE,
          message: `Service order ${order.orderNumber} completed`,
          createdById: user.id,
        },
      });
      await this.commissionsService.createRepairCommission(tx, order.id);
      return this.toResponse(updated);
    });
  }

  async cancel(user: AuthUser, id: string) {
    const order = await this.getOrder(user, id);
    return this.prisma.serviceOrder.update({
      where: { id: order.id },
      data: { status: ServiceOrderStatus.CANCELLED, cancelledAt: new Date() },
      include: this.include(),
    }).then((updated) => this.toResponse(updated));
  }

  dailyReport(user: AuthUser, branchId?: string) {
    const today = new Date();
    const from = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return this.prisma.serviceOrder.findMany({
      where: {
        createdAt: { gte: from },
        ...(this.orderAccessWhere(user, branchId)),
      },
      select: { totalAmount: true, paidAmount: true, debtAmount: true, status: true },
    }).then((orders) => ({
      orderCount: orders.length,
      totalAmount: this.sum(orders.map((order) => order.totalAmount)),
      paidAmount: this.sum(orders.map((order) => order.paidAmount)),
      debtAmount: this.sum(orders.map((order) => order.debtAmount)),
      completedCount: orders.filter((order) => order.status === ServiceOrderStatus.COMPLETED).length,
    }));
  }

  warranties(user: AuthUser, branchId?: string) {
    return this.prisma.warranty.findMany({
      where: this.orderAccessWhere(user, branchId),
      include: { customer: true, product: true, branch: true, serviceOrder: true },
      orderBy: { expiresAt: 'desc' },
    });
  }

  async warranty(user: AuthUser, id: string) {
    const warranty = await this.prisma.warranty.findFirst({
      where: { id, ...(this.orderAccessWhere(user)) },
      include: { customer: true, product: true, branch: true, serviceOrder: true },
    });
    if (!warranty) throw new NotFoundException('Warranty not found');
    return warranty;
  }

  private include() {
    return {
      branch: true,
      customer: true,
      master: { select: { id: true, fullName: true, role: true } },
      createdBy: { select: { id: true, fullName: true, role: true } },
      diagnoses: true,
      repairs: true,
      parts: { include: { product: true, warehouse: true } },
      warranties: true,
    };
  }

  private async getOrder(user: AuthUser, id: string) {
    const order = await this.prisma.serviceOrder.findFirst({
      where: { id, deletedAt: null, ...(this.orderAccessWhere(user)) },
      include: this.include(),
    });
    if (!order) throw new NotFoundException('Service order not found');
    return order;
  }

  private async getOrderInTx(tx: PrismaTx, user: AuthUser, id: string) {
    const order = await tx.serviceOrder.findFirst({
      where: { id, deletedAt: null, ...(this.orderAccessWhere(user)) },
      include: { parts: true },
    });
    if (!order) throw new NotFoundException('Service order not found');
    return order;
  }

  private orderAccessWhere(user: AuthUser, branchId?: string) {
    if (user.role === Role.OWNER) return branchId ? { branchId } : {};
    if (user.role === Role.MASTER) return { masterId: user.id };
    if (branchId && branchId !== user.branchId) throw new ForbiddenException('Forbidden branch');
    return { branchId: user.branchId };
  }

  private resolveBranchId(user: AuthUser, branchId?: string) {
    if (user.role === Role.OWNER) return branchId ?? user.branchId;
    if (branchId && branchId !== user.branchId) throw new ForbiddenException('Forbidden branch');
    return user.branchId;
  }

  private async generateOrderNumber(tx: PrismaTx) {
    const count = await tx.serviceOrder.count();
    return `SO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(count + 1).padStart(5, '0')}`;
  }

  private async generateWarrantyNumber(tx: PrismaTx) {
    const count = await tx.warranty.count();
    return `W-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(count + 1).padStart(5, '0')}`;
  }

  private toResponse(order: any) {
    return {
      ...order,
      laborCost: Number(order.laborCost),
      partsCost: Number(order.partsCost),
      totalAmount: Number(order.totalAmount),
      paidAmount: Number(order.paidAmount),
      debtAmount: Number(order.debtAmount),
      diagnoses: order.diagnoses?.map((diagnosis: any) => ({ ...diagnosis, diagnosisFee: Number(diagnosis.diagnosisFee) })),
      repairs: order.repairs?.map((repair: any) => ({ ...repair, laborCost: Number(repair.laborCost) })),
      parts: order.parts?.map((part: any) => ({
        ...part,
        unitCost: Number(part.unitCost),
        unitPrice: Number(part.unitPrice),
        totalCost: Number(part.totalCost),
        totalPrice: Number(part.totalPrice),
      })),
    };
  }

  private sum(values: Prisma.Decimal[]) {
    return values.reduce((total, value) => total + Number(value), 0);
  }

  private roundMoney(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
