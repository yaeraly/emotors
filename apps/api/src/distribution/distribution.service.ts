import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AlertType,
  BranchDistributionOrderStatus,
  BranchInvoiceStatus,
  HqWarehousePickingTaskStatus,
  Prisma,
  Role,
  ShortageReportItemType,
  ShortageReportStatus,
  ShortageResolutionType,
  StockMovementType,
} from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { InventoryService } from '../inventory/inventory.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  canCreateDistributionOrder,
  canDispatchFromHq,
  canManageDistributionOrders,
  canReceiveBranchDistribution,
  canRecordDistributionPayment,
  canRecordHqDistributionPayment,
  canViewDistribution,
  canViewBranchDiscrepancyReports,
  hasAnyFullAccessRole,
  resolveUserRoles,
} from '../rbac/rbac';
import {
  activeHqWarehouseWhere,
  hqWarehouseWhere,
  isBranchWarehouse,
  isHqWarehouse,
} from '../warehouse/warehouse.util';
import { PricingFifoService } from '../pricing/pricing-fifo.service';
import { AddBranchPaymentDto } from './dto/add-branch-payment.dto';
import { BranchInvoiceQueryDto } from './dto/branch-invoice-query.dto';
import { CreateDistributionOrderDto } from './dto/create-distribution-order.dto';
import { DistributionOrderQueryDto } from './dto/distribution-order-query.dto';
import { DistributionReportQueryDto } from './dto/distribution-report-query.dto';
import { PickingTaskQueryDto } from './dto/picking-task-query.dto';
import { ReceiveDistributionOrderDto } from './dto/receive-distribution-order.dto';
import { allocateBranchReceivingTransportCost } from './branch-receiving-transport.util';
import { ResolveShortageDto } from './dto/resolve-shortage.dto';
import { SendToWarehouseDto } from './dto/send-to-warehouse.dto';
import {
  buildBatchDiscrepancyAuditMetadata,
  buildDiscrepancyActAuditMetadata,
  differenceAuditAction,
  resolveDifferenceType,
} from '../operations/discrepancy-act.util';

type PrismaTx = Prisma.TransactionClient;

