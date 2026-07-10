import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AlertType,
  BranchDistributionOrderStatus,
  BranchPurchaseRequestStatus,
  BranchRequestShortageStatus,
  FileAttachmentEntityType,
  HqWarrantyDecision,
  Prisma,
  ProcurementOrderStatus,
  ProcurementShortageReason,
  ReturnOrderStatus,
  ReturnResolution,
  Role,
  ShortageReportItemType,
  ShortageReportStatus,
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
import {
  HQ_SALES_MANAGER_ACCESS_DENIED,
  HQ_SALES_MANAGER_ACCESS_DENIED_MESSAGES,
  HQ_WAREHOUSE_ACCESS_DENIED,
} from '../hq-warehouse/hq-warehouse-assignment.constants';
import { canCreateBranchHqOrder, canManageBranchPurchaseRequests, canManageOwnBranchProductRequest, canReceiveProcurementToHq, hasAnyFullAccessRole, hasAnyHqRole, resolveUserRoles } from '../rbac/rbac';
import { activeHqWarehouseWhere, HQ_CATALOG_BRANCH_CODE, isHqWarehouse } from '../warehouse/warehouse.util';
import {
  INACTIVE_HQ_WAREHOUSE,
  MANUAL_HQ_WAREHOUSE_SELECTION_FORBIDDEN,
  NO_HQ_WAREHOUSE_ASSIGNED_TO_BRANCH,
  NO_HQ_WAREHOUSE_MANAGER_ASSIGNED,
} from '../branches/branch-hq-warehouse.util';
import { DistributionService } from '../distribution/distribution.service';
import {
  ensureHqCatalogBranch,
  seedHqProductCatalogFromWarehouseInventory,
} from '../product-catalog/hq-product-catalog.util';
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
import { HqWarehouseAssignmentService } from '../hq-warehouse/hq-warehouse-assignment.service';
import { HqSalesManagerAssignmentService } from '../hq-warehouse/hq-sales-manager-assignment.service';
import {
  isSubmittedBranchPurchaseStatus,
  resolveBranchPurchasePriceKgs,
} from './branch-product-request.util';
import {
  buildChinaReceivingValidation,
  isChinaReceivingTaskVisible,
  isGoodsLeftYiwuStatus,
  resolveChinaReceivingListStatus,
} from './china-receiving.util';
import {
  buildChinaReceivingProgress,
  isChinaReceivingSessionStale,
  resolveChinaReceivingDraftState,
  resolveRowStatus,
} from './china-receiving-draft.util';
import { SaveChinaReceivingDraftRowDto, SaveAllChinaReceivingDraftDto } from './dto/save-china-receiving-draft-row.dto';
import {
  isWarehouseManagerOnlyView,
  sanitizeChinaReceivingDetail,
  sanitizeChinaReceivingListTask,
} from './china-receiving-privacy.util';
import { ChinaReceivingQueryDto } from './dto/china-receiving-query.dto';
import {
  canSeeHqStockInBranchRequests,
  isBranchOnlyRequestUser,
  sanitizeBranchPurchaseRequest,
} from './branch-purchase-request.presenter';
import {
  buildBatchDiscrepancyAuditMetadata,
  buildDiscrepancyActAuditMetadata,
  differenceAuditAction,
  generateProcurementActNumber,
  procurementDifferenceAuditAction,
  resolveDifferenceType,
  resolveProcurementDiscrepancyActs,
} from './discrepancy-act.util';
import { ProcurementDifferenceActQueryDto } from './dto/procurement-difference-act-query.dto';

type PrismaTx = Prisma.TransactionClient;

