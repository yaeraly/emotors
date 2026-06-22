import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BranchDistributionOrderStatus, Prisma, Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDistributionOrderDto } from './dto/create-distribution-order.dto';
import { DistributionOrderQueryDto } from './dto/distribution-order-query.dto';

type PrismaTx = Prisma.TransactionClient;

@Injectable()
export class DistributionService {
  constructor(private readonly prisma: PrismaService) {}

  create(user: AuthUser, dto: CreateDistributionOrderDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.validateBranchesAndWarehouses(tx, dto);
      const calculated = await this.calculateItems(tx, dto);
      const orderNumber = await this.generateOrderNumber(tx);
      const order = await tx.branchDistributionOrder.create({
        data: {
          orderNumber,
          branchId: dto.branchId,
          sourceWarehouseId: dto.sourceWarehouseId,
          destinationWarehouseId: dto.destinationWarehouseId,
          status: BranchDistributionOrderStatus.DRAFT,
          totalAmount: calculated.totalAmount,
          totalCost: calculated.totalCost,
          totalProfit: calculated.totalProfit,
          note: dto.note,
          createdById: user.id,
          items: { create: calculated.items },
        },
        include: this.include(),
      });
      return this.toResponse(order);
    });
  }

  async list(user: AuthUser, query: DistributionOrderQueryDto) {
    const where: Prisma.BranchDistributionOrderWhereInput = {
      deletedAt: null,
      ...(this.canManage(user) ? {} : { branchId: user.branchId }),
    };

    if (query.branchId) {
      if (!this.canManage(user) && query.branchId !== user.branchId) {
        throw new ForbiddenException('Forbidden branch');
      }
      where.branchId = query.branchId;
    }
    if (query.status) where.status = query.status;
    if (query.search?.trim()) {
      where.orderNumber = { contains: query.search.trim(), mode: 'insensitive' };
    }
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {
        ...(query.dateFrom ? { gte: query.dateFrom } : {}),
        ...(query.dateTo ? { lte: query.dateTo } : {}),
      };
    }

    const orders = await this.prisma.branchDistributionOrder.findMany({
      where,
      include: this.include(),
      orderBy: { createdAt: 'desc' },
    });
    return orders.map((order) => this.toResponse(order));
  }

  async detail(user: AuthUser, id: string) {
    const order = await this.getAccessibleOrder(user, id);
    return this.toResponse(order);
  }

  update(user: AuthUser, id: string, dto: CreateDistributionOrderDto) {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.getAccessibleOrderInTx(tx, user, id);
      if (order.status !== BranchDistributionOrderStatus.DRAFT) {
        throw new BadRequestException('Only draft orders can be edited');
      }
      await this.validateBranchesAndWarehouses(tx, dto);
      const calculated = await this.calculateItems(tx, dto);
      await tx.branchDistributionOrderItem.deleteMany({ where: { orderId: id } });
      const updated = await tx.branchDistributionOrder.update({
        where: { id },
        data: {
          branchId: dto.branchId,
          sourceWarehouseId: dto.sourceWarehouseId,
          destinationWarehouseId: dto.destinationWarehouseId,
          totalAmount: calculated.totalAmount,
          totalCost: calculated.totalCost,
          totalProfit: calculated.totalProfit,
          note: dto.note,
          items: { create: calculated.items },
        },
        include: this.include(),
      });
      return this.toResponse(updated);
    });
  }

  approve(user: AuthUser, id: string) {
    return this.transition(user, id, BranchDistributionOrderStatus.DRAFT, {
      status: BranchDistributionOrderStatus.APPROVED,
      approvedBy: { connect: { id: user.id } },
      approvedAt: new Date(),
    });
  }

  send(user: AuthUser, id: string) {
    return this.transition(user, id, BranchDistributionOrderStatus.APPROVED, {
      status: BranchDistributionOrderStatus.SENT,
      sentAt: new Date(),
    });
  }

  cancel(user: AuthUser, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.getAccessibleOrderInTx(tx, user, id);
      if (
        order.status !== BranchDistributionOrderStatus.DRAFT &&
        order.status !== BranchDistributionOrderStatus.APPROVED
      ) {
        throw new BadRequestException('Only draft or approved orders can be cancelled');
      }
      const updated = await tx.branchDistributionOrder.update({
        where: { id },
        data: {
          status: BranchDistributionOrderStatus.CANCELLED,
          cancelledAt: new Date(),
        },
        include: this.include(),
      });
      return this.toResponse(updated);
    });
  }

  private async transition(
    user: AuthUser,
    id: string,
    expected: BranchDistributionOrderStatus,
    data: Prisma.BranchDistributionOrderUpdateInput,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.getAccessibleOrderInTx(tx, user, id);
      if (order.status !== expected) {
        throw new BadRequestException(`Order must be ${expected}`);
      }
      const updated = await tx.branchDistributionOrder.update({
        where: { id },
        data,
        include: this.include(),
      });
      return this.toResponse(updated);
    });
  }

  private async validateBranchesAndWarehouses(
    tx: PrismaTx,
    dto: CreateDistributionOrderDto,
  ) {
    const [branch, sourceWarehouse, destinationWarehouse] = await Promise.all([
      tx.branch.findFirst({ where: { id: dto.branchId, deletedAt: null } }),
      tx.warehouse.findUnique({ where: { id: dto.sourceWarehouseId } }),
      tx.warehouse.findUnique({ where: { id: dto.destinationWarehouseId } }),
    ]);
    if (!branch) throw new NotFoundException('Branch not found');
    if (!sourceWarehouse) throw new NotFoundException('Source warehouse not found');
    if (!destinationWarehouse) throw new NotFoundException('Destination warehouse not found');
    if (destinationWarehouse.branchId !== branch.id) {
      throw new BadRequestException('Destination warehouse must belong to branch');
    }
  }

  private async calculateItems(tx: PrismaTx, dto: CreateDistributionOrderDto) {
    const items = [];
    for (const item of dto.items) {
      const product = await tx.product.findFirst({
        where: { id: item.productId, deletedAt: null },
      });
      if (!product) throw new NotFoundException('Product not found');
      const unitCost = Number(product.finalCostKgs);
      const unitPrice = Number(item.unitPrice);
      const quantity = Number(item.quantity);
      const totalCost = this.roundMoney(unitCost * quantity);
      const totalPrice = this.roundMoney(unitPrice * quantity);
      items.push({
        productId: product.id,
        sku: product.sku,
        productName: product.name,
        quantity,
        unitCost,
        unitPrice,
        totalCost,
        totalPrice,
        profit: this.roundMoney(totalPrice - totalCost),
      });
    }
    const totalAmount = this.roundMoney(items.reduce((sum, item) => sum + item.totalPrice, 0));
    const totalCost = this.roundMoney(items.reduce((sum, item) => sum + item.totalCost, 0));
    return { items, totalAmount, totalCost, totalProfit: this.roundMoney(totalAmount - totalCost) };
  }

  private async generateOrderNumber(tx: PrismaTx) {
    const count = await tx.branchDistributionOrder.count();
    return `BDO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(count + 1).padStart(5, '0')}`;
  }

  private include() {
    return {
      branch: true,
      sourceWarehouse: true,
      destinationWarehouse: true,
      createdBy: { select: { id: true, fullName: true, role: true } },
      approvedBy: { select: { id: true, fullName: true, role: true } },
      items: { include: { product: true } },
    };
  }

  private async getAccessibleOrder(user: AuthUser, id: string) {
    const order = await this.prisma.branchDistributionOrder.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(this.canManage(user) ? {} : { branchId: user.branchId }),
      },
      include: this.include(),
    });
    if (!order) throw new NotFoundException('Distribution order not found');
    return order;
  }

  private async getAccessibleOrderInTx(tx: PrismaTx, user: AuthUser, id: string) {
    const order = await tx.branchDistributionOrder.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(this.canManage(user) ? {} : { branchId: user.branchId }),
      },
    });
    if (!order) throw new NotFoundException('Distribution order not found');
    return order;
  }

  private canManage(user: AuthUser) {
    return user.role === Role.OWNER || user.role === Role.SUPPLY_CHAIN_MANAGER;
  }

  private toResponse(order: any) {
    return {
      ...order,
      totalAmount: Number(order.totalAmount),
      totalCost: Number(order.totalCost),
      totalProfit: Number(order.totalProfit),
      items: order.items?.map((item: any) => ({
        ...item,
        unitCost: Number(item.unitCost),
        unitPrice: Number(item.unitPrice),
        totalCost: Number(item.totalCost),
        totalPrice: Number(item.totalPrice),
        profit: Number(item.profit),
      })),
    };
  }

  private roundMoney(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
