import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AlertType,
  BranchDistributionOrderStatus,
  BranchInstallmentEarlyPaymentStatus,
  BranchInvoiceStatus,
  BranchInvoicePaymentType,
  BranchInvoiceCategory,
  BranchOrderInstallmentStatus,
  BranchPaymentConfirmationStatus,
  BranchPurchaseRequestStatus,
  BranchType,
  HqStockBookingReleaseReason,
  HqWarehousePickingTaskStatus,
  Prisma,
  Role,
  ShortageReportItemType,
  ShortageReportStatus,
  ShortageResolutionType,
  StockMovementStatus,
  StockMovementType,
  WarehouseType,
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
  canEnterBranchTransportCost,
  canViewProductCost,
  isHqWarehouseLogisticsOnlyUser,
  isBranchOwnerUser,
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
import {
  BRANCH_ORDER_COST_MISMATCH_MESSAGE,
  logBranchTransferReconciliationFailure,
  reconcileBranchTransferCost,
} from '../pricing/cost-reconciliation.util';
import {
  deriveDisplayUnitCost,
  roundDisplayMoney,
  sumDisplayMoneyTotals,
} from '../pricing/product-cost-precision.util';
import { AddBranchPaymentDto } from './dto/add-branch-payment.dto';
import { RejectBranchInstallmentDto, RequestBranchInstallmentDto } from './dto/request-branch-installment.dto';
import {
  buildBranchOrderInstallmentSchedule,
  computeBranchOrderRemainingDebt,
  isZeroInitialPayment,
  validateBranchOrderInstallmentAmounts,
} from './branch-order-installment.util';
import { canStartHqWarehouseFulfillment } from './branch-order-warehouse-eligibility.util';
import { BranchInstallmentEarlyPaymentService } from './branch-installment-early-payment.service';
import { BranchInvoiceQueryDto } from './dto/branch-invoice-query.dto';
import { CreateDistributionOrderDto } from './dto/create-distribution-order.dto';
import { DistributionOrderQueryDto } from './dto/distribution-order-query.dto';
import { DistributionReportQueryDto } from './dto/distribution-report-query.dto';
import { PickingTaskQueryDto } from './dto/picking-task-query.dto';
import { ReceiveDistributionOrderDto } from './dto/receive-distribution-order.dto';
import { SaveBranchReceivingDraftRowDto } from './dto/save-branch-receiving-draft-row.dto';
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
import {
  normalizeReceivingLine,
  resolveReceivingDifferenceQuantity,
} from './branch-receiving.util';
import { resolveMasterProductForReceivingInTx } from './branch-receiving-product.util';
import { sanitizeDistributionOrderForBranchCeo } from './branch-ceo-distribution.presenter';
import {
  buildBranchReceivingDiscrepancyPayload,
  mapDraftRowToLineItem,
  normalizeBranchReceivingDraftInput,
} from './branch-receiving-draft.util';
import { buildReceivingProgress, resolveReceivingRowStatus } from './receiving-draft.util';

type PrismaTx = Prisma.TransactionClient;

