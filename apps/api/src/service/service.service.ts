import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CustomerEventType,
  CustomerStatus,
  PartsRequestStatus,
  PaymentMethod,
  PricingEnginePriceType,
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
import { PricingResolutionService } from '../pricing/pricing-resolution.service';
import { PrismaService } from '../prisma/prisma.service';
import { hasAnyFullAccessRole } from '../rbac/rbac';
import { activeBranchWarehouseWhere } from '../warehouse/warehouse.util';
import { AddDiagnosisDto } from './dto/add-diagnosis.dto';
import { AddPartsDto } from './dto/add-parts.dto';
import { AddRepairDto } from './dto/add-repair.dto';
import { CompleteServiceOrderDto } from './dto/complete-service-order.dto';
import { CreatePartsRequestDto, IssuePartsRequestDto } from './dto/create-parts-request.dto';
import { CreateServiceOrderDto } from './dto/create-service-order.dto';
import { ReceiveServicePaymentDto } from './dto/receive-payment.dto';
import { ServiceCustomerSearchDto, ServiceProductSearchDto } from './dto/service-search.dto';
import { SetLaborCostDto } from './dto/set-labor-cost.dto';
import { UpdateChecklistDto } from './dto/update-checklist.dto';
import { UploadServicePhotoDto } from './dto/upload-photo.dto';

type PrismaTx = Prisma.TransactionClient;

