import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AlertType,
  BranchDistributionOrderStatus,
  BranchPurchaseRequestStatus,
  FileAttachmentEntityType,
  HqWarrantyDecision,
  Prisma,
  ProcurementOrderStatus,
  ReturnOrderStatus,
  ReturnResolution,
  Role,
  ShortageReportItemType,
  StockMovementType,
  SupplierClaimStatus,
  WarehouseReleaseOrderStatus,
  WarrantyClaimStatus,
} from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { InventoryService } from '../inventory/inventory.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationQueryDto } from '../notifications/dto/notification-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { HQ_WAREHOUSE_ACCESS_DENIED } from '../hq-warehouse/hq-warehouse-assignment.constants';
import { canCreateBranchHqOrder, canManageBranchPurchaseRequests, canReceiveProcurementToHq, hasAnyFullAccessRole, hasAnyHqRole, resolveUserRoles } from '../rbac/rbac';
import { DistributionService } from '../distribution/distribution.service';
import {
  buildLogisticsWithCargo,
  calculateLandedCosts,
  CARGO_WEIGHT_LESS_THAN_NET,
  mapStoredProcurementItemToLandedCostInput,
} from '../procurement/landed-cost.util';
import {
  buildHqReceivingValidationResult,
  hqReceivingBlockedMessage,
  SVH_TRANSPORT_INCOMPLETE_MESSAGE,
} from '../procurement/hq-receiving-validation.util';
import { buildProcurementLandedCostInputs } from '../procurement/transport-logistics.util';
import { summarizeSupplierPayments } from '../procurement/supplier-payment.util';
import { activeHqWarehouseWhere, isHqWarehouse } from '../warehouse/warehouse.util';
import { HqWarehouseAssignmentService } from '../hq-warehouse/hq-warehouse-assignment.service';
import {
  buildChinaReceivingValidation,
  isChinaReceivingTaskVisible,
  isGoodsLeftYiwuStatus,
  resolveChinaReceivingListStatus,
} from './china-receiving.util';

type PrismaTx = Prisma.TransactionClient;

