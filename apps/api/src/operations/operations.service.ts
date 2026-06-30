import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  BranchDistributionOrderStatus,
  BranchPurchaseRequestStatus,
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
import { PrismaService } from '../prisma/prisma.service';
import { hasAnyFullAccessRole, hasAnyHqRole } from '../rbac/rbac';
import { calculateLandedCosts, extractLogisticsCosts } from '../procurement/landed-cost.util';
import { activeHqWarehouseWhere, isHqWarehouse } from '../warehouse/warehouse.util';

type PrismaTx = Prisma.TransactionClient;

@Injectable()
export class OperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
  ) {}

  branchPurchaseRequests(user: AuthUser) {
    return this.prisma.branchPurchaseRequest.findMany({
      where: {
        deletedAt: null,
        ...(this.canManageSupplyChain(user) ? {} : { branchId: user.branchId }),
      },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createBranchPurchaseRequest(user: AuthUser, dto: any) {
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
    await this.audit(user, branchId, 'BRANCH_PURCHASE_REQUEST_CREATED', 'BranchPurchaseRequest', request.id);
    return request;
  }

  async reviewBranchPurchaseRequest(user: AuthUser, id: string, status: BranchPurchaseRequestStatus) {
    if (!this.canManageSupplyChain(user)) throw new ForbiddenException('Forbidden resource');
    if (status !== BranchPurchaseRequestStatus.APPROVED && status !== BranchPurchaseRequestStatus.REJECTED) {
      throw new BadRequestException('Request can only be approved or rejected');
    }
    const updated = await this.prisma.branchPurchaseRequest.update({
      where: { id },
      data: { status, reviewedById: user.id, reviewedAt: new Date() },
      include: { items: true },
    });
    await this.audit(user, updated.branchId, `BRANCH_PURCHASE_REQUEST_${status}`, 'BranchPurchaseRequest', id);
    return updated;
  }

  async convertBranchPurchaseRequest(user: AuthUser, id: string, dto: any) {
    if (!this.canManageSupplyChain(user)) throw new ForbiddenException('Forbidden resource');
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
      const order = await tx.branchDistributionOrder.create({
        data: {
          orderNumber: dto.orderNumber ?? `DO-${Date.now()}`,
          branchId: request.branchId,
          sourceWarehouseId,
          destinationWarehouseId,
          status: BranchDistributionOrderStatus.DRAFT,
          createdById: user.id,
          note: request.note,
          totalAmount: 0,
          totalCost: 0,
          totalProfit: 0,
          items: {
            create: request.items.map((item) => ({
              productId: item.productId,
              sku: item.sku,
              productName: item.productName,
              quantity: item.quantity,
              unitCost: 0,
              unitPrice: 0,
              totalCost: 0,
              totalPrice: 0,
              profit: 0,
            })),
          },
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
      return order;
    });
  }

  async receiveProcurementToHq(user: AuthUser, procurementOrderId: string, dto: any) {
    if (!this.canManageWarehouse(user)) throw new ForbiddenException('Forbidden resource');
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.procurementOrder.findFirst({
        where: { id: procurementOrderId, deletedAt: null },
        include: { items: true },
      });
      if (!order) throw new NotFoundException('Procurement order not found');
      if (order.hqStockMovementCreatedAt) {
        throw new BadRequestException('Procurement stock has already been received');
      }
      const hqWarehouseId = dto.hqWarehouseId ?? order.hqWarehouseId;
      const hqWarehouse = await tx.warehouse.findFirst({
        where: { id: hqWarehouseId, ...activeHqWarehouseWhere },
      });
      if (!hqWarehouse || !isHqWarehouse(hqWarehouse)) {
        throw new BadRequestException('Receiving requires an active HQ warehouse');
      }
      const receivedMap = new Map<string, any>((dto.items ?? []).map((item: any) => [item.procurementItemId ?? item.productId, item]));
      const receiving = await tx.procurementGoodsReceiving.create({
        data: {
          receivingNumber: dto.receivingNumber ?? `PGR-${Date.now()}`,
          procurementOrderId: order.id,
          hqWarehouseId,
          receivedById: user.id,
          note: dto.note,
        },
      });

      const receivedItems = order.items.map((item) => {
        const received: any = receivedMap.get(item.id) ?? receivedMap.get(item.productId) ?? {};
        const receivedQuantity = Number(received.receivedQuantity ?? item.quantity);
        return {
          ...item,
          receivedQuantity,
          difference: receivedQuantity - item.quantity,
        };
      });

      const logistics = extractLogisticsCosts(order);
      const recalculated = calculateLandedCosts(
        receivedItems.map((item) => ({
          quantity: item.quantity,
          receivedQuantity: item.receivedQuantity,
          purchasePriceYuan: Number(item.purchasePriceYuan),
          yuanRate: Number(item.yuanRate),
          weightKg: Number(item.weightKg),
        })),
        logistics,
      );

      for (const [index, item] of receivedItems.entries()) {
        const next = recalculated.items[index];
        await tx.procurementOrderItem.update({
          where: { id: item.id },
          data: {
            receivedQuantity: item.receivedQuantity,
            totalWeightKg: next.totalWeightKg,
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
          await this.inventoryService.createStockMovementInTx(tx, user, {
            productId: item.productId,
            warehouseId: hqWarehouseId,
            type: StockMovementType.IN,
            quantity: item.receivedQuantity,
            unitCostKgs: next.finalCostKgs,
            referenceType: 'PROCUREMENT_GOODS_RECEIVING',
            referenceId: receiving.id,
            note: `Procurement receiving ${receiving.receivingNumber}`,
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
          await tx.procurementDifferenceReport.create({
            data: {
              reportNumber: `PDR-${Date.now()}-${item.id.slice(-4)}`,
              receivingId: receiving.id,
              procurementOrderId: order.id,
              type: item.difference < 0 ? ShortageReportItemType.SHORTAGE : ShortageReportItemType.OVERAGE,
              productId: item.productId,
              sku: item.sku,
              productName: item.productName,
              expectedQuantity: item.quantity,
              receivedQuantity: item.receivedQuantity,
              differenceQuantity: Math.abs(item.difference),
              shortageReason: receivedMap.get(item.id)?.shortageReason ?? receivedMap.get(item.productId)?.shortageReason,
              note: receivedMap.get(item.id)?.note ?? receivedMap.get(item.productId)?.note,
            },
          });
        }
      }

      await tx.procurementOrder.update({
        where: { id: order.id },
        data: {
          status: ProcurementOrderStatus.RECEIVED_TO_HQ_WAREHOUSE,
          receivedToHqAt: new Date(),
          actualArrivalDate: new Date(),
          hqStockMovementCreatedAt: new Date(),
          totalCostKgs: recalculated.totalCostKgs,
          totalWeightKg: recalculated.totalWeightKg,
          costPerKg: recalculated.costPerKg,
        },
      });
      await this.auditInTx(tx, user, 'HQ', 'INVENTORY_RECEIVED', 'Warehouse', hqWarehouseId, {
        receivingId: receiving.id,
        procurementOrderId: order.id,
        recalculatedLandedCost: true,
        reason: dto.reason,
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

  alerts(user: AuthUser) {
    return this.prisma.alert.findMany({
      where: this.canAccessAllBranches(user) ? {} : { branchId: user.branchId },
      orderBy: { createdAt: 'desc' },
    });
  }

  createAlert(user: AuthUser, dto: any) {
    const branchId = dto.branchId ?? (this.canAccessAllBranches(user) ? null : user.branchId);
    return this.prisma.alert.create({
      data: {
        branchId,
        type: dto.type,
        title: dto.title,
        message: dto.message,
        status: dto.status,
      },
    });
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