@Injectable()
export class ServiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly commissionsService: CommissionsService,
    private readonly pricingResolution: PricingResolutionService,
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
      const masterId = dto.masterId ?? (this.hasRole(user, Role.MASTER) ? user.id : undefined);
      if (!masterId) throw new BadRequestException('Master is required');
      const master = await tx.user.findFirst({
        where: {
          id: masterId,
          branchId,
          OR: [
            { role: Role.MASTER },
            { userRoles: { some: { role: { code: Role.MASTER } } } },
          ],
        },
      });
      if (!master) throw new NotFoundException('Master not found');
      const laborCost = this.roundMoney(dto.laborCost ?? 0);
      const warrantyUntil = dto.warrantyDays
        ? this.addDays(new Date(), dto.warrantyDays)
        : undefined;
      const order = await tx.serviceOrder.create({
        data: {
          orderNumber: await this.generateOrderNumber(tx),
          branchId,
          customerId: customer.id,
          masterId: master.id,
          problemDescription: dto.problemDescription,
          vehicle: dto.vehicle,
          licensePlate: dto.licensePlate,
          mileage: dto.mileage,
          complaint: dto.complaint ?? dto.problemDescription,
          diagnosisResult: dto.diagnosisResult,
          repairDescription: dto.repairDescription,
          laborCost,
          totalAmount: laborCost,
          debtAmount: laborCost,
          warrantyDays: dto.warrantyDays,
          warrantyUntil,
          notes: dto.notes,
          status: ServiceOrderStatus.DRAFT,
          createdById: user.id,
        },
        include: this.include(),
      });
      await this.auditInTx(tx, user, branchId, 'SERVICE_ORDER_CREATED', 'ServiceOrder', order.id);
      return this.toResponse(order);
    });
  }

  list(user: AuthUser, branchId?: string, status?: ServiceOrderStatus) {
    const where: Prisma.ServiceOrderWhereInput = {
      deletedAt: null,
      ...(this.orderAccessWhere(user, branchId)),
      ...(status ? { status } : {}),
    };
    return this.prisma.serviceOrder
      .findMany({
        where,
        include: this.include(),
        orderBy: { createdAt: 'desc' },
      })
      .then((orders) => orders.map((order) => this.toResponse(order)));
  }

  masters(user: AuthUser, branchId?: string) {
    return this.prisma.user.findMany({
      where: {
        OR: [
          { role: Role.MASTER },
          { userRoles: { some: { role: { code: Role.MASTER } } } },
        ],
        ...(this.hasFullAccess(user)
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
    this.assertMasterCanEditOrder(user, order);
    if (
      order.status === ServiceOrderStatus.PAID ||
      order.status === ServiceOrderStatus.COMPLETED
    ) {
      throw new BadRequestException('Paid or completed orders cannot be edited');
    }
    const data: Prisma.ServiceOrderUpdateInput = {
      problemDescription: dto.problemDescription,
      vehicle: dto.vehicle,
      licensePlate: dto.licensePlate,
      mileage: dto.mileage,
      complaint: dto.complaint,
      diagnosisResult: dto.diagnosisResult,
      repairDescription: dto.repairDescription,
      notes: dto.notes,
      warrantyDays: dto.warrantyDays,
    };
    if (dto.warrantyDays !== undefined) {
      data.warrantyUntil = dto.warrantyDays ? this.addDays(new Date(), dto.warrantyDays) : null;
    }
    if (dto.masterId) {
      const master = await this.prisma.user.findFirst({
        where: {
          id: dto.masterId,
          branchId: order.branchId,
          OR: [
            { role: Role.MASTER },
            { userRoles: { some: { role: { code: Role.MASTER } } } },
          ],
        },
      });
      if (!master) throw new NotFoundException('Master not found');
      data.master = { connect: { id: master.id } };
    }
    const updated = await this.prisma.serviceOrder.update({
      where: { id },
      data,
      include: this.include(),
    });
    if (dto.diagnosisResult) {
      await this.audit(user, order.branchId, 'DIAGNOSIS_UPDATED', 'ServiceOrder', id);
    }
    return this.toResponse(updated);
  }

  async searchCustomers(user: AuthUser, query: ServiceCustomerSearchDto) {
    if (!user.branchId && !this.hasFullAccess(user)) {
      throw new ForbiddenException('Branch access required');
    }
    const where: Prisma.CustomerWhereInput = {
      deletedAt: null,
      status: { notIn: [CustomerStatus.ARCHIVED, CustomerStatus.INACTIVE] },
      ...(this.hasFullAccess(user) && !user.branchId ? {} : { branchId: user.branchId! }),
    };
    if (query.search?.trim()) {
      const search = query.search.trim();
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { whatsappPhone: { contains: search, mode: 'insensitive' } },
        { id: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } },
      ];
    }
    const customers = await this.prisma.customer.findMany({
      where,
      select: {
        id: true,
        fullName: true,
        phone: true,
        status: true,
        totalDebtAmount: true,
        serviceOrders: {
          where: { deletedAt: null },
          select: { createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });
    return customers.map((customer) => ({
      id: customer.id,
      fullName: customer.fullName,
      phone: customer.phone,
      customerCode: customer.id.slice(-8).toUpperCase(),
      vipStatus: customer.status === CustomerStatus.VIP,
      status: customer.status,
      outstandingDebt: Number(customer.totalDebtAmount),
      lastVisit: customer.serviceOrders[0]?.createdAt ?? null,
    }));
  }

  async searchProducts(user: AuthUser, query: ServiceProductSearchDto) {
    const branchId = user.branchId;
    if (!branchId) throw new ForbiddenException('Branch access required');
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { ...activeBranchWarehouseWhere, branchId },
      orderBy: { createdAt: 'asc' },
    });
    if (!warehouse) return [];
    const search = query.search?.trim();
    const productFilter: Prisma.ProductWhereInput = {
      branchId,
      deletedAt: null,
      isActive: true,
      warehouseId: warehouse.id,
    };
    if (search) {
      productFilter.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { barcode: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
        { productCategory: { nameRu: { contains: search, mode: 'insensitive' } } },
      ];
    }
    const products = await this.prisma.product.findMany({
      where: productFilter,
      select: {
        id: true,
        name: true,
        sku: true,
        barcode: true,
        category: true,
        sellingPriceKgs: true,
        unit: true,
      },
      orderBy: { name: 'asc' },
      take: 20,
    });
    return products.map((product) => ({
      id: product.id,
      name: product.name,
      sku: product.sku,
      barcode: product.barcode,
      category: product.category,
      unitPrice: Number(product.sellingPriceKgs),
      unit: product.unit,
    }));
  }

  setLaborCost(user: AuthUser, id: string, dto: SetLaborCostDto) {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.getOrderInTx(tx, user, id);
      this.assertMasterCanEditOrder(user, order);
      const laborCost = this.roundMoney(dto.laborCost);
      const updated = await tx.serviceOrder.update({
        where: { id: order.id },
        data: {
          laborCost,
          repairDescription: dto.repairDescription ?? order.repairDescription,
          status:
            order.status === ServiceOrderStatus.DRAFT || order.status === ServiceOrderStatus.NEW
              ? ServiceOrderStatus.DIAGNOSIS
              : order.status,
        },
        include: this.include(),
      });
      const recalculated = await this.recalculateTotalsInTx(tx, updated.id);
      await this.auditInTx(tx, user, order.branchId, 'LABOR_COST_UPDATED', 'ServiceOrder', order.id);
      return this.toResponse(recalculated);
    });
  }

  addDiagnosis(user: AuthUser, id: string, dto: AddDiagnosisDto) {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.getOrderInTx(tx, user, id);
      this.assertMasterCanEditOrder(user, order);
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
        },
        include: this.include(),
      });
      if (diagnosisFee > 0) {
        await tx.serviceOrder.update({
          where: { id: order.id },
          data: { laborCost: { increment: diagnosisFee } },
        });
      }
      const recalculated = await this.recalculateTotalsInTx(tx, order.id);
      await this.auditInTx(tx, user, order.branchId, 'DIAGNOSIS_UPDATED', 'ServiceOrder', order.id);
      return this.toResponse(recalculated);
    });
  }

  addRepair(user: AuthUser, id: string, dto: AddRepairDto) {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.getOrderInTx(tx, user, id);
      this.assertMasterCanEditOrder(user, order);
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
      await tx.serviceOrder.update({
        where: { id: order.id },
        data: {
          status: ServiceOrderStatus.IN_PROGRESS,
          laborCost: { increment: laborCost },
        },
      });
      const recalculated = await this.recalculateTotalsInTx(tx, order.id);
      return this.toResponse(recalculated);
    });
  }

  addParts(user: AuthUser, id: string, dto: AddPartsDto) {
    if (this.hasRole(user, Role.MASTER) && !this.hasFullAccess(user)) {
      throw new ForbiddenException('Branch Master cannot issue parts directly. Create a parts request.');
    }
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
      let unitPrice = Number(product.sellingPriceKgs);
      let freezeFields: Record<string, unknown> = {};
      try {
        const freeze = await this.pricingResolution.resolveWithFreeze(order.branchId, product.id, {
          priceType: PricingEnginePriceType.RETAIL_RECOMMENDED,
          auditUser: user,
          auditEntity: 'PartsConsumption',
        });
        unitPrice = dto.unitPrice != null ? Number(dto.unitPrice) : freeze.resolvedPriceKgs;
        freezeFields = {
          pricingPolicyVersionId: freeze.pricingPolicyVersionId,
          pricingProfileId: freeze.pricingProfileId,
          resolvedPriceKgs: freeze.resolvedPriceKgs,
          baseCostKgs: freeze.baseCostKgs,
          baseBranchPriceKgs: freeze.baseBranchPriceKgs,
          appliedRuleType: freeze.appliedRuleType,
          appliedRuleId: freeze.appliedRuleId,
          appliedAdjustmentMode: freeze.appliedAdjustmentMode,
          appliedAdjustmentValue: freeze.appliedAdjustmentValue,
          priceResolvedAt: freeze.priceResolvedAt,
        };
      } catch {
        if (dto.unitPrice != null) unitPrice = Number(dto.unitPrice);
      }
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
          ...freezeFields,
        },
      });
      const recalculated = await this.recalculateTotalsInTx(tx, order.id);
      return this.toResponse(recalculated);
    });
  }

  async createPartsRequest(user: AuthUser, orderId: string, dto: CreatePartsRequestDto) {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.getOrderInTx(tx, user, orderId);
      this.assertMasterCanEditOrder(user, order);
      const items = await Promise.all(
        dto.items.map(async (item) => {
          const product = await tx.product.findFirst({
            where: { id: item.productId, branchId: order.branchId, deletedAt: null },
          });
          if (!product) throw new NotFoundException(`Product ${item.productId} not found`);
          return {
            productId: product.id,
            sku: product.sku,
            productName: product.name,
            quantity: item.quantity,
            unitPrice: product.sellingPriceKgs,
            notes: item.notes,
          };
        }),
      );
      const request = await tx.partsRequest.create({
        data: {
          requestNumber: await this.generatePartsRequestNumber(tx),
          serviceOrderId: order.id,
          branchId: order.branchId,
          createdById: user.id,
          note: dto.note,
          status: PartsRequestStatus.DRAFT,
          items: { create: items },
        },
        include: { items: true },
      });
      await this.auditInTx(tx, user, order.branchId, 'PARTS_REQUEST_CREATED', 'PartsRequest', request.id);
      return request;
    });
  }

  async submitPartsRequest(user: AuthUser, orderId: string, requestId: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.getOrderInTx(tx, user, orderId);
      this.assertMasterCanEditOrder(user, order);
      const request = await tx.partsRequest.findFirst({
        where: { id: requestId, serviceOrderId: order.id, deletedAt: null },
        include: { items: true },
      });
      if (!request) throw new NotFoundException('Parts request not found');
      if (request.status !== PartsRequestStatus.DRAFT) {
        throw new BadRequestException('Only draft requests can be submitted');
      }
      const updated = await tx.partsRequest.update({
        where: { id: requestId },
        data: { status: PartsRequestStatus.SUBMITTED },
        include: { items: true },
      });
      await tx.serviceOrder.update({
        where: { id: order.id },
        data: { status: ServiceOrderStatus.WAITING_PARTS },
      });
      return updated;
    });
  }

  listPartsRequests(user: AuthUser, branchId?: string) {
    return this.prisma.partsRequest.findMany({
      where: {
        deletedAt: null,
        ...(this.hasFullAccess(user)
          ? branchId
            ? { branchId }
            : {}
          : { branchId: user.branchId }),
      },
      include: {
        items: true,
        serviceOrder: {
          include: {
            customer: { select: { id: true, fullName: true, phone: true } },
            master: { select: { id: true, fullName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async issuePartsRequest(user: AuthUser, requestId: string, dto: IssuePartsRequestDto) {
    this.assertCanIssueParts(user);
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.partsRequest.findFirst({
        where: {
          id: requestId,
          deletedAt: null,
          ...(this.hasFullAccess(user) ? {} : { branchId: user.branchId }),
        },
        include: { items: true, serviceOrder: true },
      });
      if (!request) throw new NotFoundException('Parts request not found');
      const issuableStatuses: PartsRequestStatus[] = [
        PartsRequestStatus.SUBMITTED,
        PartsRequestStatus.PARTIALLY_ISSUED,
        PartsRequestStatus.WAITING_STOCK,
        PartsRequestStatus.PENDING,
      ];
      if (!issuableStatuses.includes(request.status)) {
        throw new BadRequestException('Request cannot be issued in current status');
      }
      const warehouse = await this.resolveBranchWarehouse(tx, request.branchId, dto.warehouseId);
      const issueMap = new Map((dto.items ?? []).map((item) => [item.itemId, item.quantity]));
      let anyIssued = false;
      let allIssued = true;
      for (const item of request.items) {
        const toIssue =
          issueMap.has(item.id)
            ? Math.min(issueMap.get(item.id)!, item.quantity - item.issuedQuantity)
            : item.quantity - item.issuedQuantity;
        if (toIssue <= 0) {
          if (item.issuedQuantity < item.quantity) allIssued = false;
          continue;
        }
        const product = await tx.product.findFirst({
          where: { id: item.productId, branchId: request.branchId, deletedAt: null },
        });
        if (!product) throw new NotFoundException(`Product ${item.sku} not found`);
        const unitCost = Number(product.finalCostKgs);
        let unitPrice = Number(item.unitPrice ?? product.sellingPriceKgs);
        let freezeFields: Record<string, unknown> = {};
        try {
          const freeze = await this.pricingResolution.resolveWithFreeze(
            request.branchId,
            product.id,
            {
              priceType: PricingEnginePriceType.RETAIL_RECOMMENDED,
              auditUser: user,
              auditEntity: 'PartsConsumption',
            },
          );
          if (item.unitPrice == null) unitPrice = freeze.resolvedPriceKgs;
          freezeFields = {
            pricingPolicyVersionId: freeze.pricingPolicyVersionId,
            pricingProfileId: freeze.pricingProfileId,
            resolvedPriceKgs: freeze.resolvedPriceKgs,
            baseCostKgs: freeze.baseCostKgs,
            baseBranchPriceKgs: freeze.baseBranchPriceKgs,
            appliedRuleType: freeze.appliedRuleType,
            appliedRuleId: freeze.appliedRuleId,
            appliedAdjustmentMode: freeze.appliedAdjustmentMode,
            appliedAdjustmentValue: freeze.appliedAdjustmentValue,
            priceResolvedAt: freeze.priceResolvedAt,
          };
        } catch {
          // keep fallback unitPrice
        }
        try {
          await this.inventoryService.createStockMovementInTx(tx, user, {
            productId: product.id,
            warehouseId: warehouse.id,
            type: StockMovementType.SERVICE_USE,
            quantity: toIssue,
            unitCostKgs: unitCost,
            referenceType: 'SERVICE_ORDER',
            referenceId: request.serviceOrderId,
            note: `Parts request ${request.requestNumber}`,
          });
        } catch {
          allIssued = false;
          continue;
        }
        await tx.partsConsumption.create({
          data: {
            serviceOrderId: request.serviceOrderId,
            productId: product.id,
            warehouseId: warehouse.id,
            quantity: toIssue,
            unitCost,
            unitPrice,
            totalCost: this.roundMoney(unitCost * toIssue),
            totalPrice: this.roundMoney(unitPrice * toIssue),
            createdById: user.id,
            ...freezeFields,
          },
        });
        const newIssued = item.issuedQuantity + toIssue;
        await tx.partsRequestItem.update({
          where: { id: item.id },
          data: { issuedQuantity: newIssued, warehouseId: warehouse.id },
        });
        anyIssued = true;
        if (newIssued < item.quantity) allIssued = false;
      }
      if (!anyIssued) throw new BadRequestException('No parts could be issued');
      const newStatus = allIssued
        ? PartsRequestStatus.ISSUED
        : PartsRequestStatus.PARTIALLY_ISSUED;
      const updated = await tx.partsRequest.update({
        where: { id: requestId },
        data: {
          status: newStatus,
          releasedById: user.id,
          releasedAt: new Date(),
        },
        include: { items: true },
      });
      await tx.serviceOrder.update({
        where: { id: request.serviceOrderId },
        data: { status: ServiceOrderStatus.IN_PROGRESS },
      });
      await this.recalculateTotalsInTx(tx, request.serviceOrderId);
      await this.auditInTx(
        tx,
        user,
        request.branchId,
        allIssued ? 'PARTS_ISSUED' : 'PARTS_PARTIALLY_ISSUED',
        'PartsRequest',
        requestId,
      );
      return updated;
    });
  }

  async rejectPartsRequest(user: AuthUser, requestId: string, note?: string) {
    this.assertCanIssueParts(user);
    const request = await this.prisma.partsRequest.findFirst({
      where: {
        id: requestId,
        deletedAt: null,
        ...(this.hasFullAccess(user) ? {} : { branchId: user.branchId }),
      },
    });
    if (!request) throw new NotFoundException('Parts request not found');
    const updated = await this.prisma.partsRequest.update({
      where: { id: requestId },
      data: { status: PartsRequestStatus.REJECTED, note: note ?? request.note },
      include: { items: true },
    });
    await this.audit(user, request.branchId, 'PARTS_REJECTED', 'PartsRequest', requestId);
    return updated;
  }

  async markPartsRequestWaitingStock(user: AuthUser, requestId: string, note?: string) {
    this.assertCanIssueParts(user);
    const request = await this.prisma.partsRequest.findFirst({
      where: {
        id: requestId,
        deletedAt: null,
        ...(this.hasFullAccess(user) ? {} : { branchId: user.branchId }),
      },
    });
    if (!request) throw new NotFoundException('Parts request not found');
    return this.prisma.partsRequest.update({
      where: { id: requestId },
      data: { status: PartsRequestStatus.WAITING_STOCK, note: note ?? request.note },
      include: { items: true },
    });
  }

  updateChecklist(user: AuthUser, id: string, dto: UpdateChecklistDto) {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.getOrderInTx(tx, user, id);
      this.assertMasterCanEditOrder(user, order);
      const updated = await tx.serviceOrder.update({
        where: { id },
        data: dto,
        include: this.include(),
      });
      return this.toResponse(updated);
    });
  }

  uploadPhoto(user: AuthUser, id: string, dto: UploadServicePhotoDto) {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.getOrderInTx(tx, user, id);
      this.assertMasterCanEditOrder(user, order);
      return tx.serviceOrderPhoto.create({
        data: {
          serviceOrderId: order.id,
          type: dto.type,
          fileName: dto.fileName,
          fileUrl: dto.fileUrl,
          mimeType: dto.mimeType,
          uploadedById: user.id,
        },
      });
    });
  }

  readyForPayment(user: AuthUser, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.getOrderInTx(tx, user, id, true);
      this.assertMasterCanEditOrder(user, order);
      await this.assertPartsIssuedIfRequested(tx, order);
      const recalculated = await this.recalculateTotalsInTx(tx, order.id);
      const updated = await tx.serviceOrder.update({
        where: { id: order.id },
        data: {
          status: ServiceOrderStatus.READY_FOR_PAYMENT,
          readyForPaymentAt: new Date(),
          debtAmount: Math.max(0, Number(recalculated.totalAmount) - Number(recalculated.paidAmount)),
        },
        include: this.include(),
      });
      await this.auditInTx(tx, user, order.branchId, 'SERVICE_READY_FOR_PAYMENT', 'ServiceOrder', order.id);
      return this.toResponse(updated);
    });
  }

  receivePayment(user: AuthUser, id: string, dto: ReceiveServicePaymentDto) {
    if (!this.canReceivePayment(user)) {
      throw new ForbiddenException('Only cashier can receive service payments');
    }
    return this.prisma.$transaction(async (tx) => {
      const order = await this.getOrderInTx(tx, user, id, true);
      if (order.status !== ServiceOrderStatus.READY_FOR_PAYMENT && order.status !== ServiceOrderStatus.PAID) {
        throw new BadRequestException('Order is not ready for payment');
      }
      const totalDue = this.roundMoney(Number(order.totalAmount) - Number(order.paidAmount));
      const payments =
        dto.method === PaymentMethod.MIXED
          ? (dto.splits ?? []).map((split) => ({
              method: split.method,
              amount: this.roundMoney(split.amount),
            }))
          : [{ method: dto.method, amount: this.roundMoney(dto.amount ?? totalDue) }];
      const paymentTotal = this.roundMoney(payments.reduce((sum, row) => sum + row.amount, 0));
      if (paymentTotal <= 0) throw new BadRequestException('Payment amount required');
      if (paymentTotal > totalDue + 0.01) {
        throw new BadRequestException('Payment exceeds outstanding amount');
      }
      for (const payment of payments) {
        await tx.serviceOrderPayment.create({
          data: {
            serviceOrderId: order.id,
            branchId: order.branchId,
            customerId: order.customerId,
            amount: payment.amount,
            method: payment.method,
            note: dto.note,
            createdById: user.id,
          },
        });
      }
      const paidAmount = this.roundMoney(Number(order.paidAmount) + paymentTotal);
      const debtAmount = Math.max(0, this.roundMoney(Number(order.totalAmount) - paidAmount));
      const updated = await tx.serviceOrder.update({
        where: { id: order.id },
        data: {
          paidAmount,
          debtAmount,
          paidAt: debtAmount <= 0 ? new Date() : order.paidAt,
          status: debtAmount <= 0 ? ServiceOrderStatus.PAID : ServiceOrderStatus.READY_FOR_PAYMENT,
        },
        include: this.include(),
      });
      await this.auditInTx(tx, user, order.branchId, 'PAYMENT_RECEIVED', 'ServiceOrder', order.id);
      return this.toResponse(updated);
    });
  }

  receipt(user: AuthUser, id: string) {
    return this.getOrder(user, id).then((order) => this.buildReceipt(order));
  }

  complete(user: AuthUser, id: string, dto: CompleteServiceOrderDto) {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.getOrderInTx(tx, user, id, true);
      this.assertMasterCanEditOrder(user, order);
      if (order.status !== ServiceOrderStatus.PAID) {
        throw new BadRequestException('Payment must be received before completion');
      }
      await this.assertPartsIssuedIfRequested(tx, order);
      this.assertChecklistComplete(order);
      const warrantyUntil =
        order.warrantyUntil ??
        (order.warrantyDays ? this.addDays(new Date(), order.warrantyDays) : undefined);
      const updated = await tx.serviceOrder.update({
        where: { id: order.id },
        data: {
          status: ServiceOrderStatus.COMPLETED,
          completedAt: new Date(),
          warrantyUntil,
          customerSignature: dto.customerSignature ?? order.customerSignature,
        },
        include: this.include(),
      });
      if (warrantyUntil) {
        const existing = await tx.warranty.findFirst({
          where: { serviceOrderId: order.id },
        });
        if (!existing) {
          const firstPart = order.parts[0];
          await tx.warranty.create({
            data: {
              serviceOrderId: order.id,
              customerId: order.customerId,
              productId: firstPart?.productId,
              branchId: order.branchId,
              warrantyNumber: await this.generateWarrantyNumber(tx),
              startsAt: new Date(),
              expiresAt: warrantyUntil,
              status: WarrantyStatus.ACTIVE,
            },
          });
          await this.auditInTx(tx, user, order.branchId, 'WARRANTY_CREATED', 'ServiceOrder', order.id);
        }
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
      await this.updateMasterKpiInTx(tx, order);
      await this.auditInTx(tx, user, order.branchId, 'SERVICE_COMPLETED', 'ServiceOrder', order.id);
      return this.toResponse(updated);
    });
  }

  async cancel(user: AuthUser, id: string) {
    const order = await this.getOrder(user, id);
    if (order.status === ServiceOrderStatus.PAID || order.status === ServiceOrderStatus.COMPLETED) {
      throw new BadRequestException('Paid orders cannot be cancelled');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.serviceOrder.update({
        where: { id: order.id },
        data: { status: ServiceOrderStatus.CANCELLED, cancelledAt: new Date() },
        include: this.include(),
      });
      await this.auditInTx(tx, user, order.branchId, 'REPAIR_CANCELLATION', 'ServiceOrder', order.id);
      return this.toResponse(updated);
    });
  }

  serviceHistory(user: AuthUser, customerId: string) {
    return this.prisma.serviceOrder.findMany({
      where: {
        customerId,
        deletedAt: null,
        status: ServiceOrderStatus.COMPLETED,
        ...(this.hasFullAccess(user) ? {} : { branchId: user.branchId }),
      },
      include: {
        parts: { include: { product: true } },
        warranties: true,
      },
      orderBy: { completedAt: 'desc' },
    }).then((orders) =>
      orders.map((order) => ({
        id: order.id,
        date: order.completedAt ?? order.createdAt,
        vehicle: order.vehicle,
        licensePlate: order.licensePlate,
        complaint: order.complaint ?? order.problemDescription,
        diagnosis: order.diagnosisResult,
        repair: order.repairDescription,
        partsUsed: order.parts.map((part) => ({
          name: part.product?.name,
          quantity: part.quantity,
          totalPrice: Number(part.totalPrice),
        })),
        laborCost: Number(order.laborCost),
        total: Number(order.totalAmount),
        warrantyUntil: order.warrantyUntil,
        warrantyStatus:
          order.warrantyUntil && order.warrantyUntil > new Date()
            ? WarrantyStatus.ACTIVE
            : WarrantyStatus.EXPIRED,
      })),
    );
  }

  async masterKpi(user: AuthUser, masterId?: string) {
    const targetMasterId = masterId ?? (this.hasRole(user, Role.MASTER) ? user.id : undefined);
    if (!targetMasterId) throw new BadRequestException('Master id required');
    const branchId = user.branchId;
    const orders = await this.prisma.serviceOrder.findMany({
      where: {
        masterId: targetMasterId,
        deletedAt: null,
        ...(branchId && !this.hasFullAccess(user) ? { branchId } : {}),
      },
      include: { parts: true, warranties: true },
    });
    const completed = orders.filter((order) => order.status === ServiceOrderStatus.COMPLETED);
    const laborRevenue = completed.reduce((sum, order) => sum + Number(order.laborCost), 0);
    const repairTimes = completed
      .filter((order) => order.completedAt)
      .map((order) => order.completedAt!.getTime() - order.createdAt.getTime());
    const averageRepairTimeHours =
      repairTimes.length > 0
        ? repairTimes.reduce((sum, ms) => sum + ms, 0) / repairTimes.length / (1000 * 60 * 60)
        : 0;
    const warrantyReturns = completed.filter(
      (order) => order.warranties.some((warranty) => warranty.status === WarrantyStatus.EXPIRED),
    ).length;
    const partsUsed = completed.reduce(
      (sum, order) => sum + order.parts.reduce((partSum, part) => partSum + part.quantity, 0),
      0,
    );
    return {
      masterId: targetMasterId,
      completedRepairs: completed.length,
      laborRevenue: this.roundMoney(laborRevenue),
      averageRepairTimeHours: this.roundMoney(averageRepairTimeHours),
      warrantyReturns,
      partsUsed,
      customerRating: null,
    };
  }

  dailyReport(user: AuthUser, branchId?: string) {
    const today = new Date();
    const from = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return this.prisma.serviceOrder
      .findMany({
        where: {
          createdAt: { gte: from },
          ...(this.orderAccessWhere(user, branchId)),
        },
        select: { totalAmount: true, paidAmount: true, debtAmount: true, status: true },
      })
      .then((orders) => ({
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
      partsRequests: { include: { items: true } },
      photos: true,
      payments: true,
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

  private async getOrderInTx(tx: PrismaTx, user: AuthUser, id: string, includeAll = false) {
    const order = await tx.serviceOrder.findFirst({
      where: { id, deletedAt: null, ...(this.orderAccessWhere(user)) },
      include: includeAll
        ? this.include()
        : {
            parts: true,
            partsRequests: { include: { items: true } },
          },
    });
    if (!order) throw new NotFoundException('Service order not found');
    return order;
  }

  private orderAccessWhere(user: AuthUser, branchId?: string) {
    if (this.hasFullAccess(user)) return branchId ? { branchId } : {};
    if (this.hasRole(user, Role.FRANCHISE_OWNER)) {
      if (branchId && branchId !== user.branchId) throw new ForbiddenException('Forbidden branch');
      return { branchId: user.branchId };
    }
    if (this.hasRole(user, Role.CASHIER)) {
      if (branchId && branchId !== user.branchId) throw new ForbiddenException('Forbidden branch');
      return { branchId: user.branchId };
    }
    if (this.hasRole(user, Role.WAREHOUSE_OPERATOR)) {
      if (branchId && branchId !== user.branchId) throw new ForbiddenException('Forbidden branch');
      return { branchId: user.branchId };
    }
    if (this.hasRole(user, Role.MASTER)) return { masterId: user.id };
    if (branchId && branchId !== user.branchId) throw new ForbiddenException('Forbidden branch');
    return { branchId: user.branchId };
  }

  private resolveBranchId(user: AuthUser, branchId?: string) {
    if (this.hasFullAccess(user)) return branchId ?? user.branchId;
    if (branchId && branchId !== user.branchId) throw new ForbiddenException('Forbidden branch');
    return user.branchId;
  }

  private hasFullAccess(user: AuthUser) {
    return hasAnyFullAccessRole(user.roles?.length ? user.roles : [user.role]);
  }

  private hasRole(user: AuthUser, role: Role) {
    return (user.roles?.length ? user.roles : [user.role]).includes(role);
  }

  private assertMasterCanEditOrder(user: AuthUser, order: { masterId: string; branchId: string }) {
    if (this.hasFullAccess(user) || this.hasRole(user, Role.FRANCHISE_OWNER)) return;
    if (this.hasRole(user, Role.MASTER) && order.masterId !== user.id) {
      throw new ForbiddenException('You can only edit your own service orders');
    }
  }

  private assertCanIssueParts(user: AuthUser) {
    if (
      this.hasFullAccess(user) ||
      this.hasRole(user, Role.FRANCHISE_OWNER) ||
      this.hasRole(user, Role.WAREHOUSE_OPERATOR) ||
      this.hasRole(user, Role.WAREHOUSE_MANAGER)
    ) {
      return;
    }
    throw new ForbiddenException('Only warehouse staff can issue parts');
  }

  private canReceivePayment(user: AuthUser) {
    return (
      this.hasFullAccess(user) ||
      this.hasRole(user, Role.FRANCHISE_OWNER) ||
      this.hasRole(user, Role.CASHIER)
    );
  }

  private async assertPartsIssuedIfRequested(tx: PrismaTx, order: { id: string; partsRequests?: Array<{ status: PartsRequestStatus; items: Array<{ quantity: number; issuedQuantity: number }> }> }) {
    const requests = order.partsRequests ?? (await tx.partsRequest.findMany({
      where: { serviceOrderId: order.id, deletedAt: null },
      include: { items: true },
    }));
    const inactiveStatuses: PartsRequestStatus[] = [
      PartsRequestStatus.REJECTED,
      PartsRequestStatus.CANCELLED,
      PartsRequestStatus.DRAFT,
    ];
    const activeRequests = requests.filter(
      (request) => !inactiveStatuses.includes(request.status),
    );
    if (!activeRequests.length) return;
    const allIssued = activeRequests.every((request) =>
      request.items.every((item) => item.issuedQuantity >= item.quantity),
    );
    if (!allIssued) {
      throw new BadRequestException('All requested parts must be issued before proceeding');
    }
  }

  private assertChecklistComplete(order: {
    checklistDiagnostics: boolean;
    checklistPartsInstalled: boolean;
    checklistTestDrive: boolean;
    checklistFinalInspection: boolean;
    checklistCustomerInformed: boolean;
  }) {
    if (
      !order.checklistDiagnostics ||
      !order.checklistPartsInstalled ||
      !order.checklistTestDrive ||
      !order.checklistFinalInspection ||
      !order.checklistCustomerInformed
    ) {
      throw new BadRequestException('Repair checklist must be complete');
    }
  }

  private async recalculateTotalsInTx(tx: PrismaTx, orderId: string) {
    const order = await tx.serviceOrder.findUnique({
      where: { id: orderId },
      include: { parts: true },
    });
    if (!order) throw new NotFoundException('Service order not found');
    const partsCost = this.roundMoney(
      order.parts.reduce((sum, part) => sum + Number(part.totalCost), 0),
    );
    const partsPrice = this.roundMoney(
      order.parts.reduce((sum, part) => sum + Number(part.totalPrice), 0),
    );
    const laborCost = Number(order.laborCost);
    const totalAmount = this.roundMoney(laborCost + partsPrice);
    const paidAmount = Number(order.paidAmount);
    const debtAmount = Math.max(0, this.roundMoney(totalAmount - paidAmount));
    return tx.serviceOrder.update({
      where: { id: orderId },
      data: { partsCost, totalAmount, debtAmount },
      include: this.include(),
    });
  }

  private async resolveBranchWarehouse(tx: PrismaTx, branchId: string, warehouseId?: string) {
    if (warehouseId) {
      const warehouse = await tx.warehouse.findFirst({
        where: { id: warehouseId, branchId },
      });
      if (!warehouse) throw new NotFoundException('Warehouse not found');
      return warehouse;
    }
    const warehouse = await tx.warehouse.findFirst({
      where: { ...activeBranchWarehouseWhere, branchId },
      orderBy: { createdAt: 'asc' },
    });
    if (!warehouse) throw new NotFoundException('Branch warehouse not found');
    return warehouse;
  }

  private buildReceipt(order: any) {
    const laborLines = [
      ...(order.diagnoses ?? []).map((diagnosis: any) => ({
        description: diagnosis.problem || 'Diagnostics',
        amount: Number(diagnosis.diagnosisFee),
      })),
      ...(order.repairs ?? []).map((repair: any) => ({
        description: repair.description,
        amount: Number(repair.laborCost),
      })),
    ];
    if (!laborLines.length && Number(order.laborCost) > 0) {
      laborLines.push({
        description: order.repairDescription || 'Repair work',
        amount: Number(order.laborCost),
      });
    }
    const partsLines = (order.parts ?? []).map((part: any) => ({
      description: part.product?.name ?? part.productId,
      amount: Number(part.totalPrice),
      quantity: part.quantity,
    }));
    const laborTotal = laborLines.reduce((sum, line) => sum + line.amount, 0);
    const partsTotal = partsLines.reduce(
      (sum: number, line: { amount: number }) => sum + line.amount,
      0,
    );
    return {
      orderNumber: order.orderNumber,
      customer: order.customer,
      master: order.master,
      status: order.status,
      laborLines,
      partsLines,
      laborTotal,
      partsTotal,
      total: Number(order.totalAmount),
      paidAmount: Number(order.paidAmount),
      debtAmount: Number(order.debtAmount),
      warrantyUntil: order.warrantyUntil,
      text: this.formatReceiptText(order.orderNumber, laborLines, partsLines, Number(order.totalAmount)),
    };
  }

  private formatReceiptText(
    orderNumber: string,
    laborLines: Array<{ description: string; amount: number }>,
    partsLines: Array<{ description: string; amount: number }>,
    total: number,
  ) {
    const pad = (label: string, amount: number) =>
      `${label} ${'.'.repeat(Math.max(1, 24 - label.length))} ${amount.toFixed(0)}`;
    const laborSection = laborLines.map((line) => pad(line.description, line.amount)).join('\n');
    const partsSection = partsLines.map((line) => pad(line.description, line.amount)).join('\n');
    return [
      `Service Order ${orderNumber}`,
      '----------------------------',
      'Repair Work',
      laborSection || pad('Labor', 0),
      '----------------------------',
      'Spare Parts',
      partsSection || pad('Parts', 0),
      '----------------------------',
      'TOTAL',
      total.toFixed(0),
    ].join('\n');
  }

  private async updateMasterKpiInTx(tx: PrismaTx, order: { masterId: string; laborCost: Prisma.Decimal; completedAt: Date | null; createdAt: Date }) {
    const now = order.completedAt ?? new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    await tx.employeeKPI.upsert({
      where: { employeeId_month_year: { employeeId: order.masterId, month, year } },
      create: {
        employeeId: order.masterId,
        month,
        year,
        repairRevenue: order.laborCost,
        repairsCount: 1,
        revenue: order.laborCost,
      },
      update: {
        repairRevenue: { increment: order.laborCost },
        repairsCount: { increment: 1 },
        revenue: { increment: order.laborCost },
      },
    });
  }

  private audit(user: AuthUser, branchId: string, action: string, entity: string, entityId: string) {
    return this.prisma.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action,
        entity,
        entityId,
        metadata: { branchId, roles: user.roles ?? [user.role] },
      },
    });
  }

  private auditInTx(
    tx: PrismaTx,
    user: AuthUser,
    branchId: string,
    action: string,
    entity: string,
    entityId: string,
  ) {
    return tx.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action,
        entity,
        entityId,
        metadata: {
          branchId,
          roles: user.roles ?? [user.role],
        },
      },
    });
  }

  private async generateOrderNumber(tx: PrismaTx) {
    const count = await tx.serviceOrder.count();
    return `SO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(count + 1).padStart(5, '0')}`;
  }

  private async generatePartsRequestNumber(tx: PrismaTx) {
    const count = await tx.partsRequest.count();
    return `PR-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(count + 1).padStart(5, '0')}`;
  }

  private async generateWarrantyNumber(tx: PrismaTx) {
    const count = await tx.warranty.count();
    return `W-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(count + 1).padStart(5, '0')}`;
  }

  private addDays(date: Date, days: number) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  private toResponse(order: any) {
    return {
      ...order,
      laborCost: Number(order.laborCost),
      partsCost: Number(order.partsCost),
      totalAmount: Number(order.totalAmount),
      paidAmount: Number(order.paidAmount),
      debtAmount: Number(order.debtAmount),
      diagnoses: order.diagnoses?.map((diagnosis: any) => ({
        ...diagnosis,
        diagnosisFee: Number(diagnosis.diagnosisFee),
      })),
      repairs: order.repairs?.map((repair: any) => ({
        ...repair,
        laborCost: Number(repair.laborCost),
      })),
      parts: order.parts?.map((part: any) => ({
        ...part,
        unitCost: Number(part.unitCost),
        unitPrice: Number(part.unitPrice),
        totalCost: Number(part.totalCost),
        totalPrice: Number(part.totalPrice),
      })),
      partsRequests: order.partsRequests?.map((request: any) => ({
        ...request,
        items: request.items?.map((item: any) => ({
          ...item,
          unitPrice: item.unitPrice != null ? Number(item.unitPrice) : null,
        })),
      })),
      payments: order.payments?.map((payment: any) => ({
        ...payment,
        amount: Number(payment.amount),
      })),
      receipt: this.buildReceipt(order),
    };
  }

  private sum(values: Prisma.Decimal[]) {
    return values.reduce((total, value) => total + Number(value), 0);
  }

  private roundMoney(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