@Injectable()
export class DistributionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly notificationsService: NotificationsService,
    private readonly pricingFifoService: PricingFifoService,
  ) {}

  create(user: AuthUser, dto: CreateDistributionOrderDto) {
    if (!canCreateDistributionOrder(user)) {
      throw new ForbiddenException('Недостаточно прав для создания заказа распределения');
    }
    return this.prisma.$transaction(async (tx) => {
      await this.validateBranchesAndWarehouses(tx, dto);
      const calculated = await this.calculateItems(tx, dto, user);
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
    if (!canViewDistribution(user)) {
      throw new ForbiddenException('Недостаточно прав для просмотра заказов распределения');
    }
    const where: Prisma.BranchDistributionOrderWhereInput = {
      deletedAt: null,
      ...(this.canAccessAllDistributionBranches(user) ? {} : { branchId: user.branchId }),
    };

    if (query.branchId) {
      if (!this.canAccessAllDistributionBranches(user) && query.branchId !== user.branchId) {
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

    const roles = resolveUserRoles(user);
    if (roles.includes(Role.WAREHOUSE_MANAGER) && !hasAnyFullAccessRole(roles)) {
      const assignments = await this.prisma.hqWarehouseManagerAssignment.findMany({
        where: { userId: user.id, status: 'ACTIVE' },
        select: { warehouseId: true },
      });
      const warehouseIds = assignments.map((row) => row.warehouseId);
      if (!warehouseIds.length) return [];
      where.sourceWarehouseId = { in: warehouseIds };
    }

    const orders = await this.prisma.branchDistributionOrder.findMany({
      where,
      include: this.include(),
      orderBy: { createdAt: 'desc' },
    });
    return orders.map((order) => this.toResponse(order));
  }

  async detail(user: AuthUser, id: string) {
    if (!canViewDistribution(user)) {
      throw new ForbiddenException('Недостаточно прав для просмотра заказа распределения');
    }
    const order = await this.getAccessibleOrder(user, id);
    return this.toResponse(order);
  }

  update(user: AuthUser, id: string, dto: CreateDistributionOrderDto) {
    if (!canManageDistributionOrders(user)) {
      throw new ForbiddenException('Недостаточно прав для редактирования заказа распределения');
    }
    return this.prisma.$transaction(async (tx) => {
      const order = await this.getAccessibleOrderInTx(tx, user, id);
      if (order.status !== BranchDistributionOrderStatus.DRAFT) {
        throw new BadRequestException('Only draft orders can be edited');
      }
      await this.validateBranchesAndWarehouses(tx, dto);
      const calculated = await this.calculateItems(tx, dto, user);
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
    if (!canManageDistributionOrders(user)) {
      throw new ForbiddenException('Недостаточно прав для утверждения заказа распределения');
    }
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.branchDistributionOrder.findFirst({
        where: {
          id,
          deletedAt: null,
          ...(this.canAccessAllDistributionBranches(user) ? {} : { branchId: user.branchId }),
        },
        include: { items: true, sourceWarehouse: true },
      });
      if (!order) throw new NotFoundException('Distribution order not found');
      if (order.status !== BranchDistributionOrderStatus.DRAFT) {
        throw new BadRequestException('Only draft orders can be approved');
      }
      this.assertHqSourceWarehouse(order.sourceWarehouse);

      for (const item of order.items) {
        const inventoryProduct = await this.resolveSourceInventoryProduct(
          tx,
          order.sourceWarehouseId,
          item.productId,
          item.sku,
        );
        const balance = await tx.inventoryBalance.findUnique({
          where: {
            branchId_warehouseId_productId: {
              branchId: inventoryProduct.branchId,
              warehouseId: order.sourceWarehouseId,
              productId: inventoryProduct.productId,
            },
          },
        });
        const availableQuantity = (balance?.quantity ?? 0) - (balance?.reservedQuantity ?? 0);
        if (availableQuantity < item.quantity) {
          throw new BadRequestException(
            `Insufficient available stock for SKU ${item.sku}. Requested: ${item.quantity} Available: ${availableQuantity}`,
          );
        }
        await tx.inventoryBalance.update({
          where: {
            branchId_warehouseId_productId: {
              branchId: inventoryProduct.branchId,
              warehouseId: order.sourceWarehouseId,
              productId: inventoryProduct.productId,
            },
          },
          data: { reservedQuantity: { increment: item.quantity } },
        });
      }

      const updated = await tx.branchDistributionOrder.update({
        where: { id: order.id },
        data: {
          status: BranchDistributionOrderStatus.INVOICED,
          approvedBy: { connect: { id: user.id } },
          approvedAt: new Date(),
        },
        include: this.include(),
      });
      const invoice = await this.createInvoiceForOrder(tx, user, updated);
      await this.auditTransfer(tx, user, 'BRANCH_ORDER_ACCEPTED', updated);
      await this.auditTransfer(tx, user, 'INVOICE_CREATED', updated);
      await this.createWorkflowAlert(tx, user, {
        branchId: updated.branchId,
        type: AlertType.BRANCH_INVOICE_CREATED,
        title: 'Branch invoice created',
        message: `Invoice ${invoice.invoiceNumber} created for order ${updated.orderNumber}`,
        entityType: 'BranchInvoice',
        entityId: invoice.id,
      });
      return this.toResponse({ ...updated, branchInvoice: invoice });
    });
  }

  sendInvoice(user: AuthUser, id: string) {
    if (!canManageDistributionOrders(user)) {
      throw new ForbiddenException('Недостаточно прав для отправки счёта');
    }
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.branchDistributionOrder.findFirst({
        where: { id, deletedAt: null },
        include: { branchInvoice: true },
      });
      if (!order) throw new NotFoundException('Distribution order not found');
      if (order.status !== BranchDistributionOrderStatus.INVOICED) {
        throw new BadRequestException('Invoice can only be sent for invoiced orders');
      }
      if (!order.branchInvoice) {
        throw new BadRequestException('Invoice not found for this order');
      }
      const invoice = await tx.branchInvoice.update({
        where: { id: order.branchInvoice.id },
        data: { sentToBranchAt: new Date() },
        include: this.invoiceInclude(),
      });
      await this.auditTransfer(tx, user, 'INVOICE_SENT', order);
      await this.createWorkflowAlert(tx, user, {
        branchId: order.branchId,
        type: AlertType.BRANCH_INVOICE_CREATED,
        title: 'Invoice sent to branch',
        message: `Invoice ${invoice.invoiceNumber} sent for order ${order.orderNumber}`,
        entityType: 'BranchInvoice',
        entityId: invoice.id,
      });
      return this.toInvoiceResponse(invoice);
    });
  }

  sendToWarehouse(user: AuthUser, id: string, dto: SendToWarehouseDto) {
    if (!canManageDistributionOrders(user)) {
      throw new ForbiddenException('Недостаточно прав для отправки на склад');
    }
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.branchDistributionOrder.findFirst({
        where: { id, deletedAt: null },
        include: { branchInvoice: true, items: true },
      });
      if (!order) throw new NotFoundException('Distribution order not found');
      if (
        order.status !== BranchDistributionOrderStatus.INVOICED &&
        order.status !== BranchDistributionOrderStatus.PAYMENT_PENDING &&
        order.status !== BranchDistributionOrderStatus.PAID
      ) {
        throw new BadRequestException(
          'Order must be invoiced and payment registered before sending to warehouse',
        );
      }
      if (!order.branchInvoice?.sentToBranchAt) {
        throw new BadRequestException('Invoice must be sent to branch first');
      }

      const updated = await tx.branchDistributionOrder.update({
        where: { id },
        data: { status: BranchDistributionOrderStatus.SENT_TO_WAREHOUSE },
        include: this.include(),
      });

      const existingTask = await tx.hqWarehousePickingTask.findUnique({
        where: { distributionOrderId: id },
      });
      if (!existingTask) {
        await tx.hqWarehousePickingTask.create({
          data: {
            distributionOrderId: id,
            sourceHqWarehouseId: order.sourceWarehouseId,
            assignedWarehouseManagerId: dto.assignedWarehouseManagerId,
            status: HqWarehousePickingTaskStatus.ASSIGNED,
          },
        });
      }

      await this.auditTransfer(tx, user, 'ORDER_ASSIGNED_TO_WAREHOUSE', updated);
      await this.createWorkflowAlert(tx, user, {
        branchId: null,
        type: AlertType.ORDER_SENT_TO_WAREHOUSE,
        title: 'Order sent to warehouse',
        message: `Order ${order.orderNumber} assigned for picking`,
        entityType: 'BranchDistributionOrder',
        entityId: order.id,
      });
      await this.createWorkflowAlert(tx, user, {
        branchId: null,
        type: AlertType.PICKING_TASK_ASSIGNED,
        title: 'Picking task assigned',
        message: `Picking task created for order ${order.orderNumber}`,
        entityType: 'BranchDistributionOrder',
        entityId: order.id,
      });
      return this.toResponse(updated);
    });
  }

  listPickingTasks(user: AuthUser, query: PickingTaskQueryDto) {
    if (!canViewDistribution(user) && !canDispatchFromHq(user)) {
      throw new ForbiddenException('Недостаточно прав для просмотра заданий на комплектацию');
    }
    return this.buildPickingTasksQuery(user, query);
  }

  private async buildPickingTasksQuery(user: AuthUser, query: PickingTaskQueryDto) {
    const roles = resolveUserRoles(user);
    const where: Prisma.HqWarehousePickingTaskWhereInput = {
      ...(query.status ? { status: query.status } : {}),
    };

    if (roles.includes(Role.WAREHOUSE_MANAGER) && !hasAnyFullAccessRole(roles)) {
      const assignments = await this.prisma.hqWarehouseManagerAssignment.findMany({
        where: { userId: user.id, status: 'ACTIVE' },
        select: { warehouseId: true },
      });
      const warehouseIds = assignments.map((row) => row.warehouseId);
      if (!warehouseIds.length) return [];
      if (query.sourceHqWarehouseId) {
        if (!warehouseIds.includes(query.sourceHqWarehouseId)) return [];
        where.sourceHqWarehouseId = query.sourceHqWarehouseId;
      } else {
        where.sourceHqWarehouseId = { in: warehouseIds };
      }
    } else if (query.sourceHqWarehouseId) {
      where.sourceHqWarehouseId = query.sourceHqWarehouseId;
    }

    return this.prisma.hqWarehousePickingTask.findMany({
      where,
      include: {
        distributionOrder: {
          include: {
            branch: true,
            items: true,
            destinationWarehouse: true,
          },
        },
        sourceHqWarehouse: true,
        assignedWarehouseManager: { select: { id: true, fullName: true, role: true } },
      },
      orderBy: { assignedAt: 'desc' },
    });
  }

  async pickingTask(user: AuthUser, id: string) {
    if (!canViewDistribution(user) && !canDispatchFromHq(user)) {
      throw new ForbiddenException('Недостаточно прав для просмотра задания на комплектацию');
    }
    const task = await this.prisma.hqWarehousePickingTask.findUniqueOrThrow({
      where: { id },
      include: {
        distributionOrder: {
          include: {
            branch: true,
            items: { include: { product: true } },
            destinationWarehouse: true,
            branchInvoice: true,
          },
        },
        sourceHqWarehouse: true,
        assignedWarehouseManager: { select: { id: true, fullName: true, role: true } },
      },
    });
    const roles = resolveUserRoles(user);
    if (roles.includes(Role.WAREHOUSE_MANAGER) && !hasAnyFullAccessRole(roles)) {
      const assignments = await this.prisma.hqWarehouseManagerAssignment.findMany({
        where: { userId: user.id, status: 'ACTIVE' },
        select: { warehouseId: true },
      });
      const warehouseIds = assignments.map((row) => row.warehouseId);
      if (!warehouseIds.includes(task.sourceHqWarehouseId)) {
        throw new ForbiddenException('Недостаточно прав для просмотра задания на комплектацию');
      }
    }
    return task;
  }

  pick(user: AuthUser, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.getAccessibleOrderInTx(tx, user, id);
      if (order.status !== BranchDistributionOrderStatus.SENT_TO_WAREHOUSE) {
        throw new BadRequestException('Order must be sent to warehouse before picking');
      }
      const updated = await tx.branchDistributionOrder.update({
        where: { id },
        data: { status: BranchDistributionOrderStatus.PICKING },
        include: this.include(),
      });
      await tx.hqWarehousePickingTask.updateMany({
        where: { distributionOrderId: id },
        data: { status: HqWarehousePickingTaskStatus.PICKING, pickedAt: new Date() },
      });
      await this.auditTransfer(tx, user, 'GOODS_PICKED', updated);
      await this.auditTransfer(tx, user, 'GOODS_PREPARED', updated);
      return this.toResponse(updated);
    });
  }

  pack(user: AuthUser, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.getAccessibleOrderInTx(tx, user, id);
      if (order.status !== BranchDistributionOrderStatus.PICKING) {
        throw new BadRequestException('Order must be in PICKING before packing');
      }
      const updated = await tx.branchDistributionOrder.update({
        where: { id },
        data: { status: BranchDistributionOrderStatus.PACKED },
        include: this.include(),
      });
      await tx.hqWarehousePickingTask.updateMany({
        where: { distributionOrderId: id },
        data: { status: HqWarehousePickingTaskStatus.PACKED, packedAt: new Date() },
      });
      await this.auditTransfer(tx, user, 'GOODS_PACKED', updated);
      return this.toResponse(updated);
    });
  }

  complete(user: AuthUser, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.getAccessibleOrderInTx(tx, user, id);
      if (
        order.status !== BranchDistributionOrderStatus.RECEIVED &&
        order.status !== BranchDistributionOrderStatus.RECEIVED_BY_BRANCH &&
        order.status !== BranchDistributionOrderStatus.RECEIVED_WITH_DIFFERENCE
      ) {
        throw new BadRequestException('Only received transfers can be completed');
      }
      const updated = await tx.branchDistributionOrder.update({
        where: { id },
        data: { status: BranchDistributionOrderStatus.COMPLETED },
        include: this.include(),
      });
      await this.auditTransfer(tx, user, 'TRANSFER_COMPLETED', updated);
      return this.toResponse(updated);
    });
  }

  send(user: AuthUser, id: string) {
    if (!canDispatchFromHq(user)) {
      throw new ForbiddenException('Only Warehouse Manager can dispatch goods from HQ warehouse');
    }
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.branchDistributionOrder.findFirst({
        where: {
          id,
          deletedAt: null,
          ...(this.canAccessAllDistributionBranches(user) ? {} : { branchId: user.branchId }),
        },
        include: {
          items: true,
          sourceWarehouse: true,
        },
      });
      if (!order) throw new NotFoundException('Distribution order not found');
      if (order.status !== BranchDistributionOrderStatus.PACKED) {
        throw new BadRequestException(
          'Only packed orders can be shipped. Stock was not deducted.',
        );
      }
      this.assertHqSourceWarehouse(order.sourceWarehouse);

      for (const item of order.items) {
        const inventoryProduct = await this.resolveSourceInventoryProduct(
          tx,
          order.sourceWarehouseId,
          item.productId,
          item.sku,
        );
        const balance = await tx.inventoryBalance.findUnique({
          where: {
            branchId_warehouseId_productId: {
              branchId: inventoryProduct.branchId,
              warehouseId: order.sourceWarehouseId,
              productId: inventoryProduct.productId,
            },
          },
        });
        const availableQuantity = (balance?.quantity ?? 0) - (balance?.reservedQuantity ?? 0);
        if (availableQuantity < item.quantity) {
          throw new BadRequestException(
            `Insufficient stock for SKU ${item.sku}. Requested: ${item.quantity} Available: ${availableQuantity}`,
          );
        }
      }

      for (const item of order.items) {
        const inventoryProduct = await this.resolveSourceInventoryProduct(
          tx,
          order.sourceWarehouseId,
          item.productId,
          item.sku,
        );
        await this.inventoryService.createStockMovementInTx(tx, user, {
          productId: inventoryProduct.productId,
          warehouseId: order.sourceWarehouseId,
          type: StockMovementType.OUT,
          quantity: item.quantity,
          unitCostKgs: Number(item.unitCost),
          referenceType: 'DISTRIBUTION_ORDER',
          referenceId: order.id,
          note: `Distribution order ${order.orderNumber}`,
        });

        const branch = await tx.branch.findUnique({
          where: { id: order.branchId },
          select: { code: true },
        });
        const isHqOwnedBranch = this.pricingFifoService.isHqOwnedBranch(branch?.code);
        await this.pricingFifoService.consumeFifoForDistribution(tx, {
          productId: inventoryProduct.productId,
          warehouseId: order.sourceWarehouseId,
          quantity: item.quantity,
          isHqOwnedBranch,
          distributionOrderId: order.id,
          distributionOrderItemId: item.id,
          userId: user.id,
          userRole: user.role,
        });

        await tx.inventoryBalance.update({
          where: {
            branchId_warehouseId_productId: {
              branchId: inventoryProduct.branchId,
              warehouseId: order.sourceWarehouseId,
              productId: inventoryProduct.productId,
            },
          },
          data: { reservedQuantity: { decrement: item.quantity } },
        });
      }

      const updated = await tx.branchDistributionOrder.update({
        where: { id: order.id },
        data: {
          status: BranchDistributionOrderStatus.SHIPPED,
          sentAt: new Date(),
        },
        include: this.include(),
      });
      await tx.hqWarehousePickingTask.updateMany({
        where: { distributionOrderId: id },
        data: { status: HqWarehousePickingTaskStatus.SHIPPED, shippedAt: new Date() },
      });
      await this.auditTransfer(tx, user, 'INVENTORY_SHIPPED', updated);
      await this.auditTransfer(tx, user, 'GOODS_SHIPPED', updated);
      await this.createWorkflowAlert(tx, user, {
        branchId: order.branchId,
        type: AlertType.GOODS_SHIPPED,
        title: 'Goods shipped to branch',
        message: `Order ${order.orderNumber} has been shipped`,
        entityType: 'BranchDistributionOrder',
        entityId: order.id,
      });
      return this.toResponse(updated);
    });
  }

  cancel(user: AuthUser, id: string) {
    if (!canManageDistributionOrders(user) && !canDispatchFromHq(user)) {
      throw new ForbiddenException('Недостаточно прав для отмены заказа распределения');
    }
    return this.prisma.$transaction(async (tx) => {
      const order = await this.getAccessibleOrderInTx(tx, user, id);
      if (
        order.status !== BranchDistributionOrderStatus.DRAFT &&
        order.status !== BranchDistributionOrderStatus.INVOICED &&
        order.status !== BranchDistributionOrderStatus.PAYMENT_PENDING &&
        order.status !== BranchDistributionOrderStatus.PAID &&
        order.status !== BranchDistributionOrderStatus.SENT_TO_WAREHOUSE &&
        order.status !== BranchDistributionOrderStatus.PICKING &&
        order.status !== BranchDistributionOrderStatus.PACKED
      ) {
        throw new BadRequestException('Only pre-shipment orders can be cancelled');
      }
      if (
        order.status === BranchDistributionOrderStatus.INVOICED ||
        order.status === BranchDistributionOrderStatus.PAYMENT_PENDING ||
        order.status === BranchDistributionOrderStatus.PAID ||
        order.status === BranchDistributionOrderStatus.SENT_TO_WAREHOUSE ||
        order.status === BranchDistributionOrderStatus.PICKING ||
        order.status === BranchDistributionOrderStatus.PACKED
      ) {
        const fullOrder = await tx.branchDistributionOrder.findUnique({
          where: { id },
          include: { items: true, sourceWarehouse: true },
        });
        if (fullOrder) {
          for (const item of fullOrder.items) {
            const inventoryProduct = await this.resolveSourceInventoryProduct(
              tx,
              fullOrder.sourceWarehouseId,
              item.productId,
              item.sku,
            );
            await tx.inventoryBalance.updateMany({
              where: {
                branchId: inventoryProduct.branchId,
                warehouseId: fullOrder.sourceWarehouseId,
                productId: inventoryProduct.productId,
                reservedQuantity: { gte: item.quantity },
              },
              data: { reservedQuantity: { decrement: item.quantity } },
            });
          }
        }
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
    if (!canReceiveBranchDistribution(user)) {
      throw new ForbiddenException('Only Branch Warehouse Operator can receive goods at branch');
    }
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.branchDistributionOrder.findFirst({
        where: {
          id,
          deletedAt: null,
          ...(this.canAccessAllDistributionBranches(user) ? {} : { branchId: user.branchId }),
        },
        include: { items: true },
      });
      if (!order) throw new NotFoundException('Distribution order not found');
      if (order.status !== BranchDistributionOrderStatus.SENT && order.status !== BranchDistributionOrderStatus.SHIPPED) {
        throw new BadRequestException('Order must be SHIPPED before receiving');
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

      const transportCostKgs = Math.max(Number(dto.transportCostKgs ?? 0), 0);
      const transportLines = [];
      for (const orderItem of order.items) {
        const received = receivedMap.get(orderItem.id)!;
        const receivedQuantity = Number(received.receivedQuantity);
        if (receivedQuantity <= 0) continue;
        const product = await tx.product.findFirst({
          where: { id: orderItem.productId, deletedAt: null },
          select: { weightKg: true },
        });
        transportLines.push({
          productId: orderItem.productId,
          receivedQuantity,
          weightKg: Number(product?.weightKg ?? 0),
          unitCostKgs: Number(orderItem.unitCost),
        });
      }
      const transportAllocations = allocateBranchReceivingTransportCost(transportLines, transportCostKgs);
      const transportByProductId = new Map(transportAllocations.map((row) => [row.productId, row]));

      const receiving = await tx.goodsReceiving.create({
        data: {
          receivingNumber: await this.generateReceivingNumber(tx),
          distributionOrderId: order.id,
          branchId: order.branchId,
          warehouseId: warehouse.id,
          receivedById: user.id,
          receivedAt: new Date(),
          note: dto.note,
          transportCompany: dto.transportCompany,
          transportCostKgs,
          driverName: dto.driverName,
          vehicleNumber: dto.vehicleNumber,
          arrivalDate: dto.arrivalDate ? new Date(dto.arrivalDate) : new Date(),
          transportNotes: dto.transportNotes,
        },
      });

      const receivingItems = [];
      const shortageItems = [];

      for (const orderItem of order.items) {
        const received = receivedMap.get(orderItem.id)!;
        const receivedQuantity = Number(received.receivedQuantity);
        const sentQuantity = Number(orderItem.quantity);
        const difference = receivedQuantity - sentQuantity;
        const transportCost = transportByProductId.get(orderItem.productId);
        const unitCostWithTransport = transportCost?.finalUnitCostKgs ?? Number(orderItem.unitCost);

        if (receivedQuantity > 0) {
          await this.inventoryService.createStockMovementInTx(tx, user, {
            productId: orderItem.productId,
            warehouseId: warehouse.id,
            type: StockMovementType.IN,
            quantity: receivedQuantity,
            unitCostKgs: unitCostWithTransport,
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
          unitCost: unitCostWithTransport,
          unitPrice: orderItem.unitPrice,
          transportExpenseAllocation: transportCost?.transportExpenseAllocation ?? 0,
          transportCostPerUnit: transportCost?.transportCostPerUnit ?? 0,
          note: received.note,
        });

        if (difference !== 0) {
          const differenceType = resolveDifferenceType(sentQuantity, receivedQuantity, received.note);
          if (!differenceType) continue;
          shortageItems.push({
            productId: orderItem.productId,
            sku: orderItem.sku,
            productName: orderItem.productName,
            expectedQuantity: sentQuantity,
            receivedQuantity,
            differenceQuantity: Math.abs(difference),
            type: differenceType,
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
              : BranchDistributionOrderStatus.RECEIVED_BY_BRANCH,
        },
      });

      const existingInvoice = await tx.branchInvoice.findFirst({
        where: { distributionOrderId: order.id, deletedAt: null },
      });
      if (existingInvoice && !existingInvoice.goodsReceivingId) {
        await tx.branchInvoice.update({
          where: { id: existingInvoice.id },
          data: { goodsReceivingId: receiving.id },
        });
      }

      await this.refreshBranchAccountBalance(tx, order.branchId);

      await this.createWorkflowAlert(tx, user, {
        branchId: order.branchId,
        type: AlertType.BRANCH_GOODS_RECEIVED,
        title: 'Goods received at branch',
        message: `Order ${order.orderNumber} received at branch warehouse`,
        entityType: 'BranchDistributionOrder',
        entityId: order.id,
      });
      if (shortageItems.length > 0 && shortageReport) {
        await this.createWorkflowAlert(tx, user, {
          branchId: order.branchId,
          type: AlertType.DIFFERENCE_ACT_CREATED,
          title: 'Receiving difference act created',
          message: `Difference act ${shortageReport.reportNumber} created for order ${order.orderNumber}`,
          entityType: 'ShortageReport',
          entityId: shortageReport.id,
        });
        await this.createWorkflowAlert(tx, user, {
          branchId: null,
          type: AlertType.SHORTAGE_NEEDS_RESOLUTION,
          title: 'Shortage needs resolution',
          message: `Shortage report ${shortageReport.reportNumber} requires SCM action`,
          entityType: 'ShortageReport',
          entityId: shortageReport.id,
        });
        for (const item of shortageReport.items) {
          await tx.auditLog.create({
            data: {
              userId: user.id,
              role: user.role,
              action: differenceAuditAction(item.type),
              entity: 'ShortageReport',
              entityId: shortageReport.id,
              metadata: buildDiscrepancyActAuditMetadata(
                {
                  batchId: receiving.id,
                  distributionOrderId: order.id,
                  sourceWarehouseId: order.sourceWarehouseId,
                  destinationWarehouseId: warehouse.id,
                  productId: item.productId,
                  expectedQty: item.expectedQuantity,
                  actualQty: item.receivedQuantity,
                  differenceQty: item.differenceQuantity,
                  differenceType: item.type,
                  reason: item.note,
                  createdById: user.id,
                },
                {
                  actNumber: shortageReport.reportNumber,
                  reportNumber: shortageReport.reportNumber,
                  goodsReceivingId: receiving.id,
                  shipmentBatchId: receiving.id,
                  receivingNumber: receiving.receivingNumber,
                  status: shortageReport.status,
                  roles: user.roles ?? [user.role],
                },
              ),
            },
          });
        }
        await tx.auditLog.create({
          data: {
            userId: user.id,
            role: user.role,
            action: 'DISCREPANCY_ACT_CREATED_PER_BATCH',
            entity: 'GoodsReceiving',
            entityId: receiving.id,
            metadata: buildBatchDiscrepancyAuditMetadata(receiving.id, [shortageReport.id], {
              actNumber: shortageReport.reportNumber,
              reportNumber: shortageReport.reportNumber,
              distributionOrderId: order.id,
              sourceWarehouseId: order.sourceWarehouseId,
              destinationWarehouseId: warehouse.id,
              goodsReceivingId: receiving.id,
              receivingNumber: receiving.receivingNumber,
              status: shortageReport.status,
              roles: user.roles ?? [user.role],
            }),
          },
        });
        await this.auditTransfer(tx, user, 'DIFFERENCE_ACT_CREATED', order);
        await this.auditTransfer(tx, user, 'BRANCH_DISCREPANCY_CREATED', order, {
          shortageReportId: shortageReport.id,
          reportNumber: shortageReport.reportNumber,
          goodsReceivingId: receiving.id,
          shipmentBatchId: receiving.id,
        });
      }
      await this.auditTransfer(tx, user, 'BRANCH_RECEIVED_GOODS', order);
      await this.auditTransfer(tx, user, 'BRANCH_GOODS_RECEIVED', order);
      await this.auditTransfer(tx, user, 'GOODS_RECEIVED', order);
      if (transportCostKgs > 0) {
        await this.auditTransfer(tx, user, 'BRANCH_RECEIVING_TRANSPORT_ALLOCATED', order, {
          transportCostKgs,
          allocations: transportAllocations,
        });
      }

      return {
        receiving: await this.receivingInTx(tx, user, receiving.id),
        shortageReport,
        invoice: existingInvoice ? this.toInvoiceResponse(existingInvoice) : null,
      };
    });
  }

  receivings(user: AuthUser, query: DistributionReportQueryDto) {
    this.assertQueryBranchAccess(user, query.branchId);
    return this.prisma.goodsReceiving.findMany({
      where: {
        deletedAt: null,
        ...(this.canAccessAllDistributionBranches(user) ? {} : { branchId: user.branchId }),
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
        ...(this.canAccessAllDistributionBranches(user) ? {} : { branchId: user.branchId }),
      },
      include: this.receivingInclude(),
    });
    if (!receiving) throw new NotFoundException('Receiving not found');
    return receiving;
  }

  shortageReports(user: AuthUser, query: DistributionReportQueryDto) {
    if (!canViewBranchDiscrepancyReports(user) && !this.canAccessAllDistributionBranches(user)) {
      throw new ForbiddenException('You do not have permission to view discrepancy reports');
    }
    this.assertQueryBranchAccess(user, query.branchId);
    return this.prisma.shortageReport.findMany({
      where: {
        deletedAt: null,
        ...(this.canAccessAllDistributionBranches(user) ? {} : { branchId: user.branchId }),
        ...(query.branchId ? { branchId: query.branchId } : {}),
      },
      include: this.shortageInclude(),
      orderBy: { createdAt: 'desc' },
    });
  }

  async shortageReport(user: AuthUser, id: string) {
    if (!canViewBranchDiscrepancyReports(user) && !this.canAccessAllDistributionBranches(user)) {
      throw new ForbiddenException('You do not have permission to view discrepancy reports');
    }
    const report = await this.prisma.shortageReport.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(this.canAccessAllDistributionBranches(user) ? {} : { branchId: user.branchId }),
      },
      include: this.shortageInclude(),
    });
    if (!report) throw new NotFoundException('Shortage report not found');
    return report;
  }

  async resolveShortageReport(user: AuthUser, id: string, dto: ResolveShortageDto) {
    if (!canManageDistributionOrders(user)) {
      throw new ForbiddenException('Недостаточно прав для обработки отчёта о нехватке');
    }
    const report = await this.shortageReport(user, id);
    if (report.status === ShortageReportStatus.RESOLVED || report.status === ShortageReportStatus.CLOSED) {
      throw new BadRequestException('Shortage report is already resolved');
    }
    return this.prisma.$transaction(async (tx) => {
      const resolution = await tx.shortageResolution.upsert({
        where: { shortageReportId: report.id },
        create: {
          shortageReportId: report.id,
          resolutionType: dto.resolutionType,
          replacementOrderId: dto.replacementOrderId,
          nextOrderId: dto.nextOrderId,
          note: dto.note,
          resolvedById: user.id,
        },
        update: {
          resolutionType: dto.resolutionType,
          replacementOrderId: dto.replacementOrderId,
          nextOrderId: dto.nextOrderId,
          note: dto.note,
          resolvedById: user.id,
          resolvedAt: new Date(),
        },
        include: {
          resolvedBy: { select: { id: true, fullName: true, role: true } },
        },
      });

      const updated = await tx.shortageReport.update({
        where: { id: report.id },
        data: { status: ShortageReportStatus.RESOLVED, resolvedAt: new Date() },
        include: this.shortageInclude(),
      });

      if (dto.resolutionType === ShortageResolutionType.SEND_IMMEDIATELY) {
        await this.createWorkflowAlert(tx, user, {
          branchId: report.branchId,
          type: AlertType.REPLACEMENT_GOODS_SHIPPED,
          title: 'Replacement goods scheduled',
          message: `Shortage ${report.reportNumber} will be sent immediately`,
          entityType: 'ShortageReport',
          entityId: report.id,
        });
      }

      await tx.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'SHORTAGE_RESOLVED',
          entity: 'ShortageReport',
          entityId: report.id,
          metadata: {
            resolutionType: dto.resolutionType,
            roles: user.roles ?? [user.role],
          },
        },
      });

      return { ...updated, resolution };
    });
  }

  invoices(user: AuthUser, query: BranchInvoiceQueryDto) {
    if (!canViewDistribution(user) && !canRecordHqDistributionPayment(user)) {
      throw new ForbiddenException('Недостаточно прав для просмотра счетов');
    }
    this.assertQueryBranchAccessForFinance(user, query.branchId);
    const where: Prisma.BranchInvoiceWhereInput = {
      deletedAt: null,
      ...(this.canAccessAllDistributionBranches(user) || canRecordHqDistributionPayment(user) ? {} : { branchId: user.branchId }),
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
    if (!canViewDistribution(user) && !canRecordHqDistributionPayment(user)) {
      throw new ForbiddenException('Недостаточно прав для просмотра счёта');
    }
    const invoice = await this.prisma.branchInvoice.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(this.canAccessAllDistributionBranches(user) || canRecordHqDistributionPayment(user) ? {} : { branchId: user.branchId }),
      },
      include: this.invoiceInclude(),
    });
    if (!invoice) throw new NotFoundException('Branch invoice not found');
    return this.toInvoiceResponse(invoice);
  }

  async addInvoicePayment(user: AuthUser, id: string, dto: AddBranchPaymentDto) {
    if (!canRecordDistributionPayment(user)) {
      throw new ForbiddenException('Недостаточно прав для записи оплаты');
    }
    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.branchInvoice.findFirst({
        where: {
          id,
          deletedAt: null,
          ...(this.canAccessAllDistributionBranches(user) || canRecordHqDistributionPayment(user) ? {} : { branchId: user.branchId }),
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

      const order = await tx.branchDistributionOrder.findFirst({
        where: { id: invoice.distributionOrderId, deletedAt: null },
      });
      if (order) {
        const orderStatus =
          status === BranchInvoiceStatus.PAID
            ? BranchDistributionOrderStatus.PAID
            : status === BranchInvoiceStatus.PARTIALLY_PAID
              ? BranchDistributionOrderStatus.PAYMENT_PENDING
              : order.status;
        if (orderStatus !== order.status) {
          await tx.branchDistributionOrder.update({
            where: { id: order.id },
            data: { status: orderStatus },
          });
        }
      }

      await this.refreshBranchAccountBalance(tx, invoice.branchId);
      await tx.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'PAYMENT_RECEIVED',
          entity: 'BranchInvoice',
          entityId: invoice.id,
          metadata: { amount, method: dto.method, roles: user.roles ?? [user.role] },
        },
      });
      await this.createWorkflowAlert(tx, user, {
        branchId: invoice.branchId,
        type: AlertType.PAYMENT_RECEIVED,
        title: 'Payment received',
        message: `Payment of ${amount} received for invoice ${invoice.invoiceNumber}`,
        entityType: 'BranchInvoice',
        entityId: invoice.id,
      });

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
    if (!this.canManageFinance(user)) {
      return this.prisma.branchAccountBalance.findMany({
        where: { branchId: user.branchId },
        include: { branch: true },
        orderBy: { totalDebt: 'desc' },
      }).then((items) => items.map((item) => this.toBalanceResponse(item)));
    }
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
    if (!isHqWarehouse(sourceWarehouse) || !sourceWarehouse.isActive) {
      throw new BadRequestException('Transfers must originate from an active HQ warehouse');
    }
    if (!isBranchWarehouse(destinationWarehouse)) {
      throw new BadRequestException('Destination warehouse must be a branch warehouse');
    }
    if (destinationWarehouse.branchId !== branch.id) {
      throw new BadRequestException('Destination warehouse must belong to branch');
    }
  }

  private assertHqSourceWarehouse(sourceWarehouse: {
    warehouseType: import('@prisma/client').WarehouseType;
    branchId: string | null;
    isActive: boolean;
    deletedAt: Date | null;
  }) {
    if (!isHqWarehouse(sourceWarehouse) || !sourceWarehouse.isActive || sourceWarehouse.deletedAt) {
      throw new BadRequestException('Transfer source must be an active HQ warehouse');
    }
  }

  private resolveSourceInventoryProduct(
    tx: PrismaTx,
    warehouseId: string,
    productId: string,
    sku: string,
  ) {
    return this.inventoryService.resolveWarehouseInventoryProductInTx(tx, warehouseId, productId, sku);
  }

  private auditTransfer(
    tx: PrismaTx,
    user: AuthUser,
    action: string,
    order: { id: string; orderNumber: string; sourceWarehouseId: string },
    extra?: Record<string, unknown>,
  ) {
    return tx.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action,
        entity: 'BranchDistributionOrder',
        entityId: order.id,
        metadata: {
          warehouseId: order.sourceWarehouseId,
          orderNumber: order.orderNumber,
          roles: user.roles ?? [user.role],
          ...extra,
        },
      },
    });
  }

  private async calculateItems(tx: PrismaTx, dto: CreateDistributionOrderDto, user?: AuthUser) {
    await this.pricingFifoService.syncFifoBatchesFromHqStockMovements(tx);
    const items = [];
    const userRoles = user ? (user.roles?.length ? user.roles : [user.role]) : [];
    const branch = await tx.branch.findUnique({
      where: { id: dto.branchId },
      select: { code: true },
    });
    const isHqOwnedBranch = this.pricingFifoService.isHqOwnedBranch(branch?.code);

    for (const item of dto.items) {
      const product = await tx.product.findFirst({
        where: { id: item.productId, deletedAt: null },
      });
      if (!product) throw new NotFoundException('Product not found');

      const fallbackUnitCost = Number(product.finalCostKgs);
      const fallbackUnitPrice = isHqOwnedBranch
        ? Number(product.hqBranchWholesalePriceKgs)
        : Number(product.sellingPriceKgs);

      const fifoPreview = await this.pricingFifoService.previewFifoAllocation(tx, {
        productId: item.productId,
        warehouseId: dto.sourceWarehouseId,
        quantity: Number(item.quantity),
        isHqOwnedBranch,
        fallbackUnitCost,
        fallbackUnitPrice,
      });

      const unitCost = fifoPreview.allocatedQty > 0 ? fifoPreview.unitCost : fallbackUnitCost;
      const wholesalePrice = fifoPreview.allocatedQty > 0 ? fifoPreview.unitPrice : fallbackUnitPrice;
      const requestedPrice = Number(item.unitPrice);
      if (Math.abs(requestedPrice - wholesalePrice) > 0.01) {
        await tx.auditLog.create({
          data: {
            userId: user?.id ?? 'system',
            role: user?.role ?? Role.SUPPLY_CHAIN_MANAGER,
            action: 'PRICE_OVERRIDE_ATTEMPTED',
            entity: 'Product',
            entityId: product.id,
            metadata: {
              sku: product.sku,
              requestedPrice,
              wholesalePrice,
              roles: userRoles,
            },
          },
        });
        if (!hasAnyFullAccessRole(userRoles)) {
          throw new BadRequestException(
            `Selling price must match approved wholesale price (${wholesalePrice}) for SKU ${product.sku}`,
          );
        }
      }
      const unitPrice = hasAnyFullAccessRole(userRoles) ? requestedPrice : wholesalePrice;
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
      pickingTask: {
        include: {
          assignedWarehouseManager: { select: { id: true, fullName: true, role: true } },
        },
      },
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
      resolution: {
        include: {
          resolvedBy: { select: { id: true, fullName: true, role: true } },
        },
      },
    };
  }

  private receivingInTx(tx: PrismaTx, user: AuthUser, id: string) {
    return tx.goodsReceiving.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(this.canAccessAllDistributionBranches(user) ? {} : { branchId: user.branchId }),
      },
      include: this.receivingInclude(),
    });
  }

  private async generateInvoiceNumber(tx: PrismaTx) {
    const count = await tx.branchInvoice.count();
    return `BI-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(count + 1).padStart(5, '0')}`;
  }

  private async createInvoiceForOrder(
    tx: PrismaTx,
    user: AuthUser,
    order: { id: string; branchId: string; totalAmount: Prisma.Decimal },
  ) {
    const existing = await tx.branchInvoice.findFirst({
      where: { distributionOrderId: order.id, deletedAt: null },
      include: this.invoiceInclude(),
    });
    if (existing) return this.toInvoiceResponse(existing);

    const totalAmount = this.roundMoney(Number(order.totalAmount));
    const issuedAt = new Date();
    const invoice = await tx.branchInvoice.create({
      data: {
        invoiceNumber: await this.generateInvoiceNumber(tx),
        branchId: order.branchId,
        distributionOrderId: order.id,
        totalAmount,
        paidAmount: 0,
        debtAmount: totalAmount,
        dueDate: new Date(issuedAt.getTime() + 15 * 24 * 60 * 60 * 1000),
        issuedAt,
        createdById: user.id,
      },
      include: this.invoiceInclude(),
    });
    await this.refreshBranchAccountBalance(tx, order.branchId);
    return this.toInvoiceResponse(invoice);
  }

  private createWorkflowAlert(
    tx: PrismaTx,
    user: AuthUser,
    data: {
      branchId: string | null;
      type: AlertType;
      title: string;
      message: string;
      entityType?: string;
      entityId?: string;
      referenceNumber?: string;
    },
  ) {
    return this.notificationsService.notifyInTx(tx, user, {
      type: data.type,
      branchId: data.branchId,
      title: data.title,
      message: data.message,
      entityType: data.entityType,
      entityId: data.entityId,
      referenceNumber: data.referenceNumber,
    });
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
        ...(this.canAccessAllDistributionBranches(user) ? {} : { branchId: user.branchId }),
      },
      include: this.include(),
    });
    if (!order) throw new NotFoundException('Distribution order not found');
    await this.assertWarehouseManagerOrderAccess(user, order.sourceWarehouseId);
    return order;
  }

  private async getAccessibleOrderInTx(tx: PrismaTx, user: AuthUser, id: string) {
    const order = await tx.branchDistributionOrder.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(this.canAccessAllDistributionBranches(user) ? {} : { branchId: user.branchId }),
      },
    });
    if (!order) throw new NotFoundException('Distribution order not found');
    await this.assertWarehouseManagerOrderAccess(user, order.sourceWarehouseId);
    return order;
  }

  private async assertWarehouseManagerOrderAccess(user: AuthUser, sourceWarehouseId: string) {
    const roles = resolveUserRoles(user);
    if (!roles.includes(Role.WAREHOUSE_MANAGER) || hasAnyFullAccessRole(roles)) return;
    const assignments = await this.prisma.hqWarehouseManagerAssignment.findMany({
      where: { userId: user.id, status: 'ACTIVE' },
      select: { warehouseId: true },
    });
    const warehouseIds = assignments.map((row) => row.warehouseId);
    if (!warehouseIds.includes(sourceWarehouseId)) {
      throw new ForbiddenException('Недостаточно прав для просмотра заказа распределения');
    }
  }

  private canAccessAllDistributionBranches(user: AuthUser) {
    return canViewDistribution(user) || canRecordHqDistributionPayment(user);
  }

  private canManageFinance(user: AuthUser) {
    return this.canAccessAllDistributionBranches(user) || canRecordDistributionPayment(user);
  }

  private assertQueryBranchAccess(user: AuthUser, branchId?: string) {
    if (!this.canAccessAllDistributionBranches(user) && branchId && branchId !== user.branchId) {
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