@Injectable()
export class DistributionService {
  private readonly logger = new Logger(DistributionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly hqStockBookingService: HqStockBookingService,
    private readonly notificationsService: NotificationsService,
    private readonly pricingFifoService: PricingFifoService,
    private readonly pricingResolutionService: PricingResolutionService,
    private readonly earlyPaymentService: BranchInstallmentEarlyPaymentService,
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
    const response = this.toResponse(order, user);
    const receivingExtras = await this.buildBranchReceivingDetailExtras(order);
    return { ...response, ...receivingExtras };
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

      // Always reserve HQ FIFO layers on approve so shipment consumes the same layers.
      for (const item of order.items) {
        const inventoryProduct = await this.resolveSourceInventoryProduct(
          tx,
          order.sourceWarehouseId,
          item.productId,
          item.sku,
        );
        const branch = await tx.branch.findUnique({
          where: { id: order.branchId },
          select: { branchType: true, hqToBranchMarkupPercent: true },
        });
        const product = await tx.product.findFirst({
          where: { id: inventoryProduct.productId, deletedAt: null },
          select: { hqBranchWholesaleMarkupPercent: true },
        });
        const productMarkup = Number(product?.hqBranchWholesaleMarkupPercent ?? 0);
        const branchMarkup = Number(branch?.hqToBranchMarkupPercent ?? 0);
        const markupPercent = productMarkup > 0 ? productMarkup : branchMarkup;
        const isHqOwnedBranch = branch
          ? this.pricingFifoService.isHqBranchType(branch.branchType)
          : false;
        try {
          const reserved = await this.pricingFifoService.reserveFifoForDistribution(tx, {
            productId: inventoryProduct.productId,
            warehouseId: order.sourceWarehouseId,
            quantity: item.quantity,
            isHqOwnedBranch,
            branchPricing: branch
              ? { branchType: branch.branchType, hqToBranchMarkupPercent: markupPercent }
              : undefined,
            distributionOrderId: order.id,
            distributionOrderItemId: item.id,
            userId: user.id,
            userRole: user.role,
          });
          if ('totalCostKgs' in reserved) {
            const totalCost = roundDisplayMoney(Number(reserved.totalCostKgs ?? 0));
            const totalPrice = roundDisplayMoney(Number(reserved.totalPriceKgs ?? 0));
            await tx.branchDistributionOrderItem.update({
              where: { id: item.id },
              data: {
                unitCost: item.quantity > 0 ? deriveDisplayUnitCost(totalCost, item.quantity) : 0,
                unitPrice: item.quantity > 0 ? deriveDisplayUnitCost(totalPrice, item.quantity) : 0,
                totalCost,
                totalPrice,
                profit: roundDisplayMoney(totalPrice - totalCost),
              },
            });
          }
        } catch (error) {
          throw new BadRequestException(
            error instanceof Error ? error.message : `FIFO reservation failed for SKU ${item.sku}`,
          );
        }
      }

      const refreshedItems = await tx.branchDistributionOrderItem.findMany({
        where: { orderId: order.id },
      });
      const totalAmount = sumDisplayMoneyTotals(refreshedItems.map((row) => Number(row.totalPrice)));
      const totalCostSum = sumDisplayMoneyTotals(refreshedItems.map((row) => Number(row.totalCost)));
      await tx.branchDistributionOrder.update({
        where: { id: order.id },
        data: {
          totalAmount,
          totalCost: totalCostSum,
          totalProfit: roundDisplayMoney(totalAmount - totalCostSum),
        },
      });

      const fifoAllocations = await tx.distributionFifoAllocation.findMany({
        where: {
          distributionOrderItem: { orderId: order.id },
          status: { in: ['RESERVED', 'CONSUMED'] },
        },
        select: { totalCostKgs: true },
      });
      const transferReconciliation = reconcileBranchTransferCost(
        fifoAllocations.map((row) => Number(row.totalCostKgs)),
        totalCostSum,
        'branch distribution approve',
      );
      if (!transferReconciliation.ok) {
        logBranchTransferReconciliationFailure(this.logger, transferReconciliation, {
          orderId: order.id,
          warehouseId: order.sourceWarehouseId,
        });
        throw new BadRequestException(BRANCH_ORDER_COST_MISMATCH_MESSAGE);
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
        include: { branchInvoices: true },
      });
      if (!order) throw new NotFoundException('Distribution order not found');
      if (order.status !== BranchDistributionOrderStatus.INVOICED) {
        throw new BadRequestException('Invoice can only be sent for invoiced orders');
      }
      const productInvoice = this.resolveProductBranchInvoice(order);
      if (!productInvoice) {
        throw new BadRequestException('Invoice not found for this order');
      }
      const invoice = await tx.branchInvoice.update({
        where: { id: productInvoice.id },
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
      if (
        installment?.status === BranchOrderInstallmentStatus.APPROVED &&
        !installment.firstPaymentRequired
      ) {
        throw new BadRequestException(
          'Для рассрочки без первоначального взноса используйте запрос досрочного погашения',
        );
      }
      if (
        installment?.status === BranchOrderInstallmentStatus.APPROVED &&
        installment.firstPaymentRequired &&
        installment.firstPaymentConfirmed
      ) {
        throw new BadRequestException(
          'Для дополнительных платежей создайте запрос досрочного погашения',
        );
      }
      const approvedEarlyPayment = await tx.branchInstallmentEarlyPaymentRequest.findFirst({
        where: {
          invoiceId: invoice.id,
          status: {
            in: [
              BranchInstallmentEarlyPaymentStatus.APPROVED_BY_BRANCH_CEO,
              BranchInstallmentEarlyPaymentStatus.SENT_TO_CASHIER,
              BranchInstallmentEarlyPaymentStatus.PAYMENT_SUBMITTED,
            ],
          },
        },
      });
      if (approvedEarlyPayment) {
        throw new BadRequestException(
          'Используйте отправку в кассу для утверждённого досрочного погашения',
        );
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
        include: {
          branchInvoices: { include: { branchOrderInstallment: true } },
          items: true,
        },
      });
      if (!order) throw new NotFoundException('Distribution order not found');
      const productInvoice = this.resolveProductBranchInvoice(order);
      const installment = productInvoice?.branchOrderInstallment ?? null;
      const eligibility = canStartHqWarehouseFulfillment(order, installment);
      if (!eligibility.allowed) {
        if (eligibility.reason === 'INSTALLMENT_PENDING') {
          throw new BadRequestException('Рассрочка ожидает утверждения CEO — склад не может обработать заказ');
        }
        if (eligibility.reason === 'INSTALLMENT_REJECTED') {
          throw new BadRequestException('Рассрочка отклонена — склад не может обработать заказ');
        }
        throw new BadRequestException(
          'Order must be fully paid or installment-approved before sending to warehouse',
        );
      }
      if (!productInvoice?.sentToBranchAt) {
        throw new BadRequestException('Invoice must be sent to branch first');
      }

      const alreadyInWarehouse =
        order.status === BranchDistributionOrderStatus.SENT_TO_WAREHOUSE ||
        order.status === BranchDistributionOrderStatus.PICKING ||
        order.status === BranchDistributionOrderStatus.PACKED ||
        order.status === BranchDistributionOrderStatus.SHIPPED;
      const updated = alreadyInWarehouse
        ? await tx.branchDistributionOrder.findUniqueOrThrow({
            where: { id },
            include: this.include(),
          })
        : await tx.branchDistributionOrder.update({
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
        await tx.auditLog.create({
          data: {
            userId: user.id,
            role: user.role,
            action: 'HQ_WAREHOUSE_TASK_CREATED',
            entity: 'HqWarehousePickingTask',
            entityId: id,
            metadata: {
              distributionOrderId: id,
              sourceHqWarehouseId: order.sourceWarehouseId,
              installmentApproved: installment?.status === BranchOrderInstallmentStatus.APPROVED,
              roles: user.roles ?? [user.role],
            },
          },
        });
      }

      if (alreadyInWarehouse && existingTask) {
        return this.toResponse(updated);
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
            branchInvoices: true,
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
      await this.assertWarehouseFulfillmentAllowed(tx, order);
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

      const weightSnapshot = await this.buildDispatchWeightSnapshot(tx, order.items);
      if (weightSnapshot.missingWeightProducts.length > 0) {
        const productName = weightSnapshot.missingWeightProducts[0]!;
        throw new BadRequestException(
          `Невозможно рассчитать общий вес партии. Для товара ${productName} не указан вес.`,
        );
      }

      for (const line of weightSnapshot.lines) {
        await tx.branchDistributionOrderItem.update({
          where: { id: line.itemId },
          data: {
            dispatchedQuantity: line.dispatchedQuantity,
            unitWeightKgSnapshot: line.unitWeightKg,
            lineWeightKgSnapshot: line.lineWeightKg,
          },
        });
      }

      await tx.branchDistributionOrder.update({
        where: { id: order.id },
        data: {
          transportCompany: dto.transportCompany?.trim() || null,
          driverName: dto.driverName?.trim() || null,
          vehicleNumber: dto.vehicleNumber?.trim() || null,
          transportNotes: dto.transportNotes?.trim() || null,
          totalShipmentWeightKg: weightSnapshot.totalShipmentWeightKg,
          weightSnapshotAt: new Date(),
          weightFinalizedById: user.id,
        },
      });
      await this.auditTransfer(tx, user, 'SHIPMENT_WEIGHT_CALCULATED', order, {
        totalShipmentWeightKg: weightSnapshot.totalShipmentWeightKg,
        lineCount: weightSnapshot.lines.length,
      });
      await this.auditTransfer(tx, user, 'SHIPMENT_WEIGHT_SNAPSHOT_FINALIZED', order, {
        totalShipmentWeightKg: weightSnapshot.totalShipmentWeightKg,
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
        const product = await tx.product.findFirst({
          where: { id: inventoryProduct.productId, deletedAt: null },
          select: { hqBranchWholesaleMarkupPercent: true },
        });
        const productMarkup = Number(product?.hqBranchWholesaleMarkupPercent ?? 0);
        const branchMarkup = Number(branch?.hqToBranchMarkupPercent ?? 0);
        const markupPercent = productMarkup > 0 ? productMarkup : branchMarkup;
        const branchPricing = branch
          ? {
              branchType: branch.branchType,
              hqToBranchMarkupPercent: markupPercent,
            }
          : undefined;
        const isHqOwnedBranch = branch
          ? this.pricingFifoService.isHqBranchType(branch.branchType)
          : false;
        const consumed = await this.pricingFifoService.consumeFifoForDistribution(tx, {
          productId: inventoryProduct.productId,
          warehouseId: order.sourceWarehouseId,
          quantity: item.quantity,
          isHqOwnedBranch,
          branchPricing,
          distributionOrderId: order.id,
          distributionOrderItemId: item.id,
          userId: user.id,
          userRole: user.role,
        });

        // Reconcile order line to the real multi-layer FIFO allocation (historical lock).
        if (consumed.allocatedQty > 0) {
          await tx.branchDistributionOrderItem.update({
            where: { id: item.id },
            data: {
              unitCost: this.roundMoney(consumed.totalCostKgs / consumed.allocatedQty),
              unitPrice: this.roundMoney(consumed.totalPriceKgs / consumed.allocatedQty),
              totalCost: this.roundMoney(consumed.totalCostKgs),
              totalPrice: this.roundMoney(consumed.totalPriceKgs),
              profit: this.roundMoney(consumed.profitKgs),
            },
          });
        }

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

      const shippedItems = await tx.branchDistributionOrderItem.findMany({
        where: { orderId: order.id },
      });
      const shippedTotalAmount = this.roundMoney(
        shippedItems.reduce((sum, row) => sum + Number(row.totalPrice), 0),
      );
      const shippedTotalCost = this.roundMoney(
        shippedItems.reduce((sum, row) => sum + Number(row.totalCost), 0),
      );

      const updated = await tx.branchDistributionOrder.update({
        where: { id: order.id },
        data: {
          status: BranchDistributionOrderStatus.SHIPPED,
          sentAt: new Date(),
          totalAmount: shippedTotalAmount,
          totalCost: shippedTotalCost,
          totalProfit: this.roundMoney(shippedTotalAmount - shippedTotalCost),
        },
        include: this.include(),
      });
      await tx.hqWarehousePickingTask.updateMany({
        where: { distributionOrderId: id },
        data: { status: HqWarehousePickingTaskStatus.SHIPPED, shippedAt: new Date() },
      });
      await this.auditTransfer(tx, user, 'INVENTORY_SHIPPED', updated);
      await this.auditTransfer(tx, user, 'GOODS_SHIPPED', updated);
      await this.auditTransfer(tx, user, 'SHIPMENT_DISPATCHED', updated);
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
          await this.pricingFifoService.releaseFifoReservationsForOrder(tx, {
            distributionOrderId: id,
            userId: user.id,
            userRole: user.role,
          });
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
    try {
      return await this.prisma.$transaction(async (tx) => {
        const order = await tx.branchDistributionOrder.findFirst({
          where: {
            id,
            deletedAt: null,
            ...(this.canAccessAllDistributionBranches(user) ? {} : { branchId: user.branchId }),
          },
          include: { items: true },
        });
        if (!order) {
          if (user.branchId) {
            throw new ForbiddenException('You do not have access to this shipment');
          }
          throw new NotFoundException('Shipment not found');
        }
        if (
          order.status === BranchDistributionOrderStatus.RECEIVED_BY_BRANCH ||
          order.status === BranchDistributionOrderStatus.RECEIVED_WITH_DIFFERENCE ||
          order.status === BranchDistributionOrderStatus.RECEIVED ||
          order.status === BranchDistributionOrderStatus.COMPLETED
        ) {
          throw new BadRequestException('Shipment has already been received');
        }
        if (
          order.status !== BranchDistributionOrderStatus.SENT &&
          order.status !== BranchDistributionOrderStatus.SHIPPED
        ) {
          throw new BadRequestException('Order must be SHIPPED before receiving');
        }

        const existingReceiving = await tx.goodsReceiving.findFirst({
          where: { distributionOrderId: order.id, deletedAt: null },
          select: { id: true },
        });
        if (existingReceiving) {
          throw new BadRequestException('Shipment has already been received');
        }

        const warehouse = await tx.warehouse.findFirst({
          where: {
            id: dto.warehouseId || order.destinationWarehouseId,
            branchId: order.branchId,
            deletedAt: null,
            isActive: true,
            warehouseType: WarehouseType.BRANCH,
          },
        });
        if (!warehouse) {
          throw new BadRequestException('Branch warehouse is not configured');
        }

        this.logger.debug(
          JSON.stringify({
            event: 'BRANCH_RECEIVING_CONTEXT',
            userId: user.id,
            branchId: user.branchId,
            shipmentId: order.id,
            destinationWarehouseId: warehouse.id,
            sourceWarehouseId: order.sourceWarehouseId,
            itemCount: order.items.length,
          }),
        );

        for (const orderItem of order.items) {
          const previousProductId = orderItem.productId;
          const masterProduct = await resolveMasterProductForReceivingInTx(tx, {
            productId: orderItem.productId,
            sku: orderItem.sku,
            productName: orderItem.productName,
          });
          if (masterProduct.id !== orderItem.productId) {
            await tx.branchDistributionOrderItem.update({
              where: { id: orderItem.id },
              data: { productId: masterProduct.id },
            });
            orderItem.productId = masterProduct.id;
            await this.auditTransfer(tx, user, 'BRANCH_PRODUCT_REFERENCE_REPAIRED', order, {
              shipmentItemId: orderItem.id,
              previousProductId,
              productId: masterProduct.id,
              sku: orderItem.sku,
            });
          }
        }

        await this.auditTransfer(tx, user, 'BRANCH_RECEIVING_STARTED', order, {
          branchId: order.branchId,
          warehouseId: warehouse.id,
          sourceWarehouseId: order.sourceWarehouseId,
        });

        const draftRows = await tx.branchDistributionReceivingDraftRow.findMany({
          where: { distributionOrderId: order.id },
        });
        const savedDraftIds = new Set(
          draftRows.filter((row) => row.isSaved).map((row) => row.distributionOrderItemId),
        );
        const unsavedOrderItems = order.items.filter((item) => !savedDraftIds.has(item.id));
        if (unsavedOrderItems.length > 0) {
          throw new BadRequestException(
            `All receiving rows must be saved before final receive. Unsaved: ${unsavedOrderItems.length}`,
          );
        }

        const receivedMap = new Map<string, ReturnType<typeof normalizeReceivingLine>>();
        for (const orderItem of order.items) {
          const draft = draftRows.find((row) => row.distributionOrderItemId === orderItem.id);
          if (!draft?.isSaved) {
            throw new BadRequestException('All order items must be saved before receiving');
          }

          this.logger.debug(
            JSON.stringify({
              event: 'BRANCH_RECEIVING_LINE',
              shipmentId: order.id,
              shipmentItemId: orderItem.id,
              persistedProductId: orderItem.productId,
              sku: orderItem.sku,
            }),
          );

          if (!orderItem.productId) {
            throw new BadRequestException('Product reference is missing from shipment item');
          }
          const dispatchedQuantity = Number(orderItem.dispatchedQuantity ?? orderItem.quantity);
          receivedMap.set(
            orderItem.id,
            normalizeReceivingLine(
              {
                shipmentItemId: orderItem.id,
                acceptedQuantity: draft.acceptedQuantity,
                damagedQuantity: draft.damagedQuantity,
                missingQuantity: draft.missingQuantity,
                note: draft.note ?? undefined,
              },
              dispatchedQuantity,
            ),
          );
        }

        for (const item of order.items) {
          if (!receivedMap.has(item.id)) {
            throw new BadRequestException('Shipment item not found');
          }
          if (!item.productId) {
            throw new BadRequestException('Product reference is missing from shipment item');
          }
        }

        const transportCostKgs = 0;
        const hasPreallocatedDelivery = false;
        const transportLines = [];
        const resolvedProducts = new Map<string, { productId: string; created: boolean }>();

        for (const orderItem of order.items) {
          const received = receivedMap.get(orderItem.id)!;
          const acceptedQuantity = received.acceptedQuantity;
          if (acceptedQuantity <= 0) continue;

          const resolved = await this.inventoryService.ensureBranchWarehouseProductInTx(tx, {
            branchId: order.branchId,
            warehouseId: warehouse.id,
            catalogProductId: orderItem.productId,
            sku: orderItem.sku,
            productName: orderItem.productName,
            unitCostKgs: Number(orderItem.unitCost),
          });
          resolvedProducts.set(orderItem.id, resolved);

          await this.auditTransfer(tx, user, 'BRANCH_PRODUCT_REFERENCE_VALIDATED', order, {
            shipmentItemId: orderItem.id,
            catalogProductId: orderItem.productId,
            branchProductId: resolved.productId,
            branchId: order.branchId,
          });
          if (resolved.created) {
            await this.auditTransfer(tx, user, 'BRANCH_STOCK_RECORD_CREATED', order, {
              shipmentItemId: orderItem.id,
              productId: resolved.productId,
              branchId: order.branchId,
              warehouseId: warehouse.id,
            });
          }

          const product = await tx.product.findFirst({
            where: { id: resolved.productId, deletedAt: null },
            select: { weightKg: true },
          });
          transportLines.push({
            productId: orderItem.productId,
            receivedQuantity: acceptedQuantity,
            weightKg: Number(product?.weightKg ?? orderItem.unitWeightKgSnapshot ?? 0),
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
        const shortageOrderItemIds: string[] = [];

        for (const orderItem of order.items) {
          const received = receivedMap.get(orderItem.id)!;
          const acceptedQuantity = received.acceptedQuantity;
          const damagedQuantity = received.damagedQuantity;
          const missingQuantity = received.missingQuantity;
          const sentQuantity = Number(orderItem.dispatchedQuantity ?? orderItem.quantity);
          const receivedQuantity = acceptedQuantity + damagedQuantity;
          const difference = resolveReceivingDifferenceQuantity(
            sentQuantity,
            acceptedQuantity,
            damagedQuantity,
            missingQuantity,
          );
          const transportCost = transportByProductId.get(orderItem.productId);
          const unitCostWithTransport = transportCost?.finalUnitCostKgs ?? Number(orderItem.unitCost);
          const resolved = resolvedProducts.get(orderItem.id);
          if (!resolved) continue;
          const branchProductId = resolved.productId;

          if (acceptedQuantity > 0) {
            const transportCostPerUnit = transportCost?.transportCostPerUnit ?? 0;
            const receivingNote = `Receiving ${receiving.receivingNumber}`;

            const fifoLayers = await this.pricingFifoService.ensureBranchFifoLayersFromHqAllocationsInTx(
              tx,
              {
                distributionOrderItemId: orderItem.id,
                branchProductId,
                branchWarehouseId: warehouse.id,
                acceptedQuantity,
                transportCostPerUnit,
                receivingNote,
                createMovement: async (line) =>
                  this.inventoryService.createStockMovementInTx(
                    tx,
                    user,
                    {
                      productId: branchProductId,
                      warehouseId: warehouse.id,
                      type: StockMovementType.IN,
                      quantity: line.quantity,
                      unitCostKgs: line.unitCostKgs,
                      totalCostKgs: line.totalCostKgs,
                      referenceType: line.referenceType,
                      referenceId: line.referenceId,
                      note: line.note,
                    },
                    { branchReceiving: true, branchId: order.branchId },
                  ),
              },
            );

            if (!fifoLayers.usedAllocations) {
              const existingMovement = await tx.stockMovement.findFirst({
                where: {
                  referenceType: 'GOODS_RECEIVING_ITEM',
                  referenceId: orderItem.id,
                  productId: branchProductId,
                  warehouseId: warehouse.id,
                  type: StockMovementType.IN,
                  status: StockMovementStatus.ACTIVE,
                },
              });
              if (existingMovement) {
                throw new BadRequestException('This shipment item has already been received');
              }

              const unitCostWithTransport = transportCost?.finalUnitCostKgs ?? Number(orderItem.unitCost);
              const movement = await this.inventoryService.createStockMovementInTx(
                tx,
                user,
                {
                  productId: branchProductId,
                  warehouseId: warehouse.id,
                  type: StockMovementType.IN,
                  quantity: acceptedQuantity,
                  unitCostKgs: unitCostWithTransport,
                  referenceType: 'GOODS_RECEIVING_ITEM',
                  referenceId: orderItem.id,
                  note: receivingNote,
                },
                { branchReceiving: true, branchId: order.branchId },
              );
              const fifoBatch = await this.pricingFifoService.ensureBranchFifoBatchFromMovementInTx(
                tx,
                movement,
              );
              fifoLayers.layers.push({
                allocationId: orderItem.id,
                hqFifoLayerId: '',
                branchFifoLayerId: fifoBatch.batchId,
                quantity: acceptedQuantity,
                transferUnitCostKgs: Number(orderItem.unitCost),
                transportCostPerUnit,
                finalBranchUnitCostKgs: unitCostWithTransport,
                created: fifoBatch.created,
              });
            }

            await this.auditTransfer(tx, user, 'BRANCH_INVENTORY_RECEIVED', order, {
              shipmentItemId: orderItem.id,
              productId: branchProductId,
              acceptedQuantity,
              warehouseId: warehouse.id,
              sourceWarehouseId: order.sourceWarehouseId,
              destinationWarehouseId: warehouse.id,
              dispatchedQuantity: sentQuantity,
              fifoLayerCount: fifoLayers.layers.length,
            });
            for (const layer of fifoLayers.layers) {
              await this.auditTransfer(tx, user, 'BRANCH_FIFO_LAYER_CREATED', order, {
                shipmentItemId: orderItem.id,
                productId: branchProductId,
                fifoLayerId: layer.branchFifoLayerId,
                sourceHqFifoLayerId: layer.hqFifoLayerId || undefined,
                acceptedQuantity: layer.quantity,
                transferUnitCostKgs: layer.transferUnitCostKgs,
                allocatedDeliveryCostKgs: this.roundMoney(layer.transportCostPerUnit * layer.quantity),
                finalBranchUnitCostKgs: layer.finalBranchUnitCostKgs,
              });
            }
          }

          receivingItems.push({
            receivingId: receiving.id,
            distributionOrderItemId: orderItem.id,
            productId: branchProductId,
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

          if (difference !== 0 || damagedQuantity > 0 || missingQuantity > 0) {
            const differenceType = resolveDifferenceType(
              sentQuantity,
              receivedQuantity,
              received.discrepancyReason ?? received.note,
            );
            if (!differenceType) continue;
            shortageOrderItemIds.push(orderItem.id);
            shortageItems.push({
              productId: branchProductId,
              sku: orderItem.sku,
              productName: orderItem.productName,
              expectedQuantity: sentQuantity,
              receivedQuantity,
              differenceQuantity: Math.abs(difference),
              type: differenceType,
              note: received.discrepancyReason ?? received.note,
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
        for (let index = 0; index < shortageReport.items.length; index += 1) {
          const reportItem = shortageReport.items[index];
          const orderItemId = shortageOrderItemIds[index];
          if (!orderItemId) continue;
          await tx.branchDistributionReceivingDiscrepancy.updateMany({
            where: {
              distributionOrderId: order.id,
              distributionOrderItemId: orderItemId,
            },
            data: { shortageReportItemId: reportItem.id },
          });
        }
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
        recipientRoles: [Role.MANAGER, Role.FRANCHISE_OWNER],
      });
      await this.createWorkflowAlert(tx, user, {
        branchId: order.branchId,
        type: AlertType.BRANCH_GOODS_RECEIVED,
        title: 'Требуется внести транспортные расходы',
        message: `По заказу ${order.orderNumber} внесите транспортные расходы после приёмки`,
        entityType: 'BranchDistributionOrder',
        entityId: order.id,
        recipientRoles: [Role.WAREHOUSE_OPERATOR],
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
      await this.auditTransfer(tx, user, 'BRANCH_SHIPMENT_RECEIVED', order);
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

      await this.createWorkflowAlert(tx, user, {
        branchId: order.branchId,
        type: AlertType.BRANCH_GOODS_RECEIVED,
        title: 'Требуется ввод транспортных расходов',
        message: `По заказу ${order.orderNumber} необходимо внести транспортные расходы`,
        entityType: 'BranchDistributionOrder',
        entityId: order.id,
        recipientRoles: [Role.MANAGER, Role.FRANCHISE_OWNER],
      });

      return {
        receiving: this.sanitizeReceivingForUser(
          user,
          await this.receivingInTx(tx, user, receiving.id),
        ),
        shortageReport,
        invoice: existingInvoice ? this.toInvoiceResponse(existingInvoice) : null,
      };
      });
    } catch (error) {
      await this.prisma.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'BRANCH_RECEIVING_FAILED',
          entity: 'BranchDistributionOrder',
          entityId: id,
          metadata: {
            shipmentId: id,
            branchId: user.branchId,
            message: error instanceof Error ? error.message : 'Receiving failed',
            timestamp: new Date().toISOString(),
          },
        },
      }).catch(() => null);
      throw error;
    }
  }

  async saveBranchReceivingDraftRow(
    user: AuthUser,
    orderId: string,
    itemId: string,
    dto: SaveBranchReceivingDraftRowDto,
  ) {
    if (!canReceiveBranchDistribution(user)) {
      throw new ForbiddenException('Only Branch Warehouse Operator can receive goods at branch');
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.branchDistributionOrder.findFirst({
        where: {
          id: orderId,
          deletedAt: null,
          ...(this.canAccessAllDistributionBranches(user) ? {} : { branchId: user.branchId }),
        },
        include: { items: { include: { product: true } } },
      });
      if (!order) {
        if (user.branchId) {
          throw new ForbiddenException('You do not have access to this shipment');
        }
        throw new NotFoundException('Shipment not found');
      }
      if (
        order.status !== BranchDistributionOrderStatus.SENT &&
        order.status !== BranchDistributionOrderStatus.SHIPPED
      ) {
        throw new BadRequestException('Order must be SHIPPED before receiving');
      }

      const existingReceiving = await tx.goodsReceiving.findFirst({
        where: { distributionOrderId: order.id, deletedAt: null },
        select: { id: true },
      });
      if (existingReceiving) {
        throw new BadRequestException('Shipment has already been received');
      }

      const orderItem = order.items.find((item) => item.id === itemId);
      if (!orderItem) {
        throw new NotFoundException('Shipment item not found');
      }

      const existing = await tx.branchDistributionReceivingDraftRow.findUnique({
        where: {
          distributionOrderId_distributionOrderItemId: {
            distributionOrderId: orderId,
            distributionOrderItemId: itemId,
          },
        },
      });

      if (dto.expectedUpdatedAt && existing) {
        const expectedMs = new Date(dto.expectedUpdatedAt).getTime();
        const currentMs = existing.updatedAt.getTime();
        if (Number.isFinite(expectedMs) && currentMs > expectedMs) {
          throw new ConflictException('BRANCH_RECEIVING_DRAFT_CONFLICT');
        }
      }

      const dispatchedQuantity = Number(orderItem.dispatchedQuantity ?? orderItem.quantity);
      const normalized = normalizeBranchReceivingDraftInput(dto, dispatchedQuantity);

      const saved = await tx.branchDistributionReceivingDraftRow.upsert({
        where: {
          distributionOrderId_distributionOrderItemId: {
            distributionOrderId: orderId,
            distributionOrderItemId: itemId,
          },
        },
        create: {
          distributionOrderId: orderId,
          distributionOrderItemId: itemId,
          productId: orderItem.productId,
          branchId: order.branchId,
          acceptedQuantity: normalized.acceptedQuantity,
          damagedQuantity: normalized.damagedQuantity,
          missingQuantity: normalized.missingQuantity,
          note: normalized.note ?? null,
          isSaved: true,
          isChecked: true,
          lastSavedAt: new Date(),
          lastSavedById: user.id,
        },
        update: {
          productId: orderItem.productId,
          branchId: order.branchId,
          acceptedQuantity: normalized.acceptedQuantity,
          damagedQuantity: normalized.damagedQuantity,
          missingQuantity: normalized.missingQuantity,
          note: normalized.note ?? null,
          isSaved: true,
          isChecked: true,
          lastSavedAt: new Date(),
          lastSavedById: user.id,
        },
        include: { lastSavedBy: { select: { id: true, fullName: true } } },
      });

      const discrepancyPayload = buildBranchReceivingDiscrepancyPayload(
        orderItem,
        order,
        dispatchedQuantity,
        normalized.acceptedQuantity,
        normalized.damagedQuantity,
        normalized.missingQuantity,
        normalized.note,
      );
      let discrepancyCreated = false;
      if (discrepancyPayload) {
        const existingDiscrepancy = await tx.branchDistributionReceivingDiscrepancy.findUnique({
          where: { distributionOrderItemId: itemId },
        });
        await tx.branchDistributionReceivingDiscrepancy.upsert({
          where: { distributionOrderItemId: itemId },
          create: {
            ...discrepancyPayload,
            createdById: user.id,
          },
          update: {
            expectedQuantity: discrepancyPayload.expectedQuantity,
            receivedQuantity: discrepancyPayload.receivedQuantity,
            differenceQuantity: discrepancyPayload.differenceQuantity,
            type: discrepancyPayload.type,
            note: discrepancyPayload.note ?? null,
            productId: discrepancyPayload.productId,
            branchId: discrepancyPayload.branchId,
          },
        });
        discrepancyCreated = !existingDiscrepancy;
      } else {
        await tx.branchDistributionReceivingDiscrepancy.deleteMany({
          where: { distributionOrderItemId: itemId },
        });
      }

      const auditAction = existing
        ? 'BRANCH_RECEIVING_DRAFT_UPDATED'
        : 'BRANCH_RECEIVING_DRAFT_CREATED';
      await this.auditTransfer(tx, user, auditAction, order, {
        shipmentItemId: itemId,
        productId: orderItem.productId,
        acceptedQuantity: normalized.acceptedQuantity,
        damagedQuantity: normalized.damagedQuantity,
        missingQuantity: normalized.missingQuantity,
        note: normalized.note ?? null,
      });

      if (discrepancyCreated) {
        await this.createWorkflowAlert(tx, user, {
          branchId: order.branchId,
          type: AlertType.SHORTAGE_NEEDS_RESOLUTION,
          title: 'Расхождение при приёмке филиала',
          message: `Расхождение по товару ${orderItem.sku} в заказе ${order.orderNumber}`,
          entityType: 'BranchDistributionOrder',
          entityId: order.id,
          recipientRoles: [Role.SUPPLY_CHAIN_MANAGER, Role.HQ_SALES_MANAGER],
        });
      }

      const draftRows = await tx.branchDistributionReceivingDraftRow.findMany({
        where: { distributionOrderId: order.id },
      });
      const progress = buildReceivingProgress(
        order.items.map((item) => ({
          id: item.id,
          expectedQuantity: Number(item.dispatchedQuantity ?? item.quantity),
        })),
        draftRows.map((row) => ({
          itemId: row.distributionOrderItemId,
          acceptedQuantity: row.acceptedQuantity,
          damagedQuantity: row.damagedQuantity,
          missingQuantity: row.missingQuantity,
          note: row.note,
          isSaved: row.isSaved,
          lastSavedAt: row.lastSavedAt,
        })),
      );

      return {
        id: saved.id,
        distributionOrderId: saved.distributionOrderId,
        distributionOrderItemId: saved.distributionOrderItemId,
        acceptedQuantity: saved.acceptedQuantity,
        damagedQuantity: saved.damagedQuantity,
        missingQuantity: saved.missingQuantity,
        note: saved.note,
        isSaved: saved.isSaved,
        lastSavedAt: saved.lastSavedAt?.toISOString() ?? null,
        updatedAt: saved.updatedAt.toISOString(),
        lastSavedBy: saved.lastSavedBy,
        rowStatus: resolveReceivingRowStatus(
          saved.acceptedQuantity,
          dispatchedQuantity,
          saved.damagedQuantity,
          saved.isSaved,
        ),
        difference: saved.acceptedQuantity - dispatchedQuantity,
        receivingProgress: progress,
      };
    });
  }

  async enterReceivingTransportCost(user: AuthUser, orderId: string, dto: EnterReceivingTransportDto) {
    if (!canEnterBranchTransportCost(user)) {
      throw new ForbiddenException('Только кладовщик филиала может внести транспортные расходы');
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
      if (Number(order.totalShipmentWeightKg ?? 0) <= 0) {
        throw new BadRequestException('Для распределения транспортных расходов требуется снимок веса партии');
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
        const acceptedMovement = await tx.stockMovement.findFirst({
          where: {
            referenceType: 'GOODS_RECEIVING_ITEM',
            referenceId: orderItem.id,
            type: StockMovementType.IN,
            status: StockMovementStatus.ACTIVE,
          },
          select: { quantity: true },
        });
        const acceptedQuantity = Number(acceptedMovement?.quantity ?? 0);
        if (acceptedQuantity <= 0) continue;
        const snapshotWeight = Number(orderItem.unitWeightKgSnapshot ?? 0);
        if (snapshotWeight <= 0) {
          throw new BadRequestException(
            `Невозможно рассчитать общий вес партии. Для товара ${orderItem.productName} не указан вес.`,
          );
        }
        transportLines.push({
          productId: orderItem.productId,
          receivedQuantity: acceptedQuantity,
          weightKg: snapshotWeight,
          unitCostKgs: Number(orderItem.unitCost),
        });
      }
      if (!transportLines.length) {
        throw new BadRequestException('Нет принятых позиций для распределения транспортных расходов');
      }

      const transportAllocations = allocateBranchReceivingTransportCost(transportLines, transportCostKgs);
      const transportByProductId = new Map(transportAllocations.map((row) => [row.productId, row]));
      const totalShipmentWeightKg = transportLines.reduce(
        (sum, line) => sum + line.receivedQuantity * line.weightKg,
        0,
      );
      if (totalShipmentWeightKg <= 0) {
        throw new BadRequestException('Общий вес партии должен быть больше нуля');
      }

      await tx.branchDistributionOrder.update({
        where: { id: order.id },
        data: {
          transportCompany: dto.transportCompany.trim(),
          transportCostKgs,
          transportNotes: dto.comment?.trim() || dto.deliveryDocument?.trim() || dto.documentNumber?.trim() || null,
          totalShipmentWeightKg,
          deliveryCostEnteredAt: dto.deliveryDate ? new Date(dto.deliveryDate) : new Date(),
          deliveryCostEnteredById: user.id,
        },
      });

      if (receiving) {
        await tx.goodsReceiving.update({
          where: { id: receiving.id },
          data: {
            transportCompany: dto.transportCompany.trim(),
            transportCostKgs,
            transportNotes: dto.comment?.trim() || null,
            arrivalDate: dto.deliveryDate ? new Date(dto.deliveryDate) : receiving.arrivalDate,
          },
        });
      }

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

        const acceptedMovement = await tx.stockMovement.findFirst({
          where: {
            referenceType: 'GOODS_RECEIVING_ITEM',
            referenceId: orderItem.id,
            type: StockMovementType.IN,
            status: StockMovementStatus.ACTIVE,
          },
          select: { quantity: true },
        });
        const acceptedQuantity = Number(acceptedMovement?.quantity ?? 0);
        if (acceptedQuantity <= 0) continue;

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

      await this.auditTransfer(tx, user, 'TRANSPORT_COST_ENTERED_BY_BRANCH_WAREHOUSE', order, {
        transportCostKgs,
        receivingId: receiving.id,
      });
      await this.auditTransfer(tx, user, 'TRANSPORT_COST_CONFIRMED_BY_BRANCH_WAREHOUSE', order, {
        transportCostKgs,
        receivingId: receiving.id,
      });
      await this.auditTransfer(tx, user, 'TRANSPORT_COST_ALLOCATED', order, {
        transportCostKgs,
        allocations: transportAllocations,
      });
      await this.auditTransfer(tx, user, 'BRANCH_RECEIVING_TRANSPORT_ALLOCATED', order, {
        transportCostKgs,
        allocations: transportAllocations,
      });
      await this.auditTransfer(tx, user, 'BRANCH_LANDED_COST_UPDATED', order, {
        transportCostKgs,
        receivingId: receiving.id,
      });
      await this.auditTransfer(tx, user, 'BRANCH_LANDED_COST_CALCULATED', order, {
        transportCostKgs,
        receivingId: receiving.id,
      });
      await this.auditTransfer(tx, user, 'FIFO_LAYER_UPDATED', order, {
        receivingId: receiving.id,
      });
      await this.auditTransfer(tx, user, 'BRANCH_INVENTORY_COST_UPDATED', order, {
        receivingId: receiving.id,
      });
      await this.syncBranchPurchaseRequestPaymentStatus(tx, order.id, 'TRANSPORT_COST_ENTERED', user);

      const transportInvoice = await this.createTransportExpenseInvoice(tx, user, order, receiving, transportCostKgs);
      if (transportInvoice) {
        await this.auditTransfer(tx, user, 'TRANSPORT_EXPENSE_INVOICE_CREATED', order, {
          invoiceId: transportInvoice.id,
          invoiceNumber: transportInvoice.invoiceNumber,
        });
        await this.createWorkflowAlert(tx, user, {
          branchId: order.branchId,
          type: AlertType.BRANCH_INVOICE_CREATED,
          title: 'Счёт на транспортные расходы',
          message: `Создан счёт ${transportInvoice.invoiceNumber} на транспортные расходы по заказу ${order.orderNumber}`,
          entityType: 'BranchInvoice',
          entityId: transportInvoice.id,
          recipientRoles: [Role.ACCOUNTANT],
        });
      }
      await this.createWorkflowAlert(tx, user, {
        branchId: order.branchId,
        type: AlertType.BRANCH_GOODS_RECEIVED,
        title: 'Транспортные расходы внесены',
        message: `По заказу ${order.orderNumber} внесены транспортные расходы`,
        entityType: 'BranchDistributionOrder',
        entityId: order.id,
        recipientRoles: [Role.ACCOUNTANT],
      });

      const updated = await tx.branchDistributionOrder.findFirst({
        where: { id: order.id },
        include: this.include(),
      });
      return this.toResponse(updated!, user);
    });
  }

  receivings(user: AuthUser, query: DistributionReportQueryDto) {
    this.assertQueryBranchAccess(user, query.branchId);
    return this.prisma.goodsReceiving
      .findMany({
        where: {
          deletedAt: null,
          ...(this.canAccessAllDistributionBranches(user) ? {} : { branchId: user.branchId }),
          ...(query.branchId ? { branchId: query.branchId } : {}),
        },
        include: this.receivingInclude(),
        orderBy: { receivedAt: 'desc' },
      })
      .then((rows) => rows.map((row) => this.sanitizeReceivingForUser(user, row)));
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
    return this.sanitizeReceivingForUser(user, receiving);
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

      const earlyPaymentRequest = await this.earlyPaymentService.findCashierVisibleRequest(tx, invoice.id);
      if (
        !earlyPaymentRequest &&
        installment?.status === BranchOrderInstallmentStatus.APPROVED &&
        !installment.firstPaymentRequired
      ) {
        throw new BadRequestException('Оплата доступна только через досрочное погашение');
      }
      if (
        !earlyPaymentRequest &&
        installment?.status === BranchOrderInstallmentStatus.APPROVED &&
        installment.firstPaymentRequired &&
        installment.firstPaymentConfirmed
      ) {
        throw new BadRequestException('Создайте и отправьте запрос досрочного погашения');
      }

      if (earlyPaymentRequest) {
        const approvedAmount = this.roundMoney(
          Number(earlyPaymentRequest.approvedAmount ?? earlyPaymentRequest.requestedAmount),
        );
        if (Math.abs(amount - approvedAmount) > 0.009) {
          throw new BadRequestException('Сумма должна совпадать с утверждённой суммой досрочного погашения');
        }
        if (earlyPaymentRequest.status !== BranchInstallmentEarlyPaymentStatus.SENT_TO_CASHIER) {
          throw new BadRequestException('Запрос досрочного погашения не отправлен в кассу');
        }
        if (earlyPaymentRequest.financeAccountId) {
          const account = await tx.financeAccount.findFirst({
            where: { id: earlyPaymentRequest.financeAccountId, deletedAt: null },
          });
          if (!account || Number(account.availableBalance) < amount) {
            throw new BadRequestException('Недостаточно средств на счёте филиала');
          }
        }
      }

      const autoValidate = this.shouldAutoValidatePayment(invoice, amount, installment, earlyPaymentRequest);
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
          earlyPaymentRequestId: earlyPaymentRequest?.id ?? null,
          ...(autoValidate
            ? { confirmedAt: new Date(), confirmedById: user.id, paidAt: new Date() }
            : {}),
          createdById: user.id,
        },
      });

      if (earlyPaymentRequest) {
        await this.earlyPaymentService.markPaymentSubmitted(tx, earlyPaymentRequest.id);
        await tx.auditLog.create({
          data: {
            userId: user.id,
            role: user.role,
            action: 'EARLY_PAYMENT_PROCESSED',
            entity: 'BranchInstallmentEarlyPaymentRequest',
            entityId: earlyPaymentRequest.id,
            metadata: {
              invoiceId: invoice.id,
              amount,
              roles: user.roles ?? [user.role],
            },
          },
        });
        if (earlyPaymentRequest.financeAccountId) {
          await tx.financeAccount.update({
            where: { id: earlyPaymentRequest.financeAccountId },
            data: {
              currentBalance: { decrement: amount },
              availableBalance: { decrement: amount },
            },
          });
        }
      }

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
    earlyPaymentRequest?: {
      approvedAmount: Prisma.Decimal | null;
      requestedAmount: Prisma.Decimal;
    } | null,
  ) {
    if (installment?.status === BranchOrderInstallmentStatus.PENDING) return false;
    if (earlyPaymentRequest) {
      const expected = this.roundMoney(
        Number(earlyPaymentRequest.approvedAmount ?? earlyPaymentRequest.requestedAmount),
      );
      return Math.abs(amount - expected) < 0.01;
    }
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

    const submittedEarlyPayment = await tx.branchInstallmentEarlyPaymentRequest.findFirst({
      where: {
        invoiceId: invoice.id,
        status: BranchInstallmentEarlyPaymentStatus.PAYMENT_SUBMITTED,
      },
    });
    if (submittedEarlyPayment && installment) {
      const confirmedPayment = await tx.branchPayment.findFirst({
        where: {
          earlyPaymentRequestId: submittedEarlyPayment.id,
          deletedAt: null,
          confirmationStatus: BranchPaymentConfirmationStatus.CONFIRMED,
        },
        orderBy: { confirmedAt: 'desc' },
      });
      if (confirmedPayment) {
        const refreshedInvoice = await tx.branchInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
        await this.earlyPaymentService.completeEarlyPayment(
          tx,
          user,
          submittedEarlyPayment.id,
          Number(confirmedPayment.amount),
          refreshedInvoice,
          installment,
        );
      }
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
        await this.hqStockBookingService.extendBookingsAfterPayment(linkedRequest.id, tx);
        await this.promoteBranchRequestToReadyForWarehouse(
          tx,
          user,
          linkedRequest,
          distributionOrderId,
          'INSTALLMENT_APPROVED',
        );
        return;
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
      await this.promoteBranchRequestToReadyForWarehouse(tx, user, linkedRequest, distributionOrderId, 'FULL_PAYMENT');
      return;
    }
  }

  private async assertWarehouseFulfillmentAllowed(
    tx: PrismaTx,
    order: { id: string; status: BranchDistributionOrderStatus },
  ) {
    const invoices = await tx.branchInvoice.findMany({
      where: { distributionOrderId: order.id, deletedAt: null },
      include: { branchOrderInstallment: true },
    });
    const invoice = this.resolveProductBranchInvoice({ branchInvoices: invoices });
    const eligibility = canStartHqWarehouseFulfillment(order, invoice?.branchOrderInstallment ?? null);
    if (!eligibility.allowed) {
      if (eligibility.reason === 'INSTALLMENT_PENDING') {
        throw new BadRequestException('Рассрочка ожидает утверждения CEO — склад не может обработать заказ');
      }
      if (eligibility.reason === 'INSTALLMENT_REJECTED') {
        throw new BadRequestException('Рассрочка отклонена — склад не может обработать заказ');
      }
      throw new BadRequestException(
        'Order must be fully paid or installment-approved before warehouse fulfillment',
      );
    }
  }

  private async promoteBranchRequestToReadyForWarehouse(
    tx: PrismaTx,
    user: AuthUser,
    linkedRequest: { id: string; branchId: string; status: BranchPurchaseRequestStatus },
    distributionOrderId: string,
    reason: 'FULL_PAYMENT' | 'INSTALLMENT_APPROVED',
  ) {
    if (
      linkedRequest.status === BranchPurchaseRequestStatus.SENT_TO_HQ_WAREHOUSE ||
      linkedRequest.status === BranchPurchaseRequestStatus.COMPLETED
    ) {
      return;
    }

    const alreadyReady = linkedRequest.status === BranchPurchaseRequestStatus.READY_FOR_HQ_WAREHOUSE;
    if (!alreadyReady) {
      await tx.branchPurchaseRequest.update({
        where: { id: linkedRequest.id },
        data: { status: BranchPurchaseRequestStatus.READY_FOR_HQ_WAREHOUSE },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'BRANCH_ORDER_READY_FOR_HQ_WAREHOUSE',
          entity: 'BranchPurchaseRequest',
          entityId: linkedRequest.id,
          metadata: {
            distributionOrderId,
            reason,
            oldStatus: linkedRequest.status,
            newStatus: BranchPurchaseRequestStatus.READY_FOR_HQ_WAREHOUSE,
            roles: user.roles ?? [user.role],
          },
        },
      });
    }

    if (reason === 'INSTALLMENT_APPROVED') {
      await this.activateHqWarehouseFulfillmentAfterInstallmentApproval(
        tx,
        user,
        linkedRequest,
        distributionOrderId,
      );
      return;
    }

    if (!alreadyReady) {
      await this.createWorkflowAlert(tx, user, {
        branchId: linkedRequest.branchId,
        type: AlertType.BRANCH_ORDER_READY_FOR_WAREHOUSE,
        title: 'Заказ готов к комплектации на складе HQ',
        message: 'Финансовое согласование завершено. Заказ готов к комплектации на складе HQ.',
        entityType: 'BranchPurchaseRequest',
        entityId: linkedRequest.id,
        recipientRoles: [Role.WAREHOUSE_MANAGER],
      });
    }
  }

  private async activateHqWarehouseFulfillmentAfterInstallmentApproval(
    tx: PrismaTx,
    user: AuthUser,
    linkedRequest: { id: string; branchId: string; status: BranchPurchaseRequestStatus },
    distributionOrderId: string,
  ) {
    const order = await tx.branchDistributionOrder.findFirst({
      where: { id: distributionOrderId, deletedAt: null },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        items: true,
        branchInvoices: { include: { branchOrderInstallment: true } },
      },
    });
    if (!order) return;

    const productInvoice = this.resolveProductBranchInvoice(order);
    const installment = productInvoice?.branchOrderInstallment ?? null;
    const eligibility = canStartHqWarehouseFulfillment(order, installment);
    if (!eligibility.allowed) return;

    const managerAssignment = await tx.hqWarehouseManagerAssignment.findFirst({
      where: { warehouseId: order.sourceWarehouseId, status: 'ACTIVE' },
      orderBy: { assignedAt: 'asc' },
    });

    const alreadyInWarehouse =
      order.status === BranchDistributionOrderStatus.SENT_TO_WAREHOUSE ||
      order.status === BranchDistributionOrderStatus.PICKING ||
      order.status === BranchDistributionOrderStatus.PACKED ||
      order.status === BranchDistributionOrderStatus.SHIPPED;

    if (!alreadyInWarehouse) {
      await tx.branchDistributionOrder.update({
        where: { id: order.id },
        data: { status: BranchDistributionOrderStatus.SENT_TO_WAREHOUSE },
      });
    }

    const existingTask = await tx.hqWarehousePickingTask.findUnique({
      where: { distributionOrderId: order.id },
    });
    let taskCreated = false;
    if (!existingTask) {
      await tx.hqWarehousePickingTask.create({
        data: {
          distributionOrderId: order.id,
          sourceHqWarehouseId: order.sourceWarehouseId,
          assignedWarehouseManagerId: managerAssignment?.userId,
          status: HqWarehousePickingTaskStatus.ASSIGNED,
        },
      });
      taskCreated = true;
      await tx.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'HQ_WAREHOUSE_TASK_CREATED',
          entity: 'BranchDistributionOrder',
          entityId: order.id,
          metadata: {
            distributionOrderId: order.id,
            branchId: linkedRequest.branchId,
            installmentId: installment?.id,
            sourceHqWarehouseId: order.sourceWarehouseId,
            roles: user.roles ?? [user.role],
          },
        },
      });
    }

    if (linkedRequest.status !== BranchPurchaseRequestStatus.SENT_TO_HQ_WAREHOUSE) {
      await tx.branchPurchaseRequest.update({
        where: { id: linkedRequest.id },
        data: { status: BranchPurchaseRequestStatus.SENT_TO_HQ_WAREHOUSE },
      });
    }

    const totalAmount = this.roundMoney(Number(productInvoice?.totalAmount ?? order.totalAmount ?? 0));
    const firstPaymentAmount = this.roundMoney(Number(installment?.firstPaymentAmount ?? 0));
    const remainingDebt = computeBranchOrderRemainingDebt(totalAmount, firstPaymentAmount);
    const approvedProductCount = order.items.filter((item) => item.quantity > 0).length;

    await tx.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: 'ORDER_READY_FOR_HQ_WAREHOUSE',
        entity: 'BranchDistributionOrder',
        entityId: order.id,
        metadata: {
          installmentId: installment?.id,
          orderId: order.id,
          orderNumber: order.orderNumber,
          branchId: linkedRequest.branchId,
          previousStatus: order.status,
          newStatus: BranchDistributionOrderStatus.SENT_TO_WAREHOUSE,
          totalAmount,
          initialPayment: firstPaymentAmount,
          remainingDebt,
          approvedById: user.id,
          taskCreated,
          roles: user.roles ?? [user.role],
        },
      },
    });

    await this.createWorkflowAlert(tx, user, {
      branchId: null,
      type: AlertType.BRANCH_ORDER_READY_FOR_WAREHOUSE,
      title: 'Заказ готов к комплектации на складе HQ',
      message: [
        `Заказ ${order.orderNumber} готов к комплектации.`,
        `Филиал: ${order.branch?.name ?? linkedRequest.branchId}.`,
        `Позиций: ${approvedProductCount}.`,
        `Тип оплаты: рассрочка.`,
        `Первоначальный взнос: ${firstPaymentAmount.toFixed(2)} KGS.`,
        `Остаток долга: ${remainingDebt.toFixed(2)} KGS.`,
      ].join(' '),
      entityType: 'BranchDistributionOrder',
      entityId: order.id,
      referenceNumber: order.orderNumber,
      recipientRoles: [Role.WAREHOUSE_MANAGER],
    });

    if (taskCreated) {
      await this.createWorkflowAlert(tx, user, {
        branchId: null,
        type: AlertType.PICKING_TASK_ASSIGNED,
        title: 'Новое задание на комплектацию',
        message: `Создано задание на комплектацию заказа ${order.orderNumber}`,
        entityType: 'BranchDistributionOrder',
        entityId: order.id,
        referenceNumber: order.orderNumber,
        recipientRoles: [Role.WAREHOUSE_MANAGER],
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

      const totalAmount = this.roundMoney(Number(invoice.totalAmount));
      const firstPaymentAmount = this.roundMoney(Number(dto.firstPaymentAmount));
      const validationError = validateBranchOrderInstallmentAmounts(totalAmount, firstPaymentAmount);
      if (validationError === 'ORDER_TOTAL_REQUIRED') {
        throw new BadRequestException('Сумма заказа должна быть больше нуля');
      }
      if (validationError === 'INVALID_INITIAL_PAYMENT') {
        throw new BadRequestException('Первоначальный взнос должен быть числом');
      }
      if (validationError === 'NEGATIVE_INITIAL_PAYMENT') {
        throw new BadRequestException('Первоначальный взнос не может быть отрицательным');
      }
      if (validationError === 'INITIAL_PAYMENT_EXCEEDS_TOTAL') {
        throw new BadRequestException('Первоначальный взнос не может превышать сумму заказа');
      }

      const remainingDebt = computeBranchOrderRemainingDebt(totalAmount, firstPaymentAmount);
      const firstPaymentRequired = dto.firstPaymentRequired ?? !isZeroInitialPayment(firstPaymentAmount);
      const paymentSchedule = buildBranchOrderInstallmentSchedule(
        remainingDebt,
        dto.termMonths,
        dto.dueDate ? new Date(dto.dueDate) : null,
      );

      const linkedRequest = await tx.branchPurchaseRequest.findFirst({
        where: { convertedOrderId: invoice.distributionOrderId, deletedAt: null },
      });

      const installment = await tx.branchOrderInstallment.create({
        data: {
          branchId: invoice.branchId,
          invoiceId: invoice.id,
          branchPurchaseRequestId: linkedRequest?.id,
          totalAmount: invoice.totalAmount,
          firstPaymentAmount,
          termMonths: dto.termMonths,
          firstPaymentRequired,
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
          action: isZeroInitialPayment(firstPaymentAmount)
            ? 'ZERO_INITIAL_PAYMENT_INSTALLMENT_REQUESTED'
            : 'INSTALLMENT_REQUESTED',
          entity: 'BranchOrderInstallment',
          entityId: installment.id,
          metadata: {
            invoiceId,
            branchId: invoice.branchId,
            orderId: invoice.distributionOrderId,
            orderNumber: invoice.invoiceNumber,
            orderTotal: totalAmount,
            initialPayment: firstPaymentAmount,
            remainingDebt,
            installmentTerm: dto.termMonths,
            paymentSchedule,
            requestedById: user.id,
            requestedAt: new Date().toISOString(),
            roles: user.roles ?? [user.role],
          },
        },
      });

      await this.createWorkflowAlert(tx, user, {
        branchId: invoice.branchId,
        type: AlertType.BRANCH_INSTALLMENT_REQUESTED,
        title: isZeroInitialPayment(firstPaymentAmount)
          ? 'Запрос рассрочки без первоначального взноса'
          : 'Запрос рассрочки по заказу филиала',
        message: isZeroInitialPayment(firstPaymentAmount)
          ? `Филиал запросил рассрочку без первоначального взноса по счёту ${invoice.invoiceNumber}. Сумма заказа: ${totalAmount.toFixed(2)} KGS.`
          : `Филиал запросил рассрочку по счёту ${invoice.invoiceNumber}`,
        entityType: 'BranchInvoice',
        entityId: invoice.id,
        recipientRoles: [Role.CEO, Role.OWNER, Role.FINANCE_MANAGER],
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

      const installment = invoice.branchOrderInstallment;
      const totalAmount = this.roundMoney(Number(installment.totalAmount));
      const firstPaymentAmount = this.roundMoney(Number(installment.firstPaymentAmount));
      const remainingDebt = computeBranchOrderRemainingDebt(totalAmount, firstPaymentAmount);
      const paymentSchedule = buildBranchOrderInstallmentSchedule(
        remainingDebt,
        installment.termMonths,
        installment.installmentDueDate,
      );

      await tx.branchOrderInstallment.update({
        where: { id: installment.id },
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
          action: 'INSTALLMENT_APPROVED',
          entity: 'BranchOrderInstallment',
          entityId: installment.id,
          metadata: {
            invoiceId,
            branchId: invoice.branchId,
            orderTotal: totalAmount,
            initialPayment: firstPaymentAmount,
            remainingDebt,
            installmentTerm: installment.termMonths,
            paymentSchedule,
            approvedById: user.id,
            roles: user.roles ?? [user.role],
          },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'INSTALLMENT_SCHEDULE_CREATED',
          entity: 'BranchOrderInstallment',
          entityId: installment.id,
          metadata: {
            invoiceId,
            remainingDebt,
            installmentTerm: installment.termMonths,
            paymentSchedule,
            roles: user.roles ?? [user.role],
          },
        },
      });

      await this.createWorkflowAlert(tx, user, {
        branchId: invoice.branchId,
        type: AlertType.BRANCH_INSTALLMENT_APPROVED,
        title: 'Рассрочка утверждена',
        message: `Рассрочка по счёту ${invoice.invoiceNumber} утверждена`,
        entityType: 'BranchInvoice',
        entityId: invoice.id,
        recipientRoles: [Role.ACCOUNTANT, Role.MANAGER, Role.FRANCHISE_OWNER],
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
          action: 'INSTALLMENT_REJECTED',
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
      const master = await resolveMasterProductForReceivingInTx(tx, {
        productId: item.productId,
      });
      const product = await tx.product.findFirst({
        where: { id: master.id, deletedAt: null },
      });
      if (!product) {
        throw new NotFoundException(`Referenced product was not found. Product ID: ${master.id}`);
      }

      const fallbackUnitCost = Number(product.finalCostKgs);
      const productBranchMarkup = Number(product.hqBranchWholesaleMarkupPercent ?? 0);
      const branchMarkup = branchPricing?.hqToBranchMarkupPercent ?? productBranchMarkup;
      // Prefer product Branch-Sales markup so order pricing matches Продажа филиалам.
      const effectiveMarkup = productBranchMarkup > 0 ? productBranchMarkup : branchMarkup;
      const layerBranchPricing = branchPricing
        ? { ...branchPricing, hqToBranchMarkupPercent: effectiveMarkup }
        : {
            branchType: (branch?.branchType ?? 'FRANCHISE') as BranchType,
            hqToBranchMarkupPercent: effectiveMarkup,
          };
      const fallbackUnitPrice = this.pricingFifoService.isHqBranchType(layerBranchPricing.branchType)
        ? fallbackUnitCost
        : Number(product.hqBranchWholesalePriceKgs);

      const priceFreeze = await this.pricingResolutionService.resolveWithFreeze(
        dto.branchId,
        item.productId,
        {
          auditUser: user,
          auditEntity: 'BranchDistributionOrderItem',
          useBranchOrderPrice: true,
        },
      );

      const fifoPreview = await this.pricingFifoService.previewFifoAllocation(tx, {
        productId: item.productId,
        warehouseId: dto.sourceWarehouseId,
        quantity: Number(item.quantity),
        isHqOwnedBranch,
        branchPricing: layerBranchPricing,
        fallbackUnitCost,
        fallbackUnitPrice,
        preferPerLayerMarkup: true,
        subtractReserved: true,
      });

      if (fifoPreview.allocatedQty < Number(item.quantity)) {
        throw new BadRequestException(
          `Insufficient FIFO stock for SKU ${product.sku}. Requested: ${item.quantity} Available: ${fifoPreview.allocatedQty}`,
        );
      }

      // Catalog starting price = active (first) FIFO layer unit selling price.
      const wholesalePrice = fifoPreview.activeUnitPrice || fifoPreview.unitPrice;
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
      const quantity = Number(item.quantity);
      // Multi-layer totals: sum of per-layer cost/price (never average-then-multiply).
      const totalCost = roundDisplayMoney(fifoPreview.totalCostKgs);
      const totalPrice =
        isHqOwnedBranch || !hasAnyFullAccessRole(userRoles)
          ? roundDisplayMoney(fifoPreview.totalPriceKgs)
          : roundDisplayMoney(requestedPrice * quantity);
      const unitCost = deriveDisplayUnitCost(totalCost, quantity);
      const unitPrice = deriveDisplayUnitCost(totalPrice, quantity);
      items.push({
        productId: product.id,
        sku: product.sku,
        productName: product.name,
        quantity,
        unitCost,
        unitPrice,
        totalCost,
        totalPrice,
        profit: roundDisplayMoney(totalPrice - totalCost),
        pricingPolicyVersionId: priceFreeze.pricingPolicyVersionId,
        pricingProfileId: priceFreeze.pricingProfileId,
        resolvedPriceKgs: priceFreeze.resolvedPriceKgs,
        baseCostKgs: fifoPreview.activeUnitCost || priceFreeze.baseCostKgs,
        baseBranchPriceKgs: fifoPreview.activeUnitPrice || priceFreeze.baseBranchPriceKgs,
        appliedRuleType: priceFreeze.appliedRuleType,
        appliedRuleId: priceFreeze.appliedRuleId,
        appliedAdjustmentMode: priceFreeze.appliedAdjustmentMode,
        appliedAdjustmentValue: priceFreeze.appliedAdjustmentValue,
        priceResolvedAt: priceFreeze.priceResolvedAt,
      });
    }
    const totalAmount = sumDisplayMoneyTotals(items.map((item) => item.totalPrice));
    const totalCost = sumDisplayMoneyTotals(items.map((item) => item.totalCost));
    return { items, totalAmount, totalCost, totalProfit: roundDisplayMoney(totalAmount - totalCost) };
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

  private resolveProductBranchInvoice(order: { branchInvoices?: any[]; branchInvoice?: any }) {
    const invoices = order.branchInvoices ?? (order.branchInvoice ? [order.branchInvoice] : []);
    return (
      invoices.find(
        (invoice) => !invoice.invoiceCategory || invoice.invoiceCategory === BranchInvoiceCategory.PRODUCT_ORDER,
      ) ?? null
    );
  }

  private include() {
    return {
      branch: true,
      sourceWarehouse: true,
      destinationWarehouse: true,
      createdBy: { select: { id: true, fullName: true, role: true } },
      approvedBy: { select: { id: true, fullName: true, role: true } },
      items: { include: { product: true } },
      branchInvoices: true,
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

  private async createTransportExpenseInvoice(
    tx: PrismaTx,
    user: AuthUser,
    order: { id: string; branchId: string; orderNumber: string },
    receiving: { id: string },
    transportCostKgs: number,
  ) {
    const existing = await tx.branchInvoice.findFirst({
      where: {
        distributionOrderId: order.id,
        invoiceCategory: BranchInvoiceCategory.TRANSPORT_EXPENSE,
        deletedAt: null,
      },
    });
    if (existing) return this.toInvoiceResponse(existing);

    const totalAmount = this.roundMoney(transportCostKgs);
    const issuedAt = new Date();
    const invoice = await tx.branchInvoice.create({
      data: {
        invoiceNumber: await this.generateInvoiceNumber(tx),
        branchId: order.branchId,
        distributionOrderId: order.id,
        goodsReceivingId: receiving.id,
        invoiceCategory: BranchInvoiceCategory.TRANSPORT_EXPENSE,
        totalAmount,
        paidAmount: 0,
        debtAmount: totalAmount,
        dueDate: new Date(issuedAt.getTime() + 15 * 24 * 60 * 60 * 1000),
        issuedAt,
        sentToBranchAt: issuedAt,
        createdById: user.id,
      },
      include: this.invoiceInclude(),
    });
    await this.refreshBranchAccountBalance(tx, order.branchId);
    return this.toInvoiceResponse(invoice);
  }

  private async buildDispatchWeightSnapshot(
    tx: PrismaTx,
    items: Array<{ id: string; productId: string; productName: string; quantity: number }>,
  ) {
    const lines: Array<{
      itemId: string;
      productId: string;
      productName: string;
      dispatchedQuantity: number;
      unitWeightKg: number;
      lineWeightKg: number;
    }> = [];
    const missingWeightProducts: string[] = [];

    for (const item of items) {
      const product = await tx.product.findFirst({
        where: { id: item.productId, deletedAt: null },
        select: { weightKg: true, name: true },
      });
      const unitWeightKg = Number(product?.weightKg ?? 0);
      const dispatchedQuantity = item.quantity;
      if (unitWeightKg <= 0) {
        missingWeightProducts.push(product?.name ?? item.productName);
        continue;
      }
      const lineWeightKg = Math.round((unitWeightKg * dispatchedQuantity + Number.EPSILON) * 1000) / 1000;
      lines.push({
        itemId: item.id,
        productId: item.productId,
        productName: item.productName,
        dispatchedQuantity,
        unitWeightKg,
        lineWeightKg,
      });
    }

    const totalShipmentWeightKg =
      Math.round((lines.reduce((sum, line) => sum + line.lineWeightKg, 0) + Number.EPSILON) * 1000) / 1000;

    return { lines, missingWeightProducts, totalShipmentWeightKg };
  }

  private buildShipmentWeightSummary(order: any) {
    const items = order.items ?? [];
    const lineCount = items.length;
    const lineQuantity = (item: any) => Number(item.dispatchedQuantity ?? item.quantity ?? 0);
    const totalQuantity = items.reduce((sum: number, item: any) => sum + lineQuantity(item), 0);
    const hasSnapshot = Boolean(order.weightSnapshotAt) || items.some((item: any) => item.unitWeightKgSnapshot != null);
    let totalWeightKg = Number(order.totalShipmentWeightKg ?? 0);
    if (!hasSnapshot) {
      totalWeightKg = items.reduce((sum: number, item: any) => {
        const unitWeight = Number(item.unitWeightKgSnapshot ?? item.product?.weightKg ?? 0);
        return sum + unitWeight * lineQuantity(item);
      }, 0);
      totalWeightKg = Math.round((totalWeightKg + Number.EPSILON) * 1000) / 1000;
    }
    return {
      lineCount,
      totalQuantity,
      totalWeightKg,
      unit: 'kg',
      hasSnapshot,
      weightSnapshotAt: order.weightSnapshotAt ?? null,
    };
  }

  private async createInvoiceForOrder(
    tx: PrismaTx,
    user: AuthUser,
    order: { id: string; branchId: string; totalAmount: Prisma.Decimal },
  ) {
    const existing = await tx.branchInvoice.findFirst({
      where: {
        distributionOrderId: order.id,
        invoiceCategory: BranchInvoiceCategory.PRODUCT_ORDER,
        deletedAt: null,
      },
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
        invoiceCategory: BranchInvoiceCategory.PRODUCT_ORDER,
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

  private async buildBranchReceivingDetailExtras(order: {
    id: string;
    status: BranchDistributionOrderStatus;
    items?: Array<{
      id: string;
      productId: string;
      sku: string;
      productName: string;
      quantity: number;
      dispatchedQuantity: number | null;
      product?: { unit?: string | null } | null;
    }>;
  }) {
    const receivingStatuses: BranchDistributionOrderStatus[] = [
      BranchDistributionOrderStatus.SHIPPED,
      BranchDistributionOrderStatus.SENT,
    ];
    if (!receivingStatuses.includes(order.status) || !order.items?.length) {
      return {
        receivingLineItems: undefined,
        receivingProgress: undefined,
        canCompleteReceiving: false,
      };
    }

    const existingReceiving = await this.prisma.goodsReceiving.findFirst({
      where: { distributionOrderId: order.id, deletedAt: null },
      select: { id: true },
    });
    if (existingReceiving) {
      return {
        receivingLineItems: undefined,
        receivingProgress: undefined,
        canCompleteReceiving: false,
      };
    }

    const drafts = await this.prisma.branchDistributionReceivingDraftRow.findMany({
      where: { distributionOrderId: order.id },
    });
    const draftByItemId = new Map(drafts.map((row) => [row.distributionOrderItemId, row]));
    const receivingLineItems = order.items.map((item) =>
      mapDraftRowToLineItem(item, draftByItemId.get(item.id) ?? null),
    );
    const receivingProgress = buildReceivingProgress(
      order.items.map((item) => ({
        id: item.id,
        expectedQuantity: Number(item.dispatchedQuantity ?? item.quantity),
      })),
      drafts.map((row) => ({
        itemId: row.distributionOrderItemId,
        acceptedQuantity: row.acceptedQuantity,
        damagedQuantity: row.damagedQuantity,
        missingQuantity: row.missingQuantity,
        note: row.note,
        isSaved: row.isSaved,
        lastSavedAt: row.lastSavedAt,
      })),
    );
    const canCompleteReceiving =
      receivingProgress.products > 0 && receivingProgress.checked === receivingProgress.products;

    return { receivingLineItems, receivingProgress, canCompleteReceiving };
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
        totalLandedCostKgs:
          Number(item.totalCost ?? unitCost * Number(item.quantity)) + transportExpenseAllocation,
      };
    });
    const productCostTotal =
      items?.reduce((sum: number, item: any) => sum + Number(item.totalCost ?? 0), 0) ?? 0;
    const deliveryCostTotal =
      items?.reduce((sum: number, item: any) => sum + item.transportExpenseAllocation, 0) ?? transportCostKgs;
    const landedCostTotal =
      items?.reduce(
        (sum: number, item: any) =>
          sum + Number(item.totalCost ?? 0) + Number(item.transportExpenseAllocation ?? 0),
        0,
      ) ?? productCostTotal;
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
      shipmentWeightSummary: this.buildShipmentWeightSummary({ ...order, items }),
      deliveryCostSummary: {
        transportCostKgs,
        totalShipmentWeightKg,
        costPerKg,
        productCostTotal: Math.round((productCostTotal + Number.EPSILON) * 100) / 100,
        deliveryCostTotal: Math.round((deliveryCostTotal + Number.EPSILON) * 100) / 100,
        landedCostTotal: Math.round((landedCostTotal + Number.EPSILON) * 100) / 100,
      },
      items,
      branchInvoice: this.resolveProductBranchInvoice(order)
        ? this.toInvoiceResponse(this.resolveProductBranchInvoice(order))
        : null,
    };

    if (user && isHqWarehouseLogisticsOnlyUser(user)) {
      return this.sanitizeDistributionOrderForHqWarehouse(response);
    }
    if (user && !canViewProductCost(user)) {
      return sanitizeDistributionOrderForBranchCeo(response);
    }
    return response;
  }

  private sanitizeReceivingForUser(user: AuthUser, receiving: any) {
    if (canViewProductCost(user)) return receiving;
    return {
      id: receiving.id,
      receivingNumber: receiving.receivingNumber,
      distributionOrderId: receiving.distributionOrderId,
      branchId: receiving.branchId,
      warehouseId: receiving.warehouseId,
      receivedById: receiving.receivedById,
      receivedAt: receiving.receivedAt,
      note: receiving.note,
      transportCompany: receiving.transportCompany,
      driverName: receiving.driverName,
      vehicleNumber: receiving.vehicleNumber,
      arrivalDate: receiving.arrivalDate,
      transportNotes: receiving.transportNotes,
      createdAt: receiving.createdAt,
      updatedAt: receiving.updatedAt,
      branch: receiving.branch,
      warehouse: receiving.warehouse,
      receivedBy: receiving.receivedBy,
      distributionOrder: receiving.distributionOrder
        ? this.sanitizeDistributionOrderForHqWarehouse(receiving.distributionOrder)
        : null,
      items: (receiving.items ?? []).map((item: any) => ({
        id: item.id,
        receivingId: item.receivingId,
        distributionOrderItemId: item.distributionOrderItemId,
        productId: item.productId,
        sku: item.sku,
        productName: item.productName,
        sentQuantity: item.sentQuantity,
        receivedQuantity: item.receivedQuantity,
        differenceQuantity: item.differenceQuantity,
        note: item.note,
      })),
      shortageReport: receiving.shortageReport
        ? {
            ...receiving.shortageReport,
            items: (receiving.shortageReport.items ?? []).map((item: any) => ({
              id: item.id,
              productId: item.productId,
              sku: item.sku,
              productName: item.productName,
              expectedQuantity: item.expectedQuantity,
              receivedQuantity: item.receivedQuantity,
              differenceQuantity: item.differenceQuantity,
              type: item.type,
              note: item.note,
            })),
          }
        : null,
    };
  }

  private sanitizeDistributionOrderForHqWarehouse(order: any) {
    const shipmentWeightSummary = this.buildShipmentWeightSummary(order);
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
      totalShipmentWeightKg: shipmentWeightSummary.totalWeightKg,
      shipmentWeightSummary,
      pickingTask: order.pickingTask,
      items: order.items?.map((item: any) => ({
        id: item.id,
        productId: item.productId,
        sku: item.sku,
        productName: item.productName,
        quantity: item.quantity,
        dispatchedQuantity: item.dispatchedQuantity ?? item.quantity,
        unitWeightKg: item.unitWeightKgSnapshot != null ? Number(item.unitWeightKgSnapshot) : Number(item.product?.weightKg ?? 0),
        lineWeightKg:
          item.lineWeightKgSnapshot != null
            ? Number(item.lineWeightKgSnapshot)
            : Number(item.product?.weightKg ?? 0) * Number(item.quantity ?? 0),
        unit: item.unit,
        product: item.product
          ? { id: item.product.id, sku: item.product.sku, name: item.product.name, unit: item.product.unit, weightKg: item.product.weightKg }
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
        ? this.serializeBranchOrderInstallment(invoice.branchOrderInstallment)
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

  private serializeBranchOrderInstallment(installment: {
    id: string;
    status: BranchOrderInstallmentStatus;
    totalAmount: Prisma.Decimal | number;
    firstPaymentAmount: Prisma.Decimal | number;
    termMonths: number;
    firstPaymentRequired: boolean;
    firstPaymentConfirmed: boolean;
    requestComment?: string | null;
    installmentDueDate?: Date | string | null;
    requestedAt?: Date | string;
    decidedAt?: Date | string | null;
    rejectionComment?: string | null;
    [key: string]: unknown;
  }) {
    const totalAmount = Number(installment.totalAmount);
    const firstPaymentAmount = Number(installment.firstPaymentAmount);
    const remainingDebt = computeBranchOrderRemainingDebt(totalAmount, firstPaymentAmount);
    const paymentSchedule = buildBranchOrderInstallmentSchedule(
      remainingDebt,
      installment.termMonths,
      installment.installmentDueDate ? new Date(installment.installmentDueDate) : null,
    );
    const initialPaymentPercent =
      totalAmount > 0 ? this.roundMoney((firstPaymentAmount / totalAmount) * 100) : 0;

    return {
      ...installment,
      totalAmount,
      firstPaymentAmount,
      remainingDebt,
      financedAmount: remainingDebt,
      initialPaymentPercent,
      paymentSchedule,
      zeroInitialPayment: isZeroInitialPayment(firstPaymentAmount),
    };
  }

  private roundMoney(value: number) {
    return roundDisplayMoney(value);
  }
}