@Injectable()
export class OperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly notificationsService: NotificationsService,
    private readonly assignmentService: HqWarehouseAssignmentService,
    private readonly distributionService: DistributionService,
  ) {}

  branchPurchaseRequests(user: AuthUser) {
    return this.prisma.branchPurchaseRequest.findMany({
      where: {
        deletedAt: null,
        ...(this.canViewAllBranchPurchaseRequests(user) ? {} : { branchId: user.branchId }),
      },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createBranchPurchaseRequest(user: AuthUser, dto: any) {
    if (!canCreateBranchHqOrder(user)) {
      await this.audit(user, user.branchId, 'BRANCH_ORDER_CREATE_DENIED', 'BranchPurchaseRequest', 'create');
      throw new ForbiddenException('Only Branch Manager can create HQ orders');
    }
    const branchId = this.resolveBranchId(user, dto.branchId);
    const items = await this.resolveItems(dto.items ?? []);
    const request = await this.prisma.branchPurchaseRequest.create({
      data: {
        requestNumber: dto.requestNumber ?? `BPR-${Date.now()}`,
        branchId,
        status: dto.status ?? BranchPurchaseRequestStatus.SUBMITTED,
        createdById: user.id,
        note: dto.note,
        items: { create: items.map((item) => ({ ...item, quantity: Number(item.quantity ?? 0) })) },
      },
      include: { items: true },
    });
    await this.audit(user, branchId, 'BRANCH_ORDER_CREATED', 'BranchPurchaseRequest', request.id);
    await this.audit(user, branchId, 'BRANCH_PURCHASE_REQUEST_CREATED', 'BranchPurchaseRequest', request.id);
    if (request.status === BranchPurchaseRequestStatus.SUBMITTED) {
      await this.audit(user, branchId, 'BRANCH_ORDER_SUBMITTED', 'BranchPurchaseRequest', request.id);
      await this.notificationsService.notify(user, {
        type: AlertType.BRANCH_ORDER_SUBMITTED,
        branchId,
        entityType: 'BranchPurchaseRequest',
        entityId: request.id,
        referenceNumber: request.requestNumber,
        message: `Branch purchase request ${request.requestNumber} submitted.`,
      });
    }
    return request;
  }

  async reviewBranchPurchaseRequest(user: AuthUser, id: string, status: BranchPurchaseRequestStatus) {
    if (!canManageBranchPurchaseRequests(user)) throw new ForbiddenException('Forbidden resource');
    if (status !== BranchPurchaseRequestStatus.APPROVED && status !== BranchPurchaseRequestStatus.REJECTED) {
      throw new BadRequestException('Request can only be approved or rejected');
    }
    const updated = await this.prisma.branchPurchaseRequest.update({
      where: { id },
      data: { status, reviewedById: user.id, reviewedAt: new Date() },
      include: { items: true },
    });
    const auditAction =
      status === BranchPurchaseRequestStatus.APPROVED ? 'HQ_ORDER_APPROVED' : `BRANCH_PURCHASE_REQUEST_${status}`;
    await this.audit(user, updated.branchId, auditAction, 'BranchPurchaseRequest', id);
    await this.audit(user, updated.branchId, `BRANCH_PURCHASE_REQUEST_${status}`, 'BranchPurchaseRequest', id);

    if (status === BranchPurchaseRequestStatus.APPROVED) {
      await this.autoFulfillApprovedBranchOrder(user, updated);
    }
    return updated;
  }

  private async autoFulfillApprovedBranchOrder(user: AuthUser, request: { id: string; branchId: string; items: any[]; note?: string | null }) {
    const { sourceWarehouseId, destinationWarehouseId, assignedWarehouseManagerId } =
      await this.resolveDistributionWarehouses(request.branchId);

    const order = await this.convertBranchPurchaseRequest(user, request.id, {
      sourceWarehouseId,
      destinationWarehouseId,
    });

    await this.audit(user, request.branchId, 'DISTRIBUTION_CREATED', 'BranchDistributionOrder', order.id);

    await this.distributionService.approve(user, order.id);
    await this.distributionService.sendInvoice(user, order.id);
    await this.distributionService.sendToWarehouse(user, order.id, {
      assignedWarehouseManagerId,
    });

    await this.audit(user, request.branchId, 'WAREHOUSE_TASK_ASSIGNED', 'BranchDistributionOrder', order.id);
  }

  private async resolveDistributionWarehouses(branchId: string) {
    const sourceWarehouse = await this.prisma.warehouse.findFirst({
      where: { deletedAt: null, isActive: true, warehouseType: 'HQ' },
      orderBy: { createdAt: 'asc' },
    });
    if (!sourceWarehouse) {
      throw new BadRequestException('No active HQ warehouse found for distribution');
    }

    const destinationWarehouse = await this.prisma.warehouse.findFirst({
      where: { deletedAt: null, isActive: true, warehouseType: 'BRANCH', branchId },
      orderBy: { createdAt: 'asc' },
    });
    if (!destinationWarehouse) {
      throw new BadRequestException('No active branch warehouse found for this branch');
    }

    const assignment = await this.prisma.hqWarehouseManagerAssignment.findFirst({
      where: {
        warehouseId: sourceWarehouse.id,
        status: 'ACTIVE',
      },
      orderBy: { assignedAt: 'asc' },
    });

    return {
      sourceWarehouseId: sourceWarehouse.id,
      destinationWarehouseId: destinationWarehouse.id,
      assignedWarehouseManagerId: assignment?.userId,
    };
  }

  async convertBranchPurchaseRequest(user: AuthUser, id: string, dto: any) {
    if (!canManageBranchPurchaseRequests(user)) throw new ForbiddenException('Forbidden resource');
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.branchPurchaseRequest.findFirst({
        where: { id, deletedAt: null },
        include: { items: true },
      });
      if (!request) throw new NotFoundException('Branch purchase request not found');
      if (request.status !== BranchPurchaseRequestStatus.APPROVED) {
        throw new BadRequestException('Only approved requests can be converted');
      }
      const sourceWarehouseId = dto.sourceWarehouseId;
      const destinationWarehouseId = dto.destinationWarehouseId;
      if (!sourceWarehouseId || !destinationWarehouseId) {
        throw new BadRequestException('sourceWarehouseId and destinationWarehouseId are required');
      }

      const orderItems = [];
      let totalAmount = 0;
      let totalCost = 0;
      for (const item of request.items) {
        const product = await tx.product.findFirst({
          where: { id: item.productId, deletedAt: null },
        });
        if (!product) throw new NotFoundException(`Product not found: ${item.productId}`);
        const unitCost = Number(product.finalCostKgs);
        const unitPrice = Number(product.sellingPriceKgs);
        const quantity = item.quantity;
        const lineCost = Math.round((unitCost * quantity + Number.EPSILON) * 100) / 100;
        const linePrice = Math.round((unitPrice * quantity + Number.EPSILON) * 100) / 100;
        totalCost += lineCost;
        totalAmount += linePrice;
        orderItems.push({
          productId: product.id,
          sku: product.sku,
          productName: product.name,
          quantity,
          unitCost,
          unitPrice,
          totalCost: lineCost,
          totalPrice: linePrice,
          profit: Math.round((linePrice - lineCost + Number.EPSILON) * 100) / 100,
        });
      }

      const order = await tx.branchDistributionOrder.create({
        data: {
          orderNumber: dto.orderNumber ?? `DO-${Date.now()}`,
          branchId: request.branchId,
          sourceWarehouseId,
          destinationWarehouseId,
          status: BranchDistributionOrderStatus.DRAFT,
          createdById: user.id,
          note: request.note,
          totalAmount,
          totalCost,
          totalProfit: Math.round((totalAmount - totalCost + Number.EPSILON) * 100) / 100,
          items: { create: orderItems },
        },
      });
      await tx.branchPurchaseRequest.update({
        where: { id: request.id },
        data: {
          status: BranchPurchaseRequestStatus.CONVERTED_TO_DISTRIBUTION_ORDER,
          convertedOrderId: order.id,
        },
      });
      await this.auditInTx(tx, user, request.branchId, 'BRANCH_PURCHASE_REQUEST_CONVERTED', 'BranchPurchaseRequest', request.id);
      await this.auditInTx(tx, user, request.branchId, 'DISTRIBUTION_CREATED', 'BranchDistributionOrder', order.id);
      return order;
    });
  }

  async receiveProcurementToHq(user: AuthUser, procurementOrderId: string, dto: any) {
    const roles = resolveUserRoles(user);
    if (roles.includes(Role.SUPPLY_CHAIN_MANAGER) && !hasAnyFullAccessRole(roles)) {
      await this.auditReceivingDenied(user, procurementOrderId, null, 'Supply Chain Manager cannot receive goods into HQ warehouse');
      throw new ForbiddenException('Supply Chain Manager cannot receive goods into HQ warehouse');
    }
    if (!canReceiveProcurementToHq(user)) {
      await this.auditReceivingDenied(user, procurementOrderId, null, 'Only assigned HQ Warehouse Manager can receive goods into HQ warehouse');
      throw new ForbiddenException('Only assigned HQ Warehouse Manager can receive goods into HQ warehouse');
    }
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.procurementOrder.findFirst({
        where: { id: procurementOrderId, deletedAt: null },
        include: {
          items: true,
          supplierPayments: true,
          svhToHqTransport: { include: { transportCompany: true } },
        },
      });
      if (!order) throw new NotFoundException('Procurement order not found');
      if (order.hqStockMovementCreatedAt) {
        throw new BadRequestException('Procurement stock has already been received');
      }

      const cargoAttachmentCount = await tx.fileAttachment.count({
        where: {
          entityId: order.id,
          entityType: FileAttachmentEntityType.CARGO_RECEIPT,
          deletedAt: null,
        },
      });

      const cargoSnapshot = {
        cargoTotalWeightKg: dto.cargoTotalWeightKg ?? order.cargoTotalWeightKg,
        cargoRateUsdPerKg: dto.cargoRateUsdPerKg ?? order.cargoRateUsdPerKg,
        defaultUsdRate: dto.defaultUsdRate ?? order.defaultUsdRate,
        cargoReceiptNumber: dto.cargoReceiptNumber ?? order.cargoReceiptNumber,
        cargoReceiptDate: dto.cargoReceiptDate ?? order.cargoReceiptDate,
        cargoAttachmentCount,
      };
      const svhSnapshot = order.svhToHqTransport
        ? {
            transportCompanyId: order.svhToHqTransport.transportCompanyId,
            transportCostKgs: Number(order.svhToHqTransport.transportCostKgs),
            dispatchDate: order.svhToHqTransport.dispatchDate,
            arrivalDate: order.svhToHqTransport.arrivalDate,
            status: order.svhToHqTransport.status,
            transportCompanyStatus: order.svhToHqTransport.transportCompany?.status ?? null,
          }
        : null;

      const validation = buildHqReceivingValidationResult({
        cargo: cargoSnapshot,
        svh: svhSnapshot,
      });

      const validationResult = {
        procurementOrderId: order.id,
        cargoReceiptCompleted: validation.cargoReceiptCompleted,
        svhToHqTransportCompleted: validation.svhToHqTransportCompleted,
        cargoReceiptErrors: validation.cargoReceipt.errors,
        svhTransportErrors: validation.svhTransport.errors,
      };

      if (!validation.canReceiveToHq) {
        await this.auditInTx(tx, user, 'HQ', 'HQ_RECEIVING_BLOCKED', 'ProcurementOrder', order.id, {
          userId: user.id,
          procurementOrderId: order.id,
          validationResult,
        });
        const message = hqReceivingBlockedMessage(validation);
        throw new BadRequestException(message ?? SVH_TRANSPORT_INCOMPLETE_MESSAGE);
      }

      await this.auditInTx(tx, user, 'HQ', 'GOODS_RECEIVING_STARTED', 'ProcurementOrder', order.id, {
        userId: user.id,
        roles: user.roles ?? [user.role],
        warehouseId: order.hqWarehouseId,
        procurementOrderId: order.id,
        timestamp: new Date().toISOString(),
      });

      await this.auditInTx(tx, user, 'HQ', 'CARGO_RECEIPT_VALIDATED', 'ProcurementOrder', order.id, {
        userId: user.id,
        procurementOrderId: order.id,
        validationResult,
      });
      await this.auditInTx(tx, user, 'HQ', 'SVH_TO_HQ_TRANSPORT_VALIDATED', 'ProcurementOrder', order.id, {
        userId: user.id,
        procurementOrderId: order.id,
        validationResult,
      });
      await this.auditInTx(tx, user, 'HQ', 'HQ_RECEIVING_ALLOWED', 'ProcurementOrder', order.id, {
        userId: user.id,
        procurementOrderId: order.id,
        validationResult,
      });

      const hqWarehouseId = dto.hqWarehouseId ?? order.hqWarehouseId;
      if (!hasAnyFullAccessRole(roles)) {
        try {
          await this.assignmentService.assertAssignedToWarehouse(user.id, hqWarehouseId, tx);
        } catch (error) {
          await this.auditReceivingDenied(
            user,
            order.id,
            hqWarehouseId,
            HQ_WAREHOUSE_ACCESS_DENIED,
            tx,
          );
          throw error;
        }
      }
      const hqWarehouse = await tx.warehouse.findFirst({
        where: { id: hqWarehouseId, ...activeHqWarehouseWhere },
      });
      if (!hqWarehouse || !isHqWarehouse(hqWarehouse)) {
        throw new BadRequestException('Receiving requires an active HQ warehouse');
      }
      const receivedMap = new Map<string, any>((dto.items ?? []).map((item: any) => [item.procurementItemId ?? item.productId, item]));
      const receivedItems = order.items.map((item) => {
        const received: any = receivedMap.get(item.id) ?? receivedMap.get(item.productId) ?? {};
        const receivedQuantity = Number(received.receivedQuantity ?? item.quantity);
        return {
          ...item,
          receivedQuantity,
          difference: receivedQuantity - item.quantity,
          receivedNote: received.note,
          shortageReason: received.shortageReason,
        };
      });

      const mergedOrder = {
        ...order,
        cargoTotalWeightKg: dto.cargoTotalWeightKg ?? order.cargoTotalWeightKg,
        cargoRateUsdPerKg: dto.cargoRateUsdPerKg ?? order.cargoRateUsdPerKg,
        defaultUsdRate: dto.defaultUsdRate ?? order.defaultUsdRate,
        cargoCompany: dto.cargoCompany ?? order.cargoCompany,
        cargoReceiptNumber: dto.cargoReceiptNumber ?? order.cargoReceiptNumber,
        cargoReceiptDate: dto.cargoReceiptDate ? new Date(dto.cargoReceiptDate) : order.cargoReceiptDate,
        cargoReceiptNote: dto.cargoReceiptNote ?? order.cargoReceiptNote,
        chinaDomesticTransportYuan: dto.chinaDomesticTransportYuan ?? order.chinaDomesticTransportYuan,
        chinaDomesticTransportKgs: dto.chinaDomesticTransportKgs ?? order.chinaDomesticTransportKgs,
        customsCostKgs: dto.customsCostKgs ?? order.customsCostKgs,
        insuranceCostKgs: dto.insuranceCostKgs ?? order.insuranceCostKgs,
        bankFeeCostKgs: dto.bankFeeCostKgs ?? order.bankFeeCostKgs,
        otherExpenseKgs: dto.otherExpenseKgs ?? order.otherExpenseKgs,
        packagingCostKgs: dto.packagingCostKgs ?? order.packagingCostKgs,
      };

      const paymentSummary = summarizeSupplierPayments(
        (order.supplierPayments ?? []).map((payment) => ({
          amountYuan: Number(payment.amountYuan),
          exchangeRate: Number(payment.exchangeRate),
          status: payment.status,
        })),
        Number(order.totalYuan),
      );
      const effectiveYuanRate =
        paymentSummary.weightedAverageYuanRate && paymentSummary.totalPaidYuan > 0
          ? paymentSummary.weightedAverageYuanRate
          : Number(order.defaultYuanRate);
      const { logistics, cargo } = buildProcurementLandedCostInputs(mergedOrder, effectiveYuanRate);
      let recalculated;
      try {
        recalculated = calculateLandedCosts(
          receivedItems.map((item) => mapStoredProcurementItemToLandedCostInput(item)),
          logistics,
          { cargo },
        );
      } catch (error) {
        if (error instanceof Error && error.message === CARGO_WEIGHT_LESS_THAN_NET) {
          throw new BadRequestException('Cargo total weight cannot be less than product net weight.');
        }
        throw new BadRequestException('Landed cost could not be calculated. Complete import cost sections first.');
      }
      if (recalculated.totalCostKgs <= 0) {
        throw new BadRequestException('Landed cost must be calculated before receiving to HQ warehouse.');
      }

      const receiving = await tx.procurementGoodsReceiving.create({
        data: {
          receivingNumber: dto.receivingNumber ?? `PGR-${Date.now()}`,
          procurementOrderId: order.id,
          hqWarehouseId,
          receivedById: user.id,
          note: dto.note,
        },
      });
      const cargoTotalWeightKg = Number(cargo.cargoTotalWeightKg ?? 0);
      const { logistics: resolvedLogistics } = buildLogisticsWithCargo(
        logistics,
        cargoTotalWeightKg,
        cargo,
      );

      for (const [index, item] of receivedItems.entries()) {
        const next = recalculated.items[index];
        await tx.procurementOrderItem.update({
          where: { id: item.id },
          data: {
            receivedQuantity: item.receivedQuantity,
            packagingWeightKg: next.packagingWeightKg ?? 0,
            totalWeightKg: next.lineShipmentWeightKg ?? next.totalWeightKg,
            chinaDomesticAllocKgs: next.chinaDomesticAllocKgs,
            chinaExportAllocKgs: next.chinaExportAllocKgs,
            localTransportAllocKgs: next.localTransportAllocKgs,
            packagingAllocKgs: next.packagingAllocKgs,
            customsAllocKgs: next.customsAllocKgs,
            insuranceAllocKgs: next.insuranceAllocKgs,
            bankFeeAllocKgs: next.bankFeeAllocKgs,
            otherAllocKgs: next.otherAllocKgs,
            transportCostKgs: next.transportCostKgs,
            finalCostKgs: next.finalCostKgs,
            totalCostKgs: next.totalCostKgs,
          },
        });
        await tx.procurementGoodsReceivingItem.create({
          data: {
            receivingId: receiving.id,
            procurementItemId: item.id,
            productId: item.productId,
            sku: item.sku,
            productName: item.productName,
            expectedQuantity: item.quantity,
            receivedQuantity: item.receivedQuantity,
            differenceQuantity: Math.abs(item.difference),
            note: receivedMap.get(item.id)?.note ?? receivedMap.get(item.productId)?.note,
          },
        });
        if (item.receivedQuantity > 0) {
          const movement = await this.inventoryService.createStockMovementInTx(tx, user, {
            productId: item.productId,
            warehouseId: hqWarehouseId,
            type: StockMovementType.IN,
            quantity: item.receivedQuantity,
            unitCostKgs: next.finalCostKgs,
            referenceType: 'PROCUREMENT_GOODS_RECEIVING',
            referenceId: receiving.id,
            note: `Procurement receiving ${receiving.receivingNumber}`,
          });
          await this.auditInTx(tx, user, 'HQ', 'STOCK_MOVEMENT_CREATED', 'StockMovement', movement.id, {
            userId: user.id,
            roles: user.roles ?? [user.role],
            warehouseId: hqWarehouseId,
            procurementOrderId: order.id,
            receivingId: receiving.id,
            productId: item.productId,
            newValue: { type: StockMovementType.IN, quantity: item.receivedQuantity },
            timestamp: new Date().toISOString(),
          });
          await this.auditInTx(tx, user, 'HQ', 'INVENTORY_UPDATED', 'Product', item.productId, {
            userId: user.id,
            roles: user.roles ?? [user.role],
            warehouseId: hqWarehouseId,
            procurementOrderId: order.id,
            receivingId: receiving.id,
            productId: item.productId,
            newValue: { quantityAdded: item.receivedQuantity },
            timestamp: new Date().toISOString(),
          });
          const product = await tx.product.findUnique({ where: { id: item.productId } });
          if (product) {
            const sellingPriceKgs = Number(product.sellingPriceKgs);
            const marginAmount = Math.round((sellingPriceKgs - next.finalCostKgs + Number.EPSILON) * 100) / 100;
            const marginPercent = sellingPriceKgs === 0 ? 0 : Math.round(((marginAmount / sellingPriceKgs) * 100 + Number.EPSILON) * 100) / 100;
            await tx.product.update({
              where: { id: item.productId },
              data: {
                purchasePriceYuan: item.purchasePriceYuan,
                latestYuanRate: item.yuanRate,
                purchaseCostKgs: next.costKgs,
                transportCostKgs: next.transportCostKgs,
                finalCostKgs: next.finalCostKgs,
                marginAmount,
                marginPercent,
                priceHistory: {
                  create: {
                    purchasePriceYuan: item.purchasePriceYuan,
                    yuanRate: item.yuanRate,
                    purchaseCostKgs: next.costKgs,
                    transportCostKgs: next.transportCostKgs,
                    finalCostKgs: next.finalCostKgs,
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
        if (item.difference !== 0) {
          const shortageReason = item.shortageReason;
          let differenceType: ShortageReportItemType;
          if (shortageReason === 'DAMAGED_GOODS' || shortageReason === 'DAMAGED') {
            differenceType = ShortageReportItemType.DAMAGED;
          } else if (item.difference < 0) {
            differenceType = ShortageReportItemType.SHORTAGE;
          } else {
            differenceType = ShortageReportItemType.OVERAGE;
          }
          const report = await tx.procurementDifferenceReport.create({
            data: {
              reportNumber: `PDR-${Date.now()}-${item.id.slice(-4)}`,
              receivingId: receiving.id,
              procurementOrderId: order.id,
              warehouseId: hqWarehouseId,
              createdById: user.id,
              type: differenceType,
              productId: item.productId,
              sku: item.sku,
              productName: item.productName,
              expectedQuantity: item.quantity,
              receivedQuantity: item.receivedQuantity,
              differenceQuantity: Math.abs(item.difference),
              shortageReason: item.shortageReason,
              note: item.receivedNote,
            },
          });
          await this.auditInTx(
            tx,
            user,
            'HQ',
            differenceType === ShortageReportItemType.SHORTAGE
              ? 'SHORTAGE_DETECTED'
              : differenceType === ShortageReportItemType.OVERAGE
                ? 'OVERAGE_DETECTED'
                : 'DAMAGED_DETECTED',
            'ProcurementDifferenceReport',
            report.id,
            {
              userId: user.id,
              roles: user.roles ?? [user.role],
              warehouseId: hqWarehouseId,
              procurementOrderId: order.id,
              receivingId: receiving.id,
              productId: item.productId,
              expectedQty: item.quantity,
              actualQty: item.receivedQuantity,
              differenceQty: Math.abs(item.difference),
              differenceType,
              timestamp: new Date().toISOString(),
            },
          );
          await this.auditInTx(
            tx,
            user,
            'HQ',
            'DIFFERENCE_ACT_AUTO_CREATED',
            'ProcurementDifferenceReport',
            report.id,
            {
              userId: user.id,
              roles: user.roles ?? [user.role],
              warehouseId: hqWarehouseId,
              procurementOrderId: order.id,
              receivingId: receiving.id,
              productId: item.productId,
              expectedQty: item.quantity,
              actualQty: item.receivedQuantity,
              differenceQty: Math.abs(item.difference),
              differenceType,
              reason: item.shortageReason ?? item.receivedNote,
              oldValue: item.quantity,
              newValue: item.receivedQuantity,
              timestamp: new Date().toISOString(),
            },
          );
        }
      }

      await tx.procurementOrder.update({
        where: { id: order.id },
        data: {
          status: ProcurementOrderStatus.RECEIVED_TO_HQ_WAREHOUSE,
          receivedToHqAt: new Date(),
          actualArrivalDate: new Date(),
          hqStockMovementCreatedAt: new Date(),
          hqWarehouseId,
          cargoTotalWeightKg,
          cargoRateUsdPerKg: cargo.cargoRateUsdPerKg,
          defaultUsdRate: cargo.usdRate,
          cargoCompany: mergedOrder.cargoCompany,
          cargoReceiptNumber: mergedOrder.cargoReceiptNumber,
          cargoReceiptDate: mergedOrder.cargoReceiptDate,
          cargoReceiptNote: mergedOrder.cargoReceiptNote,
          localTransportKgs: mergedOrder.localTransportKgs,
          chinaDomesticTransportKgs: mergedOrder.chinaDomesticTransportKgs,
          customsCostKgs: mergedOrder.customsCostKgs,
          insuranceCostKgs: mergedOrder.insuranceCostKgs,
          bankFeeCostKgs: mergedOrder.bankFeeCostKgs,
          otherExpenseKgs: mergedOrder.otherExpenseKgs,
          packagingCostKgs: mergedOrder.packagingCostKgs,
          totalCostKgs: recalculated.totalCostKgs,
          totalWeightKg: recalculated.totalShipmentWeightKg,
          totalNetWeightKg: recalculated.totalNetWeightKg,
          totalPackagingWeightKg: recalculated.totalPackagingWeightKg,
          totalCargoCostUsd: recalculated.totalCargoCostUsd,
          totalCargoCostKgs: recalculated.totalCargoCostKgs,
          totalTransportCostKgs: recalculated.totalTransportCostKgs,
          costPerKg: recalculated.costPerKg,
          chinaExportTransportKgs: resolvedLogistics.chinaExportTransportKgs,
        },
      });
      await this.auditInTx(tx, user, 'HQ', 'HQ_RECEIVING_FINALIZED', 'ProcurementOrder', order.id, {
        receivingId: receiving.id,
        procurementOrderId: order.id,
        hqWarehouseId,
        recalculatedLandedCost: true,
        reason: dto.reason,
      });
      await this.auditInTx(tx, user, 'HQ', 'HQ_RECEIVING_COMPLETED', 'ProcurementOrder', order.id, {
        userId: user.id,
        roles: user.roles ?? [user.role],
        warehouseId: hqWarehouseId,
        procurementOrderId: order.id,
        receivingId: receiving.id,
        oldValue: null,
        newValue: { status: ProcurementOrderStatus.RECEIVED_TO_HQ_WAREHOUSE },
        timestamp: new Date().toISOString(),
      });
      await this.auditInTx(tx, user, 'HQ', 'GOODS_RECEIVED_TO_HQ', 'ProcurementOrder', order.id, {
        userId: user.id,
        procurementOrderId: order.id,
        receivingId: receiving.id,
        hqWarehouseId,
        validationResult,
      });
      await this.notificationsService.notifyInTx(tx, user, {
        type: AlertType.GOODS_RECEIVED_HQ,
        entityType: 'ProcurementOrder',
        entityId: order.id,
        referenceNumber: order.orderNumber,
        message: `Goods received into HQ warehouse for procurement ${order.orderNumber}.`,
      });
      return tx.procurementGoodsReceiving.findUnique({ where: { id: receiving.id }, include: { items: true } });
    });
  }

  procurementReceivings() {
    return this.prisma.procurementGoodsReceiving.findMany({
      where: { deletedAt: null },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listChinaReceivingTasks(user: AuthUser) {
    const roles = resolveUserRoles(user);
    const isCeo = hasAnyFullAccessRole(roles);
    const isScm = roles.includes(Role.SUPPLY_CHAIN_MANAGER);
    const isWm = roles.includes(Role.WAREHOUSE_MANAGER);

    if (!isCeo && !isScm && !canReceiveProcurementToHq(user)) {
      throw new ForbiddenException('You do not have access to China goods receiving');
    }

    let warehouseIds: string[] | null = null;
    if (isWm && !isCeo) {
      warehouseIds = await this.assignmentService.getActiveAssignedWarehouseIds(user.id);
      if (!warehouseIds.length) return [];
    }

    const orders = await this.prisma.procurementOrder.findMany({
      where: {
        deletedAt: null,
        status: { notIn: [ProcurementOrderStatus.DRAFT, ProcurementOrderStatus.CANCELLED] },
        ...(warehouseIds ? { hqWarehouseId: { in: warehouseIds } } : {}),
      },
      include: {
        supplier: { select: { id: true, name: true } },
        factory: { select: { id: true, name: true } },
        hqWarehouse: { select: { id: true, name: true, code: true, isActive: true } },
        items: true,
        svhToHqTransport: { include: { transportCompany: true } },
        differenceReports: { where: { deletedAt: null } },
        receivings: {
          where: { deletedAt: null },
          include: { items: true },
        },
      },
      orderBy: [{ hqStockMovementCreatedAt: 'asc' }, { actualArrivalDate: 'desc' }, { createdAt: 'desc' }],
    });

    const attachmentCounts = await this.prisma.fileAttachment.groupBy({
      by: ['entityId'],
      where: {
        entityType: FileAttachmentEntityType.CARGO_RECEIPT,
        deletedAt: null,
        entityId: { in: orders.map((order) => order.id) },
      },
      _count: { _all: true },
    });
    const attachmentCountMap = new Map(attachmentCounts.map((row) => [row.entityId, row._count._all]));

    const tasks = [];
    let goodsLeftYiwuVisibleCount = 0;
    for (const order of orders) {
      const enriched = { ...order, cargoAttachmentCount: attachmentCountMap.get(order.id) ?? 0 };
      if (!isChinaReceivingTaskVisible(enriched)) continue;
      if (isWm && !isCeo) {
        try {
          await this.assignmentService.assertAssignedToWarehouse(user.id, order.hqWarehouseId);
        } catch {
          continue;
        }
        if (isGoodsLeftYiwuStatus(order.status)) {
          goodsLeftYiwuVisibleCount += 1;
        }
      }

      const expectedQuantity = order.items.reduce((sum, item) => sum + item.quantity, 0);
      const receivedQuantity = order.hqStockMovementCreatedAt
        ? order.items.reduce((sum, item) => sum + (item.receivedQuantity ?? 0), 0)
        : 0;
      const validation = buildChinaReceivingValidation(enriched);

      tasks.push({
        id: order.id,
        orderNumber: order.orderNumber,
        supplier: order.supplier,
        factory: order.factory,
        hqWarehouse: order.hqWarehouse,
        status: resolveChinaReceivingListStatus(enriched),
        procurementStatus: order.status,
        expectedQuantity,
        receivedQuantity,
        arrivalDate: order.actualArrivalDate ?? order.estimatedArrivalDate ?? order.svhToHqTransport?.arrivalDate,
        canReceive: !order.hqStockMovementCreatedAt && isWm && !isScm,
        canMarkArrival:
          !order.hqStockMovementCreatedAt && isWm && !isScm && isGoodsLeftYiwuStatus(order.status),
        canViewOnly: isScm && !isCeo,
        arrivalMarked: Boolean(order.actualArrivalDate),
        validation,
      });
    }

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: 'CHINA_RECEIVING_MENU_OPENED',
        entity: 'ProcurementOrder',
        entityId: 'list',
        metadata: {
          userId: user.id,
          roles: user.roles ?? [user.role],
          warehouseIds,
          count: tasks.length,
          goodsLeftYiwuVisibleCount,
          timestamp: new Date().toISOString(),
        },
      },
    });

    if (isWm && !isCeo && goodsLeftYiwuVisibleCount > 0) {
      await this.prisma.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'CHINA_RECEIVING_VISIBLE_TO_WAREHOUSE_MANAGER',
          entity: 'ProcurementOrder',
          entityId: 'list',
          metadata: {
            userId: user.id,
            roles: user.roles ?? [user.role],
            warehouseIds,
            count: goodsLeftYiwuVisibleCount,
            timestamp: new Date().toISOString(),
          },
        },
      });
    }

    if (isWm && !isCeo) {
      await this.prisma.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'HQ_WAREHOUSE_MANAGER_MENU_UPDATED',
          entity: 'ProcurementOrder',
          entityId: 'list',
          metadata: {
            userId: user.id,
            roles: user.roles ?? [user.role],
            warehouseIds,
            removedMenuItems: ['stock-movements'],
            timestamp: new Date().toISOString(),
          },
        },
      });
    }

    return tasks;
  }

  async getChinaReceivingTask(user: AuthUser, orderId: string) {
    const order = await this.loadChinaReceivingOrder(orderId);
    await this.assertChinaReceivingAccess(user, order.hqWarehouseId);

    const attachmentCount = await this.prisma.fileAttachment.count({
      where: {
        entityId: order.id,
        entityType: FileAttachmentEntityType.CARGO_RECEIPT,
        deletedAt: null,
      },
    });

    const enriched = { ...order, cargoAttachmentCount: attachmentCount };
    const validation = buildChinaReceivingValidation(enriched);
    const roles = resolveUserRoles(user);
    const isScm = roles.includes(Role.SUPPLY_CHAIN_MANAGER) && !hasAnyFullAccessRole(roles);
    const isWm = canReceiveProcurementToHq(user);

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: 'CHINA_RECEIVING_OPENED',
        entity: 'ProcurementOrder',
        entityId: order.id,
        metadata: {
          userId: user.id,
          roles: user.roles ?? [user.role],
          warehouseId: order.hqWarehouseId,
          procurementOrderId: order.id,
          timestamp: new Date().toISOString(),
        },
      },
    });

    if (isScm && (order.differenceReports?.length ?? 0) > 0) {
      await this.prisma.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'SUPPLY_MANAGER_VIEWED_DIFFERENCE_ACT',
          entity: 'ProcurementOrder',
          entityId: order.id,
          metadata: {
            userId: user.id,
            roles: user.roles ?? [user.role],
            warehouseId: order.hqWarehouseId,
            procurementOrderId: order.id,
            timestamp: new Date().toISOString(),
          },
        },
      });
    }

    return {
      ...order,
      receivingStatus: resolveChinaReceivingListStatus(enriched),
      validation,
      canReceive: !order.hqStockMovementCreatedAt && isWm && !isScm,
      canMarkArrival:
        !order.hqStockMovementCreatedAt && isWm && !isScm && isGoodsLeftYiwuStatus(order.status),
      canCreateAct: isWm && !isScm && !order.hqStockMovementCreatedAt,
      canViewActs: isScm || hasAnyFullAccessRole(roles) || isWm,
      arrivalMarked: Boolean(order.actualArrivalDate),
      differenceReports: order.differenceReports,
      lineItems: order.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        sku: item.sku,
        productName: item.productName,
        orderedQuantity: item.quantity,
        expectedQuantity: item.quantity,
        actualReceivedQuantity: item.receivedQuantity,
        difference: (item.receivedQuantity ?? item.quantity) - item.quantity,
      })),
    };
  }

  async createReceivingDifferenceActs(user: AuthUser, orderId: string, dto: any) {
    const roles = resolveUserRoles(user);
    if (roles.includes(Role.SUPPLY_CHAIN_MANAGER) && !hasAnyFullAccessRole(roles)) {
      throw new ForbiddenException('Supply Chain Manager cannot create receiving acts');
    }
    if (!canReceiveProcurementToHq(user) && !hasAnyFullAccessRole(roles)) {
      throw new ForbiddenException('Only assigned HQ Warehouse Manager can create receiving acts');
    }

    const order = await this.loadChinaReceivingOrder(orderId);
    await this.assertChinaReceivingAccess(user, order.hqWarehouseId);
    if (order.hqStockMovementCreatedAt) {
      throw new BadRequestException('Goods have already been received for this procurement order');
    }

    const warehouseId = dto.warehouseId ?? order.hqWarehouseId;
    const items = Array.isArray(dto.items) ? dto.items : [];
    if (!items.length) throw new BadRequestException('At least one difference act item is required');

    return this.prisma.$transaction(async (tx) => {
      const created = [];
      for (const item of items) {
        const orderItem = order.items.find(
          (row) => row.id === item.procurementItemId || row.productId === item.productId,
        );
        if (!orderItem) continue;

        const expectedQty = Number(item.expectedQuantity ?? orderItem.quantity);
        const actualQty = Number(item.actualQuantity ?? orderItem.quantity);
        const differenceQty = Math.abs(actualQty - expectedQty);
        if (differenceQty === 0) continue;

        let differenceType = item.differenceType as ShortageReportItemType;
        if (!differenceType) {
          differenceType = actualQty < expectedQty ? ShortageReportItemType.SHORTAGE : ShortageReportItemType.OVERAGE;
        }

        const report = await tx.procurementDifferenceReport.create({
          data: {
            reportNumber: `PDR-${Date.now()}-${orderItem.id.slice(-4)}`,
            procurementOrderId: order.id,
            warehouseId,
            createdById: user.id,
            type: differenceType,
            productId: orderItem.productId,
            sku: orderItem.sku,
            productName: orderItem.productName,
            expectedQuantity: expectedQty,
            receivedQuantity: actualQty,
            differenceQuantity: differenceQty,
            shortageReason: item.reason ?? item.shortageReason,
            note: item.note,
          },
        });
        created.push(report);

        const auditAction =
          differenceType === ShortageReportItemType.SHORTAGE
            ? 'RECEIVING_SHORTAGE_CREATED'
            : differenceType === ShortageReportItemType.OVERAGE
              ? 'RECEIVING_OVERAGE_CREATED'
              : 'RECEIVING_DIFFERENCE_ACT_CREATED';

        await this.auditInTx(tx, user, 'HQ', auditAction, 'ProcurementDifferenceReport', report.id, {
          userId: user.id,
          roles: user.roles ?? [user.role],
          warehouseId,
          procurementOrderId: order.id,
          receivingId: null,
          productId: orderItem.productId,
          expectedQty,
          actualQty,
          differenceQty,
          differenceType,
          reason: item.reason ?? item.note,
        });
      }

      if (!created.length) {
        throw new BadRequestException('No quantity differences found for act creation');
      }

      await this.auditInTx(tx, user, 'HQ', 'RECEIVING_DIFFERENCE_ACT_CREATED', 'ProcurementOrder', order.id, {
        userId: user.id,
        roles: user.roles ?? [user.role],
        warehouseId,
        procurementOrderId: order.id,
        createdActIds: created.map((row) => row.id),
      });

      return created;
    });
  }

  async markChinaReceivingArrival(user: AuthUser, orderId: string, dto: any) {
    const roles = resolveUserRoles(user);
    if (roles.includes(Role.SUPPLY_CHAIN_MANAGER) && !hasAnyFullAccessRole(roles)) {
      throw new ForbiddenException('Supply Chain Manager cannot mark arrival');
    }
    if (!canReceiveProcurementToHq(user) && !hasAnyFullAccessRole(roles)) {
      throw new ForbiddenException('Only assigned HQ Warehouse Manager can mark arrival');
    }

    const order = await this.loadChinaReceivingOrder(orderId);
    await this.assertChinaReceivingAccess(user, order.hqWarehouseId);
    if (order.hqStockMovementCreatedAt) {
      throw new BadRequestException('Goods have already been received for this procurement order');
    }

    const items = Array.isArray(dto.items) ? dto.items : [];
    if (!items.length) throw new BadRequestException('At least one line item is required');

    return this.prisma.$transaction(async (tx) => {
      for (const item of items) {
        const orderItem = order.items.find(
          (row) => row.id === item.procurementItemId || row.productId === item.productId,
        );
        if (!orderItem) continue;

        const actualQty = Number(item.actualQuantity ?? item.receivedQuantity ?? orderItem.quantity);
        await tx.procurementOrderItem.update({
          where: { id: orderItem.id },
          data: { receivedQuantity: actualQty },
        });

        await this.auditInTx(tx, user, 'HQ', 'RECEIVING_COUNT_UPDATED', 'ProcurementOrderItem', orderItem.id, {
          userId: user.id,
          roles: user.roles ?? [user.role],
          warehouseId: order.hqWarehouseId,
          procurementOrderId: order.id,
          productId: orderItem.productId,
          oldValue: orderItem.receivedQuantity,
          newValue: actualQty,
        });
      }

      const updated = await tx.procurementOrder.update({
        where: { id: order.id },
        data: { actualArrivalDate: dto.arrivalDate ? new Date(dto.arrivalDate) : new Date() },
      });

      await this.auditInTx(tx, user, 'HQ', 'ARRIVAL_MARKED', 'ProcurementOrder', order.id, {
        userId: user.id,
        roles: user.roles ?? [user.role],
        warehouseId: order.hqWarehouseId,
        procurementOrderId: order.id,
        newValue: { actualArrivalDate: updated.actualArrivalDate },
      });

      return updated;
    });
  }

  async listChinaReceivingDifferenceActs(user: AuthUser, orderId?: string) {
    const roles = resolveUserRoles(user);
    const isScm = roles.includes(Role.SUPPLY_CHAIN_MANAGER) && !hasAnyFullAccessRole(roles);
    const isCeo = hasAnyFullAccessRole(roles);
    if (!isScm && !isCeo && !canReceiveProcurementToHq(user)) {
      throw new ForbiddenException('You do not have access to difference acts');
    }

    const reports = await this.prisma.procurementDifferenceReport.findMany({
      where: {
        deletedAt: null,
        ...(orderId ? { procurementOrderId: orderId } : {}),
      },
      include: {
        procurementOrder: {
          select: {
            id: true,
            orderNumber: true,
            hqWarehouseId: true,
            status: true,
            supplier: { select: { id: true, name: true } },
            factory: { select: { id: true, name: true } },
          },
        },
        warehouse: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (isScm) {
      await this.prisma.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'SUPPLY_MANAGER_VIEWED_DIFFERENCE_ACT',
          entity: 'ProcurementDifferenceReport',
          entityId: orderId ?? 'list',
          metadata: {
            userId: user.id,
            roles: user.roles ?? [user.role],
            procurementOrderId: orderId,
            count: reports.length,
            timestamp: new Date().toISOString(),
          },
        },
      });
    }

    return reports.map((report) => ({
      id: report.id,
      reportNumber: report.reportNumber,
      procurementOrderId: report.procurementOrderId,
      procurementOrder: report.procurementOrder,
      orderNumber: report.procurementOrder.orderNumber,
      supplier: report.procurementOrder.supplier,
      factory: report.procurementOrder.factory,
      warehouse: report.warehouse,
      hqWarehouse: report.warehouse,
      productId: report.productId,
      productName: report.productName,
      sku: report.sku,
      type: report.type,
      differenceType: report.type,
      status: report.status,
      expectedQuantity: report.expectedQuantity,
      actualQuantity: report.receivedQuantity,
      receivedQuantity: report.receivedQuantity,
      differenceQuantity: report.differenceQuantity,
      difference: report.differenceQuantity,
      note: report.note,
      shortageReason: report.shortageReason,
      warehouseManager: report.createdBy,
      createdBy: report.createdBy,
      receivingId: report.receivingId,
      createdAt: report.createdAt,
    }));
  }

  async archiveDifferenceAct(user: AuthUser, actId: string) {
    if (!hasAnyFullAccessRole(resolveUserRoles(user))) {
      throw new ForbiddenException('Only CEO can archive difference acts');
    }

    const report = await this.prisma.procurementDifferenceReport.findFirst({
      where: { id: actId, deletedAt: null },
    });
    if (!report) throw new NotFoundException('Difference act not found');

    const updated = await this.prisma.procurementDifferenceReport.update({
      where: { id: actId },
      data: {
        status: 'CLOSED',
        deletedAt: new Date(),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: 'DIFFERENCE_ACT_ARCHIVED',
        entity: 'ProcurementDifferenceReport',
        entityId: actId,
        metadata: {
          userId: user.id,
          roles: user.roles ?? [user.role],
          warehouseId: report.warehouseId,
          procurementOrderId: report.procurementOrderId,
          productId: report.productId,
          oldValue: { status: report.status },
          newValue: { status: 'CLOSED', archived: true },
          timestamp: new Date().toISOString(),
        },
      },
    });

    return updated;
  }

  private async loadChinaReceivingOrder(orderId: string) {
    const order = await this.prisma.procurementOrder.findFirst({
      where: { id: orderId, deletedAt: null },
      include: {
        supplier: true,
        factory: true,
        hqWarehouse: true,
        items: true,
        svhToHqTransport: { include: { transportCompany: true } },
        differenceReports: { where: { deletedAt: null } },
        receivings: { where: { deletedAt: null }, include: { items: true } },
      },
    });
    if (!order) throw new NotFoundException('Procurement order not found');
    return order;
  }

  private async assertChinaReceivingAccess(user: AuthUser, warehouseId: string) {
    const roles = resolveUserRoles(user);
    if (hasAnyFullAccessRole(roles) || roles.includes(Role.SUPPLY_CHAIN_MANAGER)) return;
    if (!canReceiveProcurementToHq(user)) {
      throw new ForbiddenException('You do not have access to China goods receiving');
    }
    await this.assignmentService.assertAssignedToWarehouse(user.id, warehouseId);
  }

  reservations(user: AuthUser) {
    return this.prisma.reservation.findMany({
      where: { deletedAt: null, ...(this.canAccessAllBranches(user) ? {} : { branchId: user.branchId }) },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createReservation(user: AuthUser, dto: any) {
    const branchId = this.resolveBranchId(user, dto.branchId);
    const items = await this.resolveItems(dto.items ?? []);
    const reservation = await this.prisma.reservation.create({
      data: {
        reservationNumber: dto.reservationNumber ?? `RES-${Date.now()}`,
        branchId,
        customerId: dto.customerId,
        depositAmount: Number(dto.depositAmount ?? 0),
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        createdById: user.id,
        items: {
          create: items.map((item) => ({
            productId: item.productId,
            sku: item.sku,
            productName: item.productName,
            quantity: Number(item.quantity ?? 0),
            unitPrice: Number(item.unitPrice ?? 0),
            totalPrice: Number(item.quantity ?? 0) * Number(item.unitPrice ?? 0),
          })),
        },
      },
      include: { items: true },
    });
    await this.audit(user, branchId, 'RESERVATION_CREATED', 'Reservation', reservation.id);
    return reservation;
  }

  async updateReservationStatus(user: AuthUser, id: string, status: any) {
    const reservation = await this.prisma.reservation.findFirst({
      where: { id, deletedAt: null, ...(this.canAccessAllBranches(user) ? {} : { branchId: user.branchId }) },
    });
    if (!reservation) throw new NotFoundException('Reservation not found');
    const updated = await this.prisma.reservation.update({
      where: { id },
      data: {
        status,
        cancelledAt: status === 'CANCELLED' ? new Date() : undefined,
      },
      include: { items: true },
    });
    await this.audit(user, reservation.branchId, `RESERVATION_${status}`, 'Reservation', id);
    return updated;
  }

  warehouseReleaseOrders(user: AuthUser) {
    return this.prisma.warehouseReleaseOrder.findMany({
      where: { deletedAt: null, ...(this.canAccessAllBranches(user) ? {} : { branchId: user.branchId }) },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createWarehouseReleaseOrder(user: AuthUser, dto: any) {
    const branchId = this.resolveBranchId(user, dto.branchId);
    const items = await this.resolveItems(dto.items ?? []);
    const release = await this.prisma.warehouseReleaseOrder.create({
      data: {
        releaseNumber: dto.releaseNumber ?? `WRO-${Date.now()}`,
        saleId: dto.saleId,
        serviceOrderId: dto.serviceOrderId,
        branchId,
        warehouseId: dto.warehouseId,
        status: dto.status ?? WarehouseReleaseOrderStatus.PENDING,
        note: dto.note,
        items: { create: items.map((item) => ({ productId: item.productId, sku: item.sku, productName: item.productName, quantity: Number(item.quantity ?? 0) })) },
      },
      include: { items: true },
    });
    await this.audit(user, branchId, 'WAREHOUSE_RELEASE_CREATED', 'WarehouseReleaseOrder', release.id);
    return release;
  }

  async releaseWarehouseOrder(user: AuthUser, id: string) {
    const release = await this.prisma.warehouseReleaseOrder.findFirst({
      where: { id, deletedAt: null, ...(this.canAccessAllBranches(user) ? {} : { branchId: user.branchId }) },
    });
    if (!release) throw new NotFoundException('Warehouse release not found');
    const updated = await this.prisma.warehouseReleaseOrder.update({
      where: { id },
      data: { status: WarehouseReleaseOrderStatus.RELEASED, releasedById: user.id, releasedAt: new Date() },
      include: { items: true },
    });
    await this.audit(user, release.branchId, 'WAREHOUSE_RELEASED', 'WarehouseReleaseOrder', id);
    return updated;
  }

  partsRequests(user: AuthUser) {
    return this.prisma.partsRequest.findMany({
      where: { deletedAt: null, ...(this.canAccessAllBranches(user) ? {} : { branchId: user.branchId }) },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createPartsRequest(user: AuthUser, dto: any) {
    const serviceOrder = await this.prisma.serviceOrder.findFirst({
      where: { id: dto.serviceOrderId, deletedAt: null, ...(this.canAccessAllBranches(user) ? {} : { branchId: user.branchId }) },
    });
    if (!serviceOrder) throw new NotFoundException('Service order not found');
    const items = await this.resolveItems(dto.items ?? []);
    const request = await this.prisma.partsRequest.create({
      data: {
        requestNumber: dto.requestNumber ?? `PR-${Date.now()}`,
        serviceOrderId: serviceOrder.id,
        branchId: serviceOrder.branchId,
        createdById: user.id,
        note: dto.note,
        items: { create: items.map((item) => ({ productId: item.productId, warehouseId: item.warehouseId, sku: item.sku, productName: item.productName, quantity: Number(item.quantity ?? 0) })) },
      },
      include: { items: true },
    });
    await this.audit(user, serviceOrder.branchId, 'PARTS_REQUEST_CREATED', 'PartsRequest', request.id);
    return request;
  }

  returns(user: AuthUser) {
    return this.prisma.returnOrder.findMany({
      where: { deletedAt: null, ...(this.canAccessAllBranches(user) ? {} : { branchId: user.branchId }) },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createReturn(user: AuthUser, dto: any) {
    const branchId = this.resolveBranchId(user, dto.branchId);
    const items = await this.resolveItems(dto.items ?? []);
    const totalAmount = items.reduce((sum, item) => sum + Number(item.quantity ?? 0) * Number(item.unitPrice ?? 0), 0);
    const order = await this.prisma.returnOrder.create({
      data: {
        returnNumber: dto.returnNumber ?? `RET-${Date.now()}`,
        branchId,
        customerId: dto.customerId,
        saleId: dto.saleId,
        reason: dto.reason,
        totalAmount,
        createdById: user.id,
        note: dto.note,
        items: { create: items.map((item) => ({ productId: item.productId, sku: item.sku, productName: item.productName, quantity: Number(item.quantity ?? 0), unitPrice: Number(item.unitPrice ?? 0), condition: item.condition, defective: Boolean(item.defective) })) },
      },
      include: { items: true },
    });
    await this.audit(user, branchId, 'RETURN_CREATED', 'ReturnOrder', order.id);
    return order;
  }

  async approveReturn(user: AuthUser, id: string, dto: any) {
    const order = await this.prisma.returnOrder.findFirst({
      where: { id, deletedAt: null, ...(this.canAccessAllBranches(user) ? {} : { branchId: user.branchId }) },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Return not found');
    const managerLimit = Number(dto.managerApprovalLimit ?? 3000);
    if (!this.hasRole(user, Role.FRANCHISE_OWNER) && Number(order.totalAmount) > managerLimit) {
      throw new ForbiddenException('Franchise owner approval required');
    }
    const updated = await this.prisma.returnOrder.update({
      where: { id },
      data: { status: ReturnOrderStatus.APPROVED, resolution: dto.resolution, approvedById: user.id, approvedAt: new Date() },
      include: { items: true },
    });
    await this.audit(user, order.branchId, 'RETURN_APPROVED', 'ReturnOrder', id);
    return updated;
  }

  async closeReturn(user: AuthUser, id: string, dto: any) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.returnOrder.findFirst({
        where: { id, deletedAt: null, ...(this.canAccessAllBranches(user) ? {} : { branchId: user.branchId }) },
        include: { items: true },
      });
      if (!order) throw new NotFoundException('Return not found');
      const warehouseId = dto.warehouseId;
      if (warehouseId) {
        for (const item of order.items) {
          await this.inventoryService.createStockMovementInTx(tx, user, {
            productId: item.productId,
            warehouseId,
            type: item.defective ? StockMovementType.DEFECTIVE_IN : StockMovementType.IN,
            quantity: item.quantity,
            unitCostKgs: Number(item.unitPrice),
            referenceType: 'RETURN_ORDER',
            referenceId: order.id,
            note: `Return ${order.returnNumber}`,
          });
        }
      }
      const updated = await tx.returnOrder.update({
        where: { id },
        data: { status: dto.status ?? ReturnOrderStatus.CLOSED, resolution: dto.resolution ?? order.resolution, closedAt: new Date() },
        include: { items: true },
      });
      await this.auditInTx(tx, user, order.branchId, 'RETURN_CLOSED', 'ReturnOrder', id);
      return updated;
    });
  }

  warrantyClaims(user: AuthUser) {
    return this.prisma.warrantyClaim.findMany({
      where: { deletedAt: null, ...(this.canAccessAllBranches(user) ? {} : { branchId: user.branchId }) },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createWarrantyClaim(user: AuthUser, dto: any) {
    const branchId = this.resolveBranchId(user, dto.branchId);
    const product = await this.prisma.product.findFirst({ where: { id: dto.productId, deletedAt: null } });
    if (!product) throw new NotFoundException('Product not found');
    const claim = await this.prisma.warrantyClaim.create({
      data: {
        claimNumber: dto.claimNumber ?? `WCL-${Date.now()}`,
        branchId,
        customerId: dto.customerId,
        productId: product.id,
        sku: product.sku,
        serialNumber: dto.serialNumber,
        saleId: dto.saleId,
        soldAt: dto.soldAt ? new Date(dto.soldAt) : undefined,
        soldById: dto.soldById,
        installedById: dto.installedById,
        warrantyUntil: dto.warrantyUntil ? new Date(dto.warrantyUntil) : undefined,
        reason: dto.reason,
        note: dto.note,
        createdById: user.id,
        items: { create: [{ productId: product.id, sku: product.sku, productName: product.name, quantity: 1, note: dto.note }] },
      },
      include: { items: true },
    });
    await this.audit(user, branchId, 'WARRANTY_CLAIM_CREATED', 'WarrantyClaim', claim.id);
    return claim;
  }

  async updateWarrantyClaim(user: AuthUser, id: string, dto: any) {
    const claim = await this.prisma.warrantyClaim.findFirst({
      where: { id, deletedAt: null, ...(this.canAccessAllBranches(user) ? {} : { branchId: user.branchId }) },
    });
    if (!claim) throw new NotFoundException('Warranty claim not found');
    const updated = await this.prisma.warrantyClaim.update({
      where: { id },
      data: {
        status: dto.status,
        decision: dto.decision,
        hqDecision: dto.hqDecision as HqWarrantyDecision | undefined,
        hqResult: dto.hqResult,
        hqReceivedAt: dto.hqReceivedAt ? new Date(dto.hqReceivedAt) : undefined,
        inspectedById: dto.inspectedById ?? user.id,
        note: dto.note,
      },
      include: { items: true },
    });
    await this.audit(user, claim.branchId, 'WARRANTY_CLAIM_UPDATED', 'WarrantyClaim', id);
    return updated;
  }

  supplierClaims() {
    return this.prisma.supplierClaim.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' } });
  }

  async createSupplierClaim(user: AuthUser, dto: any) {
    if (!this.canManageSupplyChain(user)) throw new ForbiddenException('Forbidden resource');
    const product = await this.prisma.product.findFirst({ where: { id: dto.productId, deletedAt: null } });
    if (!product) throw new NotFoundException('Product not found');
    const claim = await this.prisma.supplierClaim.create({
      data: {
        claimNumber: dto.claimNumber ?? `SCL-${Date.now()}`,
        supplierId: dto.supplierId,
        factoryId: dto.factoryId,
        procurementOrderId: dto.procurementOrderId,
        productId: product.id,
        sku: product.sku,
        quantity: Number(dto.quantity ?? 1),
        reason: dto.reason,
        evidencePhotos: dto.evidencePhotos ?? [],
        claimAmount: Number(dto.claimAmount ?? 0),
        status: dto.status ?? SupplierClaimStatus.DRAFT,
        outcome: dto.outcome,
        createdById: user.id,
      },
    });
    await this.audit(user, product.branchId, 'SUPPLIER_CLAIM_CREATED', 'SupplierClaim', claim.id);
    return claim;
  }

  alerts(user: AuthUser, query?: NotificationQueryDto) {
    return this.notificationsService.listForUser(user, query ?? {});
  }

  unreadAlertCount(user: AuthUser) {
    return this.notificationsService.unreadCount(user);
  }

  createAlert(user: AuthUser, dto: any) {
    const branchId = dto.branchId ?? (this.canAccessAllBranches(user) ? null : user.branchId);
    return this.notificationsService.notify(user, {
      type: dto.type,
      branchId,
      title: dto.title,
      message: dto.message,
      entityType: dto.entityType,
      entityId: dto.entityId,
      referenceNumber: dto.referenceNumber,
    });
  }

  markAlertRead(user: AuthUser, id: string) {
    return this.notificationsService.markRead(user, id);
  }

  archiveAlert(user: AuthUser, id: string) {
    return this.notificationsService.archive(user, id);
  }

  async analyticsPlaceholders() {
    const [topProducts, topBranches, topCustomers] = await Promise.all([
      this.prisma.saleItem.groupBy({ by: ['productName'], _sum: { quantity: true }, orderBy: { _sum: { quantity: 'desc' } }, take: 10 }),
      this.prisma.sale.groupBy({ by: ['branchId'], _sum: { profitAmount: true, totalAmount: true }, orderBy: { _sum: { totalAmount: 'desc' } }, take: 10 }),
      this.prisma.sale.groupBy({ by: ['customerId'], _sum: { totalAmount: true }, orderBy: { _sum: { totalAmount: 'desc' } }, take: 10 }),
    ]);
    return {
      topProducts,
      topBranches,
      topCustomers,
      returnRate: null,
      warrantyRate: null,
      supplierRating: null,
      factoryRating: null,
      branchProfitability: topBranches,
    };
  }

  private async resolveItems(items: any[]) {
    const resolved = [];
    for (const item of items) {
      const product = await this.prisma.product.findFirst({ where: { id: item.productId, deletedAt: null } });
      if (!product) throw new NotFoundException('Product not found');
      resolved.push({
        ...item,
        productId: product.id,
        sku: item.sku ?? product.sku,
        productName: item.productName ?? product.name,
        unitPrice: item.unitPrice ?? Number(product.sellingPriceKgs),
      });
    }
    return resolved;
  }

  private auditReceivingDenied(
    user: AuthUser,
    procurementOrderId: string,
    warehouseId: string | null,
    reason: string,
    tx: PrismaTx | PrismaService = this.prisma,
  ) {
    return tx.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: 'HQ_RECEIVING_DENIED',
        entity: 'ProcurementOrder',
        entityId: procurementOrderId,
        metadata: {
          userId: user.id,
          roles: user.roles ?? [user.role],
          warehouseId,
          procurementOrderId,
          reason,
          timestamp: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    });
  }

  private resolveBranchId(user: AuthUser, branchId?: string) {
    if (this.canAccessAllBranches(user)) return branchId ?? user.branchId;
    if (branchId && branchId !== user.branchId) throw new ForbiddenException('Forbidden branch');
    return user.branchId;
  }

  private canAccessAllBranches(user: AuthUser) {
    return hasAnyHqRole(user.roles?.length ? user.roles : [user.role]);
  }

  private canManageSupplyChain(user: AuthUser) {
    return this.hasAnyRole(user, [Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.SUPPLY_CHAIN_MANAGER, Role.WAREHOUSE_MANAGER]);
  }

  private canViewAllBranchPurchaseRequests(user: AuthUser) {
    return this.hasAnyRole(user, [
      Role.OWNER,
      Role.CEO,
      Role.SYSTEM_ADMINISTRATOR,
      Role.SUPPLY_CHAIN_MANAGER,
      Role.HQ_SALES_MANAGER,
      Role.WAREHOUSE_MANAGER,
    ]);
  }

  private canManageWarehouse(user: AuthUser) {
    return this.hasAnyRole(user, [Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.SUPPLY_CHAIN_MANAGER, Role.WAREHOUSE_MANAGER]);
  }

  private hasRole(user: AuthUser, role: Role) {
    return (user.roles?.length ? user.roles : [user.role]).includes(role);
  }

  private hasAnyRole(user: AuthUser, roles: Role[]) {
    const userRoles = user.roles?.length ? user.roles : [user.role];
    return hasAnyFullAccessRole(userRoles) || roles.some((role) => userRoles.includes(role));
  }

  private audit(user: AuthUser, branchId: string | null, action: string, entity: string, entityId: string) {
    return this.prisma.auditLog.create({
      data: { userId: user.id, role: user.role, action, entity, entityId, metadata: { branchId, roles: user.roles ?? [user.role] } },
    });
  }

  private auditInTx(tx: PrismaTx, user: AuthUser, branchId: string | null, action: string, entity: string, entityId: string, extra?: Record<string, unknown>) {
    return tx.auditLog.create({
      data: { userId: user.id, role: user.role, action, entity, entityId, metadata: { branchId, roles: user.roles ?? [user.role], ...extra } },
    });
  }
}