@Injectable()
export class OperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly notificationsService: NotificationsService,
    private readonly assignmentService: HqWarehouseAssignmentService,
    private readonly salesManagerAssignmentService: HqSalesManagerAssignmentService,
    private readonly distributionService: DistributionService,
  ) {}

  async branchPurchaseRequests(user: AuthUser) {
    const visibilityWhere = await this.buildBranchPurchaseRequestVisibilityWhere(user);
    const rows = await this.prisma.branchPurchaseRequest.findMany({
      where: {
        deletedAt: null,
        ...visibilityWhere,
      },
      include: {
        items: true,
        createdBy: { select: { id: true, fullName: true, role: true } },
        assignedHqWarehouse: { select: { id: true, name: true, code: true, city: true, isActive: true } },
        branch: {
          select: {
            id: true,
            name: true,
            assignedHqWarehouseId: true,
            assignedHqWarehouse: { select: { id: true, name: true, code: true, city: true, isActive: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    const hideSensitive = isBranchOnlyRequestUser(user, this.canViewAllBranchPurchaseRequests(user));
    return rows.map((row) => sanitizeBranchPurchaseRequest(row, hideSensitive));
  }

  async branchPurchaseRequestById(user: AuthUser, id: string) {
    const request = await this.prisma.branchPurchaseRequest.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(this.canViewAllBranchPurchaseRequests(user) ? {} : { branchId: user.branchId }),
      },
      include: {
        items: true,
        createdBy: { select: { id: true, fullName: true, role: true } },
        assignedHqWarehouse: { select: { id: true, name: true, code: true, city: true, isActive: true } },
        branch: {
          select: {
            id: true,
            name: true,
            assignedHqWarehouseId: true,
            assignedHqWarehouse: { select: { id: true, name: true, code: true, city: true, isActive: true } },
          },
        },
      },
    });
    if (!request) throw new NotFoundException('Branch purchase request not found');
    await this.assertBranchPurchaseRequestAccess(user, request);
    if (this.salesManagerAssignmentService.isHqSalesManagerScoped(user)) {
      const hqWarehouseId = await this.resolveRequestAssignedHqWarehouseId(request);
      await this.auditBranchRequest(user, request.branchId, 'HQ_SALES_REQUEST_OPENED', 'BranchPurchaseRequest', request.id, {
        hqWarehouseId,
        requestId: request.id,
        branchId: request.branchId,
      });
    }
    const canViewAll = this.canViewAllBranchPurchaseRequests(user);
    const hideSensitive = isBranchOnlyRequestUser(user, canViewAll);
    const enriched = hideSensitive
      ? request
      : await this.enrichBranchPurchaseRequestWithHqStock(user, request);
    return sanitizeBranchPurchaseRequest(enriched, hideSensitive);
  }

  async branchProductOptions(
    user: AuthUser,
    search?: string,
    branchWarehouseId?: string,
    includeStock?: string,
    branchId?: string,
  ) {
    if (!canManageOwnBranchProductRequest(user) && !this.canViewAllBranchPurchaseRequests(user)) {
      throw new ForbiddenException('Forbidden resource');
    }
    const resolvedBranchId = branchId ?? user.branchId;
    if (!resolvedBranchId && !this.canViewAllBranchPurchaseRequests(user)) {
      throw new ForbiddenException('Branch context required');
    }

    const canViewAll = this.canViewAllBranchPurchaseRequests(user);
    const isBranchOnly = isBranchOnlyRequestUser(user, canViewAll);
    if (isBranchOnly && includeStock) {
      throw new ForbiddenException('Branch users cannot access HQ stock details');
    }
    if (isBranchOnly && resolvedBranchId) {
      await this.auditBranchRequest(user, resolvedBranchId, 'BRANCH_PRODUCT_SEARCH_OPENED', 'BranchPurchaseRequest', 'search');
      await this.auditBranchRequest(user, resolvedBranchId, 'BRANCH_STOCK_VISIBILITY_BLOCKED', 'BranchPurchaseRequest', 'search');
    }

    const branch = resolvedBranchId
      ? await this.prisma.branch.findUnique({
          where: { id: resolvedBranchId },
          select: { code: true },
        })
      : null;

    const hqBranch = await ensureHqCatalogBranch(this.prisma);
    const seedResult = await seedHqProductCatalogFromWarehouseInventory(this.prisma);
    if (seedResult.seeded && resolvedBranchId) {
      await this.auditBranchRequest(user, resolvedBranchId, 'HQ_PRODUCT_CATALOG_SEEDED_FROM_WAREHOUSE', 'Product', hqBranch.id, {
        catalogCount: seedResult.catalogCount,
        adoptedCount: seedResult.adoptedCount,
        createdCount: seedResult.createdCount,
      });
    }

    const trimmed = search?.trim();
    const catalogProducts = await this.prisma.product.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        branchId: hqBranch.id,
        ...(trimmed
          ? {
              OR: [
                { name: { contains: trimmed, mode: 'insensitive' } },
                { sku: { contains: trimmed, mode: 'insensitive' } },
                { barcode: { contains: trimmed, mode: 'insensitive' } },
                { category: { contains: trimmed, mode: 'insensitive' } },
                { productCategory: { code: { contains: trimmed, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      include: {
        productCategory: { select: { id: true, code: true, nameRu: true, nameEn: true, nameKy: true } },
      },
      take: 60,
      orderBy: { name: 'asc' },
    });

    return catalogProducts.map((catalogProduct) => ({
      id: catalogProduct.id,
      catalogProductId: catalogProduct.id,
      name: catalogProduct.name,
      sku: catalogProduct.sku,
      barcode: catalogProduct.barcode,
      category: catalogProduct.category,
      productCode: catalogProduct.productCategory?.code ?? null,
      unit: catalogProduct.unit,
      branchPurchasePriceKgs: resolveBranchPurchasePriceKgs(catalogProduct, branch?.code),
    }));
  }

  async branchProductPrices(user: AuthUser, branchId: string, productIds: string[]) {
    if (!canManageOwnBranchProductRequest(user) && !this.canViewAllBranchPurchaseRequests(user)) {
      throw new ForbiddenException('Forbidden resource');
    }
    const resolvedBranchId = branchId || user.branchId;
    if (!resolvedBranchId) {
      throw new BadRequestException('Branch context required');
    }
    if (!this.canViewAllBranchPurchaseRequests(user) && user.branchId !== resolvedBranchId) {
      throw new ForbiddenException('Forbidden resource');
    }

    const uniqueIds = Array.from(new Set(productIds.filter(Boolean)));
    if (!uniqueIds.length) {
      return {};
    }

    const branch = await this.prisma.branch.findUnique({
      where: { id: resolvedBranchId },
      select: { code: true },
    });
    const hqBranch = await ensureHqCatalogBranch(this.prisma);
    const catalogProducts = await this.prisma.product.findMany({
      where: {
        id: { in: uniqueIds },
        branchId: hqBranch.id,
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
        wholesalePriceKgs: true,
        hqBranchWholesalePriceKgs: true,
      },
    });

    return Object.fromEntries(
      catalogProducts.map((product) => [
        product.id,
        resolveBranchPurchasePriceKgs(product, branch?.code),
      ]),
    );
  }

  async createBranchPurchaseRequest(user: AuthUser, dto: any) {
    if (!canManageOwnBranchProductRequest(user)) {
      await this.auditBranchRequest(user, user.branchId, 'BRANCH_ORDER_CREATE_DENIED', 'BranchPurchaseRequest', 'create');
      throw new ForbiddenException('Only Branch Manager can create HQ product requests');
    }
    const branchId = this.resolveBranchId(user, dto.branchId);
    if (dto.assignedHqWarehouseId || dto.sourceWarehouseId) {
      throw new BadRequestException(MANUAL_HQ_WAREHOUSE_SELECTION_FORBIDDEN);
    }
    const branchWarehouseId = dto.branchWarehouseId ?? (await this.resolveDefaultBranchWarehouseId(branchId));
    const resolvedItems = await this.resolveBranchPurchaseItems(branchId, branchWarehouseId, dto.items ?? []);
    const status =
      dto.status === BranchPurchaseRequestStatus.DRAFT
        ? BranchPurchaseRequestStatus.DRAFT
        : BranchPurchaseRequestStatus.SUBMITTED_TO_HQ;
    const assignedHqWarehouseId =
      status === BranchPurchaseRequestStatus.DRAFT
        ? (await this.getBranchAssignedHqWarehouseId(branchId))
        : await this.requireBranchAssignedHqWarehouse(user, branchId);
    const totalQuantity = resolvedItems.reduce((sum, item) => sum + item.quantity, 0);
    const totalEstimatedAmount = resolvedItems.reduce((sum, item) => sum + Number(item.totalAmount), 0);

    const request = await this.prisma.branchPurchaseRequest.create({
      data: {
        requestNumber: dto.requestNumber ?? `BPR-${Date.now()}`,
        branchId,
        branchWarehouseId,
        assignedHqWarehouseId,
        status,
        createdById: user.id,
        note: dto.note,
        transportCompany: null,
        transportCostKgs: 0,
        driverName: null,
        vehicleNumber: null,
        dispatchDate: undefined,
        transportNotes: null,
        totalQuantity,
        totalEstimatedAmount,
        items: { create: resolvedItems },
      },
      include: { items: true, createdBy: { select: { id: true, fullName: true, role: true } } },
    });

    await this.auditBranchRequest(user, branchId, 'BRANCH_PRODUCT_REQUEST_CREATED', 'BranchPurchaseRequest', request.id);
    await this.auditBranchRequest(user, branchId, 'BRANCH_ORDER_CREATED', 'BranchPurchaseRequest', request.id);
    for (const item of request.items) {
      await this.auditBranchRequest(user, branchId, 'BRANCH_PRODUCT_REQUEST_ITEM_ADDED', 'BranchPurchaseRequest', request.id, {
        productId: item.productId,
        quantity: item.quantity,
      });
    }
    if (status === BranchPurchaseRequestStatus.SUBMITTED_TO_HQ) {
      await this.auditBranchRequest(user, branchId, 'BRANCH_REQUEST_SUBMITTED', 'BranchPurchaseRequest', request.id, {
        hqWarehouseId: assignedHqWarehouseId,
      });
      await this.auditBranchRequest(user, branchId, 'BRANCH_PRODUCT_REQUEST_SUBMITTED', 'BranchPurchaseRequest', request.id);
      await this.auditBranchRequest(user, branchId, 'BRANCH_ORDER_SUBMITTED', 'BranchPurchaseRequest', request.id);
      await this.auditBranchRequest(user, branchId, 'HQ_ORDER_SUBMITTED', 'BranchPurchaseRequest', request.id);
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

  async updateBranchPurchaseRequest(user: AuthUser, id: string, dto: any) {
    if (!canManageOwnBranchProductRequest(user)) {
      throw new ForbiddenException('Only Branch Manager can update HQ product requests');
    }

    const existing = await this.prisma.branchPurchaseRequest.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(this.canViewAllBranchPurchaseRequests(user) ? {} : { branchId: user.branchId }),
      },
      include: { items: true },
    });

    if (!existing) {
      throw new NotFoundException('Branch purchase request not found');
    }

    if (existing.status !== BranchPurchaseRequestStatus.DRAFT) {
      throw new BadRequestException('Only draft HQ orders can be edited');
    }

    const branchWarehouseId = dto.branchWarehouseId ?? existing.branchWarehouseId ?? (await this.resolveDefaultBranchWarehouseId(existing.branchId));
    const resolvedItems = dto.items
      ? await this.resolveBranchPurchaseItems(existing.branchId, branchWarehouseId, dto.items)
      : undefined;
    const totalQuantity = resolvedItems?.reduce((sum, item) => sum + item.quantity, 0);
    const totalEstimatedAmount = resolvedItems?.reduce((sum, item) => sum + Number(item.totalAmount), 0);

    const updated = await this.prisma.branchPurchaseRequest.update({
      where: { id },
      data: {
        note: dto.note ?? existing.note,
        branchWarehouseId,
        transportCompany: null,
        transportCostKgs: 0,
        driverName: null,
        vehicleNumber: null,
        dispatchDate: null,
        transportNotes: null,
        ...(resolvedItems
          ? {
              totalQuantity,
              totalEstimatedAmount,
              items: {
                deleteMany: {},
                create: resolvedItems,
              },
            }
          : {}),
      },
      include: { items: true, createdBy: { select: { id: true, fullName: true, role: true } } },
    });

    await this.auditBranchRequest(user, updated.branchId, 'HQ_ORDER_UPDATED', 'BranchPurchaseRequest', id);
    return updated;
  }

  async submitBranchPurchaseRequest(user: AuthUser, id: string) {
    if (!canManageOwnBranchProductRequest(user)) {
      throw new ForbiddenException('Only Branch Manager can submit HQ product requests');
    }

    const existing = await this.prisma.branchPurchaseRequest.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(this.canViewAllBranchPurchaseRequests(user) ? {} : { branchId: user.branchId }),
      },
    });

    if (!existing) {
      throw new NotFoundException('Branch purchase request not found');
    }

    if (existing.status !== BranchPurchaseRequestStatus.DRAFT) {
      throw new BadRequestException('Only draft HQ orders can be submitted');
    }

    const assignedHqWarehouseId = await this.requireBranchAssignedHqWarehouse(user, existing.branchId);

    const updated = await this.prisma.branchPurchaseRequest.update({
      where: { id },
      data: {
        status: BranchPurchaseRequestStatus.SUBMITTED_TO_HQ,
        assignedHqWarehouseId,
      },
      include: { items: true, createdBy: { select: { id: true, fullName: true, role: true } } },
    });

    await this.auditBranchRequest(user, updated.branchId, 'BRANCH_REQUEST_SUBMITTED', 'BranchPurchaseRequest', id, {
      hqWarehouseId: assignedHqWarehouseId,
    });
    await this.auditBranchRequest(user, updated.branchId, 'BRANCH_PRODUCT_REQUEST_SUBMITTED', 'BranchPurchaseRequest', id);
    await this.auditBranchRequest(user, updated.branchId, 'BRANCH_ORDER_SUBMITTED', 'BranchPurchaseRequest', id);
    await this.auditBranchRequest(user, updated.branchId, 'HQ_ORDER_SUBMITTED', 'BranchPurchaseRequest', id);
    await this.notificationsService.notify(user, {
      type: AlertType.BRANCH_ORDER_SUBMITTED,
      branchId: updated.branchId,
      entityType: 'BranchPurchaseRequest',
      entityId: updated.id,
      referenceNumber: updated.requestNumber,
      message: `Branch purchase request ${updated.requestNumber} submitted.`,
    });
    return updated;
  }

  async cancelBranchPurchaseRequest(user: AuthUser, id: string) {
    if (!canManageOwnBranchProductRequest(user)) {
      throw new ForbiddenException('Only Branch Manager can cancel HQ product requests');
    }

    const existing = await this.prisma.branchPurchaseRequest.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(this.canViewAllBranchPurchaseRequests(user) ? {} : { branchId: user.branchId }),
      },
    });

    if (!existing) {
      throw new NotFoundException('Branch purchase request not found');
    }

    if (
      existing.status !== BranchPurchaseRequestStatus.DRAFT &&
      !isSubmittedBranchPurchaseStatus(existing.status)
    ) {
      throw new BadRequestException('Only draft or submitted HQ orders can be cancelled');
    }

    const updated = await this.prisma.branchPurchaseRequest.update({
      where: { id },
      data: { status: BranchPurchaseRequestStatus.CANCELLED },
      include: { items: true },
    });

    await this.auditBranchRequest(user, updated.branchId, 'HQ_ORDER_CANCELLED', 'BranchPurchaseRequest', id);
    return updated;
  }

  logForbiddenRouteAccess(user: AuthUser, pathname: string) {
    return this.audit(user, user.branchId, 'FORBIDDEN_ROUTE_ACCESS_DENIED', 'Route', pathname);
  }

  logBranchSalesManagerMenuUpdated(user: AuthUser) {
    return this.audit(user, user.branchId, 'BRANCH_SALES_MANAGER_MENU_UPDATED', 'Navigation', 'branch-sales-manager');
  }

  async reviewBranchPurchaseRequest(user: AuthUser, id: string, status: BranchPurchaseRequestStatus, dto?: any) {
    if (!canManageBranchPurchaseRequests(user)) throw new ForbiddenException('Forbidden resource');
    if (status !== BranchPurchaseRequestStatus.APPROVED && status !== BranchPurchaseRequestStatus.REJECTED) {
      throw new BadRequestException('Request can only be approved or rejected');
    }

    const existing = await this.prisma.branchPurchaseRequest.findFirst({
      where: { id, deletedAt: null },
      include: {
        items: true,
        branch: { select: { assignedHqWarehouseId: true } },
      },
    });
    if (!existing) throw new NotFoundException('Branch purchase request not found');
    await this.assertBranchPurchaseRequestAccess(user, existing);
    if (!isSubmittedBranchPurchaseStatus(existing.status)) {
      throw new BadRequestException('Only submitted requests can be reviewed');
    }

    if (status === BranchPurchaseRequestStatus.REJECTED) {
      const updated = await this.prisma.branchPurchaseRequest.update({
        where: { id },
        data: { status, reviewedById: user.id, reviewedAt: new Date() },
        include: { items: true, createdBy: { select: { id: true, fullName: true, role: true } } },
      });
      await this.auditBranchRequest(user, updated.branchId, 'HQ_SALES_REQUEST_REVIEWED', 'BranchPurchaseRequest', id, {
        oldValue: existing.status,
        newValue: status,
      });
      await this.auditBranchRequest(user, updated.branchId, 'BRANCH_PRODUCT_REQUEST_REVIEWED', 'BranchPurchaseRequest', id, {
        oldValue: existing.status,
        newValue: status,
      });
      await this.auditBranchRequest(user, updated.branchId, `BRANCH_PURCHASE_REQUEST_${status}`, 'BranchPurchaseRequest', id);
      await this.auditBranchRequest(user, updated.branchId, 'BRANCH_PRODUCT_REQUEST_REJECTED', 'BranchPurchaseRequest', id);
      return updated;
    }

    const assignedHqWarehouseId =
      existing.assignedHqWarehouseId ?? (await this.getBranchAssignedHqWarehouseId(existing.branchId));
    if (!assignedHqWarehouseId) {
      throw new BadRequestException(NO_HQ_WAREHOUSE_ASSIGNED_TO_BRANCH);
    }

    const stockMap = await this.inventoryService.getAvailableQuantityMap(
      user,
      assignedHqWarehouseId,
      existing.items.map((item) => ({ productId: item.productId, sku: item.sku })),
      { branchId: existing.branchId },
    );
    const approvedMap = new Map<string, number>(
      ((dto?.items as Array<{ id?: string; productId?: string; approvedQuantity: number }>) ?? []).map((item) => [
        item.id ?? item.productId ?? '',
        Number(item.approvedQuantity),
      ]),
    );

    let anyPartial = false;
    let anyApproved = false;
    let anyShortage = false;

    const updated = await this.prisma.$transaction(async (tx) => {
      for (const item of existing.items) {
        const available = stockMap.get(item.productId) ?? 0;
        const requested = item.quantity;
        const approvedQuantity =
          approvedMap.has(item.id) || approvedMap.has(item.productId)
            ? Number(approvedMap.get(item.id) ?? approvedMap.get(item.productId))
            : Math.min(requested, available);

        if (approvedQuantity > available) {
          throw new BadRequestException(`Cannot approve more than available HQ stock for ${item.sku}`);
        }
        if (approvedQuantity < 0) {
          throw new BadRequestException('Approved quantity cannot be negative');
        }

        const missingQty = requested - approvedQuantity;
        await tx.branchPurchaseRequestItem.update({
          where: { id: item.id },
          data: { approvedQuantity, hqAvailableStock: available },
        });

        if (missingQty > 0) {
          anyShortage = true;
          await tx.branchRequestShortage.create({
            data: {
              branchRequestId: existing.id,
              branchRequestItemId: item.id,
              branchId: existing.branchId,
              productId: item.productId,
              requestedQty: requested,
              availableQty: available,
              approvedQty: approvedQuantity,
              missingQty,
              assignedHqWarehouseId,
              status:
                approvedQuantity === 0
                  ? BranchRequestShortageStatus.OPEN
                  : BranchRequestShortageStatus.PARTIALLY_FULFILLED,
            },
          });
        }

        if (approvedQuantity < requested) anyPartial = true;
        if (approvedQuantity > 0) anyApproved = true;
      }

      const finalStatus =
        anyPartial || (anyShortage && !anyApproved)
          ? BranchPurchaseRequestStatus.PARTIALLY_APPROVED
          : BranchPurchaseRequestStatus.APPROVED;

      return tx.branchPurchaseRequest.update({
        where: { id },
        data: {
          status: finalStatus,
          reviewedById: user.id,
          reviewedAt: new Date(),
          assignedHqWarehouseId,
        },
        include: { items: true, createdBy: { select: { id: true, fullName: true, role: true } } },
      });
    });

    await this.auditBranchRequest(user, updated.branchId, 'HQ_SALES_REQUEST_REVIEWED', 'BranchPurchaseRequest', id, {
      oldValue: existing.status,
      newValue: updated.status,
    });
    await this.auditBranchRequest(user, updated.branchId, 'BRANCH_PRODUCT_REQUEST_REVIEWED', 'BranchPurchaseRequest', id, {
      oldValue: existing.status,
      newValue: updated.status,
    });
    await this.auditBranchRequest(user, updated.branchId, 'HQ_SALES_REQUEST_APPROVED', 'BranchPurchaseRequest', id);
    await this.auditBranchRequest(user, updated.branchId, 'HQ_REQUEST_APPROVED', 'BranchPurchaseRequest', id, {
      hqWarehouseId: assignedHqWarehouseId,
      requestId: id,
      branchId: updated.branchId,
    });
    await this.auditBranchRequest(user, updated.branchId, 'HQ_ORDER_APPROVED', 'BranchPurchaseRequest', id);
    await this.auditBranchRequest(user, updated.branchId, 'BRANCH_PRODUCT_REQUEST_APPROVED', 'BranchPurchaseRequest', id);
    if (anyPartial) {
      await this.auditBranchRequest(user, updated.branchId, 'REQUEST_PARTIALLY_APPROVED', 'BranchPurchaseRequest', id);
    }
    if (anyShortage) {
      await this.auditBranchRequest(user, updated.branchId, 'REQUEST_SHORTAGE_CREATED', 'BranchPurchaseRequest', id);
      await this.auditBranchRequest(user, updated.branchId, 'SHORTAGE_CREATED', 'BranchPurchaseRequest', id);
      await this.auditBranchRequest(user, updated.branchId, 'HQ_SHORTAGE_CREATED', 'BranchPurchaseRequest', id, {
        hqWarehouseId: assignedHqWarehouseId,
        requestId: id,
        branchId: updated.branchId,
      });
    }

    return updated;
  }

  async branchProductShortages(
    user: AuthUser,
    filters: {
      branchId?: string;
      productId?: string;
      assignedHqWarehouseId?: string;
      status?: BranchRequestShortageStatus;
    } = {},
  ) {
    if (!this.hasAnyRole(user, [Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR])) {
      throw new ForbiddenException('Forbidden resource');
    }

    await this.audit(user, null, 'CEO_SHORTAGE_VIEWED', 'BranchRequestShortage', 'list');

    return this.prisma.branchRequestShortage.findMany({
      where: {
        ...(filters.branchId ? { branchId: filters.branchId } : {}),
        ...(filters.productId ? { productId: filters.productId } : {}),
        ...(filters.assignedHqWarehouseId ? { assignedHqWarehouseId: filters.assignedHqWarehouseId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        product: { select: { id: true, name: true, sku: true, unit: true } },
        assignedHqWarehouse: { select: { id: true, name: true, code: true, city: true } },
        branchRequest: { select: { id: true, requestNumber: true, createdAt: true } },
        reviewedBy: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async reviewBranchProductShortage(user: AuthUser, id: string, dto: { status?: BranchRequestShortageStatus } = {}) {
    if (!this.hasAnyRole(user, [Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR])) {
      throw new ForbiddenException('Forbidden resource');
    }

    const shortage = await this.prisma.branchRequestShortage.findFirst({ where: { id } });
    if (!shortage) throw new NotFoundException('Branch request shortage not found');

    const updated = await this.prisma.branchRequestShortage.update({
      where: { id },
      data: {
        reviewedAt: new Date(),
        reviewedById: user.id,
        ...(dto.status ? { status: dto.status } : { status: BranchRequestShortageStatus.WAITING_STOCK }),
      },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        product: { select: { id: true, name: true, sku: true, unit: true } },
        assignedHqWarehouse: { select: { id: true, name: true, code: true, city: true } },
        branchRequest: { select: { id: true, requestNumber: true, createdAt: true } },
      },
    });

    await this.auditBranchRequest(user, shortage.branchId, 'CEO_SHORTAGE_REVIEWED', 'BranchRequestShortage', id, {
      status: updated.status,
    });
    return updated;
  }

  async linkBranchShortageToProcurement(user: AuthUser, id: string, dto: { procurementOrderId: string }) {
    if (!this.hasAnyRole(user, [Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR])) {
      throw new ForbiddenException('Forbidden resource');
    }
    if (!dto?.procurementOrderId) {
      throw new BadRequestException('procurementOrderId is required');
    }

    const shortage = await this.prisma.branchRequestShortage.findFirst({ where: { id } });
    if (!shortage) throw new NotFoundException('Branch request shortage not found');

    const procurementOrder = await this.prisma.procurementOrder.findFirst({
      where: { id: dto.procurementOrderId, deletedAt: null },
    });
    if (!procurementOrder) throw new NotFoundException('Procurement order not found');

    const updated = await this.prisma.branchRequestShortage.update({
      where: { id },
      data: {
        procurementOrderId: dto.procurementOrderId,
        status: BranchRequestShortageStatus.WAITING_STOCK,
        reviewedAt: new Date(),
        reviewedById: user.id,
      },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        product: { select: { id: true, name: true, sku: true, unit: true } },
        assignedHqWarehouse: { select: { id: true, name: true, code: true, city: true } },
        branchRequest: { select: { id: true, requestNumber: true, createdAt: true } },
      },
    });

    await this.auditBranchRequest(user, shortage.branchId, 'SHORTAGE_LINKED_TO_PROCUREMENT', 'BranchRequestShortage', id, {
      procurementOrderId: dto.procurementOrderId,
    });
    return updated;
  }

  async routeBranchRequestToHqWarehouse(user: AuthUser, id: string, dto: any = {}) {
    if (!canManageBranchPurchaseRequests(user)) throw new ForbiddenException('Forbidden resource');
    return this.sendBranchRequestToHqWarehouse(user, id, dto);
  }

  async convertBranchPurchaseRequest(user: AuthUser, id: string, dto: any) {
    if (dto?.sourceWarehouseId && !hasAnyFullAccessRole(resolveUserRoles(user))) {
      throw new BadRequestException(MANUAL_HQ_WAREHOUSE_SELECTION_FORBIDDEN);
    }
    return this.sendBranchRequestToHqWarehouse(user, id, dto);
  }

  private async sendBranchRequestToHqWarehouse(user: AuthUser, id: string, dto: any) {
    if (!canManageBranchPurchaseRequests(user)) throw new ForbiddenException('Forbidden resource');

    const request = await this.prisma.branchPurchaseRequest.findFirst({
      where: { id, deletedAt: null },
      include: {
        items: true,
        branch: { select: { assignedHqWarehouseId: true } },
      },
    });
    if (!request) throw new NotFoundException('Branch purchase request not found');
    await this.assertBranchPurchaseRequestAccess(user, request);
    if (
      request.status !== BranchPurchaseRequestStatus.APPROVED &&
      request.status !== BranchPurchaseRequestStatus.PARTIALLY_APPROVED
    ) {
      throw new BadRequestException('Only approved requests can be sent to HQ warehouse');
    }

    const hasApprovedLines = request.items.some((item) => (item.approvedQuantity ?? 0) > 0);
    if (!hasApprovedLines) {
      throw new BadRequestException('No approved quantity available to send to HQ warehouse');
    }
    if (request.convertedOrderId) {
      throw new BadRequestException('Request has already been routed to HQ warehouse');
    }

    const assignedHqWarehouseId =
      request.assignedHqWarehouseId ?? (await this.getBranchAssignedHqWarehouseId(request.branchId));
    if (!assignedHqWarehouseId) {
      await this.auditBranchRequest(user, request.branchId, 'ROUTING_DENIED_NO_HQ_WAREHOUSE', 'BranchPurchaseRequest', id);
      await this.auditBranchRequest(user, request.branchId, 'ROUTING_DENIED_NO_ASSIGNED_WAREHOUSE', 'BranchPurchaseRequest', id);
      throw new BadRequestException(NO_HQ_WAREHOUSE_ASSIGNED_TO_BRANCH);
    }

    const sourceWarehouse = await this.prisma.warehouse.findFirst({
      where: { id: assignedHqWarehouseId, ...activeHqWarehouseWhere },
    });
    if (!sourceWarehouse || !isHqWarehouse(sourceWarehouse)) {
      await this.auditBranchRequest(user, request.branchId, 'ROUTING_DENIED_INACTIVE_WAREHOUSE', 'BranchPurchaseRequest', id, {
        hqWarehouseId: assignedHqWarehouseId,
      });
      throw new BadRequestException(INACTIVE_HQ_WAREHOUSE);
    }

    const destinationWarehouse = await this.prisma.warehouse.findFirst({
      where: {
        deletedAt: null,
        isActive: true,
        warehouseType: 'BRANCH',
        branchId: request.branchId,
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!destinationWarehouse) {
      throw new BadRequestException('No active branch warehouse found for this branch');
    }

    const managerAssignments = await this.prisma.hqWarehouseManagerAssignment.findMany({
      where: {
        warehouseId: assignedHqWarehouseId,
        status: 'ACTIVE',
      },
      orderBy: { assignedAt: 'asc' },
    });
    const assignedWarehouseManagerId = managerAssignments[0]?.userId;
    if (!assignedWarehouseManagerId && !dto.confirmNoManager && !hasAnyFullAccessRole(resolveUserRoles(user))) {
      await this.auditBranchRequest(user, request.branchId, 'ROUTING_DENIED_NO_HQ_WAREHOUSE', 'BranchPurchaseRequest', id, {
        hqWarehouseId: assignedHqWarehouseId,
        reason: NO_HQ_WAREHOUSE_MANAGER_ASSIGNED,
      });
      throw new BadRequestException(NO_HQ_WAREHOUSE_MANAGER_ASSIGNED);
    }

    const order = await this.prisma.$transaction(async (tx) => {
      const orderItems = [];
      let totalAmount = 0;
      let totalCost = 0;
      for (const item of request.items) {
        const quantity = item.approvedQuantity ?? item.quantity;
        if (quantity <= 0) continue;
        const product = await tx.product.findFirst({
          where: { id: item.productId, deletedAt: null },
        });
        if (!product) throw new NotFoundException(`Product not found: ${item.productId}`);
        const unitCost = Number(product.finalCostKgs);
        const unitPrice = Number(product.sellingPriceKgs);
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

      if (!orderItems.length) {
        throw new BadRequestException('No approved quantity available to send to HQ warehouse');
      }

      const createdOrder = await tx.branchDistributionOrder.create({
        data: {
          orderNumber: dto.orderNumber ?? `DO-${Date.now()}`,
          branchId: request.branchId,
          sourceWarehouseId: assignedHqWarehouseId,
          destinationWarehouseId: destinationWarehouse.id,
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
          status: BranchPurchaseRequestStatus.SENT_TO_HQ_WAREHOUSE,
          convertedOrderId: createdOrder.id,
          assignedHqWarehouseId,
        },
      });

      await this.auditInTx(tx, user, request.branchId, 'BRANCH_REQUEST_ROUTED_TO_HQ_WAREHOUSE', 'BranchPurchaseRequest', request.id, {
        hqWarehouseId: assignedHqWarehouseId,
        distributionOrderId: createdOrder.id,
        requestId: request.id,
      });
      await this.auditInTx(tx, user, request.branchId, 'REQUEST_ROUTED_TO_HQ_WAREHOUSE', 'BranchPurchaseRequest', request.id, {
        hqWarehouseId: assignedHqWarehouseId,
        distributionOrderId: createdOrder.id,
        requestId: request.id,
      });
      await this.auditInTx(tx, user, request.branchId, 'REQUEST_ROUTED_TO_ASSIGNED_HQ_WAREHOUSE', 'BranchPurchaseRequest', request.id, {
        hqWarehouseId: assignedHqWarehouseId,
        distributionOrderId: createdOrder.id,
        requestId: request.id,
        branchId: request.branchId,
      });
      await this.auditInTx(tx, user, request.branchId, 'DISTRIBUTION_ORDER_CREATED', 'BranchDistributionOrder', createdOrder.id, {
        requestId: request.id,
        hqWarehouseId: assignedHqWarehouseId,
      });

      return createdOrder;
    });

    const approvedOrder = await this.distributionService.approve(user, order.id);
    await this.distributionService.sendInvoice(user, order.id);
    await this.distributionService.sendToWarehouse(user, order.id, {
      assignedWarehouseManagerId,
    });

    await this.auditBranchRequest(user, request.branchId, 'WAREHOUSE_TASK_ASSIGNED', 'BranchDistributionOrder', order.id, {
      hqWarehouseId: assignedHqWarehouseId,
      requestId: request.id,
      assignedWarehouseManagerId,
    });

    for (const assignment of managerAssignments) {
      await this.notificationsService.notify(user, {
        type: AlertType.PICKING_TASK_ASSIGNED,
        branchId: request.branchId,
        entityType: 'BranchDistributionOrder',
        entityId: order.id,
        referenceNumber: order.orderNumber,
        message: `Picking task assigned for branch request ${request.requestNumber}.`,
      });
      break;
    }

    return approvedOrder;
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

      const draftRows = await tx.chinaReceivingDraftRow.findMany({
        where: { procurementOrderId: order.id, isArchived: false },
      });
      const savedDraftIds = new Set(
        draftRows.filter((row) => row.isSaved).map((row) => row.procurementItemId),
      );
      const unsavedItems = order.items.filter((item) => !savedDraftIds.has(item.id));
      if (unsavedItems.length > 0) {
        throw new BadRequestException(
          `All receiving rows must be saved before final receive. Unsaved: ${unsavedItems.length}`,
        );
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
      const draftMap = new Map(
        draftRows.filter((row) => row.isSaved).map((row) => [row.procurementItemId, row]),
      );
      const receivedItems = order.items.map((item) => {
        const draft = draftMap.get(item.id);
        const received: any = receivedMap.get(item.id) ?? receivedMap.get(item.productId) ?? {};
        const receivedQuantity = draft
          ? draft.actualQuantity
          : Number(received.receivedQuantity ?? item.quantity);
        const damagedQuantity = draft ? draft.damagedQuantity : Number(received.damagedQuantity ?? 0);
        const note = draft?.note ?? received.note;
        return {
          ...item,
          receivedQuantity,
          damagedQuantity,
          difference: receivedQuantity - item.quantity,
          receivedNote: note,
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
      const batchDiscrepancyActIds: string[] = [];

      for (const [index, item] of receivedItems.entries()) {
        const received: any = receivedMap.get(item.id) ?? receivedMap.get(item.productId) ?? {};
        const receivedQuantity = Number(received.receivedQuantity ?? item.quantity);
        const damagedQuantity = Number(received.damagedQuantity ?? 0);
        if (received.receivedQuantity !== undefined) {
          await this.auditInTx(tx, user, 'HQ', 'RECEIVING_QUANTITY_UPDATED', 'ProcurementOrderItem', item.id, {
            userId: user.id,
            role: user.role,
            procurementOrderId: order.id,
            warehouseId: hqWarehouseId,
            productId: item.productId,
            oldValue: item.quantity,
            newValue: receivedQuantity,
            timestamp: new Date().toISOString(),
          });
        }
        if (damagedQuantity > 0) {
          await this.auditInTx(tx, user, 'HQ', 'RECEIVING_DAMAGED_QTY_UPDATED', 'ProcurementOrderItem', item.id, {
            userId: user.id,
            role: user.role,
            procurementOrderId: order.id,
            warehouseId: hqWarehouseId,
            productId: item.productId,
            oldValue: 0,
            newValue: damagedQuantity,
            timestamp: new Date().toISOString(),
          });
        }
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
            damagedQuantity: item.damagedQuantity,
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
        const lineActs = await this.createProcurementDiscrepancyActsForLineInTx(tx, user, {
          batchId: receiving.id,
          procurementOrderId: order.id,
          destinationWarehouseId: hqWarehouseId,
          productId: item.productId,
          sku: item.sku,
          productName: item.productName,
          expectedQty: item.quantity,
          actualQty: item.receivedQuantity,
          damagedQty: item.damagedQuantity,
          reason: item.shortageReason ?? item.receivedNote,
          note: item.receivedNote,
          shortageReason: item.shortageReason,
          autoCreated: true,
        });
        batchDiscrepancyActIds.push(...lineActs.map((act) => act.id));
      }

      if (batchDiscrepancyActIds.length > 0) {
        await this.auditInTx(
          tx,
          user,
          'HQ',
          'DISCREPANCY_ACT_CREATED_PER_BATCH',
          'ProcurementGoodsReceiving',
          receiving.id,
          buildBatchDiscrepancyAuditMetadata(receiving.id, batchDiscrepancyActIds, {
            userId: user.id,
            roles: user.roles ?? [user.role],
            warehouseId: hqWarehouseId,
            procurementOrderId: order.id,
            receivingId: receiving.id,
            timestamp: new Date().toISOString(),
          }),
        );
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
      await tx.chinaReceivingDraftRow.updateMany({
        where: { procurementOrderId: order.id },
        data: { isArchived: true },
      });
      await tx.chinaReceivingEditSession.deleteMany({ where: { procurementOrderId: order.id } });
      await this.auditInTx(tx, user, 'HQ', 'CHINA_RECEIVING_FINALIZED_FROM_DRAFT', 'ProcurementOrder', order.id, {
        userId: user.id,
        procurementOrderId: order.id,
        receivingId: receiving.id,
        draftRowCount: draftRows.length,
        timestamp: new Date().toISOString(),
      });
      await this.auditInTx(tx, user, 'HQ', 'RECEIVING_COMPLETED', 'ProcurementOrder', order.id, {
        userId: user.id,
        procurementOrderId: order.id,
        receivingId: receiving.id,
        timestamp: new Date().toISOString(),
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

  async listChinaReceivingTasks(user: AuthUser, query: ChinaReceivingQueryDto = {}) {
    const roles = resolveUserRoles(user);
    const isCeo = hasAnyFullAccessRole(roles);
    const isScm = roles.includes(Role.SUPPLY_CHAIN_MANAGER);
    const isWm = roles.includes(Role.WAREHOUSE_MANAGER);

    if (!isCeo && !isScm && !canReceiveProcurementToHq(user)) {
      throw new ForbiddenException('You do not have access to China goods receiving');
    }

    const wmOnlyView = isWarehouseManagerOnlyView(user);

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
        supplier: wmOnlyView ? false : { select: { id: true, name: true } },
        factory: wmOnlyView ? false : { select: { id: true, name: true } },
        createdBy: { select: { id: true, fullName: true, role: true } },
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
        purchaseDate: order.purchaseDate ?? order.createdAt,
        supplyManager: order.createdBy
          ? { id: order.createdBy.id, fullName: order.createdBy.fullName }
          : null,
        supplyManagerName: order.createdBy?.fullName ?? null,
        supplier: wmOnlyView ? undefined : order.supplier,
        factory: wmOnlyView ? undefined : order.factory,
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
        validation: wmOnlyView ? { canReceiveToHq: validation.canReceiveToHq } : validation,
      });
    }

    const filtered = this.applyChinaReceivingFilters(tasks, query);

    const hasFilters = Boolean(
      query.search?.trim()
      || query.purchaseDate?.trim()
      || query.orderNumber?.trim()
      || query.supplyManagerId?.trim()
      || query.hqWarehouseId?.trim()
      || query.status?.trim(),
    );
    if (hasFilters) {
      await this.prisma.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'CHINA_RECEIVING_FILTERED',
          entity: 'ProcurementOrder',
          entityId: 'list',
          metadata: {
            userId: user.id,
            role: user.role,
            filters: { ...query },
            resultCount: filtered.length,
            timestamp: new Date().toISOString(),
          },
        },
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
          count: filtered.length,
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

    return filtered.map((task) => sanitizeChinaReceivingListTask(task, wmOnlyView));
  }

  private applyChinaReceivingFilters(
    tasks: Array<{
      id: string;
      orderNumber: string;
      purchaseDate?: Date | string | null;
      supplyManager?: { id: string; fullName: string } | null;
      supplyManagerName?: string | null;
      hqWarehouse?: { id: string; name: string } | null;
      status: string;
    }>,
    query: ChinaReceivingQueryDto,
  ) {
    let result = tasks;
    const search = query.search?.trim().toLowerCase();
    if (search) {
      result = result.filter((task) => {
        const orderNumber = task.orderNumber.toLowerCase();
        const managerName = task.supplyManagerName?.toLowerCase() ?? '';
        const warehouseName = task.hqWarehouse?.name?.toLowerCase() ?? '';
        return orderNumber.includes(search) || managerName.includes(search) || warehouseName.includes(search);
      });
    }
    if (query.purchaseDate?.trim()) {
      const target = query.purchaseDate.trim();
      result = result.filter((task) => {
        const value = task.purchaseDate ? new Date(task.purchaseDate).toISOString().slice(0, 10) : '';
        return value === target;
      });
    }
    if (query.orderNumber?.trim()) {
      const needle = query.orderNumber.trim().toLowerCase();
      result = result.filter((task) => task.orderNumber.toLowerCase().includes(needle));
    }
    if (query.supplyManagerId?.trim()) {
      result = result.filter((task) => task.supplyManager?.id === query.supplyManagerId);
    }
    if (query.hqWarehouseId?.trim()) {
      result = result.filter((task) => task.hqWarehouse?.id === query.hqWarehouseId);
    }
    if (query.status?.trim()) {
      result = result.filter((task) => task.status === query.status);
    }
    return result;
  }

  async getChinaReceivingTask(user: AuthUser, orderId: string) {
    const wmOnlyView = isWarehouseManagerOnlyView(user);
    const order = await this.loadChinaReceivingOrder(orderId, wmOnlyView);
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
          tableLayout: 'compact',
          timestamp: new Date().toISOString(),
        },
      },
    });
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: 'CHINA_RECEIVING_TABLE_COMPACTED',
        entity: 'ProcurementOrder',
        entityId: order.id,
        metadata: {
          userId: user.id,
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

    const [draftRows, editSession] = await Promise.all([
      this.prisma.chinaReceivingDraftRow.findMany({
        where: { procurementOrderId: order.id, isArchived: false },
        include: { lastSavedBy: { select: { id: true, fullName: true } } },
        orderBy: { updatedAt: 'asc' },
      }),
      this.prisma.chinaReceivingEditSession.findFirst({
        where: { procurementOrderId: order.id },
        include: { lockedByUser: { select: { id: true, fullName: true } } },
      }),
    ]);

    if (draftRows.length > 0 && !order.hqStockMovementCreatedAt) {
      await this.prisma.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'CHINA_RECEIVING_DRAFT_RESTORED',
          entity: 'ProcurementOrder',
          entityId: order.id,
          metadata: {
            userId: user.id,
            procurementOrderId: order.id,
            restoredRowCount: draftRows.length,
            timestamp: new Date().toISOString(),
          },
        },
      });
    }

    const lineItems = order.items.map((item) => {
      const draft = draftRows.find((row) => row.procurementItemId === item.id);
      const hasSavedDraft = Boolean(draft?.isSaved);
      const actualQuantity = hasSavedDraft
        ? draft!.actualQuantity
        : (draft?.actualQuantity ?? item.receivedQuantity ?? item.quantity);
      const damagedQuantity = hasSavedDraft ? draft!.damagedQuantity : (draft?.damagedQuantity ?? 0);
      const isSaved = hasSavedDraft;
      return {
        id: item.id,
        productId: item.productId,
        sku: item.sku,
        productName: item.productName,
        orderedQuantity: wmOnlyView ? undefined : item.quantity,
        expectedQuantity: item.quantity,
        actualReceivedQuantity: actualQuantity,
        damagedQuantity,
        note: hasSavedDraft ? (draft!.note ?? '') : (draft?.note ?? null),
        isSaved,
        isChecked: draft?.isChecked ?? isSaved,
        lastSavedAt: draft?.lastSavedAt?.toISOString() ?? null,
        updatedAt: draft?.updatedAt?.toISOString() ?? null,
        lastSavedBy: draft?.lastSavedBy ?? null,
        rowStatus: resolveRowStatus(actualQuantity, item.quantity, damagedQuantity, isSaved),
        difference: actualQuantity - item.quantity,
      };
    });

    const progress = buildChinaReceivingProgress(
      order.items.map((item) => ({ id: item.id, expectedQuantity: item.quantity })),
      draftRows.map((row) => ({
        procurementItemId: row.procurementItemId,
        actualQuantity: row.actualQuantity,
        damagedQuantity: row.damagedQuantity,
        note: row.note,
        isSaved: row.isSaved,
        lastSavedAt: row.lastSavedAt,
      })),
    );

    const sessionStale = editSession ? isChinaReceivingSessionStale(editSession.lastHeartbeatAt) : true;
    const activeSession =
      editSession && !sessionStale
        ? {
            lockedByUserId: editSession.lockedByUserId,
            lockedByUser: editSession.lockedByUser,
            lockedAt: editSession.lockedAt,
            lastHeartbeatAt: editSession.lastHeartbeatAt,
            isCurrentUser: editSession.lockedByUserId === user.id,
            canTakeOver: hasAnyFullAccessRole(roles) && editSession.lockedByUserId !== user.id,
          }
        : null;

    return sanitizeChinaReceivingDetail({
      id: order.id,
      orderNumber: order.orderNumber,
      purchaseDate: order.purchaseDate ?? order.createdAt,
      supplyManager: order.createdBy
        ? { id: order.createdBy.id, fullName: order.createdBy.fullName }
        : null,
      hqWarehouseId: order.hqWarehouseId,
      hqWarehouse: order.hqWarehouse,
      receivingStatus: resolveChinaReceivingListStatus(enriched),
      draftState: resolveChinaReceivingDraftState(order.hqStockMovementCreatedAt),
      validation: wmOnlyView ? { canReceiveToHq: validation.canReceiveToHq } : validation,
      canReceive: !order.hqStockMovementCreatedAt && isWm && !isScm,
      canMarkArrival:
        !order.hqStockMovementCreatedAt && isWm && !isScm && isGoodsLeftYiwuStatus(order.status),
      canCreateAct: isWm && !isScm && !order.hqStockMovementCreatedAt,
      canViewActs: isScm || hasAnyFullAccessRole(roles) || isWm,
      arrivalMarked: Boolean(order.actualArrivalDate),
      hqStockMovementCreatedAt: order.hqStockMovementCreatedAt,
      progress,
      editSession: activeSession,
      draftRows: draftRows.map((row) => ({
        id: row.id,
        procurementItemId: row.procurementItemId,
        productId: row.productId,
        hqWarehouseId: row.hqWarehouseId,
        actualQuantity: row.actualQuantity,
        damagedQuantity: row.damagedQuantity,
        note: row.note,
        isSaved: row.isSaved,
        isChecked: row.isChecked,
        isArchived: row.isArchived,
        lastSavedAt: row.lastSavedAt,
        updatedAt: row.updatedAt,
        lastSavedBy: row.lastSavedBy,
      })),
      readOnly:
        Boolean(order.hqStockMovementCreatedAt) ||
        (activeSession !== null && activeSession.lockedByUserId !== user.id && !hasAnyFullAccessRole(roles)),
      supplier: wmOnlyView ? undefined : order.supplier,
      factory: wmOnlyView ? undefined : order.factory,
      differenceReports: wmOnlyView ? undefined : order.differenceReports,
      shipmentBatches: (order.receivings ?? []).map((batch) => ({
        id: batch.id,
        batchId: batch.id,
        shipmentBatchId: batch.id,
        receivingNumber: batch.receivingNumber,
        receivedAt: batch.receivedAt,
        items: batch.items.map((row) => ({
          id: row.id,
          productId: row.productId,
          sku: row.sku,
          productName: row.productName,
          expectedQuantity: row.expectedQuantity,
          actualQuantity: row.receivedQuantity,
          receivedQuantity: row.receivedQuantity,
          differenceQuantity: row.differenceQuantity,
          difference: row.receivedQuantity - row.expectedQuantity,
        })),
        discrepancyActs: (order.differenceReports ?? [])
          .filter((act) => act.receivingId === batch.id)
          .map((act) => ({
            id: act.id,
            actNumber: act.reportNumber,
            reportNumber: act.reportNumber,
            batchId: batch.id,
            shipmentBatchId: batch.id,
            procurementOrderId: act.procurementOrderId,
            productId: act.productId,
            productName: act.productName,
            sku: act.sku,
            expectedQty: act.expectedQuantity,
            actualQty: act.receivedQuantity,
            differenceQty: act.differenceQuantity,
            differenceType: act.type,
            status: act.status,
            reason: act.shortageReason ?? act.note,
            createdAt: act.createdAt,
          })),
      })),
      lineItems,
    }, wmOnlyView);
  }

  async getChinaReceivingDrafts(user: AuthUser, orderId: string) {
    const order = await this.loadChinaReceivingOrder(orderId);
    await this.assertChinaReceivingAccess(user, order.hqWarehouseId);
    const drafts = await this.prisma.chinaReceivingDraftRow.findMany({
      where: { procurementOrderId: orderId, isArchived: false },
      include: { lastSavedBy: { select: { id: true, fullName: true } } },
      orderBy: { updatedAt: 'asc' },
    });
    return drafts;
  }

  async saveChinaReceivingDraftRow(
    user: AuthUser,
    orderId: string,
    itemId: string,
    dto: SaveChinaReceivingDraftRowDto,
  ) {
    await this.assertChinaReceivingDraftWritable(user, orderId);
    const order = await this.loadChinaReceivingOrder(orderId);
    const orderItem = order.items.find((item) => item.id === itemId);
    if (!orderItem) throw new NotFoundException('Procurement line item not found');

    const existing = await this.prisma.chinaReceivingDraftRow.findUnique({
      where: {
        procurementOrderId_procurementItemId: {
          procurementOrderId: orderId,
          procurementItemId: itemId,
        },
      },
    });

    if (existing?.isArchived) {
      throw new BadRequestException('Receiving draft is archived and cannot be edited');
    }

    if (dto.expectedUpdatedAt && existing) {
      const expectedMs = new Date(dto.expectedUpdatedAt).getTime();
      const currentMs = existing.updatedAt.getTime();
      if (Number.isFinite(expectedMs) && currentMs > expectedMs) {
        await this.prisma.auditLog.create({
          data: {
            userId: user.id,
            role: user.role,
            action: 'CHINA_RECEIVING_DRAFT_CONFLICT',
            entity: 'ChinaReceivingDraftRow',
            entityId: existing.id,
            metadata: {
              userId: user.id,
              procurementOrderId: orderId,
              procurementOrderItemId: itemId,
              productId: orderItem.productId,
              oldValue: {
                actualQuantity: existing.actualQuantity,
                damagedQuantity: existing.damagedQuantity,
                note: existing.note,
                updatedAt: existing.updatedAt.toISOString(),
              },
              newValue: {
                actualQuantity: dto.actualQuantity,
                damagedQuantity: dto.damagedQuantity,
                note: dto.note ?? null,
              },
              timestamp: new Date().toISOString(),
            },
          },
        });
        throw new ConflictException('CHINA_RECEIVING_DRAFT_CONFLICT');
      }
    }

    const auditAction = existing
      ? 'CHINA_RECEIVING_DRAFT_UPDATED'
      : 'CHINA_RECEIVING_DRAFT_CREATED';
    const legacyAction = dto.autoSave ? 'ROW_AUTOSAVED' : existing ? 'ROW_UPDATED' : 'ROW_SAVED';

    const saved = await this.prisma.chinaReceivingDraftRow.upsert({
      where: {
        procurementOrderId_procurementItemId: {
          procurementOrderId: orderId,
          procurementItemId: itemId,
        },
      },
      create: {
        procurementOrderId: orderId,
        procurementItemId: itemId,
        productId: orderItem.productId,
        hqWarehouseId: order.hqWarehouseId,
        actualQuantity: dto.actualQuantity,
        damagedQuantity: dto.damagedQuantity,
        note: dto.note ?? null,
        isSaved: true,
        isChecked: true,
        isArchived: false,
        lastSavedAt: new Date(),
        lastSavedById: user.id,
      },
      update: {
        productId: orderItem.productId,
        hqWarehouseId: order.hqWarehouseId,
        actualQuantity: dto.actualQuantity,
        damagedQuantity: dto.damagedQuantity,
        note: dto.note ?? null,
        isSaved: true,
        isChecked: true,
        lastSavedAt: new Date(),
        lastSavedById: user.id,
      },
      include: { lastSavedBy: { select: { id: true, fullName: true } } },
    });

    const auditMetadata = {
      userId: user.id,
      procurementOrderId: orderId,
      procurementOrderItemId: itemId,
      productId: orderItem.productId,
      oldValue: existing
        ? {
            actualQuantity: existing.actualQuantity,
            damagedQuantity: existing.damagedQuantity,
            note: existing.note,
          }
        : null,
      newValue: {
        actualQuantity: dto.actualQuantity,
        damagedQuantity: dto.damagedQuantity,
        note: dto.note ?? null,
      },
      timestamp: new Date().toISOString(),
    };

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: auditAction,
        entity: 'ChinaReceivingDraftRow',
        entityId: saved.id,
        metadata: auditMetadata,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: legacyAction,
        entity: 'ChinaReceivingDraftRow',
        entityId: saved.id,
        metadata: auditMetadata,
      },
    });
    if (dto.networkRecovery) {
      await this.prisma.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'NETWORK_RECOVERY',
          entity: 'ProcurementOrder',
          entityId: orderId,
          metadata: {
            userId: user.id,
            procurementOrderId: orderId,
            procurementItemId: itemId,
            timestamp: new Date().toISOString(),
          },
        },
      });
    }

    return {
      ...saved,
      updatedAt: saved.updatedAt.toISOString(),
      lastSavedAt: saved.lastSavedAt?.toISOString() ?? null,
      rowStatus: resolveRowStatus(
        saved.actualQuantity,
        orderItem.quantity,
        saved.damagedQuantity,
        saved.isSaved,
      ),
      difference: saved.actualQuantity - orderItem.quantity,
    };
  }

  async saveAllChinaReceivingDraftRows(
    user: AuthUser,
    orderId: string,
    dto: SaveAllChinaReceivingDraftDto,
  ) {
    await this.assertChinaReceivingDraftWritable(user, orderId);
    const order = await this.loadChinaReceivingOrder(orderId);
    const rows = Array.isArray(dto.rows) ? dto.rows : [];
    if (!rows.length) throw new BadRequestException('At least one row is required');

    const savedRows = [];
    for (const row of rows) {
      const orderItem = order.items.find((item) => item.id === row.procurementItemId);
      if (!orderItem) continue;
      const saved = await this.prisma.chinaReceivingDraftRow.upsert({
        where: {
          procurementOrderId_procurementItemId: {
            procurementOrderId: orderId,
            procurementItemId: row.procurementItemId,
          },
        },
        create: {
          procurementOrderId: orderId,
          procurementItemId: row.procurementItemId,
          productId: orderItem.productId,
          hqWarehouseId: order.hqWarehouseId,
          actualQuantity: row.actualQuantity,
          damagedQuantity: row.damagedQuantity,
          note: row.note ?? null,
          isSaved: true,
          isChecked: true,
          isArchived: false,
          lastSavedAt: new Date(),
          lastSavedById: user.id,
        },
        update: {
          productId: orderItem.productId,
          hqWarehouseId: order.hqWarehouseId,
          actualQuantity: row.actualQuantity,
          damagedQuantity: row.damagedQuantity,
          note: row.note ?? null,
          isSaved: true,
          isChecked: true,
          lastSavedAt: new Date(),
          lastSavedById: user.id,
        },
        include: { lastSavedBy: { select: { id: true, fullName: true } } },
      });
      savedRows.push({
        ...saved,
        rowStatus: resolveRowStatus(
          saved.actualQuantity,
          orderItem.quantity,
          saved.damagedQuantity,
          saved.isSaved,
        ),
        difference: saved.actualQuantity - orderItem.quantity,
      });
    }

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: 'SAVE_ALL',
        entity: 'ProcurementOrder',
        entityId: orderId,
        metadata: {
          userId: user.id,
          procurementOrderId: orderId,
          savedCount: savedRows.length,
          timestamp: new Date().toISOString(),
        },
      },
    });

    return { savedRows, count: savedRows.length };
  }

  async heartbeatChinaReceivingSession(user: AuthUser, orderId: string) {
    const order = await this.loadChinaReceivingOrder(orderId);
    await this.assertChinaReceivingAccess(user, order.hqWarehouseId);
    if (order.hqStockMovementCreatedAt) {
      return { active: false, reason: 'COMPLETED' };
    }

    const existing = await this.prisma.chinaReceivingEditSession.findUnique({
      where: { procurementOrderId: orderId },
      include: { lockedByUser: { select: { id: true, fullName: true } } },
    });

    if (existing && !isChinaReceivingSessionStale(existing.lastHeartbeatAt) && existing.lockedByUserId !== user.id) {
      return {
        active: true,
        lockedByUser: existing.lockedByUser,
        isCurrentUser: false,
        canTakeOver: hasAnyFullAccessRole(resolveUserRoles(user)),
      };
    }

    const session = await this.prisma.chinaReceivingEditSession.upsert({
      where: { procurementOrderId: orderId },
      create: {
        procurementOrderId: orderId,
        lockedByUserId: user.id,
        lockedAt: new Date(),
        lastHeartbeatAt: new Date(),
      },
      update: {
        lockedByUserId: user.id,
        lastHeartbeatAt: new Date(),
        ...(existing && isChinaReceivingSessionStale(existing.lastHeartbeatAt)
          ? { lockedAt: new Date() }
          : {}),
      },
      include: { lockedByUser: { select: { id: true, fullName: true } } },
    });

    return {
      active: true,
      lockedByUser: session.lockedByUser,
      isCurrentUser: true,
      canTakeOver: false,
    };
  }

  async takeOverChinaReceivingSession(user: AuthUser, orderId: string) {
    if (!hasAnyFullAccessRole(resolveUserRoles(user))) {
      throw new ForbiddenException('Only CEO can take over an active receiving session');
    }
    const order = await this.loadChinaReceivingOrder(orderId);
    await this.assertChinaReceivingAccess(user, order.hqWarehouseId);
    if (order.hqStockMovementCreatedAt) {
      throw new BadRequestException('Receiving is already completed');
    }

    const session = await this.prisma.chinaReceivingEditSession.upsert({
      where: { procurementOrderId: orderId },
      create: {
        procurementOrderId: orderId,
        lockedByUserId: user.id,
        lockedAt: new Date(),
        lastHeartbeatAt: new Date(),
      },
      update: {
        lockedByUserId: user.id,
        lockedAt: new Date(),
        lastHeartbeatAt: new Date(),
      },
      include: { lockedByUser: { select: { id: true, fullName: true } } },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: 'CHINA_RECEIVING_SESSION_TAKEOVER',
        entity: 'ProcurementOrder',
        entityId: orderId,
        metadata: {
          userId: user.id,
          procurementOrderId: orderId,
          timestamp: new Date().toISOString(),
        },
      },
    });

    return {
      active: true,
      lockedByUser: session.lockedByUser,
      isCurrentUser: true,
      canTakeOver: false,
    };
  }

  async releaseChinaReceivingSession(user: AuthUser, orderId: string) {
    const existing = await this.prisma.chinaReceivingEditSession.findUnique({
      where: { procurementOrderId: orderId },
    });
    if (existing?.lockedByUserId === user.id) {
      await this.prisma.chinaReceivingEditSession.delete({ where: { procurementOrderId: orderId } });
    }
    return { released: true };
  }

  private async assertChinaReceivingDraftWritable(user: AuthUser, orderId: string) {
    const roles = resolveUserRoles(user);
    if (roles.includes(Role.SUPPLY_CHAIN_MANAGER) && !hasAnyFullAccessRole(roles)) {
      throw new ForbiddenException('Supply Chain Manager cannot edit receiving drafts');
    }
    if (!canReceiveProcurementToHq(user) && !hasAnyFullAccessRole(roles)) {
      throw new ForbiddenException('Only assigned HQ Warehouse Manager can edit receiving drafts');
    }
    const order = await this.loadChinaReceivingOrder(orderId);
    await this.assertChinaReceivingAccess(user, order.hqWarehouseId);
    if (order.hqStockMovementCreatedAt) {
      throw new BadRequestException('Receiving is already completed');
    }
    const session = await this.prisma.chinaReceivingEditSession.findUnique({
      where: { procurementOrderId: orderId },
    });
    if (
      session &&
      !isChinaReceivingSessionStale(session.lastHeartbeatAt) &&
      session.lockedByUserId !== user.id &&
      !hasAnyFullAccessRole(roles)
    ) {
      throw new ForbiddenException('Receiving is currently being edited by another user');
    }
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
      const batchId = await this.resolveProcurementShipmentBatchId(
        tx,
        order.id,
        order.hqWarehouseId,
        user.id,
        dto.receivingId ?? dto.shipmentBatchId,
      );
      const created = [];
      for (const item of items) {
        const orderItem = order.items.find(
          (row) => row.id === item.procurementItemId || row.productId === item.productId,
        );
        if (!orderItem) continue;

        const expectedQty = Number(item.expectedQuantity ?? orderItem.quantity);
        const actualQty = Number(item.actualQuantity ?? orderItem.quantity);
        const damagedQty = Number(item.damagedQuantity ?? 0);
        const discrepancyActs = resolveProcurementDiscrepancyActs(expectedQty, actualQty, damagedQty);
        if (!discrepancyActs.length) continue;

        for (const discrepancy of discrepancyActs) {
          const differenceType =
            (item.differenceType as ShortageReportItemType | undefined) ?? discrepancy.type;

          const existingAct = await tx.procurementDifferenceReport.findFirst({
            where: {
              deletedAt: null,
              receivingId: batchId,
              productId: orderItem.productId,
              type: differenceType,
            },
          });
          if (existingAct) continue;

          const report = await this.createProcurementDiscrepancyActInTx(tx, user, {
            batchId,
            procurementOrderId: order.id,
            destinationWarehouseId: warehouseId,
            productId: orderItem.productId,
            sku: orderItem.sku,
            productName: orderItem.productName,
            expectedQty,
            actualQty,
            damagedQty,
            reason: item.reason ?? item.shortageReason ?? item.note,
            note: item.note,
            shortageReason: item.reason ?? item.shortageReason,
            differenceType,
            differenceQty: discrepancy.differenceQty,
          });
          if (report) {
            created.push(report);
          }
        }
      }

      if (!created.length) {
        throw new BadRequestException('No quantity differences found for act creation');
      }

      await this.auditInTx(
        tx,
        user,
        'HQ',
        'DISCREPANCY_ACT_CREATED_PER_BATCH',
        'ProcurementGoodsReceiving',
        batchId,
        buildBatchDiscrepancyAuditMetadata(
          batchId,
          created.map((row) => row.id),
          {
            userId: user.id,
            roles: user.roles ?? [user.role],
            warehouseId,
            procurementOrderId: order.id,
            receivingId: batchId,
            timestamp: new Date().toISOString(),
          },
        ),
      );

      await this.auditInTx(tx, user, 'HQ', 'RECEIVING_DIFFERENCE_ACT_CREATED', 'ProcurementOrder', order.id, {
        userId: user.id,
        roles: user.roles ?? [user.role],
        warehouseId,
        procurementOrderId: order.id,
        receivingId: batchId,
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

  async listChinaReceivingDifferenceActs(user: AuthUser, query: ProcurementDifferenceActQueryDto = {}) {
    const roles = resolveUserRoles(user);
    const isScm = roles.includes(Role.SUPPLY_CHAIN_MANAGER) && !hasAnyFullAccessRole(roles);
    const isCeo = hasAnyFullAccessRole(roles);
    if (!isScm && !isCeo && !canReceiveProcurementToHq(user)) {
      throw new ForbiddenException('You do not have access to difference acts');
    }

    const createdAtFilter =
      query.dateFrom || query.dateTo
        ? {
            ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
            ...(query.dateTo ? { lte: new Date(`${query.dateTo}T23:59:59.999Z`) } : {}),
          }
        : undefined;

    const reports = await this.prisma.procurementDifferenceReport.findMany({
      where: {
        deletedAt: null,
        ...(query.orderId ? { procurementOrderId: query.orderId } : {}),
        ...(query.type ? { type: query.type } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
        ...(query.supplierId || query.factoryId
          ? {
              procurementOrder: {
                ...(query.supplierId ? { supplierId: query.supplierId } : {}),
                ...(query.factoryId ? { factoryId: query.factoryId } : {}),
              },
            }
          : {}),
      },
      include: {
        procurementOrder: {
          select: {
            id: true,
            orderNumber: true,
            hqWarehouseId: true,
            status: true,
            supplierId: true,
            factoryId: true,
            supplier: { select: { id: true, name: true } },
            factory: { select: { id: true, name: true } },
          },
        },
        warehouse: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    const receivingIds = [...new Set(reports.map((report) => report.receivingId).filter(Boolean))] as string[];
    const receivings = receivingIds.length
      ? await this.prisma.procurementGoodsReceiving.findMany({
          where: { id: { in: receivingIds }, deletedAt: null },
          select: { id: true, receivingNumber: true, receivedAt: true },
        })
      : [];
    const receivingMap = new Map(receivings.map((row) => [row.id, row]));

    if (isScm) {
      await this.prisma.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'PROCUREMENT_DISCREPANCY_ACT_VIEWED',
          entity: 'ProcurementDifferenceReport',
          entityId: query.orderId ?? 'list',
          metadata: {
            userId: user.id,
            role: user.role,
            roles: user.roles ?? [user.role],
            procurementOrderId: query.orderId,
            filters: { ...query } as Prisma.InputJsonValue,
            count: reports.length,
            timestamp: new Date().toISOString(),
          },
        },
      });
      await this.prisma.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'PROCUREMENT_DISCREPANCY_NAVIGATION_FIXED',
          entity: 'ProcurementDifferenceReport',
          entityId: 'navigation',
          metadata: {
            userId: user.id,
            role: user.role,
            roles: user.roles ?? [user.role],
            timestamp: new Date().toISOString(),
          },
        },
      });
    }

    return reports.map((report) => this.mapProcurementDifferenceAct(report, receivingMap));
  }

  async getProcurementDifferenceAct(user: AuthUser, actId: string) {
    const roles = resolveUserRoles(user);
    const isScm = roles.includes(Role.SUPPLY_CHAIN_MANAGER) && !hasAnyFullAccessRole(roles);
    const isCeo = hasAnyFullAccessRole(roles);
    if (!isScm && !isCeo && !canReceiveProcurementToHq(user)) {
      throw new ForbiddenException('You do not have access to difference acts');
    }

    const report = await this.prisma.procurementDifferenceReport.findFirst({
      where: { id: actId, deletedAt: null },
      include: {
        procurementOrder: {
          select: {
            id: true,
            orderNumber: true,
            hqWarehouseId: true,
            status: true,
            supplierId: true,
            factoryId: true,
            supplier: { select: { id: true, name: true } },
            factory: { select: { id: true, name: true } },
          },
        },
        warehouse: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
    });
    if (!report) {
      throw new NotFoundException('Difference act not found');
    }

    const receiving = report.receivingId
      ? await this.prisma.procurementGoodsReceiving.findFirst({
          where: { id: report.receivingId, deletedAt: null },
          select: { id: true, receivingNumber: true, receivedAt: true },
        })
      : null;
    const receivingMap = new Map(receiving ? [[receiving.id, receiving]] : []);

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: 'PROCUREMENT_DISCREPANCY_ACT_VIEWED',
        entity: 'ProcurementDifferenceReport',
        entityId: report.id,
        metadata: {
          userId: user.id,
          role: user.role,
          roles: user.roles ?? [user.role],
          procurementOrderId: report.procurementOrderId,
          warehouseId: report.warehouseId,
          timestamp: new Date().toISOString(),
        },
      },
    });

    return this.mapProcurementDifferenceAct(report, receivingMap);
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

  private async loadChinaReceivingOrder(orderId: string, wmView = false) {
    const order = await this.prisma.procurementOrder.findFirst({
      where: { id: orderId, deletedAt: null },
      include: {
        supplier: wmView ? false : true,
        factory: wmView ? false : true,
        createdBy: { select: { id: true, fullName: true, role: true } },
        hqWarehouse: true,
        items: true,
        svhToHqTransport: wmView ? false : { include: { transportCompany: true } },
        differenceReports: wmView ? false : { where: { deletedAt: null } },
        receivings: { where: { deletedAt: null }, include: { items: true } },
      },
    });
    if (!order) throw new NotFoundException('Procurement order not found');
    return order;
  }

  private async resolveProcurementShipmentBatchId(
    tx: PrismaTx,
    procurementOrderId: string,
    hqWarehouseId: string,
    receivedById: string,
    requestedBatchId?: string,
  ) {
    if (requestedBatchId) {
      const existing = await tx.procurementGoodsReceiving.findFirst({
        where: {
          id: requestedBatchId,
          procurementOrderId,
          deletedAt: null,
        },
      });
      if (!existing) {
        throw new BadRequestException('Shipment batch not found for this procurement order');
      }
      return existing.id;
    }

    const openBatch = await tx.procurementGoodsReceiving.findFirst({
      where: {
        procurementOrderId,
        deletedAt: null,
        items: { none: {} },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (openBatch) return openBatch.id;

    const created = await tx.procurementGoodsReceiving.create({
      data: {
        receivingNumber: `PGR-BATCH-${Date.now()}`,
        procurementOrderId,
        hqWarehouseId,
        receivedById,
      },
    });
    return created.id;
  }

  private mapProcurementDifferenceAct(
    report: {
      id: string;
      reportNumber: string;
      procurementOrderId: string;
      receivingId: string | null;
      warehouseId: string | null;
      productId: string;
      productName: string;
      sku: string;
      type: ShortageReportItemType;
      status: ShortageReportStatus;
      expectedQuantity: number;
      receivedQuantity: number;
      differenceQuantity: number;
      damagedQuantity: number;
      shortageReason: ProcurementShortageReason | null;
      note: string | null;
      createdAt: Date;
      updatedAt: Date;
      procurementOrder: {
        id: string;
        orderNumber: string;
        hqWarehouseId: string;
        status: ProcurementOrderStatus;
        supplierId: string;
        factoryId: string | null;
        supplier: { id: string; name: string };
        factory: { id: string; name: string } | null;
      };
      warehouse: { id: string; name: string; code: string } | null;
      createdBy: { id: string; fullName: string } | null;
    },
    receivingMap: Map<string, { id: string; receivingNumber: string; receivedAt: Date }>,
  ) {
    return {
      id: report.id,
      reportNumber: report.reportNumber,
      actNumber: report.reportNumber,
      procurementOrderId: report.procurementOrderId,
      procurementOrder: report.procurementOrder,
      orderNumber: report.procurementOrder.orderNumber,
      supplierId: report.procurementOrder.supplierId,
      factoryId: report.procurementOrder.factoryId,
      supplier: report.procurementOrder.supplier,
      factory: report.procurementOrder.factory,
      warehouse: report.warehouse,
      warehouseId: report.warehouseId,
      hqWarehouse: report.warehouse,
      productId: report.productId,
      productName: report.productName,
      sku: report.sku,
      type: report.type,
      differenceType: report.type,
      status: report.status,
      expectedQuantity: report.expectedQuantity,
      expectedQty: report.expectedQuantity,
      actualQuantity: report.receivedQuantity,
      actualQty: report.receivedQuantity,
      receivedQuantity: report.receivedQuantity,
      damagedQuantity: report.damagedQuantity,
      damagedQty: report.damagedQuantity,
      differenceQuantity: report.differenceQuantity,
      differenceQty: report.differenceQuantity,
      difference: report.differenceQuantity,
      note: report.note,
      shortageReason: report.shortageReason,
      reason: report.shortageReason ?? report.note,
      warehouseManager: report.createdBy,
      createdBy: report.createdBy,
      createdById: report.createdBy?.id ?? null,
      receivingId: report.receivingId,
      batchId: report.receivingId,
      shipmentBatchId: report.receivingId,
      batchNumber: report.receivingId ? receivingMap.get(report.receivingId)?.receivingNumber ?? null : null,
      receivingNumber: report.receivingId ? receivingMap.get(report.receivingId)?.receivingNumber ?? null : null,
      batchReceivedAt: report.receivingId ? receivingMap.get(report.receivingId)?.receivedAt ?? null : null,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
    };
  }

  private async createProcurementDiscrepancyActsForLineInTx(
    tx: PrismaTx,
    user: AuthUser,
    input: {
      batchId: string;
      procurementOrderId: string;
      destinationWarehouseId?: string;
      productId: string;
      sku: string;
      productName: string;
      expectedQty: number;
      actualQty: number;
      damagedQty?: number;
      reason?: string | null;
      note?: string | null;
      shortageReason?: string | null;
      autoCreated?: boolean;
    },
  ) {
    const damagedQty = Number(input.damagedQty ?? 0);
    const actsToCreate = resolveProcurementDiscrepancyActs(input.expectedQty, input.actualQty, damagedQty);
    const created = [];
    for (const discrepancy of actsToCreate) {
      const report = await this.createProcurementDiscrepancyActInTx(tx, user, {
        ...input,
        differenceType: discrepancy.type,
        differenceQty: discrepancy.differenceQty,
        damagedQty,
        autoCreated: input.autoCreated,
      });
      if (report) {
        created.push(report);
      }
    }
    return created;
  }

  private async createProcurementDiscrepancyActInTx(
    tx: PrismaTx,
    user: AuthUser,
    input: {
      batchId: string;
      procurementOrderId: string;
      destinationWarehouseId?: string;
      productId: string;
      sku: string;
      productName: string;
      expectedQty: number;
      actualQty: number;
      damagedQty?: number;
      reason?: string | null;
      note?: string | null;
      shortageReason?: string | null;
      differenceType?: ShortageReportItemType;
      differenceQty?: number;
      autoCreated?: boolean;
    },
  ) {
    const differenceType =
      input.differenceType ??
      resolveDifferenceType(input.expectedQty, input.actualQty, input.reason);
    const differenceQty =
      input.differenceQty ?? Math.abs(input.actualQty - input.expectedQty);
    if (!differenceType || differenceQty === 0) return null;

    const existing = await tx.procurementDifferenceReport.findFirst({
      where: {
        deletedAt: null,
        receivingId: input.batchId,
        productId: input.productId,
        type: differenceType,
      },
      select: { id: true },
    });
    if (existing) return null;

    const typePrefix =
      differenceType === ShortageReportItemType.SHORTAGE
        ? 'PSH'
        : differenceType === ShortageReportItemType.OVERAGE
          ? 'POV'
          : 'PDM';
    const report = await tx.procurementDifferenceReport.create({
      data: {
        reportNumber: generateProcurementActNumber(typePrefix, input.productId, input.batchId),
        receivingId: input.batchId,
        procurementOrderId: input.procurementOrderId,
        warehouseId: input.destinationWarehouseId,
        createdById: user.id,
        type: differenceType,
        productId: input.productId,
        sku: input.sku,
        productName: input.productName,
        expectedQuantity: input.expectedQty,
        receivedQuantity: input.actualQty,
        differenceQuantity: differenceQty,
        damagedQuantity: input.damagedQty ?? 0,
        shortageReason: input.shortageReason as any,
        note: input.note,
      },
    });

    const auditContext = {
      batchId: input.batchId,
      procurementOrderId: input.procurementOrderId,
      destinationWarehouseId: input.destinationWarehouseId,
      productId: input.productId,
      expectedQty: input.expectedQty,
      actualQty: input.actualQty,
      differenceQty,
      differenceType,
      reason: input.reason ?? input.note,
      createdById: user.id,
    };

    await this.auditInTx(
      tx,
      user,
      'HQ',
      input.autoCreated ? 'DISCREPANCY_ACT_AUTO_CREATED' : procurementDifferenceAuditAction(differenceType),
      'ProcurementDifferenceReport',
      report.id,
      buildDiscrepancyActAuditMetadata(auditContext, {
        userId: user.id,
        role: user.role,
        roles: user.roles ?? [user.role],
        warehouseId: input.destinationWarehouseId,
        receivingId: input.batchId,
        shipmentBatchId: input.batchId,
        actNumber: report.reportNumber,
        damagedQty: input.damagedQty ?? 0,
        status: report.status,
        timestamp: new Date().toISOString(),
      }),
    );

    return report;
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

  private async resolveBranchPurchaseItems(
    branchId: string,
    branchWarehouseId: string | null,
    items: any[],
  ) {
    if (!items.length) throw new BadRequestException('At least one product line is required');

    const resolvedProducts = [];
    for (const item of items) {
      const product = await this.ensureBranchProductFromCatalog(branchId, item.productId);
      resolvedProducts.push({ item, product });
    }

    const productIds = resolvedProducts.map(({ product }) => product.id);
    const branchBalances = branchWarehouseId
      ? await this.prisma.inventoryBalance.findMany({
          where: { warehouseId: branchWarehouseId, productId: { in: productIds } },
        })
      : [];
    const branchStockMap = new Map(branchBalances.map((balance) => [balance.productId, balance.quantity]));

    const assignedHqWarehouseId = await this.getBranchAssignedHqWarehouseId(branchId);
    const hqStockMap = assignedHqWarehouseId
      ? await this.inventoryService.getAvailableQuantityMap(
          null,
          assignedHqWarehouseId,
          resolvedProducts.map(({ product }) => ({ productId: product.id, sku: product.sku })),
          { branchId, skipAccessCheck: true },
        )
      : new Map<string, number>();

    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { code: true },
    });
    const hqBranch = await ensureHqCatalogBranch(this.prisma);

    return Promise.all(
      resolvedProducts.map(async ({ item, product }) => {
        const quantity = Number(item.quantity ?? 0);
        const catalogProduct = await this.prisma.product.findFirst({
          where: {
            sku: product.sku,
            branchId: hqBranch.id,
            deletedAt: null,
            isActive: true,
          },
          select: {
            wholesalePriceKgs: true,
            hqBranchWholesalePriceKgs: true,
          },
        });
        const priceSource = catalogProduct ?? product;
        const branchPurchasePriceKgs = resolveBranchPurchasePriceKgs(priceSource, branch?.code);

        return {
          productId: product.id,
          sku: product.sku,
          productName: product.name,
          quantity,
          unit: product.unit,
          currentBranchStock: branchStockMap.get(product.id) ?? 0,
          hqAvailableStock: hqStockMap.get(product.id) ?? 0,
          wholesalePriceKgs: branchPurchasePriceKgs,
          weightKg: Number(product.weightKg),
          transportExpenseAllocation: 0,
          estimatedUnitCost: branchPurchasePriceKgs,
          totalAmount: Math.round((branchPurchasePriceKgs * quantity + Number.EPSILON) * 100) / 100,
          note: item.note,
        };
      }),
    );
  }

  private async ensureBranchProductFromCatalog(branchId: string, catalogOrBranchProductId: string) {
    const direct = await this.prisma.product.findFirst({
      where: { id: catalogOrBranchProductId, branchId, deletedAt: null },
    });
    if (direct) return direct;

    const hqBranch = await ensureHqCatalogBranch(this.prisma);

    const catalogProduct = await this.prisma.product.findFirst({
      where: {
        id: catalogOrBranchProductId,
        branchId: hqBranch.id,
        deletedAt: null,
        isActive: true,
      },
    });
    if (!catalogProduct) {
      throw new NotFoundException(`Product not found: ${catalogOrBranchProductId}`);
    }

    const sku = catalogProduct.sku?.trim();
    if (sku) {
      const existingBySku = await this.prisma.product.findFirst({
        where: { branchId, sku },
        orderBy: [{ deletedAt: 'asc' }, { updatedAt: 'desc' }],
      });
      if (existingBySku) {
        if (existingBySku.deletedAt || !existingBySku.isActive) {
          return this.prisma.product.update({
            where: { id: existingBySku.id },
            data: {
              deletedAt: null,
              isActive: true,
              name: catalogProduct.name,
              barcode: catalogProduct.barcode,
              category: catalogProduct.category,
              categoryId: catalogProduct.categoryId,
              unit: catalogProduct.unit,
              weightKg: catalogProduct.weightKg,
            },
          });
        }
        return existingBySku;
      }
    }

    const branchWarehouse = await this.prisma.warehouse.findFirst({
      where: { branchId, warehouseType: 'BRANCH', isActive: true, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    if (!branchWarehouse) {
      throw new BadRequestException('No active branch warehouse found for product provisioning');
    }

    try {
      return await this.prisma.product.create({
        data: {
          branchId,
          warehouseId: branchWarehouse.id,
          categoryId: catalogProduct.categoryId,
          name: catalogProduct.name,
          sku: catalogProduct.sku,
          barcode: catalogProduct.barcode,
          category: catalogProduct.category,
          unit: catalogProduct.unit,
          weightKg: catalogProduct.weightKg,
          purchasePriceYuan: 0,
          latestYuanRate: 0,
          purchaseCostKgs: 0,
          transportCostKgs: 0,
          finalCostKgs: catalogProduct.wholesalePriceKgs,
          costPriceKgs: catalogProduct.wholesalePriceKgs,
          sellingPriceKgs: catalogProduct.sellingPriceKgs,
          wholesalePriceKgs: catalogProduct.sellingPriceKgs,
          hqBranchWholesalePriceKgs: catalogProduct.wholesalePriceKgs,
          recommendedRetailPriceKgs: catalogProduct.recommendedRetailPriceKgs,
          minimumSellingPriceKgs: catalogProduct.minimumSellingPriceKgs,
          pricingMode: catalogProduct.pricingMode,
          isActive: true,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        sku
      ) {
        const raced = await this.prisma.product.findFirst({
          where: { branchId, sku },
        });
        if (raced) {
          if (raced.deletedAt || !raced.isActive) {
            return this.prisma.product.update({
              where: { id: raced.id },
              data: { deletedAt: null, isActive: true },
            });
          }
          return raced;
        }
      }
      throw error;
    }
  }

  private async enrichBranchPurchaseRequestWithHqStock<
    T extends {
      branchId: string;
      assignedHqWarehouseId?: string | null;
      branch?: { assignedHqWarehouseId?: string | null } | null;
      items: Array<{
        id: string;
        productId: string;
        sku: string;
        quantity: number;
        approvedQuantity?: number | null;
        hqAvailableStock?: number | null;
      }>;
    },
  >(user: AuthUser, request: T) {
    const assignedHqWarehouseId =
      request.assignedHqWarehouseId ??
      request.branch?.assignedHqWarehouseId ??
      (await this.getBranchAssignedHqWarehouseId(request.branchId));
    if (!assignedHqWarehouseId) return request;

    const stockMap = await this.inventoryService.getAvailableQuantityMap(
      user,
      assignedHqWarehouseId,
      request.items.map((item) => ({ productId: item.productId, sku: item.sku })),
      { branchId: request.branchId },
    );

    return {
      ...request,
      items: request.items.map((item) => {
        const available = stockMap.get(item.productId) ?? 0;
        const approved = item.approvedQuantity ?? null;
        const missingQty =
          approved !== null ? Math.max(item.quantity - approved, 0) : Math.max(item.quantity - available, 0);
        return {
          ...item,
          hqAvailableStock: available,
          missingQty,
        };
      }),
    };
  }

  private async getBranchAssignedHqWarehouseId(branchId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, deletedAt: null },
      select: { assignedHqWarehouseId: true },
    });
    return branch?.assignedHqWarehouseId ?? null;
  }

  private async buildBranchPurchaseRequestVisibilityWhere(
    user: AuthUser,
  ): Promise<Prisma.BranchPurchaseRequestWhereInput> {
    if (!this.canViewAllBranchPurchaseRequests(user)) {
      return { branchId: user.branchId! };
    }

    if (!this.salesManagerAssignmentService.isHqSalesManagerScoped(user)) {
      return {};
    }

    const warehouseIds = await this.salesManagerAssignmentService.getActiveAssignedWarehouseIds(user.id);
    return this.salesManagerAssignmentService.buildAssignedRequestScope(warehouseIds) ?? { id: '__none__' };
  }

  private async resolveRequestAssignedHqWarehouseId(request: {
    assignedHqWarehouseId?: string | null;
    branchId: string;
    branch?: { assignedHqWarehouseId?: string | null } | null;
  }) {
    return (
      request.assignedHqWarehouseId ??
      request.branch?.assignedHqWarehouseId ??
      (await this.getBranchAssignedHqWarehouseId(request.branchId))
    );
  }

  private async assertBranchPurchaseRequestAccess(
    user: AuthUser,
    request: {
      id: string;
      branchId: string;
      assignedHqWarehouseId?: string | null;
      branch?: { assignedHqWarehouseId?: string | null } | null;
    },
  ) {
    if (!this.salesManagerAssignmentService.isHqSalesManagerScoped(user)) {
      return;
    }

    const warehouseId = await this.resolveRequestAssignedHqWarehouseId(request);
    const assignedIds = await this.salesManagerAssignmentService.getActiveAssignedWarehouseIds(user.id);
    if (!warehouseId || !assignedIds.includes(warehouseId)) {
      await this.auditBranchRequest(user, request.branchId, 'HQ_SALES_REQUEST_ACCESS_DENIED', 'BranchPurchaseRequest', request.id, {
        hqWarehouseId: warehouseId,
        requestId: request.id,
        branchId: request.branchId,
        assignedWarehouseIds: assignedIds,
      });
      throw new ForbiddenException({
        message: HQ_SALES_MANAGER_ACCESS_DENIED,
        messages: HQ_SALES_MANAGER_ACCESS_DENIED_MESSAGES,
      });
    }
  }

  private async requireBranchAssignedHqWarehouse(user: AuthUser, branchId: string) {
    const assignedHqWarehouseId = await this.getBranchAssignedHqWarehouseId(branchId);
    if (!assignedHqWarehouseId) {
      await this.auditBranchRequest(user, branchId, 'ROUTING_DENIED_NO_HQ_WAREHOUSE', 'Branch', branchId);
      await this.auditBranchRequest(user, branchId, 'ROUTING_DENIED_NO_ASSIGNED_WAREHOUSE', 'Branch', branchId);
      throw new BadRequestException(NO_HQ_WAREHOUSE_ASSIGNED_TO_BRANCH);
    }
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: assignedHqWarehouseId, ...activeHqWarehouseWhere },
    });
    if (!warehouse || !isHqWarehouse(warehouse)) {
      await this.auditBranchRequest(user, branchId, 'ROUTING_DENIED_INACTIVE_WAREHOUSE', 'Branch', branchId, {
        hqWarehouseId: assignedHqWarehouseId,
      });
      throw new BadRequestException(INACTIVE_HQ_WAREHOUSE);
    }
    return assignedHqWarehouseId;
  }

  private async resolveDefaultBranchWarehouseId(branchId: string) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { branchId, warehouseType: 'BRANCH', isActive: true, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    return warehouse?.id ?? null;
  }

  private auditBranchRequest(
    user: AuthUser,
    branchId: string | null,
    action: string,
    entity: string,
    entityId: string,
    extra?: Record<string, unknown>,
  ) {
    return this.prisma.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action,
        entity,
        entityId,
        metadata: {
          userId: user.id,
          role: user.role,
          branchId,
          roles: user.roles ?? [user.role],
          requestId: entity === 'BranchPurchaseRequest' ? entityId : undefined,
          timestamp: new Date().toISOString(),
          ...extra,
        } as Prisma.InputJsonValue,
      },
    });
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
