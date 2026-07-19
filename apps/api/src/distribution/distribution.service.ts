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
  BranchInvoicePaymentType,
  BranchOrderInstallmentStatus,
  BranchPaymentConfirmationStatus,
  BranchPurchaseRequestStatus,
  HqStockBookingReleaseReason,
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
import { HqStockBookingService } from '../inventory/hq-stock-booking.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  canCreateDistributionOrder,
  canConfirmBranchInvoicePayment,
  canDispatchFromHq,
  canManageDistributionOrders,
  canReceiveBranchDistribution,
  canRecordDistributionPayment,
  canRecordHqDistributionPayment,
  canRequestBranchOrderInstallment,
  canApproveBranchOrderInstallment,
  canSubmitBranchInvoicePayment,
  canSendInvoiceToCashier,
  canEnterBranchReceivingTransportCost,
  isHqWarehouseLogisticsOnlyUser,
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
import { PricingResolutionService } from '../pricing/pricing-resolution.service';
import { AddBranchPaymentDto } from './dto/add-branch-payment.dto';
import { RejectBranchInstallmentDto, RequestBranchInstallmentDto } from './dto/request-branch-installment.dto';
import { BranchInvoiceQueryDto } from './dto/branch-invoice-query.dto';
import { CreateDistributionOrderDto } from './dto/create-distribution-order.dto';
import { DistributionOrderQueryDto } from './dto/distribution-order-query.dto';
import { DistributionReportQueryDto } from './dto/distribution-report-query.dto';
import { PickingTaskQueryDto } from './dto/picking-task-query.dto';
import { ReceiveDistributionOrderDto } from './dto/receive-distribution-order.dto';
import { SendDistributionOrderDto } from './dto/send-distribution-order.dto';
import { EnterReceivingTransportDto } from './dto/enter-receiving-transport.dto';
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
    private readonly hqStockBookingService: HqStockBookingService,
    private readonly notificationsService: NotificationsService,
    private readonly pricingFifoService: PricingFifoService,
    private readonly pricingResolutionService: PricingResolutionService,
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
    return orders.map((order) => this.toResponse(order, user));
  }

  async detail(user: AuthUser, id: string) {
    if (!canViewDistribution(user)) {
      throw new ForbiddenException('Недостаточно прав для просмотра заказа распределения');
    }
    const order = await this.getAccessibleOrder(user, id);
    return this.toResponse(order, user);
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

  approve(user: AuthUser, id: string, options?: { skipStockReservation?: boolean; skipPermissionCheck?: boolean }) {
    if (!options?.skipPermissionCheck && !canManageDistributionOrders(user)) {
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

      if (!options?.skipStockReservation) {
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
        title: 'Счёт филиалу создан',
        message: `Создан счёт ${invoice.invoiceNumber} по заказу ${updated.orderNumber}`,
        entityType: 'BranchInvoice',
        entityId: invoice.id,
      });
      return this.toResponse({ ...updated, branchInvoice: invoice });
    });
  }

  sendInvoice(user: AuthUser, id: string, options?: { skipPermissionCheck?: boolean }) {
    if (!options?.skipPermissionCheck && !canManageDistributionOrders(user)) {
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
      await this.syncBranchPurchaseRequestPaymentStatus(tx, order.id, 'INVOICE_SENT', user);
      await this.auditTransfer(tx, user, 'INVOICE_SENT', order);
      await tx.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'INVOICE_AUTO_CREATED',
          entity: 'BranchInvoice',
          entityId: invoice.id,
          metadata: {
            invoiceNumber: invoice.invoiceNumber,
            branchId: order.branchId,
            distributionOrderId: order.id,
            roles: user.roles ?? [user.role],
          },
        },
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'INVOICE_ASSIGNED_TO_BRANCH_ACCOUNTANT',
          entity: 'BranchInvoice',
          entityId: invoice.id,
          metadata: {
            invoiceNumber: invoice.invoiceNumber,
            branchId: order.branchId,
            roles: user.roles ?? [user.role],
          },
        },
      });
      await this.createWorkflowAlert(tx, user, {
        branchId: order.branchId,
        type: AlertType.BRANCH_INVOICE_CREATED,
        title: 'Новый счёт на оплату',
        message: `Новый счет на оплату №${invoice.invoiceNumber}`,
        entityType: 'BranchInvoice',
        entityId: invoice.id,
        recipientRoles: [Role.ACCOUNTANT],
      });
      return this.toInvoiceResponse(invoice);
    });
  }

  sendInvoiceToCashier(user: AuthUser, invoiceId: string) {
    if (!canSendInvoiceToCashier(user)) {
      throw new ForbiddenException('Только бухгалтер филиала может передать счёт кассиру');
    }
    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.branchInvoice.findFirst({
        where: { id: invoiceId, deletedAt: null, branchId: user.branchId! },
        include: { branchOrderInstallment: true, distributionOrder: true },
      });
      if (!invoice) throw new NotFoundException('Branch invoice not found');
      if (!invoice.sentToBranchAt) {
        throw new BadRequestException('Счёт ещё не доступен бухгалтеру филиала');
      }
      if (invoice.sentToCashierAt) {
        throw new BadRequestException('Счёт уже передан кассиру');
      }
      if (invoice.status === BranchInvoiceStatus.PAID || invoice.status === BranchInvoiceStatus.CANCELLED) {
        throw new BadRequestException('Счёт уже оплачен или отменён');
      }
      const installment = invoice.branchOrderInstallment;
      if (installment?.status === BranchOrderInstallmentStatus.PENDING) {
        throw new BadRequestException('Рассрочка ожидает утверждения CEO');
      }

      const updated = await tx.branchInvoice.update({
        where: { id: invoice.id },
        data: { sentToCashierAt: new Date() },
        include: this.invoiceInclude(),
      });

      await this.syncBranchPurchaseRequestPaymentStatus(tx, invoice.distributionOrderId, 'SENT_TO_CASHIER', user);

      await tx.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'BRANCH_INVOICE_SENT_TO_CASHIER',
          entity: 'BranchInvoice',
          entityId: invoice.id,
          metadata: {
            invoiceNumber: invoice.invoiceNumber,
            branchId: invoice.branchId,
            roles: user.roles ?? [user.role],
          },
        },
      });

      await this.createWorkflowAlert(tx, user, {
        branchId: invoice.branchId,
        type: AlertType.BRANCH_INVOICE_CREATED,
        title: 'Счёт передан кассиру',
        message: `Счёт ${invoice.invoiceNumber} передан кассиру на оплату`,
        entityType: 'BranchInvoice',
        entityId: invoice.id,
        recipientRoles: [Role.CASHIER],
      });

      return this.toInvoiceResponse(updated);
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
      if (order.status !== BranchDistributionOrderStatus.PAID) {
        throw new BadRequestException(
          'Order must be fully paid or installment-approved before sending to warehouse',
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
        title: 'Заказ передан на склад HQ',
        message: `Заказ ${order.orderNumber} передан на склад HQ для сборки`,
        entityType: 'BranchDistributionOrder',
        entityId: order.id,
      });
      await this.createWorkflowAlert(tx, user, {
        branchId: null,
        type: AlertType.PICKING_TASK_ASSIGNED,
        title: 'Заказ готов к сборке',
        message: `Заказ ${order.orderNumber} готов к сборке на складе HQ`,
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

  send(user: AuthUser, id: string, dto: SendDistributionOrderDto) {
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

      await tx.branchDistributionOrder.update({
        where: { id: order.id },
        data: {
          transportCompany: dto.transportCompany?.trim() || null,
          driverName: dto.driverName?.trim() || null,
          vehicleNumber: dto.vehicleNumber?.trim() || null,
          transportNotes: dto.transportNotes?.trim() || null,
        },
      });

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
        const booking = await tx.hqStockBooking.findFirst({
          where: {
            distributionOrderId: order.id,
            productId: inventoryProduct.productId,
            status: 'CONFIRMED',
          },
        });
        const bookedForOrder = booking?.confirmedQuantity ?? booking?.bookedQuantity ?? 0;
        const availableQuantity =
          (balance?.quantity ?? 0) - (balance?.reservedQuantity ?? 0) + bookedForOrder;
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
          select: { code: true, branchType: true, hqToBranchMarkupPercent: true },
        });
        const branchPricing = branch
          ? {
              branchType: branch.branchType,
              hqToBranchMarkupPercent: Number(branch.hqToBranchMarkupPercent),
            }
          : undefined;
        const isHqOwnedBranch = branch
          ? this.pricingFifoService.isHqBranchType(branch.branchType)
          : false;
        const overrideUnitPriceKgs = await this.pricingResolutionService.resolveBranchProductUnitPrice(
          order.branchId,
          inventoryProduct.productId,
          tx,
        );
        await this.pricingFifoService.consumeFifoForDistribution(tx, {
          productId: inventoryProduct.productId,
          warehouseId: order.sourceWarehouseId,
          quantity: item.quantity,
          isHqOwnedBranch,
          branchPricing,
          distributionOrderId: order.id,
          distributionOrderItemId: item.id,
          userId: user.id,
          userRole: user.role,
          overrideUnitPriceKgs,
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

      await this.hqStockBookingService.consumeBookingsForDispatch(
        tx,
        user,
        order.id,
        order.items.map((item) => ({
          productId: item.productId,
          sku: item.sku,
          quantity: item.quantity,
        })),
      );

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
        title: 'Товар отгружен филиалу',
        message: `Заказ ${order.orderNumber} отгружен филиалу`,
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

      const transportCostKgs = 0;
      const hasPreallocatedDelivery = false;
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
      const transportAllocations = hasPreallocatedDelivery
        ? []
        : allocateBranchReceivingTransportCost(transportLines, transportCostKgs);
      const transportByProductId = hasPreallocatedDelivery
        ? new Map(
            order.items.map((item) => [
              item.productId,
              {
                productId: item.productId,
                transportExpenseAllocation: Number(item.transportExpenseAllocation ?? 0),
                transportCostPerUnit: Number(item.transportCostPerUnit ?? 0),
                finalUnitCostKgs: Number(item.landedUnitCostKgs ?? item.unitCost),
              },
            ]),
          )
        : new Map(transportAllocations.map((row) => [row.productId, row]));

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
          transportCostKgs: 0,
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
        const inventoryQuantity = difference > 0 ? sentQuantity : receivedQuantity;
        const transportCost = transportByProductId.get(orderItem.productId);
        const unitCostWithTransport = transportCost?.finalUnitCostKgs ?? Number(orderItem.unitCost);

        if (inventoryQuantity > 0) {
          await this.inventoryService.createStockMovementInTx(tx, user, {
            productId: orderItem.productId,
            warehouseId: warehouse.id,
            type: StockMovementType.IN,
            quantity: inventoryQuantity,
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
        title: 'Филиал подтвердил приёмку',
        message: `Заказ ${order.orderNumber} принят на складе филиала`,
        entityType: 'BranchDistributionOrder',
        entityId: order.id,
      });
      if (shortageItems.length > 0 && shortageReport) {
        await this.createWorkflowAlert(tx, user, {
          branchId: order.branchId,
          type: AlertType.BRANCH_RECEIVE_DISCREPANCY,
          title: 'При приёмке заказа филиалом обнаружено расхождение',
          message: `Акт расхождения ${shortageReport.reportNumber} по заказу ${order.orderNumber}`,
          entityType: 'ShortageReport',
          entityId: shortageReport.id,
          recipientRoles: [Role.FRANCHISE_OWNER, Role.WAREHOUSE_MANAGER, Role.HQ_SALES_MANAGER],
        });
        await this.createWorkflowAlert(tx, user, {
          branchId: null,
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

      const linkedRequest = await tx.branchPurchaseRequest.findFirst({
        where: { convertedOrderId: order.id, deletedAt: null },
      });
      if (linkedRequest) {
        await tx.branchPurchaseRequest.update({
          where: { id: linkedRequest.id },
          data: {
            status:
              shortageItems.length > 0
                ? BranchPurchaseRequestStatus.RECEIVED_WITH_DIFFERENCE
                : BranchPurchaseRequestStatus.RECEIVED,
          },
        });
      }

      return {
        receiving: await this.receivingInTx(tx, user, receiving.id),
        shortageReport,
        invoice: existingInvoice ? this.toInvoiceResponse(existingInvoice) : null,
      };
    });
  }

  async enterReceivingTransportCost(user: AuthUser, orderId: string, dto: EnterReceivingTransportDto) {
    if (!canEnterBranchReceivingTransportCost(user)) {
      throw new ForbiddenException('Только склад филиала может внести транспортные расходы');
    }
    const transportCostKgs = Math.max(Number(dto.transportCostKgs ?? 0), 0);
    if (transportCostKgs <= 0) {
      throw new BadRequestException('Стоимость доставки должна быть больше нуля');
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.branchDistributionOrder.findFirst({
        where: {
          id: orderId,
          deletedAt: null,
          ...(this.canAccessAllDistributionBranches(user) ? {} : { branchId: user.branchId }),
        },
        include: { items: true },
      });
      if (!order) throw new NotFoundException('Distribution order not found');
      if (
        order.status !== BranchDistributionOrderStatus.RECEIVED_BY_BRANCH &&
        order.status !== BranchDistributionOrderStatus.RECEIVED_WITH_DIFFERENCE &&
        order.status !== BranchDistributionOrderStatus.RECEIVED
      ) {
        throw new BadRequestException('Транспортные расходы можно внести только после приёмки');
      }
      if (Number(order.transportCostKgs ?? 0) > 0 || order.deliveryCostEnteredAt) {
        throw new BadRequestException('Транспортные расходы по этой поставке уже внесены');
      }

      const receiving = await tx.goodsReceiving.findFirst({
        where: { distributionOrderId: order.id, deletedAt: null },
        include: { items: true },
        orderBy: { receivedAt: 'desc' },
      });
      if (!receiving) {
        throw new BadRequestException('Приёмка не найдена');
      }

      const transportLines = [];
      for (const orderItem of order.items) {
        const receivingItem = receiving.items.find((row) => row.distributionOrderItemId === orderItem.id);
        const receivedQuantity = Number(receivingItem?.receivedQuantity ?? 0);
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
      const totalShipmentWeightKg = transportLines.reduce(
        (sum, line) => sum + line.receivedQuantity * line.weightKg,
        0,
      );

      await tx.branchDistributionOrder.update({
        where: { id: order.id },
        data: {
          transportCompany: dto.transportCompany.trim(),
          transportCostKgs,
          transportNotes: dto.comment?.trim() || dto.deliveryDocument?.trim() || null,
          totalShipmentWeightKg,
          deliveryCostEnteredAt: dto.deliveryDate ? new Date(dto.deliveryDate) : new Date(),
          deliveryCostEnteredById: user.id,
        },
      });

      await tx.goodsReceiving.update({
        where: { id: receiving.id },
        data: {
          transportCompany: dto.transportCompany.trim(),
          transportCostKgs,
          transportNotes: dto.comment?.trim() || null,
          arrivalDate: dto.deliveryDate ? new Date(dto.deliveryDate) : receiving.arrivalDate,
        },
      });

      for (const orderItem of order.items) {
        const transportCost = transportByProductId.get(orderItem.productId);
        if (!transportCost) continue;
        await tx.branchDistributionOrderItem.update({
          where: { id: orderItem.id },
          data: {
            transportExpenseAllocation: transportCost.transportExpenseAllocation,
            transportCostPerUnit: transportCost.transportCostPerUnit,
            landedUnitCostKgs: transportCost.finalUnitCostKgs,
          },
        });
        const receivingItem = receiving.items.find((row) => row.distributionOrderItemId === orderItem.id);
        if (receivingItem) {
          await tx.goodsReceivingItem.update({
            where: { id: receivingItem.id },
            data: {
              unitCost: transportCost.finalUnitCostKgs,
              transportExpenseAllocation: transportCost.transportExpenseAllocation,
              transportCostPerUnit: transportCost.transportCostPerUnit,
            },
          });
        }

        const receivedQuantity = Number(receivingItem?.receivedQuantity ?? 0);
        if (receivedQuantity <= 0) continue;

        const balance = await tx.inventoryBalance.findFirst({
          where: {
            warehouseId: receiving.warehouseId,
            productId: orderItem.productId,
          },
        });
        if (!balance) continue;

        const transportDelta = transportCost.transportExpenseAllocation;
        const currentQty = balance.quantity;
        const currentTotalValue = Number(balance.totalValueKgs);
        const newTotalValue = this.roundMoney(currentTotalValue + transportDelta);
        const newAverageCost =
          currentQty > 0 ? this.roundMoney(newTotalValue / currentQty) : Number(balance.averageCostKgs);
        const newLandedCost = this.roundMoney(
          Number(balance.landedCostKgs || balance.averageCostKgs) + transportCost.transportCostPerUnit,
        );

        await tx.inventoryBalance.update({
          where: { id: balance.id },
          data: {
            averageCostKgs: newAverageCost,
            landedCostKgs: newLandedCost,
            totalValueKgs: newTotalValue,
          },
        });

        await tx.stockMovement.create({
          data: {
            branchId: order.branchId,
            warehouseId: receiving.warehouseId,
            productId: orderItem.productId,
            type: StockMovementType.ADJUSTMENT,
            quantity: 0,
            unitCostKgs: transportCost.transportCostPerUnit,
            totalCostKgs: transportDelta,
            note: `Transport cost allocation for ${order.orderNumber}`,
            referenceType: 'GOODS_RECEIVING',
            referenceId: receiving.id,
            createdById: user.id,
          },
        });
      }

      await this.auditTransfer(tx, user, 'BRANCH_RECEIVING_TRANSPORT_ALLOCATED', order, {
        transportCostKgs,
        allocations: transportAllocations,
      });
      await this.auditTransfer(tx, user, 'BRANCH_LANDED_COST_CALCULATED', order, {
        transportCostKgs,
        receivingId: receiving.id,
      });
      await this.auditTransfer(tx, user, 'BRANCH_INVENTORY_COST_UPDATED', order, {
        receivingId: receiving.id,
      });
      await this.syncBranchPurchaseRequestPaymentStatus(tx, order.id, 'TRANSPORT_COST_ENTERED', user);

      const updated = await tx.branchDistributionOrder.findFirst({
        where: { id: order.id },
        include: this.include(),
      });
      return this.toResponse(updated!, user);
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
    if (canSubmitBranchInvoicePayment(user) && !canConfirmBranchInvoicePayment(user)) {
      return this.submitInvoicePayment(user, id, dto);
    }
    if (!canRecordDistributionPayment(user)) {
      throw new ForbiddenException('Недостаточно прав для записи оплаты');
    }
    return this.confirmInvoicePaymentDirect(user, id, dto);
  }

  async submitInvoicePayment(user: AuthUser, id: string, dto: AddBranchPaymentDto) {
    if (!canSubmitBranchInvoicePayment(user)) {
      throw new ForbiddenException('Недостаточно прав для отправки оплаты');
    }
    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.branchInvoice.findFirst({
        where: { id, deletedAt: null, branchId: user.branchId! },
        include: { distributionOrder: true, branchOrderInstallment: true },
      });
      if (!invoice) throw new NotFoundException('Branch invoice not found');
      if (!invoice.sentToCashierAt) {
        throw new BadRequestException('Счёт ещё не передан кассиру бухгалтером');
      }
      if (invoice.status === BranchInvoiceStatus.CANCELLED) {
        throw new BadRequestException('Cannot pay cancelled invoice');
      }
      const pending = await tx.branchPayment.findFirst({
        where: {
          invoiceId: invoice.id,
          deletedAt: null,
          confirmationStatus: BranchPaymentConfirmationStatus.PENDING_CONFIRMATION,
        },
      });
      if (pending) {
        throw new BadRequestException('Оплата уже отправлена на подтверждение');
      }
      const amount = this.roundMoney(Number(dto.amount));
      if (amount <= 0) throw new BadRequestException('Payment amount must be greater than 0');
      if (amount > Number(invoice.debtAmount)) {
        throw new BadRequestException('Payment amount cannot exceed invoice debt');
      }

      const installment = invoice.branchOrderInstallment;
      if (installment?.status === BranchOrderInstallmentStatus.PENDING) {
        throw new BadRequestException('Рассрочка ожидает утверждения CEO');
      }

      const autoValidate = this.shouldAutoValidatePayment(invoice, amount, installment);
      const confirmationStatus = autoValidate
        ? BranchPaymentConfirmationStatus.CONFIRMED
        : BranchPaymentConfirmationStatus.PENDING_CONFIRMATION;

      const payment = await tx.branchPayment.create({
        data: {
          branchId: invoice.branchId,
          invoiceId: invoice.id,
          amount,
          method: dto.method,
          note: dto.note,
          receiptReference: dto.receiptReference,
          confirmationStatus,
          submittedAt: new Date(),
          ...(autoValidate
            ? { confirmedAt: new Date(), confirmedById: user.id, paidAt: new Date() }
            : {}),
          createdById: user.id,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: autoValidate ? 'BRANCH_PAYMENT_AUTO_CONFIRMED' : 'BRANCH_PAYMENT_SUBMITTED',
          entity: 'BranchPayment',
          entityId: payment.id,
          metadata: { invoiceId: invoice.id, amount, method: dto.method, autoValidate, roles: user.roles ?? [user.role] },
        },
      });

      if (autoValidate) {
        return this.applyConfirmedPaymentTotals(tx, user, invoice);
      }

      await this.syncBranchPurchaseRequestPaymentStatus(tx, invoice.distributionOrderId, 'PAYMENT_SUBMITTED', user);
      await this.createWorkflowAlert(tx, user, {
        branchId: invoice.branchId,
        type: AlertType.BRANCH_PAYMENT_SUBMITTED,
        title: 'Оплата требует проверки HQ Finance',
        message: `Оплата по счёту ${invoice.invoiceNumber} требует ручной проверки HQ Finance`,
        entityType: 'BranchInvoice',
        entityId: invoice.id,
        recipientRoles: [Role.FINANCE_MANAGER, Role.HQ_ACCOUNTANT],
      });

      const updated = await tx.branchInvoice.findUniqueOrThrow({
        where: { id: invoice.id },
        include: this.invoiceInclude(),
      });
      return this.toInvoiceResponse(updated);
    });
  }

  private shouldAutoValidatePayment(
    invoice: { debtAmount: Prisma.Decimal; totalAmount: Prisma.Decimal },
    amount: number,
    installment: {
      status: BranchOrderInstallmentStatus;
      firstPaymentRequired: boolean;
      firstPaymentConfirmed: boolean;
      firstPaymentAmount: Prisma.Decimal;
    } | null,
  ) {
    if (installment?.status === BranchOrderInstallmentStatus.PENDING) return false;
    if (installment?.status === BranchOrderInstallmentStatus.APPROVED && installment.firstPaymentRequired) {
      const expected = installment.firstPaymentConfirmed
        ? Number(invoice.debtAmount)
        : Number(installment.firstPaymentAmount);
      return Math.abs(amount - expected) < 0.01;
    }
    return Math.abs(amount - Number(invoice.debtAmount)) < 0.01;
  }

  async confirmInvoicePayment(user: AuthUser, invoiceId: string, paymentId: string) {
    if (!canConfirmBranchInvoicePayment(user)) {
      throw new ForbiddenException('Недостаточно прав для подтверждения оплаты');
    }
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.branchPayment.findFirst({
        where: {
          id: paymentId,
          invoiceId,
          deletedAt: null,
          confirmationStatus: BranchPaymentConfirmationStatus.PENDING_CONFIRMATION,
        },
        include: { invoice: true },
      });
      if (!payment) throw new NotFoundException('Pending payment not found');

      await tx.branchPayment.update({
        where: { id: payment.id },
        data: {
          confirmationStatus: BranchPaymentConfirmationStatus.CONFIRMED,
          confirmedAt: new Date(),
          confirmedById: user.id,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'BRANCH_PAYMENT_CONFIRMED',
          entity: 'BranchPayment',
          entityId: payment.id,
          metadata: { invoiceId, amount: Number(payment.amount), roles: user.roles ?? [user.role] },
        },
      });

      return this.applyConfirmedPaymentTotals(tx, user, payment.invoice);
    });
  }

  async rejectInvoicePayment(user: AuthUser, invoiceId: string, paymentId: string, comment?: string) {
    if (!canConfirmBranchInvoicePayment(user)) {
      throw new ForbiddenException('Недостаточно прав для отклонения оплаты');
    }
    if (!comment?.trim()) {
      throw new BadRequestException('Требуется комментарий при отклонении оплаты');
    }
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.branchPayment.findFirst({
        where: {
          id: paymentId,
          invoiceId,
          deletedAt: null,
          confirmationStatus: BranchPaymentConfirmationStatus.PENDING_CONFIRMATION,
        },
        include: { invoice: true },
      });
      if (!payment) throw new NotFoundException('Pending payment not found');

      await tx.branchPayment.update({
        where: { id: payment.id },
        data: {
          confirmationStatus: BranchPaymentConfirmationStatus.REJECTED,
          rejectedAt: new Date(),
          rejectedById: user.id,
          rejectionComment: comment.trim(),
        },
      });

      await this.syncBranchPurchaseRequestPaymentStatus(tx, payment.invoice.distributionOrderId, 'PAYMENT_REJECTED', user);

      await tx.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'BRANCH_PAYMENT_REJECTED',
          entity: 'BranchPayment',
          entityId: payment.id,
          metadata: { invoiceId, comment: comment.trim(), roles: user.roles ?? [user.role] },
        },
      });
      await this.createWorkflowAlert(tx, user, {
        branchId: payment.branchId,
        type: AlertType.BRANCH_PAYMENT_REJECTED,
        title: 'Оплата отклонена',
        message: `Оплата по счёту ${payment.invoice.invoiceNumber} отклонена: ${comment.trim()}`,
        entityType: 'BranchInvoice',
        entityId: payment.invoice.id,
        recipientRoles: [Role.ACCOUNTANT, Role.CASHIER],
      });

      const updated = await tx.branchInvoice.findUniqueOrThrow({
        where: { id: payment.invoice.id },
        include: this.invoiceInclude(),
      });
      return this.toInvoiceResponse(updated);
    });
  }

  private async confirmInvoicePaymentDirect(user: AuthUser, id: string, dto: AddBranchPaymentDto) {
    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.branchInvoice.findFirst({
        where: {
          id,
          deletedAt: null,
          ...(this.canAccessAllDistributionBranches(user) || canRecordHqDistributionPayment(user)
            ? {}
            : { branchId: user.branchId }),
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
          receiptReference: dto.receiptReference,
          createdById: user.id,
          paidAt: new Date(),
          confirmationStatus: BranchPaymentConfirmationStatus.CONFIRMED,
          submittedAt: new Date(),
          confirmedAt: new Date(),
          confirmedById: user.id,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'BRANCH_PAYMENT_CONFIRMED',
          entity: 'BranchInvoice',
          entityId: invoice.id,
          metadata: { amount, method: dto.method, roles: user.roles ?? [user.role] },
        },
      });

      return this.applyConfirmedPaymentTotals(tx, user, invoice);
    });
  }

  private async applyConfirmedPaymentTotals(
    tx: PrismaTx,
    user: AuthUser,
    invoice: {
      id: string;
      branchId: string;
      distributionOrderId: string;
      totalAmount: Prisma.Decimal;
      invoiceNumber: string;
    },
  ) {
    const paidAggregate = await tx.branchPayment.aggregate({
      where: {
        invoiceId: invoice.id,
        deletedAt: null,
        confirmationStatus: BranchPaymentConfirmationStatus.CONFIRMED,
      },
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

    const installment = await tx.branchOrderInstallment.findFirst({
      where: { invoiceId: invoice.id, status: BranchOrderInstallmentStatus.APPROVED },
    });
    if (
      installment?.firstPaymentRequired &&
      !installment.firstPaymentConfirmed &&
      paidAmount >= Number(installment.firstPaymentAmount)
    ) {
      await tx.branchOrderInstallment.update({
        where: { id: installment.id },
        data: { firstPaymentConfirmed: true },
      });
    }

    if (status === BranchInvoiceStatus.PAID) {
      await this.syncBranchPurchaseRequestPaymentStatus(
        tx,
        invoice.distributionOrderId,
        'PAYMENT_CONFIRMED',
        user,
      );
      await this.createWorkflowAlert(tx, user, {
        branchId: invoice.branchId,
        type: AlertType.PAYMENT_RECEIVED,
        title: 'Оплата подтверждена',
        message: `Оплата по счёту ${invoice.invoiceNumber} подтверждена`,
        entityType: 'BranchInvoice',
        entityId: invoice.id,
      });
      await this.createWorkflowAlert(tx, user, {
        branchId: null,
        type: AlertType.PAYMENT_RECEIVED,
        title: 'Оплата подтверждена',
        message: `Оплата по заказу филиала подтверждена. Можно передать на склад HQ.`,
        entityType: 'BranchInvoice',
        entityId: invoice.id,
        recipientRoles: [Role.HQ_SALES_MANAGER],
      });
    }

    const updated = await tx.branchInvoice.findUniqueOrThrow({
      where: { id: invoice.id },
      include: this.invoiceInclude(),
    });
    return this.toInvoiceResponse(updated);
  }

  private async syncBranchPurchaseRequestPaymentStatus(
    tx: PrismaTx,
    distributionOrderId: string | null,
    event:
      | 'INVOICE_SENT'
      | 'SENT_TO_CASHIER'
      | 'PAYMENT_SUBMITTED'
      | 'PAYMENT_REJECTED'
      | 'PAYMENT_CONFIRMED'
      | 'INSTALLMENT_PENDING'
      | 'INSTALLMENT_APPROVED'
      | 'INSTALLMENT_REJECTED'
      | 'TRANSPORT_COST_ENTERED',
    user: AuthUser,
  ) {
    if (!distributionOrderId) return;

    const linkedRequest = await tx.branchPurchaseRequest.findFirst({
      where: { convertedOrderId: distributionOrderId, deletedAt: null },
    });
    if (!linkedRequest) return;

    const invoice = await tx.branchInvoice.findFirst({
      where: { distributionOrderId, deletedAt: null },
      include: { branchOrderInstallment: true },
    });
    const installment = invoice?.branchOrderInstallment ?? null;

    let nextStatus: BranchPurchaseRequestStatus | null = null;

    switch (event) {
      case 'INVOICE_SENT':
        nextStatus = BranchPurchaseRequestStatus.PENDING_PAYMENT;
        break;
      case 'SENT_TO_CASHIER':
        nextStatus = BranchPurchaseRequestStatus.PENDING_PAYMENT;
        break;
      case 'PAYMENT_SUBMITTED':
        nextStatus = BranchPurchaseRequestStatus.PAYMENT_SUBMITTED;
        break;
      case 'PAYMENT_REJECTED':
        nextStatus = BranchPurchaseRequestStatus.PAYMENT_REJECTED;
        break;
      case 'PAYMENT_CONFIRMED':
        if (installment?.status === BranchOrderInstallmentStatus.APPROVED) {
          if (installment.firstPaymentRequired && !installment.firstPaymentConfirmed) {
            nextStatus = BranchPurchaseRequestStatus.PAYMENT_SUBMITTED;
          } else {
            nextStatus = BranchPurchaseRequestStatus.PAYMENT_CONFIRMED;
          }
        } else if (installment?.status === BranchOrderInstallmentStatus.PENDING) {
          nextStatus = BranchPurchaseRequestStatus.PENDING_INSTALLMENT_APPROVAL;
        } else if (!installment) {
          nextStatus = BranchPurchaseRequestStatus.PAYMENT_CONFIRMED;
        }
        break;
      case 'INSTALLMENT_PENDING':
        nextStatus = BranchPurchaseRequestStatus.PENDING_INSTALLMENT_APPROVAL;
        break;
      case 'INSTALLMENT_APPROVED':
        nextStatus = BranchPurchaseRequestStatus.PENDING_PAYMENT;
        break;
      case 'INSTALLMENT_REJECTED':
        nextStatus = BranchPurchaseRequestStatus.PENDING_PAYMENT;
        break;
      case 'TRANSPORT_COST_ENTERED':
        nextStatus = BranchPurchaseRequestStatus.COMPLETED;
        break;
    }

    if (!nextStatus || nextStatus === linkedRequest.status) return;

    await tx.branchPurchaseRequest.update({
      where: { id: linkedRequest.id },
      data: { status: nextStatus },
    });

    if (nextStatus === BranchPurchaseRequestStatus.PAYMENT_CONFIRMED) {
      await this.hqStockBookingService.extendBookingsAfterPayment(linkedRequest.id, tx);
      await tx.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'BRANCH_ORDER_PAYMENT_CONFIRMED',
          entity: 'BranchPurchaseRequest',
          entityId: linkedRequest.id,
          metadata: {
            distributionOrderId,
            oldStatus: linkedRequest.status,
            newStatus: nextStatus,
            roles: user.roles ?? [user.role],
          },
        },
      });
    }
  }

  async requestInvoiceInstallment(user: AuthUser, invoiceId: string, dto: RequestBranchInstallmentDto) {
    if (!canRequestBranchOrderInstallment(user)) {
      throw new ForbiddenException('Недостаточно прав для запроса рассрочки');
    }
    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.branchInvoice.findFirst({
        where: { id: invoiceId, deletedAt: null, branchId: user.branchId! },
        include: { branchOrderInstallment: true, distributionOrder: true },
      });
      if (!invoice) throw new NotFoundException('Branch invoice not found');
      if (invoice.branchOrderInstallment) {
        throw new BadRequestException('Рассрочка по этому счёту уже запрошена');
      }

      const linkedRequest = await tx.branchPurchaseRequest.findFirst({
        where: { convertedOrderId: invoice.distributionOrderId, deletedAt: null },
      });

      const installment = await tx.branchOrderInstallment.create({
        data: {
          branchId: invoice.branchId,
          invoiceId: invoice.id,
          branchPurchaseRequestId: linkedRequest?.id,
          totalAmount: invoice.totalAmount,
          firstPaymentAmount: dto.firstPaymentAmount,
          termMonths: dto.termMonths,
          firstPaymentRequired: dto.firstPaymentRequired ?? true,
          requestedById: user.id,
          requestComment: dto.comment?.trim() || null,
          installmentDueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        },
      });

      await tx.branchInvoice.update({
        where: { id: invoice.id },
        data: {
          paymentType: BranchInvoicePaymentType.INSTALLMENT,
          ...(dto.dueDate ? { dueDate: new Date(dto.dueDate) } : {}),
        },
      });

      if (linkedRequest) {
        await this.syncBranchPurchaseRequestPaymentStatus(
          tx,
          invoice.distributionOrderId,
          'INSTALLMENT_PENDING',
          user,
        );
      }

      await tx.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'INSTALLMENT_REQUESTED',
          entity: 'BranchOrderInstallment',
          entityId: installment.id,
          metadata: {
            invoiceId,
            firstPaymentAmount: dto.firstPaymentAmount,
            termMonths: dto.termMonths,
            roles: user.roles ?? [user.role],
          },
        },
      });

      await this.createWorkflowAlert(tx, user, {
        branchId: invoice.branchId,
        type: AlertType.BRANCH_INSTALLMENT_REQUESTED,
        title: 'Запрос рассрочки по заказу филиала',
        message: `Филиал запросил рассрочку по счёту ${invoice.invoiceNumber}`,
        entityType: 'BranchInvoice',
        entityId: invoice.id,
        recipientRoles: [Role.CEO, Role.OWNER],
      });

      const updated = await tx.branchInvoice.findUniqueOrThrow({
        where: { id: invoice.id },
        include: this.invoiceInclude(),
      });
      return this.toInvoiceResponse(updated);
    });
  }

  async approveInvoiceInstallment(user: AuthUser, invoiceId: string) {
    if (!canApproveBranchOrderInstallment(user)) {
      throw new ForbiddenException('Недостаточно прав для утверждения рассрочки');
    }
    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.branchInvoice.findFirst({
        where: { id: invoiceId, deletedAt: null },
        include: { branchOrderInstallment: true },
      });
      if (!invoice?.branchOrderInstallment) {
        throw new NotFoundException('Запрос рассрочки не найден');
      }
      if (invoice.branchOrderInstallment.status !== BranchOrderInstallmentStatus.PENDING) {
        throw new BadRequestException('Рассрочка уже рассмотрена');
      }

      await tx.branchOrderInstallment.update({
        where: { id: invoice.branchOrderInstallment.id },
        data: {
          status: BranchOrderInstallmentStatus.APPROVED,
          approvedById: user.id,
          decidedAt: new Date(),
        },
      });

      await this.syncBranchPurchaseRequestPaymentStatus(
        tx,
        invoice.distributionOrderId,
        'INSTALLMENT_APPROVED',
        user,
      );

      await tx.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'BRANCH_INSTALLMENT_APPROVED',
          entity: 'BranchOrderInstallment',
          entityId: invoice.branchOrderInstallment.id,
          metadata: { invoiceId, roles: user.roles ?? [user.role] },
        },
      });

      await this.createWorkflowAlert(tx, user, {
        branchId: invoice.branchId,
        type: AlertType.BRANCH_INSTALLMENT_APPROVED,
        title: 'Рассрочка утверждена',
        message: `CEO утвердил рассрочку по счёту ${invoice.invoiceNumber}`,
        entityType: 'BranchInvoice',
        entityId: invoice.id,
        recipientRoles: [Role.ACCOUNTANT, Role.MANAGER],
      });

      const updated = await tx.branchInvoice.findUniqueOrThrow({
        where: { id: invoice.id },
        include: this.invoiceInclude(),
      });
      return this.toInvoiceResponse(updated);
    });
  }

  async rejectInvoiceInstallment(user: AuthUser, invoiceId: string, dto: RejectBranchInstallmentDto) {
    if (!canApproveBranchOrderInstallment(user)) {
      throw new ForbiddenException('Недостаточно прав для отклонения рассрочки');
    }
    if (!dto.comment?.trim()) {
      throw new BadRequestException('Требуется комментарий при отклонении рассрочки');
    }
    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.branchInvoice.findFirst({
        where: { id: invoiceId, deletedAt: null },
        include: { branchOrderInstallment: true },
      });
      if (!invoice?.branchOrderInstallment) {
        throw new NotFoundException('Запрос рассрочки не найден');
      }
      if (invoice.branchOrderInstallment.status !== BranchOrderInstallmentStatus.PENDING) {
        throw new BadRequestException('Рассрочка уже рассмотрена');
      }

      await tx.branchOrderInstallment.update({
        where: { id: invoice.branchOrderInstallment.id },
        data: {
          status: BranchOrderInstallmentStatus.REJECTED,
          rejectedById: user.id,
          rejectionComment: dto.comment.trim(),
          decidedAt: new Date(),
        },
      });

      const linkedRequest = await tx.branchPurchaseRequest.findFirst({
        where: { convertedOrderId: invoice.distributionOrderId, deletedAt: null },
      });
      if (linkedRequest) {
        await this.hqStockBookingService.releaseAllForRequestInTx(
          tx,
          user,
          linkedRequest.id,
          HqStockBookingReleaseReason.INSTALLMENT_REJECTED,
        );
        await this.syncBranchPurchaseRequestPaymentStatus(
          tx,
          invoice.distributionOrderId,
          'INSTALLMENT_REJECTED',
          user,
        );
      }

      await tx.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'BRANCH_INSTALLMENT_REJECTED',
          entity: 'BranchOrderInstallment',
          entityId: invoice.branchOrderInstallment.id,
          metadata: { invoiceId, comment: dto.comment.trim(), roles: user.roles ?? [user.role] },
        },
      });

      await this.createWorkflowAlert(tx, user, {
        branchId: invoice.branchId,
        type: AlertType.BRANCH_INSTALLMENT_REJECTED,
        title: 'Рассрочка отклонена',
        message: `CEO отклонил рассрочку по счёту ${invoice.invoiceNumber}: ${dto.comment.trim()}`,
        entityType: 'BranchInvoice',
        entityId: invoice.id,
        recipientRoles: [Role.ACCOUNTANT, Role.MANAGER],
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
      select: { code: true, branchType: true, hqToBranchMarkupPercent: true },
    });
    const branchPricing = branch
      ? {
          branchType: branch.branchType,
          hqToBranchMarkupPercent: Number(branch.hqToBranchMarkupPercent),
        }
      : undefined;
    const isHqOwnedBranch = branch ? this.pricingFifoService.isHqBranchType(branch.branchType) : false;

    for (const item of dto.items) {
      const product = await tx.product.findFirst({
        where: { id: item.productId, deletedAt: null },
      });
      if (!product) throw new NotFoundException('Product not found');

      const fallbackUnitCost = Number(product.finalCostKgs);
      const fallbackUnitPrice = branchPricing
        ? this.pricingFifoService.isHqBranchType(branchPricing.branchType)
          ? fallbackUnitCost
          : Number(product.hqBranchWholesalePriceKgs)
        : isHqOwnedBranch
          ? Number(product.hqBranchWholesalePriceKgs)
          : Number(product.sellingPriceKgs);

      const overrideUnitPriceKgs = await this.pricingResolutionService.resolveBranchProductUnitPrice(
        dto.branchId,
        item.productId,
        tx,
      );
      const priceFreeze = await this.pricingResolutionService.resolveWithFreeze(
        dto.branchId,
        item.productId,
        {
          auditUser: user,
          auditEntity: 'BranchDistributionOrderItem',
        },
      );

      const fifoPreview = await this.pricingFifoService.previewFifoAllocation(tx, {
        productId: item.productId,
        warehouseId: dto.sourceWarehouseId,
        quantity: Number(item.quantity),
        isHqOwnedBranch,
        branchPricing,
        fallbackUnitCost,
        fallbackUnitPrice,
        overrideUnitPriceKgs,
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
        pricingPolicyVersionId: priceFreeze.pricingPolicyVersionId,
        pricingProfileId: priceFreeze.pricingProfileId,
        resolvedPriceKgs: priceFreeze.resolvedPriceKgs,
        baseCostKgs: priceFreeze.baseCostKgs,
        baseBranchPriceKgs: priceFreeze.baseBranchPriceKgs,
        appliedRuleType: priceFreeze.appliedRuleType,
        appliedRuleId: priceFreeze.appliedRuleId,
        appliedAdjustmentMode: priceFreeze.appliedAdjustmentMode,
        appliedAdjustmentValue: priceFreeze.appliedAdjustmentValue,
        priceResolvedAt: priceFreeze.priceResolvedAt,
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
          confirmedBy: { select: { id: true, fullName: true, role: true } },
          rejectedBy: { select: { id: true, fullName: true, role: true } },
        },
        orderBy: { paidAt: 'desc' as const },
      },
      branchOrderInstallment: true,
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
      recipientRoles?: Role[];
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
      recipientRoles: data.recipientRoles,
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

  private async allocateOrderDeliveryCost(
    tx: PrismaTx,
    items: Array<{ productId: string; quantity: number; unitCost: Prisma.Decimal | number }>,
    transportCostKgs: number,
  ) {
    const transportLines = [];
    let totalShipmentWeightKg = 0;
    for (const item of items) {
      const product = await tx.product.findFirst({
        where: { id: item.productId, deletedAt: null },
        select: { weightKg: true },
      });
      const weightKg = Number(product?.weightKg ?? 0);
      const lineWeight = weightKg > 0 ? weightKg * item.quantity : 0;
      totalShipmentWeightKg += lineWeight;
      transportLines.push({
        productId: item.productId,
        receivedQuantity: item.quantity,
        weightKg,
        unitCostKgs: Number(item.unitCost),
      });
    }
    const allocations = allocateBranchReceivingTransportCost(transportLines, transportCostKgs);
    return {
      allocations,
      totalShipmentWeightKg: Math.round((totalShipmentWeightKg + Number.EPSILON) * 1000) / 1000,
    };
  }

  private toResponse(order: any, user?: AuthUser) {
    const transportCostKgs = Number(order.transportCostKgs ?? 0);
    const totalShipmentWeightKg = Number(order.totalShipmentWeightKg ?? 0);
    const items = order.items?.map((item: any) => {
      const unitCost = Number(item.unitCost);
      const transportExpenseAllocation = Number(item.transportExpenseAllocation ?? 0);
      const transportCostPerUnit = Number(item.transportCostPerUnit ?? 0);
      const landedUnitCostKgs = Number(item.landedUnitCostKgs ?? unitCost + transportCostPerUnit);
      return {
        ...item,
        unitCost,
        unitPrice: Number(item.unitPrice),
        totalCost: Number(item.totalCost),
        totalPrice: Number(item.totalPrice),
        profit: Number(item.profit),
        transportExpenseAllocation,
        transportCostPerUnit,
        landedUnitCostKgs,
        transferCostKgs: unitCost,
        deliveryCostKgs: transportExpenseAllocation,
        totalLandedCostKgs: landedUnitCostKgs * Number(item.quantity),
      };
    });
    const productCostTotal = items?.reduce((sum: number, item: any) => sum + item.unitCost * item.quantity, 0) ?? 0;
    const deliveryCostTotal =
      items?.reduce((sum: number, item: any) => sum + item.transportExpenseAllocation, 0) ?? transportCostKgs;
    const landedCostTotal =
      items?.reduce((sum: number, item: any) => sum + item.landedUnitCostKgs * item.quantity, 0) ?? productCostTotal;
    const costPerKg =
      totalShipmentWeightKg > 0 && transportCostKgs > 0
        ? Math.round((transportCostKgs / totalShipmentWeightKg + Number.EPSILON) * 100) / 100
        : 0;

    const response = {
      ...order,
      totalAmount: Number(order.totalAmount),
      totalCost: Number(order.totalCost),
      totalProfit: Number(order.totalProfit),
      transportCostKgs,
      totalShipmentWeightKg,
      deliveryCostSummary: {
        transportCostKgs,
        totalShipmentWeightKg,
        costPerKg,
        productCostTotal: Math.round((productCostTotal + Number.EPSILON) * 100) / 100,
        deliveryCostTotal: Math.round((deliveryCostTotal + Number.EPSILON) * 100) / 100,
        landedCostTotal: Math.round((landedCostTotal + Number.EPSILON) * 100) / 100,
      },
      items,
      branchInvoice: order.branchInvoice
        ? this.toInvoiceResponse(order.branchInvoice)
        : order.branchInvoice,
    };

    if (user && isHqWarehouseLogisticsOnlyUser(user)) {
      return this.sanitizeDistributionOrderForHqWarehouse(response);
    }
    return response;
  }

  private sanitizeDistributionOrderForHqWarehouse(order: any) {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      branchId: order.branchId,
      branch: order.branch ? { id: order.branch.id, name: order.branch.name, code: order.branch.code } : order.branch,
      sourceWarehouseId: order.sourceWarehouseId,
      sourceWarehouse: order.sourceWarehouse
        ? { id: order.sourceWarehouse.id, name: order.sourceWarehouse.name, code: order.sourceWarehouse.code }
        : order.sourceWarehouse,
      destinationWarehouseId: order.destinationWarehouseId,
      destinationWarehouse: order.destinationWarehouse
        ? { id: order.destinationWarehouse.id, name: order.destinationWarehouse.name, code: order.destinationWarehouse.code }
        : order.destinationWarehouse,
      status: order.status,
      note: order.note,
      sentAt: order.sentAt,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      transportCompany: order.transportCompany,
      driverName: order.driverName,
      vehicleNumber: order.vehicleNumber,
      transportNotes: order.transportNotes,
      pickingTask: order.pickingTask,
      items: order.items?.map((item: any) => ({
        id: item.id,
        productId: item.productId,
        sku: item.sku,
        productName: item.productName,
        quantity: item.quantity,
        unit: item.unit,
        product: item.product
          ? { id: item.product.id, sku: item.product.sku, name: item.product.name, unit: item.product.unit }
          : item.product,
      })),
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
      branchOrderInstallment: invoice.branchOrderInstallment
        ? {
            ...invoice.branchOrderInstallment,
            totalAmount: Number(invoice.branchOrderInstallment.totalAmount),
            firstPaymentAmount: Number(invoice.branchOrderInstallment.firstPaymentAmount),
          }
        : null,
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
