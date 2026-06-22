import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BranchDistributionOrderStatus,
  BranchInvoiceStatus,
  Prisma,
  Role,
  ShortageReportItemType,
  ShortageReportStatus,
  StockMovementType,
} from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { AddBranchPaymentDto } from './dto/add-branch-payment.dto';
import { BranchInvoiceQueryDto } from './dto/branch-invoice-query.dto';
import { CreateDistributionOrderDto } from './dto/create-distribution-order.dto';
import { DistributionOrderQueryDto } from './dto/distribution-order-query.dto';
import { DistributionReportQueryDto } from './dto/distribution-report-query.dto';
import { ReceiveDistributionOrderDto } from './dto/receive-distribution-order.dto';

type PrismaTx = Prisma.TransactionClient;

@Injectable()
export class DistributionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
  ) {}

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

  async receive(user: AuthUser, id: string, dto: ReceiveDistributionOrderDto) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.branchDistributionOrder.findFirst({
        where: {
          id,
          deletedAt: null,
          ...(this.canManage(user) ? {} : { branchId: user.branchId }),
        },
        include: { items: true },
      });
      if (!order) throw new NotFoundException('Distribution order not found');
      if (order.status !== BranchDistributionOrderStatus.SENT) {
        throw new BadRequestException('Order must be SENT before receiving');
      }

      const warehouse = await tx.warehouse.findFirst({
        where: { id: dto.warehouseId, branchId: order.branchId },
      });
      if (!warehouse) {
        throw new BadRequestException('Warehouse must belong to order branch');
      }

      const receivedMap = new Map(
        dto.items.map((item) => [item.distributionOrderItemId, item]),
      );
      if (receivedMap.size !== order.items.length) {
        throw new BadRequestException('All order items must be included');
      }
      for (const item of order.items) {
        if (!receivedMap.has(item.id)) {
          throw new BadRequestException('All order items must be included');
        }
      }

      const receiving = await tx.goodsReceiving.create({
        data: {
          receivingNumber: await this.generateReceivingNumber(tx),
          distributionOrderId: order.id,
          branchId: order.branchId,
          warehouseId: warehouse.id,
          receivedById: user.id,
          receivedAt: new Date(),
          note: dto.note,
        },
      });

      const receivingItems = [];
      const shortageItems = [];

      for (const orderItem of order.items) {
        const received = receivedMap.get(orderItem.id)!;
        const receivedQuantity = Number(received.receivedQuantity);
        const sentQuantity = Number(orderItem.quantity);
        const difference = receivedQuantity - sentQuantity;

        if (receivedQuantity > 0) {
          await this.inventoryService.createStockMovementInTx(tx, user, {
            productId: orderItem.productId,
            warehouseId: warehouse.id,
            type: StockMovementType.IN,
            quantity: receivedQuantity,
            unitCostKgs: Number(orderItem.unitCost),
            referenceType: 'GOODS_RECEIVING',
            referenceId: receiving.id,
            note: `Receiving ${receiving.receivingNumber}`,
          });
        }

        receivingItems.push({
          receivingId: receiving.id,
          distributionOrderItemId: orderItem.id,
          productId: orderItem.productId,
          sku: orderItem.sku,
          productName: orderItem.productName,
          sentQuantity,
          receivedQuantity,
          differenceQuantity: difference,
          unitCost: orderItem.unitCost,
          unitPrice: orderItem.unitPrice,
          note: received.note,
        });

        if (difference !== 0) {
          shortageItems.push({
            productId: orderItem.productId,
            sku: orderItem.sku,
            productName: orderItem.productName,
            expectedQuantity: sentQuantity,
            receivedQuantity,
            differenceQuantity: Math.abs(difference),
            type:
              difference < 0
                ? ShortageReportItemType.SHORTAGE
                : ShortageReportItemType.OVERAGE,
            note: received.note,
          });
        }
      }

      await tx.goodsReceivingItem.createMany({ data: receivingItems });

      let shortageReport = null;
      if (shortageItems.length > 0) {
        shortageReport = await tx.shortageReport.create({
          data: {
            reportNumber: await this.generateShortageReportNumber(tx),
            goodsReceivingId: receiving.id,
            distributionOrderId: order.id,
            branchId: order.branchId,
            warehouseId: warehouse.id,
            createdById: user.id,
            items: { create: shortageItems },
          },
          include: this.shortageInclude(),
        });
      }

      await tx.branchDistributionOrder.update({
        where: { id: order.id },
        data: {
          status:
            shortageItems.length > 0
              ? BranchDistributionOrderStatus.RECEIVED_WITH_DIFFERENCE
              : BranchDistributionOrderStatus.RECEIVED,
        },
      });
      const invoice = await this.createInvoiceForReceiving(
        tx,
        user,
        order.id,
        receiving.id,
        order.branchId,
        receivingItems,
      );
      await this.refreshBranchAccountBalance(tx, order.branchId);

      return {
        receiving: await this.receivingInTx(tx, user, receiving.id),
        shortageReport,
        invoice,
      };
    });
  }

  receivings(user: AuthUser, query: DistributionReportQueryDto) {
    this.assertQueryBranchAccess(user, query.branchId);
    return this.prisma.goodsReceiving.findMany({
      where: {
        deletedAt: null,
        ...(this.canManage(user) ? {} : { branchId: user.branchId }),
        ...(query.branchId ? { branchId: query.branchId } : {}),
      },
      include: this.receivingInclude(),
      orderBy: { receivedAt: 'desc' },
    });
  }

  async receiving(user: AuthUser, id: string) {
    const receiving = await this.prisma.goodsReceiving.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(this.canManage(user) ? {} : { branchId: user.branchId }),
      },
      include: this.receivingInclude(),
    });
    if (!receiving) throw new NotFoundException('Receiving not found');
    return receiving;
  }

  shortageReports(user: AuthUser, query: DistributionReportQueryDto) {
    this.assertQueryBranchAccess(user, query.branchId);
    return this.prisma.shortageReport.findMany({
      where: {
        deletedAt: null,
        ...(this.canManage(user) ? {} : { branchId: user.branchId }),
        ...(query.branchId ? { branchId: query.branchId } : {}),
      },
      include: this.shortageInclude(),
      orderBy: { createdAt: 'desc' },
    });
  }

  async shortageReport(user: AuthUser, id: string) {
    const report = await this.prisma.shortageReport.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(this.canManage(user) ? {} : { branchId: user.branchId }),
      },
      include: this.shortageInclude(),
    });
    if (!report) throw new NotFoundException('Shortage report not found');
    return report;
  }

  async resolveShortageReport(user: AuthUser, id: string) {
    const report = await this.shortageReport(user, id);
    return this.prisma.shortageReport.update({
      where: { id: report.id },
      data: { status: ShortageReportStatus.RESOLVED, resolvedAt: new Date() },
      include: this.shortageInclude(),
    });
  }

  invoices(user: AuthUser, query: BranchInvoiceQueryDto) {
    this.assertQueryBranchAccessForFinance(user, query.branchId);
    const where: Prisma.BranchInvoiceWhereInput = {
      deletedAt: null,
      ...(this.canManageFinance(user) ? {} : { branchId: user.branchId }),
      ...(query.branchId ? { branchId: query.branchId } : {}),
    };
    if (query.status) where.status = query.status;
    if (query.search?.trim()) {
      where.invoiceNumber = { contains: query.search.trim(), mode: 'insensitive' };
    }
    if (query.dateFrom || query.dateTo) {
      where.issuedAt = {
        ...(query.dateFrom ? { gte: query.dateFrom } : {}),
        ...(query.dateTo ? { lte: query.dateTo } : {}),
      };
    }

    return this.prisma.branchInvoice.findMany({
      where,
      include: this.invoiceInclude(),
      orderBy: { issuedAt: 'desc' },
    }).then((items) => items.map((item) => this.toInvoiceResponse(item)));
  }

  async invoice(user: AuthUser, id: string) {
    const invoice = await this.prisma.branchInvoice.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(this.canManageFinance(user) ? {} : { branchId: user.branchId }),
      },
      include: this.invoiceInclude(),
    });
    if (!invoice) throw new NotFoundException('Branch invoice not found');
    return this.toInvoiceResponse(invoice);
  }

  async addInvoicePayment(user: AuthUser, id: string, dto: AddBranchPaymentDto) {
    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.branchInvoice.findFirst({
        where: {
          id,
          deletedAt: null,
          ...(this.canManageFinance(user) ? {} : { branchId: user.branchId }),
        },
      });
      if (!invoice) throw new NotFoundException('Branch invoice not found');
      if (invoice.status === BranchInvoiceStatus.CANCELLED) {
        throw new BadRequestException('Cannot pay cancelled invoice');
      }
      const amount = this.roundMoney(Number(dto.amount));
      if (amount <= 0) throw new BadRequestException('Payment amount must be greater than 0');
      if (amount > Number(invoice.debtAmount)) {
        throw new BadRequestException('Payment amount cannot exceed invoice debt');
      }

      await tx.branchPayment.create({
        data: {
          branchId: invoice.branchId,
          invoiceId: invoice.id,
          amount,
          method: dto.method,
          note: dto.note,
          createdById: user.id,
          paidAt: new Date(),
        },
      });

      const paidAggregate = await tx.branchPayment.aggregate({
        where: { invoiceId: invoice.id, deletedAt: null },
        _sum: { amount: true },
      });
      const paidAmount = this.roundMoney(Number(paidAggregate._sum.amount ?? 0));
      const totalAmount = Number(invoice.totalAmount);
      const debtAmount = this.roundMoney(Math.max(totalAmount - paidAmount, 0));
      const status =
        debtAmount === 0
          ? BranchInvoiceStatus.PAID
          : paidAmount > 0
            ? BranchInvoiceStatus.PARTIALLY_PAID
            : BranchInvoiceStatus.ISSUED;

      await tx.branchInvoice.update({
        where: { id: invoice.id },
        data: { paidAmount, debtAmount, status },
      });
      await this.refreshBranchAccountBalance(tx, invoice.branchId);

      const updated = await tx.branchInvoice.findUniqueOrThrow({
        where: { id: invoice.id },
        include: this.invoiceInclude(),
      });
      return this.toInvoiceResponse(updated);
    });
  }

  async branchAccountBalance(user: AuthUser, branchId: string) {
    if (!this.canManageFinance(user) && branchId !== user.branchId) {
      throw new ForbiddenException('Forbidden branch');
    }
    const balance = await this.prisma.branchAccountBalance.findUnique({
      where: { branchId },
      include: { branch: true },
    });
    return balance
      ? this.toBalanceResponse(balance)
      : { branchId, totalDebt: 0, totalPaid: 0, lastPaymentAt: null };
  }

  branchBalances(user: AuthUser) {
    if (!this.canManageFinance(user)) throw new ForbiddenException('Forbidden');
    return this.prisma.branchAccountBalance.findMany({
      include: { branch: true },
      orderBy: { totalDebt: 'desc' },
    }).then((items) => items.map((item) => this.toBalanceResponse(item)));
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

  private async generateReceivingNumber(tx: PrismaTx) {
    const count = await tx.goodsReceiving.count();
    return `GR-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(count + 1).padStart(5, '0')}`;
  }

  private async generateShortageReportNumber(tx: PrismaTx) {
    const count = await tx.shortageReport.count();
    return `SR-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(count + 1).padStart(5, '0')}`;
  }

  private include() {
    return {
      branch: true,
      sourceWarehouse: true,
      destinationWarehouse: true,
      createdBy: { select: { id: true, fullName: true, role: true } },
      approvedBy: { select: { id: true, fullName: true, role: true } },
      items: { include: { product: true } },
      branchInvoice: true,
    };
  }

  private receivingInclude() {
    return {
      distributionOrder: true,
      branch: true,
      warehouse: true,
      receivedBy: { select: { id: true, fullName: true, role: true } },
      items: true,
      shortageReport: { include: { items: true } },
      branchInvoice: true,
    };
  }

  private invoiceInclude() {
    return {
      branch: true,
      distributionOrder: true,
      goodsReceiving: true,
      payments: {
        include: {
          createdBy: { select: { id: true, fullName: true, role: true } },
        },
        orderBy: { paidAt: 'desc' as const },
      },
      createdBy: { select: { id: true, fullName: true, role: true } },
    };
  }

  private shortageInclude() {
    return {
      distributionOrder: true,
      goodsReceiving: true,
      branch: true,
      warehouse: true,
      createdBy: { select: { id: true, fullName: true, role: true } },
      items: true,
    };
  }

  private receivingInTx(tx: PrismaTx, user: AuthUser, id: string) {
    return tx.goodsReceiving.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(this.canManage(user) ? {} : { branchId: user.branchId }),
      },
      include: this.receivingInclude(),
    });
  }

  private async generateInvoiceNumber(tx: PrismaTx) {
    const count = await tx.branchInvoice.count();
    return `BI-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(count + 1).padStart(5, '0')}`;
  }

  private async createInvoiceForReceiving(
    tx: PrismaTx,
    user: AuthUser,
    distributionOrderId: string,
    goodsReceivingId: string,
    branchId: string,
    receivingItems: Array<{
      receivedQuantity: number;
      unitPrice: Prisma.Decimal;
    }>,
  ) {
    const existing = await tx.branchInvoice.findFirst({
      where: { distributionOrderId, goodsReceivingId, deletedAt: null },
      include: this.invoiceInclude(),
    });
    if (existing) return this.toInvoiceResponse(existing);

    const totalAmount = this.roundMoney(
      receivingItems.reduce(
        (sum, item) => sum + item.receivedQuantity * Number(item.unitPrice),
        0,
      ),
    );
    const issuedAt = new Date();
    const invoice = await tx.branchInvoice.create({
      data: {
        invoiceNumber: await this.generateInvoiceNumber(tx),
        branchId,
        distributionOrderId,
        goodsReceivingId,
        totalAmount,
        paidAmount: 0,
        debtAmount: totalAmount,
        dueDate: new Date(issuedAt.getTime() + 15 * 24 * 60 * 60 * 1000),
        issuedAt,
        createdById: user.id,
      },
      include: this.invoiceInclude(),
    });
    return this.toInvoiceResponse(invoice);
  }

  private async refreshBranchAccountBalance(tx: PrismaTx, branchId: string) {
    const [invoices, paymentAggregate] = await Promise.all([
      tx.branchInvoice.findMany({
        where: {
          branchId,
          deletedAt: null,
          NOT: { status: BranchInvoiceStatus.CANCELLED },
        },
        select: { debtAmount: true, paidAmount: true },
      }),
      tx.branchPayment.aggregate({
        where: { branchId, deletedAt: null },
        _max: { paidAt: true },
      }),
    ]);
    const totalDebt = this.roundMoney(
      invoices.reduce((sum, invoice) => sum + Number(invoice.debtAmount), 0),
    );
    const totalPaid = this.roundMoney(
      invoices.reduce((sum, invoice) => sum + Number(invoice.paidAmount), 0),
    );
    return tx.branchAccountBalance.upsert({
      where: { branchId },
      create: {
        branchId,
        totalDebt,
        totalPaid,
        lastPaymentAt: paymentAggregate._max.paidAt,
      },
      update: {
        totalDebt,
        totalPaid,
        lastPaymentAt: paymentAggregate._max.paidAt,
      },
    });
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

  private canManageFinance(user: AuthUser) {
    return this.canManage(user) || user.role === Role.ACCOUNTANT;
  }

  private assertQueryBranchAccess(user: AuthUser, branchId?: string) {
    if (!this.canManage(user) && branchId && branchId !== user.branchId) {
      throw new ForbiddenException('Forbidden branch');
    }
  }

  private assertQueryBranchAccessForFinance(user: AuthUser, branchId?: string) {
    if (!this.canManageFinance(user) && branchId && branchId !== user.branchId) {
      throw new ForbiddenException('Forbidden branch');
    }
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
      branchInvoice: order.branchInvoice
        ? this.toInvoiceResponse(order.branchInvoice)
        : order.branchInvoice,
    };
  }

  private toInvoiceResponse(invoice: any) {
    return {
      ...invoice,
      totalAmount: Number(invoice.totalAmount),
      paidAmount: Number(invoice.paidAmount),
      debtAmount: Number(invoice.debtAmount),
      payments: invoice.payments?.map((payment: any) => ({
        ...payment,
        amount: Number(payment.amount),
      })),
    };
  }

  private toBalanceResponse(balance: any) {
    return {
      ...balance,
      totalDebt: Number(balance.totalDebt),
      totalPaid: Number(balance.totalPaid),
    };
  }

  private roundMoney(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
