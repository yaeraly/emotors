import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  AlertType,
  BranchDistributionOrderStatus,
  BranchPurchaseRequestLineStatus,
  BranchPurchaseRequestStatus,
  BranchRequestIssueStatus,
  BranchRequestIssueType,
  BranchRequestLineRejectionReason,
  BranchRequestShortageStatus,
  BranchType,
  HqStockBookingReleaseReason,
  HqWarrantyDecision,
  PricingAppliedRuleType,
  Prisma,
  Product,
  ProcurementOrderStatus,
  ProcurementOrderItemStatus,
  ProcurementItemWeightStatus,
  ProcurementLandedCostStatus,
  ProcurementShortageReason,
  ReturnOrderStatus,
  ReturnResolution,
  Role,
  ShortageReportItemType,
  ShortageReportStatus,
  StockMovementType,
  SupplierClaimStatus,
  TransportExpenseType,
  WarehouseReleaseOrderStatus,
  WarehouseType,
  WarrantyClaimStatus,
} from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { InventoryService } from '../inventory/inventory.service';
import { HqStockBookingService } from '../inventory/hq-stock-booking.service';
import { addBookingHours, BRANCH_CONFIRMATION_BOOKING_HOURS } from '../inventory/hq-stock-booking.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationQueryDto } from '../notifications/dto/notification-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import {
  HQ_SALES_MANAGER_ACCESS_DENIED,
  HQ_SALES_MANAGER_ACCESS_DENIED_MESSAGES,
  HQ_WAREHOUSE_ACCESS_DENIED,
} from '../hq-warehouse/hq-warehouse-assignment.constants';
import { canCreateBranchHqOrder, canManageBranchPurchaseRequests, canManageOwnBranchProductRequest, canReceiveProcurementToHq, canViewProductCost, hasAnyFullAccessRole, hasAnyHqRole, isBranchOwnerUser, resolveUserRoles } from '../rbac/rbac';
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
  CARGO_WEIGHT_LESS_THAN_NET,
} from '../procurement/landed-cost.util';
import {
  buildHqReceivingValidationResult,
  buildHqReceivingBlockedMessages,
  HQ_RECEIVING_BLOCKED,
  validateHqReceivingInvoicePrerequisites,
} from '../procurement/hq-receiving-validation.util';
import {
  countCargoReceiptAttachmentsByOrderIds,
  countCargoReceiptAttachmentsForOrder,
  listCargoReceiptAttachmentsForOrder,
} from '../procurement/cargo-receipt-attachments.util';
import { LandedCostService } from '../procurement/landed-cost.service';
import {
  planProcurementReceiveInventoryReconciliation,
  sumReceiveMovementTotals,
} from '../procurement/procurement-receive-inventory-reconcile.util';
import { recomputeInventoryBalanceValuationInTx } from '../inventory/inventory-balance-valuation.repair';
import { deriveDisplayUnitCost, roundDisplayMoney, sumDisplayMoneyTotals } from '../pricing/product-cost-precision.util';
import {
  compareAuthoritativeCostTotals,
  BRANCH_ORDER_COST_MISMATCH_MESSAGE,
} from '../pricing/cost-reconciliation.util';
import { HqWarehouseAssignmentService } from '../hq-warehouse/hq-warehouse-assignment.service';
import { HqSalesManagerAssignmentService } from '../hq-warehouse/hq-sales-manager-assignment.service';
import { PricingResolutionService } from '../pricing/pricing-resolution.service';
import { BranchOrderPricingRevisionService } from '../pricing/branch-order-pricing-revision.service';
import { BranchPriceResolverService } from '../pricing/branch-price-resolver.service';
import { PricingFifoService } from '../pricing/pricing-fifo.service';
import {
  isSubmittedBranchPurchaseStatus,
  resolveBranchPurchasePriceKgs,
} from './branch-product-request.util';
import { toBranchPurchaseRequestItemCreate } from './branch-purchase-request-item.util';
import { buildDistributionLinesFromConfirmedRequestItems } from './branch-purchase-confirm.util';
import {
  resolveBranchPurchaseFifoLineCost,
  resolveEnrichedBranchPurchaseLineCost,
  sumBranchPurchaseLineProductCosts,
} from './branch-purchase-fifo-cost.util';
import {
  BRANCH_ESTIMATED_AMOUNT_MISMATCH_MESSAGE,
  compareEstimatedAmountToProductCost,
  resolveBranchPurchaseEstimatedAmountKgs,
  resolveBranchPurchaseLinePayableAmount,
  shouldTransferBranchPurchaseAtCost,
} from './branch-purchase-estimated-amount.util';
import {
  assertBranchPurchaseBranchContext,
  assertBranchPurchaseRequestItems,
} from './branch-purchase-request.validation';
import {
  buildChinaReceivingValidation,
  isChinaReceivingTaskVisible,
  isGoodsLeftYiwuStatus,
  resolveChinaReceivingListStatus,
} from './china-receiving.util';
import {
  buildChinaReceivingProgress,
  buildChinaReceivingSummaryFromBatches,
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
  presentBranchPurchaseRequestForUser,
} from './branch-purchase-request.presenter';
import {
  applyBranchPurchaseLineReviewInTx,
  completeBranchPurchaseRequestReviewInTx,
  recalculateBranchPurchaseRequestReviewTotalsInTx,
  resolveBranchPurchaseLineReviewAuditAction,
  type AppliedBranchPurchaseLineReview,
  type BranchPurchaseLineReviewContext,
} from './branch-purchase-line-review.apply';
import { assertBranchPurchaseLineReviewEditable } from './branch-purchase-line-review-editable.util';
import {
  deriveRequestStatusFromLines,
  type LineReviewAction,
  type LineReviewInput,
} from './branch-request-review.util';
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
  private readonly logger = new Logger(OperationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly hqStockBookingService: HqStockBookingService,
    private readonly notificationsService: NotificationsService,
    private readonly assignmentService: HqWarehouseAssignmentService,
    private readonly salesManagerAssignmentService: HqSalesManagerAssignmentService,
    private readonly distributionService: DistributionService,
    private readonly landedCostService: LandedCostService,
    private readonly pricingResolution: PricingResolutionService,
    private readonly pricingFifoService: PricingFifoService,
    private readonly branchPriceResolver: BranchPriceResolverService,
    private readonly branchOrderPricingRevision: BranchOrderPricingRevisionService,
  ) {}

  async branchPurchaseRequests(user: AuthUser) {
    if (
      !this.canViewAllBranchPurchaseRequests(user) &&
      !canManageOwnBranchProductRequest(user) &&
      !this.hasAnyRole(user, [Role.FRANCHISE_OWNER])
    ) {
      throw new ForbiddenException('У вас нет доступа к заказам филиалов');
    }
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
            branchType: true,
            assignedHqWarehouseId: true,
            assignedHqWarehouse: { select: { id: true, name: true, code: true, city: true, isActive: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    const hideSensitive = isBranchOnlyRequestUser(user, this.canViewAllBranchPurchaseRequests(user));
    const hideFinancialCost = !canViewProductCost(user);
    const presentedRows = await Promise.all(
      rows.map(async (row) => {
        const transferAtCost = shouldTransferBranchPurchaseAtCost(row.branch?.branchType);
        const needsAtCostRefresh =
          transferAtCost && row.status === BranchPurchaseRequestStatus.DRAFT;
        const enriched =
          !hideSensitive || needsAtCostRefresh
            ? await this.enrichBranchPurchaseRequestWithHqStock(user, row)
            : row;
        return presentBranchPurchaseRequestForUser(enriched, { hideSensitive, hideFinancialCost });
      }),
    );
    return presentedRows;
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
            branchType: true,
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
        requestNumber: request.requestNumber,
      });
      await this.auditBranchRequest(user, request.branchId, 'HQ_SALES_BRANCH_ORDER_OPENED', 'BranchPurchaseRequest', request.id, {
        hqWarehouseId,
        requestId: request.id,
        branchId: request.branchId,
        requestNumber: request.requestNumber,
      });
    }
    const canViewAll = this.canViewAllBranchPurchaseRequests(user);
    const hideSensitive = isBranchOnlyRequestUser(user, canViewAll);
    const hideFinancialCost = !canViewProductCost(user);
    const transferAtCost = shouldTransferBranchPurchaseAtCost(request.branch?.branchType);
    let enriched: typeof request & {
      authoritativeTransferCostKgs?: number;
      convertedOrderNumber?: string;
      totalProductCostKgs?: number;
      hqStockStatus?: 'loaded' | 'unavailable';
    } =
      !hideSensitive || transferAtCost
        ? await this.enrichBranchPurchaseRequestWithHqStock(user, request)
        : request;
    if (request.convertedOrderId) {
      const linkedOrder = await this.prisma.branchDistributionOrder.findFirst({
        where: { id: request.convertedOrderId, deletedAt: null },
        select: { orderNumber: true },
      });
      if (linkedOrder) {
        enriched = {
          ...enriched,
          convertedOrderNumber: linkedOrder.orderNumber,
        };
      }
    }
    return presentBranchPurchaseRequestForUser(enriched, { hideSensitive, hideFinancialCost });
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

    const baseProducts = catalogProducts.map((catalogProduct) => ({
      id: catalogProduct.id,
      catalogProductId: catalogProduct.id,
      name: catalogProduct.name,
      sku: catalogProduct.sku,
      barcode: catalogProduct.barcode,
      category: catalogProduct.category,
      productCode: catalogProduct.productCategory?.code ?? null,
      unit: catalogProduct.unit,
      branchPurchasePriceKgs: null as number | null,
      hasPricingPolicy: false,
      pricingPending: true,
    }));

    if (!resolvedBranchId) {
      return baseProducts;
    }

    await this.pricingFifoService.syncFifoBatchesFromHqStockMovements();
    const pricingRevision = this.branchOrderPricingRevision.current();
    const enriched = await this.enrichBranchProductOptionsWithPricing(resolvedBranchId, baseProducts);
    return enriched.map((product) => ({ ...product, pricingRevision }));
  }

  async branchProductPrices(
    user: AuthUser,
    branchId: string,
    productIds: string[],
    quantities?: number[],
  ) {
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

    const quantityByProductId = new Map<string, number>();
    productIds.forEach((productId, index) => {
      if (!productId) return;
      const qty = quantities?.[index];
      if (qty != null && qty > 0) {
        quantityByProductId.set(productId, qty);
      }
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
        sku: true,
      },
    });

    await this.pricingFifoService.syncFifoBatchesFromHqStockMovements();
    const branch = await this.prisma.branch.findFirst({
      where: { id: resolvedBranchId, deletedAt: null },
      select: { branchType: true, hqToBranchMarkupPercent: true, assignedHqWarehouseId: true },
    });
    const assignedHqWarehouseId =
      branch?.assignedHqWarehouseId ?? (await this.getBranchAssignedHqWarehouseId(resolvedBranchId));

    const entries = await Promise.all(
      catalogProducts.map(async (product) => {
        const pricing = await this.resolveBranchRequestProductPricing(
          resolvedBranchId,
          product.id,
        );
        const quantity = quantityByProductId.get(product.id) ?? 0;
        let lineTotalKgs: number | null = null;
        let estimatedLineProductCostKgs = 0;
        if (assignedHqWarehouseId && quantity > 0) {
          const fifoCost = await resolveBranchPurchaseFifoLineCost(this.pricingFifoService, this.prisma, {
            productId: product.id,
            warehouseId: assignedHqWarehouseId,
            quantity,
            branchType: branch?.branchType,
            hqToBranchMarkupPercent: Number(branch?.hqToBranchMarkupPercent ?? 0),
            fallbackUnitCost: pricing.costPriceSnapshot ?? 0,
            fallbackUnitPrice: pricing.branchPurchasePriceKgs ?? 0,
          });
          if (fifoCost.allocatedQty > 0) {
            estimatedLineProductCostKgs = fifoCost.estimatedLineProductCostKgs;
          }
          const payable = resolveBranchPurchaseLinePayableAmount({
            branchType: branch?.branchType,
            quantity,
            estimatedLineProductCostKgs,
            unitPriceKgs: pricing.branchPurchasePriceKgs,
            hasPricingPolicy: pricing.hasPricingPolicy,
          });
          // HQ at-cost: omit lineTotal when FIFO is unavailable so clients keep prior authoritative totals
          // instead of rebuilding from rounded unit × qty (914369.08-style drift).
          lineTotalKgs =
            shouldTransferBranchPurchaseAtCost(branch?.branchType) && payable <= 0 ? null : payable;
        }
        return [
          product.id,
          canViewProductCost(user)
            ? {
                branchPriceKgs: pricing.branchPurchasePriceKgs,
                finalBranchPriceKgs: pricing.branchPurchasePriceKgs,
                finalBranchPrice: pricing.branchPurchasePriceKgs,
                costPriceKgs: pricing.costPriceSnapshot,
                markupPercent: pricing.markupSnapshot,
                markupAmount: pricing.markupAmountSnapshot,
                pricingPolicyVersionId: pricing.pricingPolicyVersionId,
                branchPriceProfileId: pricing.pricingProfileId,
                pricingSource: pricing.pricingSource,
                hasPricingPolicy: pricing.hasPricingPolicy,
                priceConfigured: pricing.priceConfigured,
                priceMissingReason: pricing.priceMissingReason,
                pricingRevision: this.branchOrderPricingRevision.current(),
                quantity: quantity > 0 ? quantity : undefined,
                lineTotalKgs,
                transferLineCostKgs: shouldTransferBranchPurchaseAtCost(branch?.branchType)
                  ? lineTotalKgs
                  : undefined,
              }
            : {
                branchPriceKgs: pricing.branchPurchasePriceKgs,
                finalBranchPriceKgs: pricing.branchPurchasePriceKgs,
                finalBranchPrice: pricing.branchPurchasePriceKgs,
                pricingPolicyVersionId: pricing.pricingPolicyVersionId,
                branchPriceProfileId: pricing.pricingProfileId,
                pricingSource: pricing.pricingSource,
                hasPricingPolicy: pricing.hasPricingPolicy,
                priceConfigured: pricing.priceConfigured,
                priceMissingReason: pricing.priceMissingReason,
                pricingRevision: this.branchOrderPricingRevision.current(),
                quantity: quantity > 0 ? quantity : undefined,
                lineTotalKgs,
                transferLineCostKgs: shouldTransferBranchPurchaseAtCost(branch?.branchType)
                  ? lineTotalKgs
                  : undefined,
              },
        ] as const;
      }),
    );

    return Object.fromEntries(entries);
  }

  async createBranchPurchaseRequest(user: AuthUser, dto: any) {
    if (!canManageOwnBranchProductRequest(user)) {
      await this.auditBranchRequest(user, user.branchId, 'BRANCH_ORDER_CREATE_DENIED', 'BranchPurchaseRequest', 'create');
      throw new ForbiddenException('Only Branch Manager can create HQ product requests');
    }
    const branchId = this.assertBranchPurchaseBranchContext(user, dto.branchId);
    if (dto.assignedHqWarehouseId || dto.sourceWarehouseId) {
      throw new BadRequestException(MANUAL_HQ_WAREHOUSE_SELECTION_FORBIDDEN);
    }
    this.assertBranchPurchaseRequestItems(dto.items);
    const branchWarehouseId = dto.branchWarehouseId ?? (await this.resolveDefaultBranchWarehouseId(branchId));
    const resolvedItems = await this.resolveBranchPurchaseItems(branchId, branchWarehouseId, dto.items ?? []);
    const itemCreates = resolvedItems.map((item) => toBranchPurchaseRequestItemCreate(item));
    const status =
      dto.status === BranchPurchaseRequestStatus.DRAFT
        ? BranchPurchaseRequestStatus.DRAFT
        : BranchPurchaseRequestStatus.SUBMITTED_TO_HQ;
    const assignedHqWarehouseId =
      status === BranchPurchaseRequestStatus.DRAFT
        ? (await this.getBranchAssignedHqWarehouseId(branchId))
        : await this.requireBranchAssignedHqWarehouse(user, branchId);
    const totalQuantity = resolvedItems.reduce((sum, item) => sum + item.quantity, 0);
    const createBranch = await this.prisma.branch.findFirst({
      where: { id: branchId, deletedAt: null },
      select: { branchType: true },
    });
    const totalProductCostOnCreate = sumDisplayMoneyTotals(
      resolvedItems.map((item) => Number(item.estimatedLineProductCostKgs ?? 0)),
    );
    const totalEstimatedAmount = resolveBranchPurchaseEstimatedAmountKgs({
      branchType: createBranch?.branchType,
      totalProductCostKgs: totalProductCostOnCreate,
      storedEstimatedAmountKgs: sumDisplayMoneyTotals(
        resolvedItems.map((item) => Number(item.totalAmount ?? 0)),
      ),
    });

    const request = await this.prisma.$transaction(async (tx) => {
      await this.hqStockBookingService.expireOverdueBookingsInTx(tx, user);

      const created = await tx.branchPurchaseRequest.create({
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
          transportNotes: null,
          totalQuantity,
          totalEstimatedAmount,
          items: { create: itemCreates },
        },
        include: { items: true, createdBy: { select: { id: true, fullName: true, role: true } } },
      });

      if (status === BranchPurchaseRequestStatus.SUBMITTED_TO_HQ && assignedHqWarehouseId) {
        const bookingResults = await this.hqStockBookingService.createBookingsForRequestSubmit(tx, user, {
          requestId: created.id,
          branchId,
          warehouseId: assignedHqWarehouseId,
          lines: created.items.map((item) => ({
            requestLineId: item.id,
            productId: item.productId,
            sku: item.sku,
            requestedQuantity: item.quantity,
          })),
        });
        const bookingExpiresAt = bookingResults.find((row) => row.expiresAt)?.expiresAt ?? null;
        await tx.branchPurchaseRequest.update({
          where: { id: created.id },
          data: { bookingExpiresAt },
        });
        for (const result of bookingResults) {
          if (!result.bookingId) continue;
          await this.auditInTx(tx, user, branchId, 'HQ_STOCK_BOOKING_CREATED', 'HqStockBooking', result.bookingId, {
            requestId: created.id,
            requestLineId: result.requestLineId,
            bookedQuantity: result.bookedQuantity,
          });
        }

        return tx.branchPurchaseRequest.findFirstOrThrow({
          where: { id: created.id },
          include: { items: true, createdBy: { select: { id: true, fullName: true, role: true } } },
        });
      }

      return created;
    });

    await this.auditBranchRequest(user, branchId, 'BRANCH_PRODUCT_REQUEST_CREATED', 'BranchPurchaseRequest', request.id);
    await this.auditBranchRequest(user, branchId, 'BRANCH_ORDER_CREATED', 'BranchPurchaseRequest', request.id);
    for (const item of request.items) {
      await this.auditBranchRequest(user, branchId, 'BRANCH_PRODUCT_REQUEST_ITEM_ADDED', 'BranchPurchaseRequest', request.id, {
        productId: item.productId,
        quantity: item.quantity,
      });
      await this.auditBranchRequest(user, branchId, 'BRANCH_REQUEST_ITEM_LINKED_TO_PRODUCT', 'BranchPurchaseRequestItem', item.id, {
        requestId: request.id,
        requestLineId: item.id,
        productId: item.productId,
        productCode: item.sku,
      });
      if (item.hasPricingPolicyAtSubmit) {
        await this.auditBranchRequest(user, branchId, 'BRANCH_PRODUCT_REQUEST_PRICE_RESOLVED', 'BranchPurchaseRequest', request.id, {
          requestId: request.id,
          requestLineId: item.id,
          productId: item.productId,
          branchId,
          pricingPolicyVersionId: item.pricingPolicyVersionId,
          pricingProfileId: item.pricingProfileId,
          resolvedBranchPriceKgs: item.resolvedBranchPriceKgs,
          quantity: item.quantity,
          lineTotalKgs: item.totalAmount,
          timestamp: new Date().toISOString(),
        });
      }
    }
    if (status === BranchPurchaseRequestStatus.SUBMITTED_TO_HQ) {
      this.logger.log({
        message: 'BRANCH_REQUEST_SUBMITTED',
        requestId: request.id,
        branchId,
        hqWarehouseId: assignedHqWarehouseId,
        userId: user.id,
        lines: request.items.map((item) => ({
          requestLineId: item.id,
          productId: item.productId,
          productCode: item.sku,
          requestedQuantity: item.quantity,
          bookedQuantity: item.bookedQuantity,
          physicalQuantity: item.hqPhysicalStock,
        })),
      });
      await this.auditBranchRequest(user, branchId, 'BRANCH_REQUEST_SUBMITTED', 'BranchPurchaseRequest', request.id, {
        hqWarehouseId: assignedHqWarehouseId,
      });
      await this.auditBranchRequest(user, branchId, 'BRANCH_PRODUCT_REQUEST_SUBMITTED', 'BranchPurchaseRequest', request.id);
      await this.auditBranchRequest(user, branchId, 'BRANCH_ORDER_SUBMITTED', 'BranchPurchaseRequest', request.id);
      await this.auditBranchRequest(user, branchId, 'HQ_ORDER_SUBMITTED', 'BranchPurchaseRequest', request.id);
      await this.notifyHqSalesBranchRequestSubmitted(user, request);
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
    const itemCreates = resolvedItems?.map((item) => toBranchPurchaseRequestItemCreate(item));
    const totalQuantity = resolvedItems?.reduce((sum, item) => sum + item.quantity, 0);
    const updateBranch = await this.prisma.branch.findFirst({
      where: { id: existing.branchId, deletedAt: null },
      select: { branchType: true },
    });
    const totalEstimatedAmount = resolvedItems
      ? resolveBranchPurchaseEstimatedAmountKgs({
          branchType: updateBranch?.branchType,
          totalProductCostKgs: sumDisplayMoneyTotals(
            resolvedItems.map((item) => Number(item.estimatedLineProductCostKgs ?? 0)),
          ),
          storedEstimatedAmountKgs: sumDisplayMoneyTotals(
            resolvedItems.map((item) => Number(item.totalAmount ?? 0)),
          ),
        })
      : undefined;

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
        ...(resolvedItems && itemCreates
          ? {
              totalQuantity,
              totalEstimatedAmount,
              items: {
                deleteMany: {},
                create: itemCreates,
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

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.hqStockBookingService.expireOverdueBookingsInTx(tx, user);
      await tx.branchPurchaseRequestItem.updateMany({
        where: { requestId: id },
        data: { lineStatus: BranchPurchaseRequestLineStatus.PENDING_REVIEW },
      });

      const requestWithItems = await tx.branchPurchaseRequest.findFirstOrThrow({
        where: { id },
        include: { items: true },
      });

      const bookingResults = await this.hqStockBookingService.createBookingsForRequestSubmit(tx, user, {
        requestId: id,
        branchId: existing.branchId,
        warehouseId: assignedHqWarehouseId,
        lines: requestWithItems.items.map((item) => ({
          requestLineId: item.id,
          productId: item.productId,
          sku: item.sku,
          requestedQuantity: item.quantity,
        })),
      });

      const bookingExpiresAt = bookingResults.find((row) => row.expiresAt)?.expiresAt ?? null;

      const request = await tx.branchPurchaseRequest.update({
        where: { id },
        data: {
          status: BranchPurchaseRequestStatus.SUBMITTED_TO_HQ,
          assignedHqWarehouseId,
          bookingExpiresAt,
        },
        include: { items: true, createdBy: { select: { id: true, fullName: true, role: true } } },
      });

      for (const result of bookingResults) {
        if (!result.bookingId) continue;
        await this.auditInTx(tx, user, existing.branchId, 'HQ_STOCK_BOOKING_CREATED', 'HqStockBooking', result.bookingId, {
          requestId: id,
          requestLineId: result.requestLineId,
          bookedQuantity: result.bookedQuantity,
          hqPhysicalStock: result.hqPhysicalStock,
          hqAvailableStock: result.hqAvailableStock,
        });
      }

      return request;
    });

    await this.auditBranchRequest(user, updated.branchId, 'BRANCH_REQUEST_SUBMITTED', 'BranchPurchaseRequest', id, {
      hqWarehouseId: assignedHqWarehouseId,
    });
    await this.auditBranchRequest(user, updated.branchId, 'BRANCH_PRODUCT_REQUEST_SUBMITTED', 'BranchPurchaseRequest', id);
    await this.auditBranchRequest(user, updated.branchId, 'BRANCH_ORDER_SUBMITTED', 'BranchPurchaseRequest', id);
    await this.auditBranchRequest(user, updated.branchId, 'HQ_ORDER_SUBMITTED', 'BranchPurchaseRequest', id);
    await this.notifyHqSalesBranchRequestSubmitted(user, updated);
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

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.hqStockBookingService.releaseAllForRequestInTx(
        tx,
        user,
        id,
        HqStockBookingReleaseReason.CANCELLED,
      );
      return tx.branchPurchaseRequest.update({
        where: { id },
        data: { status: BranchPurchaseRequestStatus.CANCELLED },
        include: { items: true },
      });
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
        branch: { select: { id: true, name: true, assignedHqWarehouseId: true } },
        createdBy: { select: { id: true, fullName: true, role: true } },
      },
    });
    if (!existing) throw new NotFoundException('Branch purchase request not found');
    await this.assertBranchPurchaseRequestAccess(user, existing);
    if (!isSubmittedBranchPurchaseStatus(existing.status)) {
      throw new BadRequestException('Only submitted requests can be reviewed');
    }

    if (status === BranchPurchaseRequestStatus.REJECTED) {
      const updated = await this.prisma.$transaction(async (tx) => {
        await this.hqStockBookingService.releaseAllForRequestInTx(
          tx,
          user,
          id,
          HqStockBookingReleaseReason.HQ_SALES_REJECTED,
        );
        for (const item of existing.items) {
          await tx.branchPurchaseRequestItem.update({
            where: { id: item.id },
            data: {
              lineStatus: BranchPurchaseRequestLineStatus.REJECTED,
              approvedQuantity: 0,
              unavailableQuantity: item.quantity,
              rejectionReasonCode: BranchRequestLineRejectionReason.OTHER,
              publicComment: dto?.publicComment?.trim() || 'Заявка отклонена',
              bookedQuantity: 0,
              bookingExpiresAt: null,
            },
          });
        }
        return tx.branchPurchaseRequest.update({
          where: { id },
          data: { status, reviewedById: user.id, reviewedAt: new Date(), bookingExpiresAt: null },
          include: { items: true, createdBy: { select: { id: true, fullName: true, role: true } } },
        });
      });
      await this.auditBranchRequest(user, updated.branchId, 'BRANCH_REQUEST_REVIEW_SUBMITTED', 'BranchPurchaseRequest', id);
      await this.auditBranchRequest(user, updated.branchId, 'BRANCH_PRODUCT_REQUEST_REJECTED', 'BranchPurchaseRequest', id);
      await this.notifyBranchSalesReviewOutcome(user, updated);
      return this.presentBranchPurchaseRequestResponse(user, updated);
    }

    return this.submitBranchPurchaseRequestReview(user, id, dto);
  }

  async submitBranchPurchaseRequestReview(user: AuthUser, id: string, dto?: any) {
    if (!canManageBranchPurchaseRequests(user)) throw new ForbiddenException('Forbidden resource');

    const existing = await this.prisma.branchPurchaseRequest.findFirst({
      where: { id, deletedAt: null },
      include: {
        items: true,
        branch: { select: { id: true, name: true, assignedHqWarehouseId: true } },
        createdBy: { select: { id: true, fullName: true, role: true } },
      },
    });
    if (!existing) throw new NotFoundException('Branch purchase request not found');
    await this.assertBranchPurchaseRequestAccess(user, existing);
    if (!isSubmittedBranchPurchaseStatus(existing.status)) {
      throw new BadRequestException('Only submitted requests can be reviewed');
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
    const bookedMap = await this.hqStockBookingService.getActiveBookedQuantityByLine(existing.id);
    const physicalStockMap = await this.getHqPhysicalStockMap(
      assignedHqWarehouseId,
      existing.items.map((item) => ({ productId: item.productId, sku: item.sku })),
    );
    const activeBookings = await this.prisma.hqStockBooking.findMany({
      where: {
        requestId: existing.id,
        status: { in: ['ACTIVE', 'CONFIRMED'] },
      },
      select: { id: true, requestLineId: true },
    });
    const bookingIdByLine = new Map(activeBookings.map((row) => [row.requestLineId, row.id]));
    const branchConfirmationExpiresAt = addBookingHours(new Date(), BRANCH_CONFIRMATION_BOOKING_HOURS);
    const pricingAvailability = await this.resolveBranchRequestPricingAvailability(
      existing.branchId,
      existing.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        sku: item.sku,
        resolvedBranchPriceKgs: item.resolvedBranchPriceKgs,
        hasPricingPolicyAtSubmit: item.hasPricingPolicyAtSubmit,
      })),
    );

    const reviewInputs = this.normalizeLineReviewInputs(dto, existing.items);
    if (reviewInputs.length !== existing.items.length) {
      throw new BadRequestException('Every request line must have a review decision');
    }

    const lineReviewDeps = {
      hqStockBookingService: this.hqStockBookingService,
      pricingFifoService: this.pricingFifoService,
      auditInTx: this.auditInTx.bind(this),
    };
    const lineReviewContext: BranchPurchaseLineReviewContext = {
      requestId: existing.id,
      branchId: existing.branchId,
      assignedHqWarehouseId,
      stockMap,
      bookedMap,
      physicalStockMap,
      bookingIdByLine,
      pricingAvailability,
      branchConfirmationExpiresAt,
    };

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.hqStockBookingService.expireOverdueBookingsInTx(tx, user);
      await this.pricingFifoService.syncFifoBatchesFromHqStockMovements(tx);
      const reviewBranch = await tx.branch.findFirst({
        where: { id: existing.branchId, deletedAt: null },
        select: { branchType: true, hqToBranchMarkupPercent: true },
      });
      const resolvedLines: AppliedBranchPurchaseLineReview[] = [];

      for (const item of existing.items) {
        const input = reviewInputs.find((row) => row.id === item.id);
        if (!input) {
          throw new BadRequestException(`Missing review decision for line ${item.sku}`);
        }

        const line = await this.applyBranchPurchaseLineReviewWithIssues(
          tx,
          user,
          existing,
          item,
          input,
          lineReviewContext,
          reviewBranch,
          lineReviewDeps,
        );
        resolvedLines.push(line);
      }

      const { request } = await completeBranchPurchaseRequestReviewInTx(
        tx,
        user,
        id,
        existing.branchId,
        assignedHqWarehouseId,
        resolvedLines,
        this.auditInTx.bind(this),
      );

      for (const line of resolvedLines) {
        const item = existing.items.find((row) => row.id === line.itemId);
        if (!item) continue;
        await this.recordBranchPurchaseLineReviewAudits(tx, user, existing, item, line, assignedHqWarehouseId);
      }

      await this.auditInTx(tx, user, existing.branchId, 'BRANCH_REQUEST_REVIEW_SUBMITTED', 'BranchPurchaseRequest', id, {
        requestId: id,
        branchId: existing.branchId,
        reviewedById: user.id,
        timestamp: new Date().toISOString(),
      });

      return request;
    });

    await this.auditBranchRequest(user, updated.branchId, 'HQ_SALES_REQUEST_REVIEWED', 'BranchPurchaseRequest', id, {
      oldValue: existing.status,
      newValue: updated.status,
    });
    await this.auditBranchRequest(user, updated.branchId, 'BRANCH_PRODUCT_REQUEST_REVIEWED', 'BranchPurchaseRequest', id, {
      oldValue: existing.status,
      newValue: updated.status,
    });

    await this.notifyBranchSalesReviewOutcome(user, updated);

    return this.presentBranchPurchaseRequestResponse(user, updated);
  }

  async reviewBranchPurchaseRequestItem(
    user: AuthUser,
    requestId: string,
    itemId: string,
    dto: {
      action?: LineReviewAction;
      approvedQuantity?: number;
      publicComment?: string;
    },
  ) {
    if (!canManageBranchPurchaseRequests(user)) throw new ForbiddenException('Forbidden resource');

    const existing = await this.prisma.branchPurchaseRequest.findFirst({
      where: { id: requestId, deletedAt: null },
      include: {
        items: true,
        branch: { select: { id: true, name: true, assignedHqWarehouseId: true } },
        createdBy: { select: { id: true, fullName: true, role: true } },
      },
    });
    if (!existing) throw new NotFoundException('Branch purchase request not found');
    await this.assertBranchPurchaseRequestAccess(user, existing);
    try {
      assertBranchPurchaseLineReviewEditable(existing);
    } catch {
      throw new ConflictException(
        'Нельзя изменить решение: заказ уже передан на следующий необратимый этап.',
      );
    }

    const item = existing.items.find((row) => row.id === itemId);
    if (!item) throw new NotFoundException('Branch purchase request line not found');

    const input: LineReviewInput = {
      id: item.id,
      action: (String(dto?.action ?? 'APPROVE').toUpperCase() as LineReviewAction) || 'APPROVE',
      approvedQuantity: dto?.approvedQuantity !== undefined ? Number(dto.approvedQuantity) : undefined,
      publicComment: typeof dto?.publicComment === 'string' ? dto.publicComment : undefined,
    };

    if (input.approvedQuantity !== undefined && !Number.isFinite(input.approvedQuantity)) {
      throw new BadRequestException('Утверждённое количество должно быть числом');
    }

    const assignedHqWarehouseId =
      existing.assignedHqWarehouseId ?? (await this.getBranchAssignedHqWarehouseId(existing.branchId));
    if (!assignedHqWarehouseId) {
      throw new BadRequestException(NO_HQ_WAREHOUSE_ASSIGNED_TO_BRANCH);
    }

    const stockMap = await this.inventoryService.getAvailableQuantityMap(
      user,
      assignedHqWarehouseId,
      [{ productId: item.productId, sku: item.sku }],
      { branchId: existing.branchId },
    );
    const bookedMap = await this.hqStockBookingService.getActiveBookedQuantityByLine(existing.id);
    const physicalStockMap = await this.getHqPhysicalStockMap(
      assignedHqWarehouseId,
      [{ productId: item.productId, sku: item.sku }],
    );
    const activeBookings = await this.prisma.hqStockBooking.findMany({
      where: {
        requestId: existing.id,
        status: { in: ['ACTIVE', 'CONFIRMED'] },
      },
      select: { id: true, requestLineId: true },
    });
    const bookingIdByLine = new Map(activeBookings.map((row) => [row.requestLineId, row.id]));
    const branchConfirmationExpiresAt = addBookingHours(new Date(), BRANCH_CONFIRMATION_BOOKING_HOURS);
    const pricingAvailability = await this.resolveBranchRequestPricingAvailability(
      existing.branchId,
      [
        {
          id: item.id,
          productId: item.productId,
          sku: item.sku,
          resolvedBranchPriceKgs: item.resolvedBranchPriceKgs,
          hasPricingPolicyAtSubmit: item.hasPricingPolicyAtSubmit,
        },
      ],
    );

    const lineReviewDeps = {
      hqStockBookingService: this.hqStockBookingService,
      pricingFifoService: this.pricingFifoService,
      auditInTx: this.auditInTx.bind(this),
    };
    const lineReviewContext: BranchPurchaseLineReviewContext = {
      requestId: existing.id,
      branchId: existing.branchId,
      assignedHqWarehouseId,
      stockMap,
      bookedMap,
      physicalStockMap,
      bookingIdByLine,
      pricingAvailability,
      branchConfirmationExpiresAt,
    };

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.hqStockBookingService.expireOverdueBookingsInTx(tx, user);
      await this.pricingFifoService.syncFifoBatchesFromHqStockMovements(tx);
      const reviewBranch = await tx.branch.findFirst({
        where: { id: existing.branchId, deletedAt: null },
        select: { branchType: true, hqToBranchMarkupPercent: true },
      });

      const line = await this.applyBranchPurchaseLineReviewWithIssues(
        tx,
        user,
        existing,
        item,
        input,
        lineReviewContext,
        reviewBranch,
        lineReviewDeps,
      );

      if (!line.unchanged) {
        await this.recordBranchPurchaseLineReviewAudits(
          tx,
          user,
          existing,
          item,
          line,
          assignedHqWarehouseId,
          {
            previousLineStatus: item.lineStatus,
            previousApprovedQuantity: item.approvedQuantity,
          },
        );
        await recalculateBranchPurchaseRequestReviewTotalsInTx(tx, existing.id, existing.branchId);
      }

      return tx.branchPurchaseRequest.findFirstOrThrow({
        where: { id: requestId },
        include: {
          items: true,
          createdBy: { select: { id: true, fullName: true, role: true } },
          branch: { select: { id: true, name: true } },
          assignedHqWarehouse: { select: { id: true, name: true } },
        },
      });
    });

    return this.presentBranchPurchaseRequestResponse(user, updated);
  }

  private async applyBranchPurchaseLineReviewWithIssues(
    tx: PrismaTx,
    user: AuthUser,
    existing: {
      id: string;
      requestNumber: string;
      branchId: string;
      createdAt: Date;
      branch?: { name?: string | null } | null;
      assignedHqWarehouse?: { name?: string | null } | null;
    },
    item: {
      id: string;
      productId: string;
      sku: string;
      productName: string;
      quantity: number;
      bookedQuantity: number | null;
      hqPhysicalStock: number | null;
      estimatedUnitCost: Prisma.Decimal | number | null;
      resolvedBranchPriceKgs: Prisma.Decimal | number | null;
      lineStatus: BranchPurchaseRequestLineStatus;
      approvedQuantity: number | null;
      unavailableQuantity: number | null;
      rejectionReasonCode: BranchRequestLineRejectionReason | null;
      publicComment: string | null;
    },
    input: LineReviewInput,
    context: BranchPurchaseLineReviewContext,
    reviewBranch: { branchType: BranchType | null; hqToBranchMarkupPercent: Prisma.Decimal | number | null } | null,
    deps: {
      hqStockBookingService: HqStockBookingService;
      pricingFifoService: PricingFifoService;
      auditInTx: typeof OperationsService.prototype.auditInTx;
    },
  ): Promise<AppliedBranchPurchaseLineReview> {
    const hasPricingPolicy = context.pricingAvailability.get(item.id) ?? false;
    if (!hasPricingPolicy && (input.action === 'APPROVE' || input.action === 'PARTIAL')) {
      const branchName = existing.branch?.name ?? 'филиал';
      await this.upsertBranchRequestIssueInTx(tx, user, {
        issueType: BranchRequestIssueType.NO_PRICING_POLICY,
        request: existing,
        item,
        availableQuantity:
          (context.stockMap.get(item.productId) ?? 0) +
          (context.bookedMap.get(item.id) ?? item.bookedQuantity ?? 0),
        unavailableQuantity: item.quantity,
        publicComment: 'Для товара не настроена цена для филиала.',
        hqWarehouseId: context.assignedHqWarehouseId,
        alertType: AlertType.BRANCH_REQUEST_NO_PRICING_POLICY,
        alertTitle: 'Требуется ценовая политика',
        alertMessage: `Филиал '${branchName}' заказал товар, для которого отсутствует ценовая политика.`,
      });
      await this.auditInTx(tx, user, existing.branchId, 'BRANCH_ORDER_PRICING_MISSING', 'BranchPurchaseRequestItem', item.id, {
        requestId: existing.id,
        productId: item.productId,
        requestedQuantity: item.quantity,
      });
      throw new BadRequestException('Для товара не настроена цена для филиала.');
    }

    try {
      return await applyBranchPurchaseLineReviewInTx(tx, user, deps, item, input, context, reviewBranch);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.startsWith('APPROVED_QUANTITY_EXCEEDS_AVAILABLE:')) {
          throw new BadRequestException(
            `На складе HQ недостаточно товара для утверждения указанного количества (${item.sku})`,
          );
        }
        if (error.message.startsWith('PUBLIC_COMMENT_REQUIRED:')) {
          throw new BadRequestException(`A public comment is required for line ${item.sku}`);
        }
        if (error.message === 'APPROVED_QUANTITY_EXCEEDS_REQUESTED') {
          throw new BadRequestException(
            `Утверждаемое количество не может превышать запрошенное (${item.sku})`,
          );
        }
        if (error.message === 'APPROVED_QUANTITY_REQUIRED') {
          throw new BadRequestException('Укажите количество для утверждения.');
        }
        if (error.message === 'INVALID_APPROVED_QUANTITY') {
          throw new BadRequestException('Утверждённое количество должно быть числом');
        }
      }
      if (error instanceof BadRequestException) {
        const message = error.message ?? '';
        if (message.includes('изменилось') || message.includes('истекла')) {
          throw new ConflictException('Данные заказа изменились. Обновите страницу и повторите проверку.');
        }
        throw error;
      }
      throw error;
    }
  }

  private async recordBranchPurchaseLineReviewAudits(
    tx: PrismaTx,
    user: AuthUser,
    existing: { id: string; branchId: string },
    item: { id: string; productId: string; quantity: number; productName: string; sku: string },
    line: AppliedBranchPurchaseLineReview,
    assignedHqWarehouseId: string,
    previous?: {
      previousLineStatus?: BranchPurchaseRequestLineStatus | null;
      previousApprovedQuantity?: number | null;
    },
  ) {
    const request = await tx.branchPurchaseRequest.findFirst({
      where: { id: existing.id },
      include: { branch: { select: { name: true } } },
    });

    if (line.notifyCeoNoPricingPolicy) {
      const branchName = request?.branch?.name ?? 'филиал';
      await this.upsertBranchRequestIssueInTx(tx, user, {
        issueType: BranchRequestIssueType.NO_PRICING_POLICY,
        request: {
          id: existing.id,
          requestNumber: request?.requestNumber ?? existing.id,
          branchId: existing.branchId,
          createdAt: request?.createdAt ?? new Date(),
          branch: request?.branch,
        },
        item,
        availableQuantity: line.generalAvailable + line.bookedQuantity,
        unavailableQuantity: line.unavailableQuantity,
        publicComment: line.publicComment,
        hqWarehouseId: assignedHqWarehouseId,
        alertType: AlertType.BRANCH_REQUEST_NO_PRICING_POLICY,
        alertTitle: 'Требуется ценовая политика',
        alertMessage: `Филиал '${branchName}' заказал товар, для которого отсутствует ценовая политика.`,
      });
      await this.auditInTx(tx, user, existing.branchId, 'BRANCH_ORDER_PRICING_MISSING', 'BranchPurchaseRequestItem', item.id, {
        requestId: existing.id,
        productId: item.productId,
        requestedQuantity: item.quantity,
      });
    }

    if (line.notifyCeoOutOfStock) {
      const branchName = request?.branch?.name ?? 'филиал';
      await this.upsertBranchRequestIssueInTx(tx, user, {
        issueType: BranchRequestIssueType.OUT_OF_STOCK,
        request: {
          id: existing.id,
          requestNumber: request?.requestNumber ?? existing.id,
          branchId: existing.branchId,
          createdAt: request?.createdAt ?? new Date(),
          branch: request?.branch,
        },
        item,
        availableQuantity: line.generalAvailable + line.bookedQuantity,
        unavailableQuantity: line.unavailableQuantity || item.quantity,
        publicComment: line.publicComment,
        hqWarehouseId: assignedHqWarehouseId,
        alertType: AlertType.BRANCH_REQUEST_OUT_OF_STOCK,
        alertTitle: 'Товара недостаточно на складе HQ',
        alertMessage: `Филиал '${branchName}' заказал товар, но на складе HQ недостаточно остатков.`,
      });
    }

    if (line.unavailableQuantity > 0 && line.approvedQuantity > 0) {
      await this.auditInTx(tx, user, existing.branchId, 'BRANCH_ORDER_STOCK_SHORTAGE_DETECTED', 'BranchPurchaseRequestItem', item.id, {
        requestId: existing.id,
        productId: item.productId,
        requestedQuantity: item.quantity,
        availableQuantity: line.generalAvailable + line.bookedQuantity,
        approvedQuantity: line.approvedQuantity,
        shortageQuantity: line.unavailableQuantity,
      });
    }

    const auditAction = resolveBranchPurchaseLineReviewAuditAction({
      previousLineStatus: previous?.previousLineStatus,
      previousApprovedQuantity: previous?.previousApprovedQuantity,
      nextLineStatus: line.lineStatus,
      nextApprovedQuantity: line.approvedQuantity,
    });
    await this.auditInTx(tx, user, existing.branchId, auditAction, 'BranchPurchaseRequestItem', item.id, {
      orderId: existing.id,
      requestId: existing.id,
      requestLineId: item.id,
      itemId: item.id,
      branchId: existing.branchId,
      productId: item.productId,
      requestedQuantity: item.quantity,
      bookedQuantity: line.bookedQuantity,
      availableQuantity: line.generalAvailable + line.bookedQuantity,
      oldApprovedQty: previous?.previousApprovedQuantity ?? 0,
      newApprovedQty: line.approvedQuantity,
      oldStatus: previous?.previousLineStatus ?? BranchPurchaseRequestLineStatus.PENDING_REVIEW,
      newStatus: line.lineStatus,
      approvedQuantity: line.approvedQuantity,
      unavailableQuantity: line.unavailableQuantity,
      reasonCode: line.rejectionReasonCode,
      publicComment: line.publicComment,
      actorUserId: user.id,
      createdById: user.id,
      timestamp: new Date().toISOString(),
    });
  }

  async confirmBranchPurchaseRequest(user: AuthUser, id: string) {
    if (!canManageOwnBranchProductRequest(user)) {
      throw new ForbiddenException('Only Branch Sales Manager can confirm HQ-approved orders');
    }

    const existing = await this.prisma.branchPurchaseRequest.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(this.canViewAllBranchPurchaseRequests(user) ? {} : { branchId: user.branchId }),
      },
      include: {
        items: true,
        branch: { select: { id: true, name: true, assignedHqWarehouseId: true } },
      },
    });
    if (!existing) throw new NotFoundException('Order not found');
    if (!this.canViewAllBranchPurchaseRequests(user) && existing.branchId !== user.branchId) {
      throw new ForbiddenException('Order does not belong to your branch');
    }
    if (!existing.reviewedAt || !existing.reviewedById) {
      throw new BadRequestException('Order has not been reviewed by HQ Sales');
    }
    if (existing.status !== BranchPurchaseRequestStatus.PENDING_BRANCH_CONFIRMATION) {
      throw new ConflictException('Order cannot be confirmed in its current status');
    }
    if (existing.convertedOrderId) {
      throw new ConflictException('Order already confirmed and linked to distribution');
    }

    const hasApprovedLines = existing.items.some((item) => (item.approvedQuantity ?? 0) > 0);
    if (!hasApprovedLines) {
      throw new BadRequestException('Order has no approved items');
    }

    const assignedHqWarehouseId =
      existing.assignedHqWarehouseId ?? (await this.getBranchAssignedHqWarehouseId(existing.branchId));
    if (!assignedHqWarehouseId) {
      throw new BadRequestException(NO_HQ_WAREHOUSE_ASSIGNED_TO_BRANCH);
    }

    const destinationWarehouse = await this.prisma.warehouse.findFirst({
      where: {
        deletedAt: null,
        isActive: true,
        warehouseType: 'BRANCH',
        branchId: existing.branchId,
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!destinationWarehouse) {
      throw new BadRequestException('No active branch warehouse found for this branch');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await this.hqStockBookingService.expireOverdueBookingsInTx(tx, user);
      const branch = await tx.branch.findFirst({
        where: { id: existing.branchId, deletedAt: null },
        select: { branchType: true, hqToBranchMarkupPercent: true },
      });
      await this.pricingFifoService.syncFifoBatchesFromHqStockMovements();

      const productsById = new Map<string, Pick<Product, 'id' | 'sku' | 'name' | 'finalCostKgs'>>();
      const fifoLineCosts: number[] = [];
      const itemsWithFifoCosts = [];

      for (const item of existing.items) {
        const approvedQuantity = item.approvedQuantity ?? 0;
        if (approvedQuantity <= 0) {
          itemsWithFifoCosts.push(item);
          continue;
        }

        const product = await tx.product.findFirst({
          where: { id: item.productId, deletedAt: null },
        });
        if (!product) throw new NotFoundException(`Product not found: ${item.productId}`);
        productsById.set(product.id, product);

        const fifoCost = await resolveBranchPurchaseFifoLineCost(this.pricingFifoService, tx, {
          productId: item.productId,
          warehouseId: assignedHqWarehouseId,
          quantity: approvedQuantity,
          branchType: branch?.branchType,
          hqToBranchMarkupPercent: Number(branch?.hqToBranchMarkupPercent ?? 0),
          fallbackUnitCost: Number(item.estimatedUnitCost ?? 0),
          fallbackUnitPrice: Number(item.resolvedBranchPriceKgs ?? 0),
        });
        if (fifoCost.allocatedQty < approvedQuantity) {
          throw new BadRequestException(
            `Insufficient FIFO stock for SKU ${item.sku}. Requested: ${approvedQuantity} Available: ${fifoCost.allocatedQty}`,
          );
        }

        fifoLineCosts.push(fifoCost.estimatedLineProductCostKgs);
        const payableLineAmount = resolveBranchPurchaseLinePayableAmount({
          branchType: branch?.branchType,
          quantity: approvedQuantity,
          estimatedLineProductCostKgs: fifoCost.estimatedLineProductCostKgs,
          unitPriceKgs: Number(item.resolvedBranchPriceKgs ?? 0),
          hasPricingPolicy: true,
        });
        await tx.branchPurchaseRequestItem.update({
          where: { id: item.id },
          data: {
            estimatedLineProductCostKgs: fifoCost.estimatedLineProductCostKgs,
            estimatedUnitCost: fifoCost.estimatedUnitCost,
            totalAmount: payableLineAmount,
            approvedLineTotalKgs: payableLineAmount,
          },
        });
        itemsWithFifoCosts.push({
          ...item,
          estimatedLineProductCostKgs: fifoCost.estimatedLineProductCostKgs,
          estimatedUnitCost: fifoCost.estimatedUnitCost,
          totalAmount: payableLineAmount,
          approvedLineTotalKgs: payableLineAmount,
        });
      }

      const fifoOrderTotal = sumBranchPurchaseLineProductCosts(fifoLineCosts);
      if (shouldTransferBranchPurchaseAtCost(branch?.branchType)) {
        const storedEstimated = roundDisplayMoney(Number(existing.totalEstimatedAmount ?? 0));
        const estimatedParity = compareEstimatedAmountToProductCost(storedEstimated, fifoOrderTotal);
        if (!estimatedParity.ok) {
          await tx.branchPurchaseRequest.update({
            where: { id: existing.id },
            data: { totalEstimatedAmount: fifoOrderTotal },
          });
          await this.auditInTx(
            tx,
            user,
            existing.branchId,
            'COST_RECONCILIATION_REPAIRED',
            'BranchPurchaseRequest',
            existing.id,
            {
              requestNumber: existing.requestNumber,
              oldAmount: storedEstimated,
              correctedAmount: fifoOrderTotal,
              difference: estimatedParity.differenceKgs,
              reason: 'estimated_amount_aligned_to_fifo_product_cost',
              affectedItemIds: existing.items.map((item) => item.id),
            },
          );
        }
        const refreshedEstimated = resolveBranchPurchaseEstimatedAmountKgs({
          branchType: branch?.branchType,
          totalProductCostKgs: fifoOrderTotal,
          storedEstimatedAmountKgs: fifoOrderTotal,
        });
        const afterRepair = compareEstimatedAmountToProductCost(refreshedEstimated, fifoOrderTotal);
        if (!afterRepair.ok) {
          throw new BadRequestException({
            message: BRANCH_ESTIMATED_AMOUNT_MISMATCH_MESSAGE,
            branchPurchaseRequestId: existing.id,
            requestNumber: existing.requestNumber,
            expectedAmount: afterRepair.expectedKgs,
            actualAmount: afterRepair.actualKgs,
            difference: afterRepair.differenceKgs,
            affectedItemIds: existing.items.map((item) => item.id),
          });
        }
      }

      let builtLines;
      try {
        builtLines = buildDistributionLinesFromConfirmedRequestItems(
          itemsWithFifoCosts as typeof existing.items,
          productsById,
        );
      } catch (error) {
        if (error instanceof Error && error.message.includes('Approved price missing')) {
          throw new BadRequestException(error.message);
        }
        throw error;
      }
      if (!builtLines.length) {
        throw new BadRequestException('Order has no approved items');
      }

      const orderTransferTotal = sumDisplayMoneyTotals(builtLines.map((line) => line.totalCost));
      const reconciliation = compareAuthoritativeCostTotals(
        fifoOrderTotal,
        orderTransferTotal,
        'branch purchase confirm',
      );
      if (!reconciliation.ok) {
        this.logger.error({
          message: 'BRANCH_ORDER_COST_RECONCILIATION_FAILED',
          branchPurchaseRequestNumber: existing.requestNumber,
          warehouseId: assignedHqWarehouseId,
          expectedTotal: reconciliation.expectedKgs,
          actualTotal: reconciliation.actualKgs,
          differenceKgs: reconciliation.differenceKgs,
        });
        throw new BadRequestException(BRANCH_ORDER_COST_MISMATCH_MESSAGE);
      }

      const totalAmount = sumDisplayMoneyTotals(builtLines.map((line) => line.totalPrice));
      const totalCost = sumDisplayMoneyTotals(builtLines.map((line) => line.totalCost));

      const orderItems = builtLines.map((line) => ({
        productId: line.productId,
        sku: line.sku,
        productName: line.productName,
        quantity: line.quantity,
        unitCost: line.unitCost,
        unitPrice: line.unitPrice,
        totalCost: line.totalCost,
        totalPrice: line.totalPrice,
        profit: line.profit,
        pricingPolicyVersionId: line.pricingPolicyVersionId,
        pricingProfileId: line.pricingProfileId,
        resolvedPriceKgs: line.resolvedPriceKgs,
        baseCostKgs: line.baseCostKgs,
        baseBranchPriceKgs: line.baseBranchPriceKgs,
        appliedRuleType: line.appliedRuleType,
        appliedRuleId: line.appliedRuleId,
        appliedAdjustmentMode: line.appliedAdjustmentMode,
        appliedAdjustmentValue: line.appliedAdjustmentValue,
        priceResolvedAt: line.priceResolvedAt,
      }));

      const createdOrder = await tx.branchDistributionOrder.create({
        data: {
          orderNumber: `DO-${existing.requestNumber}`,
          branchId: existing.branchId,
          sourceWarehouseId: assignedHqWarehouseId,
          destinationWarehouseId: destinationWarehouse.id,
          status: BranchDistributionOrderStatus.DRAFT,
          createdById: user.id,
          note: existing.note,
          totalAmount,
          totalCost,
          totalProfit: roundDisplayMoney(totalAmount - totalCost),
          items: { create: orderItems },
        },
        include: { items: true },
      });

      await this.hqStockBookingService.linkBookingsToDistributionOrder(tx, existing.id, createdOrder.id);
      await this.hqStockBookingService.extendBookingsForBranchConfirmation(existing.id, tx);

      const request = await tx.branchPurchaseRequest.update({
        where: { id: existing.id },
        data: {
          status: BranchPurchaseRequestStatus.BRANCH_CONFIRMED,
          branchConfirmedAt: new Date(),
          convertedOrderId: createdOrder.id,
        },
        include: {
          items: true,
          createdBy: { select: { id: true, fullName: true, role: true } },
          branch: { select: { id: true, name: true } },
        },
      });

      await this.auditInTx(tx, user, existing.branchId, 'BRANCH_ORDER_CONFIRMED', 'BranchPurchaseRequest', existing.id, {
        distributionOrderId: createdOrder.id,
        workflowStage: 'WAITING_FOR_BRANCH_ACCOUNTANT',
      });

      await this.notificationsService.notifyInTx(tx, user, {
        type: AlertType.BRANCH_ORDER_APPROVED,
        branchId: existing.branchId,
        entityType: 'BranchPurchaseRequest',
        entityId: existing.id,
        referenceNumber: existing.requestNumber,
        title: 'Филиал согласовал заказ',
        message: `Филиал согласовал заказ ${existing.requestNumber}. Требуется выставление счёта.`,
        recipientRoles: [Role.HQ_SALES_MANAGER],
      });
      await this.notificationsService.notifyInTx(tx, user, {
        type: AlertType.BRANCH_INVOICE_CREATED,
        branchId: existing.branchId,
        entityType: 'BranchPurchaseRequest',
        entityId: existing.id,
        referenceNumber: existing.requestNumber,
        title: 'Создайте счёт по заказу',
        message: `Заказ ${existing.requestNumber} согласован филиалом. Создайте счёт и передадите кассиру.`,
        recipientRoles: [Role.ACCOUNTANT],
      });

      return { request, createdOrder };
    });

    return result.request;
  }

  async declineBranchPurchaseRequest(user: AuthUser, id: string, dto?: { publicComment?: string }) {
    if (!canManageOwnBranchProductRequest(user)) {
      throw new ForbiddenException('Only Branch Sales Manager can decline HQ-approved orders');
    }

    const existing = await this.prisma.branchPurchaseRequest.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(this.canViewAllBranchPurchaseRequests(user) ? {} : { branchId: user.branchId }),
      },
      include: { items: true, createdBy: { select: { id: true, fullName: true, role: true } } },
    });
    if (!existing) throw new NotFoundException('Branch purchase request not found');
    if (existing.status !== BranchPurchaseRequestStatus.PENDING_BRANCH_CONFIRMATION) {
      throw new BadRequestException('Заказ не ожидает согласования филиалом');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.hqStockBookingService.releaseAllForRequestInTx(
        tx,
        user,
        id,
        HqStockBookingReleaseReason.BRANCH_DECLINED,
      );
      return tx.branchPurchaseRequest.update({
        where: { id },
        data: {
          status: BranchPurchaseRequestStatus.BRANCH_DECLINED,
          branchDeclinedAt: new Date(),
          bookingExpiresAt: null,
          note: dto?.publicComment?.trim() || existing.note,
        },
        include: { items: true, createdBy: { select: { id: true, fullName: true, role: true } } },
      });
    });

    await this.auditBranchRequest(user, updated.branchId, 'BRANCH_ORDER_DECLINED', 'BranchPurchaseRequest', id);
    await this.notificationsService.notify(user, {
      type: AlertType.BRANCH_ORDER_REJECTED,
      branchId: existing.branchId,
      entityType: 'BranchPurchaseRequest',
      entityId: id,
      referenceNumber: existing.requestNumber,
      title: 'Филиал отклонил заказ',
      message: `Филиал отказался от согласования заказа ${existing.requestNumber}.`,
      recipientRoles: [Role.HQ_SALES_MANAGER],
    });

    return updated;
  }

  async markBranchRequestPaymentConfirmed(user: AuthUser, requestId: string) {
    const request = await this.prisma.branchPurchaseRequest.findFirst({
      where: { id: requestId, deletedAt: null },
    });
    if (!request?.convertedOrderId) return null;

    const order = await this.prisma.branchDistributionOrder.findFirst({
      where: { id: request.convertedOrderId, deletedAt: null },
      include: { branchInvoices: true },
    });
    const productInvoice = order?.branchInvoices?.find(
      (invoice) => !invoice.invoiceCategory || invoice.invoiceCategory === 'PRODUCT_ORDER',
    );
    if (!productInvoice || productInvoice.status !== 'PAID') return null;

    return this.prisma.$transaction(async (tx) => {
      await this.hqStockBookingService.extendBookingsAfterPayment(request.id, tx);
      const updated = await tx.branchPurchaseRequest.update({
        where: { id: request.id },
        data: {
          status: BranchPurchaseRequestStatus.READY_FOR_HQ_WAREHOUSE,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'BRANCH_ORDER_PAYMENT_CONFIRMED',
          entity: 'BranchPurchaseRequest',
          entityId: request.id,
          metadata: { roles: user.roles ?? [user.role] },
        },
      });
      return updated;
    });
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
    if (isBranchOwnerUser(user)) {
      throw new ForbiddenException('У вас нет прав создавать заказ на отправку');
    }
    if (!canManageBranchPurchaseRequests(user)) throw new ForbiddenException('Forbidden resource');
    return this.sendBranchRequestToHqWarehouse(user, id, dto);
  }

  async convertBranchPurchaseRequest(user: AuthUser, id: string, dto: any) {
    if (isBranchOwnerUser(user)) {
      throw new ForbiddenException('У вас нет прав создавать заказ на отправку');
    }
    if (dto?.sourceWarehouseId && !hasAnyFullAccessRole(resolveUserRoles(user))) {
      throw new BadRequestException(MANUAL_HQ_WAREHOUSE_SELECTION_FORBIDDEN);
    }
    return this.sendBranchRequestToHqWarehouse(user, id, dto);
  }

  private async sendBranchRequestToHqWarehouse(user: AuthUser, id: string, dto: any) {
    if (isBranchOwnerUser(user)) {
      throw new ForbiddenException('У вас нет прав создавать заказ на отправку');
    }
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
      request.status !== BranchPurchaseRequestStatus.READY_FOR_HQ_WAREHOUSE
    ) {
      throw new BadRequestException('Order must be financially cleared before HQ warehouse fulfillment');
    }

    const hasApprovedLines = request.items.some((item) => (item.approvedQuantity ?? 0) > 0);
    if (!hasApprovedLines) {
      throw new BadRequestException('No approved quantity available to send to HQ warehouse');
    }

    const assignedHqWarehouseId =
      request.assignedHqWarehouseId ?? (await this.getBranchAssignedHqWarehouseId(request.branchId));
    if (!assignedHqWarehouseId) {
      await this.auditBranchRequest(user, request.branchId, 'ROUTING_DENIED_NO_HQ_WAREHOUSE', 'BranchPurchaseRequest', id);
      await this.auditBranchRequest(user, request.branchId, 'ROUTING_DENIED_NO_ASSIGNED_WAREHOUSE', 'BranchPurchaseRequest', id);
      throw new BadRequestException(NO_HQ_WAREHOUSE_ASSIGNED_TO_BRANCH);
    }

    const managerAssignments = await this.prisma.hqWarehouseManagerAssignment.findMany({
      where: {
        warehouseId: assignedHqWarehouseId,
        status: 'ACTIVE',
      },
      orderBy: { assignedAt: 'asc' },
    });
    const assignedWarehouseManagerId = managerAssignments[0]?.userId;

    if (
      request.convertedOrderId &&
      request.status === BranchPurchaseRequestStatus.READY_FOR_HQ_WAREHOUSE
    ) {
      if (!assignedWarehouseManagerId && !dto.confirmNoManager && !hasAnyFullAccessRole(resolveUserRoles(user))) {
        throw new BadRequestException(NO_HQ_WAREHOUSE_MANAGER_ASSIGNED);
      }
      const approvedOrder = await this.distributionService.sendToWarehouse(user, request.convertedOrderId, {
        assignedWarehouseManagerId,
      });
      await this.prisma.branchPurchaseRequest.update({
        where: { id: request.id },
        data: { status: BranchPurchaseRequestStatus.SENT_TO_HQ_WAREHOUSE },
      });
      await this.auditBranchRequest(user, request.branchId, 'BRANCH_ORDER_READY_FOR_HQ_WAREHOUSE', 'BranchPurchaseRequest', request.id, {
        distributionOrderId: request.convertedOrderId,
      });
      return approvedOrder;
    }

    if (request.convertedOrderId) {
      throw new BadRequestException('Request has already been routed to HQ warehouse');
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

    if (!assignedWarehouseManagerId && !dto.confirmNoManager && !hasAnyFullAccessRole(resolveUserRoles(user))) {
      await this.auditBranchRequest(user, request.branchId, 'ROUTING_DENIED_NO_HQ_WAREHOUSE', 'BranchPurchaseRequest', id, {
        hqWarehouseId: assignedHqWarehouseId,
        reason: NO_HQ_WAREHOUSE_MANAGER_ASSIGNED,
      });
      throw new BadRequestException(NO_HQ_WAREHOUSE_MANAGER_ASSIGNED);
    }

    const order = await this.prisma.$transaction(async (tx) => {
      const branch = await tx.branch.findFirst({
        where: { id: request.branchId, deletedAt: null },
        select: { branchType: true, hqToBranchMarkupPercent: true },
      });
      await this.pricingFifoService.syncFifoBatchesFromHqStockMovements();

      const orderItems = [];
      const lineCosts: number[] = [];
      const linePrices: number[] = [];

      for (const item of request.items) {
        const quantity = item.approvedQuantity ?? item.quantity;
        if (quantity <= 0) continue;
        const product = await tx.product.findFirst({
          where: { id: item.productId, deletedAt: null },
        });
        if (!product) throw new NotFoundException(`Product not found: ${item.productId}`);

        const fifoCost = await resolveBranchPurchaseFifoLineCost(this.pricingFifoService, tx, {
          productId: item.productId,
          warehouseId: assignedHqWarehouseId,
          quantity,
          branchType: branch?.branchType,
          hqToBranchMarkupPercent: Number(branch?.hqToBranchMarkupPercent ?? 0),
          fallbackUnitCost: Number(item.estimatedUnitCost ?? product.finalCostKgs),
          fallbackUnitPrice: Number(item.resolvedBranchPriceKgs ?? product.sellingPriceKgs),
        });
        if (fifoCost.allocatedQty < quantity) {
          throw new BadRequestException(
            `Insufficient FIFO stock for SKU ${item.sku}. Requested: ${quantity} Available: ${fifoCost.allocatedQty}`,
          );
        }

        const unitCost = fifoCost.estimatedUnitCost;
        const unitPrice = Number(item.resolvedBranchPriceKgs ?? product.sellingPriceKgs);
        const lineCost = fifoCost.estimatedLineProductCostKgs;
        const linePrice =
          item.approvedLineTotalKgs != null
            ? roundDisplayMoney(Number(item.approvedLineTotalKgs))
            : roundDisplayMoney(unitPrice * quantity);
        lineCosts.push(lineCost);
        linePrices.push(linePrice);
        orderItems.push({
          productId: product.id,
          sku: product.sku,
          productName: product.name,
          quantity,
          unitCost,
          unitPrice,
          totalCost: lineCost,
          totalPrice: linePrice,
          profit: roundDisplayMoney(linePrice - lineCost),
        });
      }

      if (!orderItems.length) {
        throw new BadRequestException('No approved quantity available to send to HQ warehouse');
      }

      const totalAmount = sumDisplayMoneyTotals(linePrices);
      const totalCost = sumDisplayMoneyTotals(lineCosts);

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
          totalProfit: roundDisplayMoney(totalAmount - totalCost),
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
        message: `Заказ ${request.requestNumber} готов к сборке на складе HQ.`,
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

    const precheckOrder = await this.prisma.procurementOrder.findFirst({
      where: { id: procurementOrderId, deletedAt: null },
      include: {
        svhToHqTransport: true,
        transportExpenses: {
          select: {
            procurementOrderId: true,
            expenseType: true,
            amount: true,
            amountKgs: true,
            status: true,
          },
        },
      },
    });
    if (!precheckOrder) throw new NotFoundException('Procurement order not found');

    const invoiceGate = validateHqReceivingInvoicePrerequisites({
      procurementOrderId: precheckOrder.id,
      transportExpenses: precheckOrder.transportExpenses,
      supplier: {
        invoiceSentToAccountantAt: precheckOrder.invoiceSentToAccountantAt,
        supplierInvoiceNumber: precheckOrder.supplierInvoiceNumber,
        invoiceReviewStatus: precheckOrder.invoiceReviewStatus,
        supplierPaymentStatus: precheckOrder.supplierPaymentStatus,
      },
      chinaSectionTotal: Number(precheckOrder.chinaDomesticTransportKgs ?? 0),
      cargoSectionTotal: Number(precheckOrder.totalCargoCostKgs ?? 0),
      kyrgyzstanSectionTotal: Number(
        precheckOrder.localTransportKgs ?? precheckOrder.svhToHqTransport?.transportCostKgs ?? 0,
      ),
    });
    if (!invoiceGate.canReceiveToHq) {
      await this.auditReceivingBlocked(
        user,
        precheckOrder.id,
        precheckOrder.hqWarehouseId,
        invoiceGate,
      );
      throw new BadRequestException({
        message: HQ_RECEIVING_BLOCKED,
        messages: buildHqReceivingBlockedMessages(invoiceGate.blockingInvoices),
        blockingInvoices: invoiceGate.blockingInvoices.map((row) => ({
          requestType: row.requestType,
          displayName: row.displayName,
          state: row.state,
          status: row.status,
          accountantProcessed: row.accountantProcessed,
        })),
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.procurementOrder.findFirst({
        where: { id: procurementOrderId, deletedAt: null },
        include: {
          items: true,
          supplierPayments: true,
          svhToHqTransport: { include: { transportCompany: true } },
          landedCostSnapshots: { where: { isFinalized: false } },
          transportExpenses: {
            select: {
              procurementOrderId: true,
              expenseType: true,
              amount: true,
              amountKgs: true,
              paidAmountKgs: true,
              status: true,
            },
          },
        },
      });
      if (!order) throw new NotFoundException('Procurement order not found');
      if (order.hqStockMovementCreatedAt) {
        throw new BadRequestException('Procurement stock has already been received');
      }

      const txInvoiceGate = validateHqReceivingInvoicePrerequisites({
        procurementOrderId: order.id,
        transportExpenses: order.transportExpenses,
        supplier: {
          invoiceSentToAccountantAt: order.invoiceSentToAccountantAt,
          supplierInvoiceNumber: order.supplierInvoiceNumber,
          invoiceReviewStatus: order.invoiceReviewStatus,
          supplierPaymentStatus: order.supplierPaymentStatus,
        },
        chinaSectionTotal: Number(order.chinaDomesticTransportKgs ?? 0),
        cargoSectionTotal: Number(order.totalCargoCostKgs ?? 0),
        kyrgyzstanSectionTotal: Number(
          order.localTransportKgs ?? order.svhToHqTransport?.transportCostKgs ?? 0,
        ),
      });
      if (!txInvoiceGate.canReceiveToHq) {
        throw new BadRequestException({
          message: HQ_RECEIVING_BLOCKED,
          messages: buildHqReceivingBlockedMessages(txInvoiceGate.blockingInvoices),
          blockingInvoices: txInvoiceGate.blockingInvoices.map((row) => ({
            requestType: row.requestType,
            displayName: row.displayName,
            state: row.state,
            status: row.status,
            accountantProcessed: row.accountantProcessed,
          })),
        });
      }

      const activeItems = order.items.filter((item) => item.status === 'ACTIVE');
      const readiness = this.landedCostService.validateFinalReceivingReadiness({
        id: order.id,
        landedCostStatus: order.landedCostStatus,
        hqStockMovementCreatedAt: order.hqStockMovementCreatedAt,
        items: activeItems,
      });
      if (!readiness.ready) {
        if (readiness.errors.includes('LANDED_COST_PENDING_WEIGHT')) {
          throw new BadRequestException('LANDED_COST_PENDING_WEIGHT');
        }
        throw new BadRequestException(readiness.errors.join('; '));
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

      const cargoAttachmentCount = await countCargoReceiptAttachmentsForOrder(tx, order.id);

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
        procurementOrderId: order.id,
        transportExpenses: order.transportExpenses,
        supplier: {
          invoiceSentToAccountantAt: order.invoiceSentToAccountantAt,
          supplierInvoiceNumber: order.supplierInvoiceNumber,
          invoiceReviewStatus: order.invoiceReviewStatus,
          supplierPaymentStatus: order.supplierPaymentStatus,
        },
        chinaSectionTotal: Number(order.chinaDomesticTransportKgs ?? 0),
        cargoSectionTotal: Number(order.totalCargoCostKgs ?? 0),
        kyrgyzstanSectionTotal: Number(
          order.localTransportKgs ?? order.svhToHqTransport?.transportCostKgs ?? 0,
        ),
      });

      const validationResult = {
        procurementOrderId: order.id,
        cargoReceiptCompleted: validation.cargoReceiptCompleted,
        svhToHqTransportCompleted: validation.svhToHqTransportCompleted,
        cargoReceiptErrors: validation.cargoReceipt.errors,
        svhTransportErrors: validation.svhTransport.errors,
      };

      // Cargo Import Logistics form fill and SVH→HQ completion must not block HQ receiving.
      // Existing cargo receipt attachments (order / freight payment request) are recognized only.

      await this.auditInTx(tx, user, 'HQ', 'GOODS_RECEIVING_STARTED', 'ProcurementOrder', order.id, {
        userId: user.id,
        roles: user.roles ?? [user.role],
        warehouseId: order.hqWarehouseId,
        procurementOrderId: order.id,
        timestamp: new Date().toISOString(),
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
      const snapshotMap = new Map(
        (order.landedCostSnapshots ?? []).map((snapshot) => [snapshot.procurementOrderItemId, snapshot]),
      );
      const receivedItems = order.items
        .filter((item) => item.status === ProcurementOrderItemStatus.ACTIVE)
        .map((item) => {
        const draft = draftMap.get(item.id);
        const snapshot = snapshotMap.get(item.id);
        const received: any = receivedMap.get(item.id) ?? receivedMap.get(item.productId) ?? {};
        const receivedQuantity = draft
          ? draft.actualQuantity
          : Number(received.receivedQuantity ?? item.quantity);
        const damagedQuantity = draft ? draft.damagedQuantity : Number(received.damagedQuantity ?? 0);
        const note = draft?.note ?? received.note;
        const unitWeightKg =
          draft?.unitWeightKg != null
            ? Number(draft.unitWeightKg)
            : item.unitWeightKg != null
              ? Number(item.unitWeightKg)
              : Number(item.weightKg);
        return {
          ...item,
          unitWeightKg,
          weightStatus: draft?.weightStatus ?? item.weightStatus,
          receivedQuantity,
          damagedQuantity,
          difference: receivedQuantity - item.quantity,
          receivedNote: note,
          shortageReason: received.shortageReason,
          snapshotUnitLandedCostKgs: snapshot ? Number(snapshot.unitLandedCostKgs) : null,
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
        // Receiving workflow does not collect/require other expenses; preserve existing value.
        otherExpenseKgs: order.otherExpenseKgs,
        packagingCostKgs: dto.packagingCostKgs ?? order.packagingCostKgs,
      };

      // Persist receive-time logistics fields, then recalculate from confirmed expenses + order scalars.
      await tx.procurementOrder.update({
        where: { id: order.id },
        data: {
          cargoTotalWeightKg: mergedOrder.cargoTotalWeightKg,
          cargoRateUsdPerKg: mergedOrder.cargoRateUsdPerKg,
          defaultUsdRate: mergedOrder.defaultUsdRate,
          cargoCompany: mergedOrder.cargoCompany,
          cargoReceiptNumber: mergedOrder.cargoReceiptNumber,
          cargoReceiptDate: mergedOrder.cargoReceiptDate,
          cargoReceiptNote: mergedOrder.cargoReceiptNote,
          chinaDomesticTransportYuan: mergedOrder.chinaDomesticTransportYuan,
          chinaDomesticTransportKgs: mergedOrder.chinaDomesticTransportKgs,
          customsCostKgs: mergedOrder.customsCostKgs,
          insuranceCostKgs: mergedOrder.insuranceCostKgs,
          bankFeeCostKgs: mergedOrder.bankFeeCostKgs,
          otherExpenseKgs: mergedOrder.otherExpenseKgs,
          packagingCostKgs: mergedOrder.packagingCostKgs,
        },
      });

      for (const item of receivedItems) {
        await tx.procurementOrderItem.update({
          where: { id: item.id },
          data: {
            receivedQuantity: item.receivedQuantity,
            unitWeightKg: item.unitWeightKg,
            weightStatus: item.weightStatus,
          },
        });
      }

      let recalculated;
      let costOrder: Record<string, unknown>;
      try {
        const result = await this.landedCostService.recalculateProcurementOrder(
          order.id,
          {
            user,
            reason: 'hq_receive',
            triggerReason: 'hq_receive',
            useDraftQuantities: true,
          },
          tx,
        );
        if (result.skipped || !result.calculated || !result.order) {
          throw new BadRequestException(
            'Landed cost could not be calculated. Complete import cost sections first.',
          );
        }
        recalculated = result.calculated;
        costOrder = result.order as Record<string, unknown>;
      } catch (error) {
        if (error instanceof BadRequestException) throw error;
        if (error instanceof Error && error.message === CARGO_WEIGHT_LESS_THAN_NET) {
          throw new BadRequestException('Cargo total weight cannot be less than product net weight.');
        }
        throw new BadRequestException('Landed cost could not be calculated. Complete import cost sections first.');
      }
      if (recalculated.totalCostKgs <= 0) {
        throw new BadRequestException('Landed cost must be calculated before receiving to HQ warehouse.');
      }

      const cargo = {
        usdRate: Number(costOrder.defaultUsdRate ?? mergedOrder.defaultUsdRate ?? 0),
        cargoRateUsdPerKg: Number(costOrder.cargoRateUsdPerKg ?? mergedOrder.cargoRateUsdPerKg ?? 0),
        cargoTotalWeightKg: Number(costOrder.cargoTotalWeightKg ?? mergedOrder.cargoTotalWeightKg ?? 0) || null,
      };
      const resolvedLogistics = {
        chinaDomesticTransportKgs: Number(costOrder.chinaDomesticTransportKgs ?? 0),
        chinaExportTransportKgs: Number(costOrder.chinaExportTransportKgs ?? 0),
        localTransportKgs: Number(costOrder.localTransportKgs ?? 0),
        packagingCostKgs: Number(costOrder.packagingCostKgs ?? 0),
        customsCostKgs: Number(costOrder.customsCostKgs ?? 0),
        insuranceCostKgs: Number(costOrder.insuranceCostKgs ?? 0),
        bankFeeCostKgs: Number(costOrder.bankFeeCostKgs ?? 0),
        otherExpenseKgs: Number(costOrder.otherExpenseKgs ?? 0),
      };

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
      const batchDiscrepancyActIds: string[] = [];
      const receivedMovementSnapshots: Array<{
        movementId: string;
        productId: string;
        warehouseId: string;
        branchId: string;
        quantity: number;
        totalCostKgs: number;
      }> = [];
      let receivedLineCount = 0;
      let inventoryBatchCount = 0;

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
          receivedLineCount += 1;
          const allocatedLineLandedCostKgs = next.totalCostKgs;
          const movement = await this.inventoryService.createStockMovementInTx(tx, user, {
            productId: item.productId,
            warehouseId: hqWarehouseId,
            type: StockMovementType.IN,
            quantity: item.receivedQuantity,
            totalCostKgs: allocatedLineLandedCostKgs,
            referenceType: 'PROCUREMENT_GOODS_RECEIVING',
            referenceId: receiving.id,
            note: `Procurement receiving ${receiving.receivingNumber}`,
          });
          // Eager HQ FIFO layer per shipment (do not merge with older layers).
          await this.pricingFifoService.ensureBranchFifoBatchFromMovementInTx(tx, {
            id: movement.id,
            productId: movement.productId,
            warehouseId: movement.warehouseId,
            quantity: Math.abs(Number(movement.quantity)),
            unitCostKgs: Number(movement.unitCostKgs),
            totalCostKgs: Number(movement.totalCostKgs),
            createdAt: movement.createdAt,
            referenceType: movement.referenceType,
            referenceId: movement.referenceId,
          });
          const fifoLinked = await tx.fifoInventoryBatch.findFirst({
            where: { stockMovementId: movement.id },
            select: { id: true },
          });
          if (!fifoLinked) {
            throw new BadRequestException(
              `FIFO layer was not created for procurement receipt line ${item.sku} (movement ${movement.id})`,
            );
          }
          await this.auditInTx(tx, user, 'HQ', 'FIFO_LAYER_CREATED', 'StockMovement', movement.id, {
            productId: item.productId,
            inventoryLayerMovementId: movement.id,
            quantity: item.receivedQuantity,
            unitCost: Number(movement.unitCostKgs),
            totalLandedCostKgs: allocatedLineLandedCostKgs,
            receivingId: receiving.id,
            timestamp: new Date().toISOString(),
          });
          inventoryBatchCount += 1;
          receivedMovementSnapshots.push({
            movementId: movement.id,
            productId: item.productId,
            warehouseId: hqWarehouseId,
            branchId: movement.branchId,
            quantity: item.receivedQuantity,
            totalCostKgs: Number(movement.totalCostKgs),
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
                costPriceKgs: next.finalCostKgs,
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

      const reconciliationPlan = planProcurementReceiveInventoryReconciliation(
        receivedMovementSnapshots,
        recalculated.totalCostKgs,
      );
      for (const plan of reconciliationPlan) {
        if (plan.deltaKgs === 0) continue;

        await tx.stockMovement.update({
          where: { id: plan.movementId },
          data: {
            unitCostKgs: plan.reconciledUnitCostKgs,
            totalCostKgs: plan.reconciledTotalCostKgs,
          },
        });

        const fifoBatch = await tx.fifoInventoryBatch.findFirst({
          where: { stockMovementId: plan.movementId },
          select: { id: true },
        });
        if (fifoBatch) {
          const product = await tx.product.findFirst({
            where: { id: plan.productId, deletedAt: null },
            select: {
              wholesaleMarkupPercent: true,
              hqBranchWholesaleMarkupPercent: true,
              recommendedRetailMarkupPercent: true,
              minimumSellingMarkupPercent: true,
            },
          });
          const batchPrices = this.pricingFifoService.calculateBatchPrices(
            plan.reconciledUnitCostKgs,
            {
              wholesaleMarkupPercent: Number(product?.wholesaleMarkupPercent ?? 0),
              hqBranchWholesaleMarkupPercent: Number(product?.hqBranchWholesaleMarkupPercent ?? 0),
              recommendedRetailMarkupPercent: Number(product?.recommendedRetailMarkupPercent ?? 0),
              minimumSellingMarkupPercent: Number(product?.minimumSellingMarkupPercent ?? 0),
            },
          );
          await tx.fifoInventoryBatch.update({
            where: { id: fifoBatch.id },
            data: {
              unitCostKgs: plan.reconciledUnitCostKgs,
              wholesalePriceKgs: batchPrices.wholesalePriceKgs,
              hqBranchWholesalePriceKgs: batchPrices.hqBranchWholesalePriceKgs,
              recommendedRetailPriceKgs: batchPrices.recommendedRetailPriceKgs,
              minimumSellingPriceKgs: batchPrices.minimumSellingPriceKgs,
            },
          });
        }
      }

      const affectedBalances = new Map<
        string,
        { branchId: string; warehouseId: string; productId: string }
      >();
      for (const snap of receivedMovementSnapshots) {
        affectedBalances.set(`${snap.branchId}:${snap.warehouseId}:${snap.productId}`, {
          branchId: snap.branchId,
          warehouseId: snap.warehouseId,
          productId: snap.productId,
        });
      }
      for (const balanceKey of affectedBalances.values()) {
        await recomputeInventoryBalanceValuationInTx(tx, balanceKey);
      }

      const confirmedFullLandedCostKgs = roundDisplayMoney(recalculated.totalCostKgs);
      const allocatedInventoryValueKgs = sumReceiveMovementTotals(
        reconciliationPlan.map((row) => ({ totalCostKgs: row.reconciledTotalCostKgs })),
      );
      const differenceKgs = roundDisplayMoney(allocatedInventoryValueKgs - confirmedFullLandedCostKgs);
      if (differenceKgs !== 0) {
        this.logger.warn(
          `Inventory cost reconciliation failed. Purchase cost and created inventory value do not match. purchaseId=${order.id} purchaseTotal=${confirmedFullLandedCostKgs} inventoryTotal=${allocatedInventoryValueKgs} difference=${differenceKgs}`,
        );
        throw new BadRequestException(
          `Стоимость принятого товара не совпадает с подтверждённой полной себестоимостью. Разница: ${differenceKgs.toFixed(2)} сом`,
        );
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
        confirmedFullLandedCostKgs,
        allocatedInventoryValueKgs: allocatedInventoryValueKgs,
        differenceKgs,
        receivedLineCount,
        inventoryBatchCount,
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
      await this.auditInTx(tx, user, 'HQ', 'HQ_WAREHOUSE_RECEIPT_COMPLETED', 'ProcurementOrder', order.id, {
        userId: user.id,
        actorUserId: user.id,
        actorRole: user.role,
        roles: user.roles ?? [user.role],
        warehouseId: hqWarehouseId,
        procurementOrderId: order.id,
        shipmentId: order.id,
        receivingId: receiving.id,
        paymentStatus: order.supplierPaymentStatus,
        accountantProcessingStatus: 'PROCESSED',
        timestamp: new Date().toISOString(),
      });
      await this.auditUnpaidReceiving(tx, user, order, txInvoiceGate);
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
      await this.landedCostService.finalizeSnapshots(order.id, tx);
      await this.auditInTx(tx, user, 'HQ', 'LANDED_COST_FINALIZED', 'ProcurementOrder', order.id, {
        userId: user.id,
        procurementOrderId: order.id,
        receivingId: receiving.id,
        calculationVersion: order.landedCostCalculationVersion,
        timestamp: new Date().toISOString(),
      });
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
        transportExpenses: {
          select: {
            procurementOrderId: true,
            expenseType: true,
            amount: true,
            amountKgs: true,
            status: true,
          },
        },
      },
      orderBy: [{ hqStockMovementCreatedAt: 'asc' }, { actualArrivalDate: 'desc' }, { createdAt: 'desc' }],
    });

    const attachmentCountMap = await countCargoReceiptAttachmentsByOrderIds(
      this.prisma,
      orders.map((order) => order.id),
    );

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
        validation: wmOnlyView
        ? {
            canReceiveToHq: validation.canReceiveToHq,
            allExpensesProcessed: validation.allExpensesProcessed,
            invoicePrerequisites: validation.invoicePrerequisites,
          }
        : validation,
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

    const attachmentCount = await countCargoReceiptAttachmentsForOrder(this.prisma, order.id);

    const enriched = { ...order, cargoAttachmentCount: attachmentCount };
    const validation = buildChinaReceivingValidation(enriched);
    const roles = resolveUserRoles(user);
    const isScm = roles.includes(Role.SUPPLY_CHAIN_MANAGER) && !hasAnyFullAccessRole(roles);
    const isWm = canReceiveProcurementToHq(user);

    const isCompleted = Boolean(order.hqStockMovementCreatedAt);

    if (isCompleted) {
      await this.prisma.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'CHINA_RECEIVING_VIEW_OPENED',
          entity: 'ProcurementOrder',
          entityId: order.id,
          metadata: {
            userId: user.id,
            procurementOrderId: order.id,
            timestamp: new Date().toISOString(),
          },
        },
      });
    } else {
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
    }

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

    const differenceReportsForView = wmOnlyView && isCompleted
      ? await this.prisma.procurementDifferenceReport.findMany({
          where: { procurementOrderId: order.id, deletedAt: null },
          select: {
            id: true,
            reportNumber: true,
            receivingId: true,
            procurementOrderId: true,
            productId: true,
            productName: true,
            sku: true,
            type: true,
            status: true,
            expectedQuantity: true,
            receivedQuantity: true,
            differenceQuantity: true,
            damagedQuantity: true,
            shortageReason: true,
            note: true,
            createdAt: true,
          },
        })
      : (order.differenceReports ?? []);

    const [draftRows, editSession, cargoAttachments] = await Promise.all([
      isCompleted
        ? Promise.resolve([])
        : this.prisma.chinaReceivingDraftRow.findMany({
            where: { procurementOrderId: order.id, isArchived: false },
            include: { lastSavedBy: { select: { id: true, fullName: true } } },
            orderBy: { updatedAt: 'asc' },
          }),
      isCompleted
        ? Promise.resolve(null)
        : this.prisma.chinaReceivingEditSession.findFirst({
            where: { procurementOrderId: order.id },
            include: { lockedByUser: { select: { id: true, fullName: true } } },
          }),
      listCargoReceiptAttachmentsForOrder(this.prisma, order.id).then((rows) =>
        rows.map((row) => ({
          id: row.id,
          fileName: row.fileName,
          fileUrl: row.fileUrl,
          mimeType: row.mimeType,
        })),
      ),
    ]);

    if (draftRows.length > 0 && !isCompleted) {
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

    const receivedItemByProcurementId = new Map(
      (order.receivings ?? []).flatMap((batch) =>
        batch.items
          .filter((row) => row.procurementItemId)
          .map((row) => [row.procurementItemId as string, row]),
      ),
    );

    const lineItems = order.items.map((item) => {
      if (isCompleted) {
        const received = receivedItemByProcurementId.get(item.id);
        const actualQuantity = received?.receivedQuantity ?? item.receivedQuantity ?? 0;
        const damagedQuantity = received?.damagedQuantity ?? 0;
        return {
          id: item.id,
          productId: item.productId,
          sku: item.sku,
          productName: item.productName,
          ...this.mapChinaReceivingLineItemProductMeta(item),
          orderedQuantity: wmOnlyView ? undefined : item.quantity,
          expectedQuantity: item.quantity,
          actualReceivedQuantity: actualQuantity,
          damagedQuantity,
          unitWeightKg: item.unitWeightKg != null ? Number(item.unitWeightKg) : null,
          weightStatus: item.weightStatus,
          needsWeightEntry: false,
          note: null,
          isSaved: true,
          isChecked: true,
          lastSavedAt: null,
          updatedAt: null,
          lastSavedBy: null,
          rowStatus: resolveRowStatus(actualQuantity, item.quantity, damagedQuantity, true),
          difference: actualQuantity - item.quantity,
        };
      }

      const draft = draftRows.find((row) => row.procurementItemId === item.id);
      const hasSavedDraft = Boolean(draft?.isSaved);
      const actualQuantity = hasSavedDraft
        ? draft!.actualQuantity
        : (draft?.actualQuantity ?? item.receivedQuantity ?? item.quantity);
      const damagedQuantity = hasSavedDraft ? draft!.damagedQuantity : (draft?.damagedQuantity ?? 0);
      const isSaved = hasSavedDraft;
      const unitWeightKg =
        draft?.unitWeightKg != null
          ? Number(draft.unitWeightKg)
          : item.unitWeightKg != null
            ? Number(item.unitWeightKg)
            : Number(item.weightKg) > 0
              ? Number(item.weightKg)
              : null;
      const weightStatus = draft?.weightStatus ?? item.weightStatus;
      const needsWeightEntry = weightStatus === ProcurementItemWeightStatus.NOT_SET;
      return {
        id: item.id,
        productId: item.productId,
        sku: item.sku,
        productName: item.productName,
        ...this.mapChinaReceivingLineItemProductMeta(item),
        orderedQuantity: wmOnlyView ? undefined : item.quantity,
        expectedQuantity: item.quantity,
        actualReceivedQuantity: actualQuantity,
        damagedQuantity,
        unitWeightKg,
        weightStatus,
        needsWeightEntry,
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

    const progress = isCompleted
      ? (() => {
          const batchItems = (order.receivings ?? []).flatMap((batch) =>
            batch.items.map((row) => ({
              productId: row.productId,
              expectedQuantity: row.expectedQuantity,
              receivedQuantity: row.receivedQuantity,
              damagedQuantity: row.damagedQuantity,
            })),
          );
          const summary = buildChinaReceivingSummaryFromBatches(
            batchItems,
            differenceReportsForView.map((act) => ({ differenceType: act.type })),
          );
          return {
            products: summary.totalProducts,
            checked: summary.totalProducts,
            remaining: 0,
            saved: summary.totalProducts,
            unsaved: 0,
            progress: 100,
            expectedQty: summary.totalExpected,
            receivedQty: summary.totalReceived,
            shortage: summary.shortage,
            overage: summary.overage,
            damaged: summary.damaged,
          };
        })()
      : buildChinaReceivingProgress(
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

    const primaryReceiving = isCompleted ? ((order.receivings ?? [])[0] ?? null) : null;
    const receivedByUser =
      isCompleted && primaryReceiving?.receivedById
        ? await this.prisma.user.findUnique({
            where: { id: primaryReceiving.receivedById },
            select: { id: true, fullName: true },
          })
        : null;
    const batchItemsFlat = isCompleted
      ? (order.receivings ?? []).flatMap((batch) =>
          batch.items.map((row) => ({
            productId: row.productId,
            expectedQuantity: row.expectedQuantity,
            receivedQuantity: row.receivedQuantity,
            damagedQuantity: row.damagedQuantity,
          })),
        )
      : [];
    const receivingSummary = isCompleted
      ? {
          ...buildChinaReceivingSummaryFromBatches(
            batchItemsFlat,
            differenceReportsForView.map((act) => ({ differenceType: act.type })),
          ),
          receivedAt: (order.receivedToHqAt ?? primaryReceiving?.receivedAt ?? order.hqStockMovementCreatedAt)?.toISOString() ?? null,
          receivedBy: receivedByUser,
          status: resolveChinaReceivingListStatus(enriched),
        }
      : null;

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
      validation: wmOnlyView
        ? {
            canReceiveToHq: validation.canReceiveToHq,
            allExpensesProcessed: validation.allExpensesProcessed,
            invoicePrerequisites: validation.invoicePrerequisites,
          }
        : validation,
      canReceive: !order.hqStockMovementCreatedAt && isWm && !isScm,
      canMarkArrival:
        !order.hqStockMovementCreatedAt && isWm && !isScm && isGoodsLeftYiwuStatus(order.status),
      canCreateAct: isWm && !isScm && !order.hqStockMovementCreatedAt,
      canViewActs: isScm || hasAnyFullAccessRole(roles) || isWm,
      arrivalMarked: Boolean(order.actualArrivalDate),
      hqStockMovementCreatedAt: order.hqStockMovementCreatedAt,
      receivedToHqAt: order.receivedToHqAt,
      progress,
      receivingSummary,
      documents: isCompleted
        ? {
            photos: cargoAttachments,
            discrepancyActs: differenceReportsForView.map((act) => ({
              id: act.id,
              actNumber: act.reportNumber,
              differenceType: act.type,
              status: act.status,
            })),
          }
        : null,
      cargoAttachments,
      cargoAttachmentCount: cargoAttachments.length,
      editSession: activeSession,
      landedCostStatus: order.landedCostStatus,
      landedCostPendingWeight: order.landedCostStatus === ProcurementLandedCostStatus.PENDING_WEIGHT,
      draftRows: draftRows.map((row) => ({
        id: row.id,
        procurementItemId: row.procurementItemId,
        productId: row.productId,
        hqWarehouseId: row.hqWarehouseId,
        actualQuantity: row.actualQuantity,
        damagedQuantity: row.damagedQuantity,
        unitWeightKg: row.unitWeightKg != null ? Number(row.unitWeightKg) : null,
        weightStatus: row.weightStatus,
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
          damagedQuantity: row.damagedQuantity,
          differenceQuantity: row.differenceQuantity,
          difference: row.receivedQuantity - row.expectedQuantity,
        })),
        discrepancyActs: differenceReportsForView
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

    const weightProvided = dto.unitWeightKg != null && Number(dto.unitWeightKg) > 0;
    const nextWeightStatus = weightProvided
      ? ProcurementItemWeightStatus.CONFIRMED
      : existing?.weightStatus ?? orderItem.weightStatus;

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
        unitWeightKg: weightProvided ? dto.unitWeightKg : null,
        weightStatus: nextWeightStatus,
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
        unitWeightKg: weightProvided ? dto.unitWeightKg : undefined,
        weightStatus: weightProvided ? ProcurementItemWeightStatus.CONFIRMED : undefined,
        note: dto.note ?? null,
        isSaved: true,
        isChecked: true,
        lastSavedAt: new Date(),
        lastSavedById: user.id,
      },
      include: { lastSavedBy: { select: { id: true, fullName: true } } },
    });

    let productMasterWeightUpdated = false;
    let productMasterWeightMismatch = false;
    if (weightProvided) {
      const product = await this.prisma.product.findUnique({ where: { id: orderItem.productId } });
      const oldItemWeight = orderItem.unitWeightKg != null ? Number(orderItem.unitWeightKg) : null;
      await this.prisma.procurementOrderItem.update({
        where: { id: orderItem.id },
        data: {
          unitWeightKg: dto.unitWeightKg,
          weightKg: dto.unitWeightKg,
          netWeightKg: dto.unitWeightKg,
          weightStatus: ProcurementItemWeightStatus.CONFIRMED,
        },
      });
      await this.prisma.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'PRODUCT_WEIGHT_ENTERED_DURING_RECEIVING',
          entity: 'ProcurementOrderItem',
          entityId: orderItem.id,
          metadata: {
            userId: user.id,
            procurementOrderId: orderId,
            procurementOrderItemId: itemId,
            productId: orderItem.productId,
            oldWeight: oldItemWeight,
            newWeight: dto.unitWeightKg,
            timestamp: new Date().toISOString(),
          },
        },
      });
      await this.prisma.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'PRODUCT_WEIGHT_CONFIRMED',
          entity: 'ProcurementOrderItem',
          entityId: orderItem.id,
          metadata: {
            userId: user.id,
            procurementOrderId: orderId,
            productId: orderItem.productId,
            newWeight: dto.unitWeightKg,
            timestamp: new Date().toISOString(),
          },
        },
      });
      if (product) {
        const masterWeight = Number(product.weightKg ?? 0);
        if (masterWeight <= 0) {
          await this.prisma.product.update({
            where: { id: product.id },
            data: { weightKg: dto.unitWeightKg },
          });
          productMasterWeightUpdated = true;
          await this.prisma.auditLog.create({
            data: {
              userId: user.id,
              role: user.role,
              action: 'PRODUCT_MASTER_WEIGHT_UPDATED',
              entity: 'Product',
              entityId: product.id,
              metadata: {
                userId: user.id,
                productId: product.id,
                oldWeight: masterWeight,
                newWeight: dto.unitWeightKg,
                procurementOrderId: orderId,
                timestamp: new Date().toISOString(),
              },
            },
          });
        } else if (Math.abs(masterWeight - Number(dto.unitWeightKg)) > 0.001) {
          productMasterWeightMismatch = true;
        }
      }
      await this.landedCostService.recalculateProcurementOrder(orderId, {
        user,
        reason: 'Unit weight entered during China receiving',
        triggerReason: 'china_receiving_weight_saved',
        useDraftQuantities: true,
      });
    }

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
      unitWeightKg: saved.unitWeightKg != null ? Number(saved.unitWeightKg) : null,
      weightStatus: saved.weightStatus,
      productMasterWeightUpdated,
      productMasterWeightMismatch,
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
        items: {
          include: {
            product: {
              select: {
                barcode: true,
                categoryId: true,
                category: true,
                productCategory: {
                  select: { id: true, nameRu: true, nameKy: true, nameEn: true, code: true },
                },
              },
            },
          },
        },
        svhToHqTransport: wmView ? false : { include: { transportCompany: true } },
        differenceReports: wmView ? false : { where: { deletedAt: null } },
        receivings: {
          where: { deletedAt: null },
          include: { items: true },
        },
        transportExpenses: {
          select: {
            procurementOrderId: true,
            expenseType: true,
            amount: true,
            amountKgs: true,
            status: true,
          },
        },
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

  private mapChinaReceivingLineItemProductMeta(item: {
    product?: {
      barcode?: string | null;
      categoryId?: string;
      category?: string;
      productCategory?: {
        id: string;
        nameRu: string;
        nameKy: string;
        nameEn: string;
        code: string;
      } | null;
    } | null;
  }) {
    const product = item.product;
    const category = product?.productCategory;
    return {
      categoryId: product?.categoryId ?? '',
      categoryNameRu: category?.nameRu ?? product?.category ?? '',
      categoryNameKy: category?.nameKy ?? product?.category ?? '',
      categoryNameEn: category?.nameEn ?? product?.category ?? '',
      barcode: product?.barcode ?? null,
    };
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
    return this.listReservationsForUser(user);
  }

  private async listReservationsForUser(user: AuthUser) {
    const rows = await this.prisma.reservation.findMany({
      where: { deletedAt: null, ...(this.canAccessAllBranches(user) ? {} : { branchId: user.branchId }) },
      select: {
        id: true,
        reservationNumber: true,
        branchId: true,
        customerId: true,
        status: true,
        depositAmount: true,
        expiresAt: true,
        convertedSaleId: true,
        createdAt: true,
        items: {
          select: {
            id: true,
            productId: true,
            quantity: true,
            unitPrice: true,
            totalPrice: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const customerIds = [...new Set(rows.map((row) => row.customerId))];
    const customers = customerIds.length
      ? await this.prisma.customer.findMany({
          where: { id: { in: customerIds } },
          select: { id: true, fullName: true, phone: true },
        })
      : [];
    const customerById = new Map(customers.map((customer) => [customer.id, customer]));

    return rows.map((row) => {
      const totalAmount = row.items.reduce((sum, item) => sum + Number(item.totalPrice), 0);
      const totalUnits = row.items.reduce((sum, item) => sum + item.quantity, 0);
      return {
        ...row,
        depositAmount: Number(row.depositAmount),
        customer: customerById.get(row.customerId) ?? null,
        totalAmount,
        itemCount: row.items.length,
        totalUnits,
      };
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
    return this.listReturnsForUser(user);
  }

  private async listReturnsForUser(user: AuthUser) {
    const rows = await this.prisma.returnOrder.findMany({
      where: { deletedAt: null, ...(this.canAccessAllBranches(user) ? {} : { branchId: user.branchId }) },
      select: {
        id: true,
        returnNumber: true,
        branchId: true,
        customerId: true,
        saleId: true,
        status: true,
        reason: true,
        totalAmount: true,
        note: true,
        createdAt: true,
        items: {
          select: {
            id: true,
            quantity: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const customerIds = [...new Set(rows.map((row) => row.customerId))];
    const saleIds = [...new Set(rows.map((row) => row.saleId).filter((id): id is string => Boolean(id)))];
    const [customers, sales] = await Promise.all([
      customerIds.length
        ? this.prisma.customer.findMany({
            where: { id: { in: customerIds } },
            select: { id: true, fullName: true, phone: true },
          })
        : [],
      saleIds.length
        ? this.prisma.sale.findMany({
            where: { id: { in: saleIds } },
            select: { id: true, receiptNumber: true },
          })
        : [],
    ]);
    const customerById = new Map(customers.map((customer) => [customer.id, customer]));
    const saleById = new Map(sales.map((sale) => [sale.id, sale]));

    return rows.map((row) => {
      const totalUnits = row.items.reduce((sum, item) => sum + item.quantity, 0);
      return {
        ...row,
        totalAmount: Number(row.totalAmount),
        customer: customerById.get(row.customerId) ?? null,
        sale: row.saleId ? saleById.get(row.saleId) ?? null : null,
        itemCount: row.items.length,
        totalUnits,
      };
    });
  }

  async createReturn(user: AuthUser, dto: any) {
    const branchId = this.resolveBranchId(user, dto.branchId);
    const items = await this.resolveItems(dto.items ?? []);
    const totalAmount = items.reduce((sum, item) => sum + Number(item.quantity ?? 0) * Number(item.unitPrice ?? 0), 0);

    const snapshotItems = await Promise.all(
      items.map(async (item) => {
        const base = {
          productId: item.productId,
          sku: item.sku,
          productName: item.productName,
          quantity: Number(item.quantity ?? 0),
          unitPrice: Number(item.unitPrice ?? 0),
          condition: item.condition,
          defective: Boolean(item.defective),
        };
        try {
          const freeze = await this.pricingResolution.resolveWithFreeze(branchId, item.productId, {
            auditUser: user,
            auditEntity: 'ReturnOrderItem',
          });
          return {
            ...base,
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
          return base;
        }
      }),
    );

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
        items: { create: snapshotItems },
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

  private async auditUnpaidReceiving(
    tx: PrismaTx,
    user: AuthUser,
    order: {
      id: string;
      supplierPaymentStatus?: string | null;
      totalYuan?: unknown;
      totalPaidYuan?: unknown;
      remainingYuan?: unknown;
      transportExpenses?: Array<{
        expenseType: string;
        status: string;
        amount?: unknown;
        amountKgs?: unknown;
        paidAmountKgs?: unknown;
      }>;
    },
    gate: ReturnType<typeof validateHqReceivingInvoicePrerequisites>,
  ) {
    const supplierStatus = String(order.supplierPaymentStatus ?? 'UNPAID').toUpperCase();
    const supplierUnpaid =
      supplierStatus !== 'PAID' && supplierStatus !== 'OVERPAID';
    if (supplierUnpaid) {
      await this.auditInTx(tx, user, 'HQ', 'WAREHOUSE_RECEIVED_WITH_UNPAID_SUPPLIER', 'ProcurementOrder', order.id, {
        procurementOrderId: order.id,
        supplierInvoiceId: order.id,
        paymentStatus: supplierStatus,
        paidAmount: Number(order.totalPaidYuan ?? 0),
        remainingAmount: Number(order.remainingYuan ?? Math.max(Number(order.totalYuan ?? 0) - Number(order.totalPaidYuan ?? 0), 0)),
        userId: user.id,
        timestamp: new Date().toISOString(),
      });
      if (supplierStatus === 'PARTIALLY_PAID') {
        await this.auditInTx(tx, user, 'HQ', 'SUPPLIER_PARTIAL_PAYMENT', 'ProcurementOrder', order.id, {
          procurementOrderId: order.id,
          paymentStatus: supplierStatus,
          paidAmount: Number(order.totalPaidYuan ?? 0),
          remainingAmount: Number(order.remainingYuan ?? 0),
          userId: user.id,
          timestamp: new Date().toISOString(),
          context: 'WAREHOUSE_RECEIVE',
        });
      }
    }

    const cargoPrereq = gate.prerequisites.find((row) => row.requestType === 'CARGO_PAYMENT');
    if (cargoPrereq && cargoPrereq.exists && !cargoPrereq.closed) {
      const cargoExpense = (order.transportExpenses ?? []).find(
        (row) => row.expenseType === TransportExpenseType.INTERNATIONAL_FREIGHT,
      );
      const paidAmount = Number(cargoExpense?.paidAmountKgs ?? 0);
      const totalAmount = Number(cargoExpense?.amountKgs ?? cargoExpense?.amount ?? 0);
      await this.auditInTx(tx, user, 'HQ', 'WAREHOUSE_RECEIVED_WITH_UNPAID_CARGO', 'ProcurementOrder', order.id, {
        procurementOrderId: order.id,
        cargoInvoiceId: cargoExpense ? undefined : null,
        paymentStatus: cargoPrereq.status,
        paidAmount,
        remainingAmount: Math.max(totalAmount - paidAmount, 0),
        userId: user.id,
        timestamp: new Date().toISOString(),
      });
      if (cargoPrereq.state === 'partial') {
        await this.auditInTx(tx, user, 'HQ', 'CARGO_PARTIAL_PAYMENT', 'ProcurementOrder', order.id, {
          procurementOrderId: order.id,
          paymentStatus: cargoPrereq.status,
          paidAmount,
          remainingAmount: Math.max(totalAmount - paidAmount, 0),
          userId: user.id,
          timestamp: new Date().toISOString(),
          context: 'WAREHOUSE_RECEIVE',
        });
      }
    }
  }

  private async auditReceivingBlocked(
    user: AuthUser,
    procurementOrderId: string,
    warehouseId: string | null,
    gate: ReturnType<typeof validateHqReceivingInvoicePrerequisites>,
    tx: PrismaTx | PrismaService = this.prisma,
  ) {
    const metadata = {
      shipmentId: procurementOrderId,
      purchaseOrderId: procurementOrderId,
      warehouseId,
      action: 'HQ_RECEIVING_BLOCKED_BY_UNPROCESSED_EXPENSE',
      blockingInvoiceTypes: gate.blockingInvoices.map((row) => row.requestType),
      blockingInvoiceStatuses: gate.blockingInvoices.map((row) => row.status),
      blockingInvoiceStates: gate.blockingInvoices.map((row) => row.state),
      accountantProcessingStatus: gate.prerequisites.map((row) => ({
        requestType: row.requestType,
        accountantProcessed: row.accountantProcessed,
        paymentStatus: row.status,
        state: row.state,
      })),
      attemptedBy: user.id,
      attemptedAt: new Date().toISOString(),
      userId: user.id,
      roles: user.roles ?? [user.role],
      actorUserId: user.id,
      actorRole: user.role,
      procurementOrderId,
      timestamp: new Date().toISOString(),
      failureReason: 'UNPROCESSED_PROCUREMENT_OR_IMPORT_EXPENSE',
    } as Prisma.InputJsonValue;

    await tx.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: 'HQ_RECEIVING_BLOCKED',
        entity: 'ProcurementOrder',
        entityId: procurementOrderId,
        metadata,
      },
    });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: 'HQ_RECEIVING_BLOCKED_BY_UNPROCESSED_EXPENSE',
        entity: 'ProcurementOrder',
        entityId: procurementOrderId,
        metadata,
      },
    });
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

  private assertBranchPurchaseBranchContext(user: AuthUser, dtoBranchId?: string) {
    try {
      return assertBranchPurchaseBranchContext(this.resolveBranchId(user, dtoBranchId));
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Branch context is required');
    }
  }

  private assertBranchPurchaseRequestItems(items: unknown) {
    try {
      assertBranchPurchaseRequestItems(items);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Invalid request items');
    }
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

  private presentBranchPurchaseRequestResponse(user: AuthUser, request: Record<string, unknown>) {
    const canViewAll = this.canViewAllBranchPurchaseRequests(user);
    const hideSensitive = isBranchOnlyRequestUser(user, canViewAll);
    const hideFinancialCost = !canViewProductCost(user);
    return presentBranchPurchaseRequestForUser(request as Parameters<typeof presentBranchPurchaseRequestForUser>[0], {
      hideSensitive,
      hideFinancialCost,
    });
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
    if (items.some((item) => !item?.productId)) {
      throw new BadRequestException('Заявка должна ссылаться на существующий товар');
    }

    const hqBranch = await ensureHqCatalogBranch(this.prisma);
    const resolvedProducts = [];
    for (const item of items) {
      const product = await this.validateCatalogProductForRequest(item.productId, hqBranch.id);
      resolvedProducts.push({ item, product });
    }

    const branchStockBySku = new Map<string, number>();
    if (branchWarehouseId) {
      const skus = resolvedProducts.map(({ product }) => product.sku);
      const branchBalances = await this.prisma.inventoryBalance.findMany({
        where: {
          warehouseId: branchWarehouseId,
          product: { branchId, sku: { in: skus }, deletedAt: null },
        },
        select: { quantity: true, product: { select: { sku: true } } },
      });
      for (const balance of branchBalances) {
        branchStockBySku.set(balance.product.sku, balance.quantity);
      }
    }

    const assignedHqWarehouseId = await this.getBranchAssignedHqWarehouseId(branchId);
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, deletedAt: null },
      select: { branchType: true, hqToBranchMarkupPercent: true },
    });
    const hqStockMetrics = assignedHqWarehouseId
      ? await this.inventoryService.getHqWarehouseStockMetricsMap(
          assignedHqWarehouseId,
          resolvedProducts.map(({ product }) => ({ productId: product.id, sku: product.sku })),
        )
      : new Map();

    return Promise.all(
      resolvedProducts.map(async ({ item, product }) => {
        const quantity = Number(item.quantity ?? 0);
        const pricing = await this.resolveBranchRequestProductPricing(branchId, product.id);
        const branchPurchasePriceKgs = pricing.branchPurchasePriceKgs ?? 0;
        const costPriceSnapshot = pricing.costPriceSnapshot ?? 0;
        let estimatedLineProductCostKgs = 0;
        let estimatedUnitCost = costPriceSnapshot;
        if (assignedHqWarehouseId && quantity > 0) {
          await this.pricingFifoService.syncFifoBatchesFromHqStockMovements();
          const fifoCost = await resolveBranchPurchaseFifoLineCost(this.pricingFifoService, this.prisma, {
            productId: product.id,
            warehouseId: assignedHqWarehouseId,
            quantity,
            branchType: branch?.branchType,
            hqToBranchMarkupPercent: Number(branch?.hqToBranchMarkupPercent ?? 0),
            fallbackUnitCost: costPriceSnapshot,
            fallbackUnitPrice: branchPurchasePriceKgs,
          });
          if (fifoCost.allocatedQty > 0) {
            estimatedLineProductCostKgs = fifoCost.estimatedLineProductCostKgs;
            estimatedUnitCost = fifoCost.estimatedUnitCost;
          }
        }
        const totalAmount = resolveBranchPurchaseLinePayableAmount({
          branchType: branch?.branchType,
          quantity,
          estimatedLineProductCostKgs,
          unitPriceKgs: branchPurchasePriceKgs,
          hasPricingPolicy: pricing.hasPricingPolicy,
        });
        const stockMetrics = hqStockMetrics.get(product.id);

        return {
          productId: product.id,
          sku: product.sku,
          productName: product.name,
          quantity,
          unit: product.unit,
          currentBranchStock: branchStockBySku.get(product.sku) ?? 0,
          hqAvailableStock: stockMetrics?.generalAvailableQuantity ?? null,
          hqPhysicalStock: stockMetrics?.physicalQuantity ?? null,
          wholesalePriceKgs: branchPurchasePriceKgs,
          resolvedBranchPriceKgs: pricing.resolvedBranchPriceKgs,
          pricingPolicyVersionId: pricing.pricingPolicyVersionId,
          pricingProfileId: pricing.pricingProfileId,
          appliedRuleType: pricing.appliedRuleType,
          appliedRuleId: pricing.appliedRuleId,
          appliedAdjustmentMode: pricing.appliedAdjustmentMode,
          appliedAdjustmentValue: pricing.appliedAdjustmentValue,
          priceResolvedAt: pricing.priceResolvedAt,
          hasPricingPolicyAtSubmit: pricing.hasPricingPolicy,
          weightKg: Number(product.weightKg),
          transportExpenseAllocation: 0,
          estimatedUnitCost,
          estimatedLineProductCostKgs,
          totalAmount,
          note: item.note,
        };
      }),
    );
  }

  private async validateCatalogProductForRequest(productId: string, hqCatalogBranchId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
    });
    if (!product) {
      throw new NotFoundException('Товар не найден');
    }
    if (!product.isActive) {
      throw new BadRequestException('Товар недоступен для заказа');
    }
    if (product.branchId !== hqCatalogBranchId) {
      throw new NotFoundException('Товар из заявки не найден в справочнике товаров');
    }
    return product;
  }

  async diagnoseBranchRequestProductDuplicates(user: AuthUser) {
    if (!this.hasAnyRole(user, [Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.SUPPLY_CHAIN_MANAGER])) {
      throw new ForbiddenException('Forbidden resource');
    }

    const hqBranch = await ensureHqCatalogBranch(this.prisma);
    const catalogProducts = await this.prisma.product.findMany({
      where: { branchId: hqBranch.id, deletedAt: null },
      select: { id: true, sku: true, name: true, createdAt: true, isActive: true },
    });
    const catalogBySku = new Map(
      catalogProducts
        .filter((product) => product.sku?.trim())
        .map((product) => [product.sku.trim().toUpperCase(), product]),
    );

    const branchCopies = await this.prisma.product.findMany({
      where: {
        deletedAt: null,
        NOT: { branchId: hqBranch.id },
      },
      include: {
        _count: {
          select: {
            stockMovements: true,
            inventoryBalances: true,
            saleItems: true,
          },
        },
        inventoryBalances: { select: { quantity: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    const requestLineCounts = await this.prisma.branchPurchaseRequestItem.groupBy({
      by: ['productId'],
      _count: { _all: true },
    });
    const requestLinesByProduct = new Map(requestLineCounts.map((row) => [row.productId, row._count._all]));

    return branchCopies
      .map((product) => {
        const normalizedSku = product.sku?.trim().toUpperCase() ?? '';
        const canonical = normalizedSku ? catalogBySku.get(normalizedSku) : undefined;
        const inventoryQty = product.inventoryBalances.reduce((sum, row) => sum + row.quantity, 0);
        return {
          productId: product.id,
          sku: product.sku,
          name: product.name,
          branchId: product.branchId,
          createdAt: product.createdAt,
          isActive: product.isActive,
          requestLineReferences: requestLinesByProduct.get(product.id) ?? 0,
          inventoryReferences: product._count.inventoryBalances,
          salesReferences: product._count.saleItems,
          stockMovementReferences: product._count.stockMovements,
          totalInventoryQuantity: inventoryQty,
          duplicatesCanonicalProduct: canonical
            ? { id: canonical.id, sku: canonical.sku, name: canonical.name }
            : null,
          likelyRequestProvisioningDuplicate: Boolean(canonical && inventoryQty === 0),
          safeToArchive:
            Boolean(canonical) &&
            inventoryQty === 0 &&
            product._count.saleItems === 0 &&
            product._count.stockMovements === 0,
        };
      })
      .filter((row) => row.likelyRequestProvisioningDuplicate || row.duplicatesCanonicalProduct);
  }

  async repairBranchRequestProductDuplicates(user: AuthUser) {
    if (!this.hasAnyRole(user, [Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR])) {
      throw new ForbiddenException('Forbidden resource');
    }

    const report = await this.diagnoseBranchRequestProductDuplicates(user);
    const repairs: Array<{ duplicateProductId: string; canonicalProductId: string; archived: boolean }> = [];

    for (const row of report) {
      if (!row.duplicatesCanonicalProduct || !row.safeToArchive) continue;

      await this.prisma.$transaction(async (tx) => {
        const updatedLines = await tx.branchPurchaseRequestItem.updateMany({
          where: { productId: row.productId },
          data: { productId: row.duplicatesCanonicalProduct!.id },
        });
        if (updatedLines.count > 0) {
          await tx.auditLog.create({
            data: {
              userId: user.id,
              role: user.role,
              action: 'REQUEST_PRODUCT_RELATION_REPAIRED',
              entity: 'Product',
              entityId: row.productId,
              metadata: {
                duplicateProductId: row.productId,
                canonicalProductId: row.duplicatesCanonicalProduct!.id,
                repairedLineCount: updatedLines.count,
              },
            },
          });
        }

        await tx.product.update({
          where: { id: row.productId },
          data: { isActive: false, deletedAt: new Date() },
        });
        await tx.auditLog.create({
          data: {
            userId: user.id,
            role: user.role,
            action: 'DUPLICATE_PRODUCT_ARCHIVED',
            entity: 'Product',
            entityId: row.productId,
            metadata: {
              canonicalProductId: row.duplicatesCanonicalProduct!.id,
              sku: row.sku,
            },
          },
        });
      });

      repairs.push({
        duplicateProductId: row.productId,
        canonicalProductId: row.duplicatesCanonicalProduct.id,
        archived: true,
      });
    }

    return { repairedCount: repairs.length, repairs };
  }

  private async getHqPhysicalStockMap(
    warehouseId: string,
    items: Array<{ productId: string; sku: string }>,
  ) {
    const metrics = await this.inventoryService.getHqWarehouseStockMetricsMap(warehouseId, items);
    const result = new Map<string, number>();
    for (const item of items) {
      result.set(item.productId, metrics.get(item.productId)?.physicalQuantity ?? 0);
    }
    return result;
  }

  private async enrichBranchPurchaseRequestWithHqStock<
    T extends {
      id: string;
      branchId: string;
      status: BranchPurchaseRequestStatus;
      reviewedAt?: Date | string | null;
      assignedHqWarehouseId?: string | null;
      branch?: { assignedHqWarehouseId?: string | null } | null;
      items: Array<{
        id: string;
        productId: string;
        sku: string;
        quantity: number;
        approvedQuantity?: number | null;
        hqAvailableStock?: number | null;
        estimatedLineProductCostKgs?: unknown;
        estimatedUnitCost?: unknown;
      }>;
    },
  >(user: AuthUser, request: T) {
    const assignedHqWarehouseId =
      request.assignedHqWarehouseId ??
      request.branch?.assignedHqWarehouseId ??
      (await this.getBranchAssignedHqWarehouseId(request.branchId));
    if (!assignedHqWarehouseId) {
      return { ...request, hqStockStatus: 'unavailable' as const };
    }

    try {
      const stockMetrics = await this.inventoryService.getHqWarehouseStockMetricsMap(
        assignedHqWarehouseId,
        request.items.map((item) => ({ productId: item.productId, sku: item.sku })),
      );
      const bookedMap = await this.hqStockBookingService.getActiveBookedQuantityByLine(request.id);
      const pricingAvailability = await this.resolveBranchRequestPricingAvailability(
        request.branchId,
        request.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          sku: item.sku,
          resolvedBranchPriceKgs: (item as { resolvedBranchPriceKgs?: unknown }).resolvedBranchPriceKgs,
          hasPricingPolicyAtSubmit: (item as { hasPricingPolicyAtSubmit?: boolean | null })
            .hasPricingPolicyAtSubmit,
        })),
      );
      const branch = await this.prisma.branch.findFirst({
        where: { id: request.branchId, deletedAt: null },
        select: { branchType: true, hqToBranchMarkupPercent: true },
      });
      await this.pricingFifoService.syncFifoBatchesFromHqStockMovements();

      const transferCostLocked = Boolean(
        (request as { convertedOrderId?: string | null }).convertedOrderId,
      );
      const transferAtCost = shouldTransferBranchPurchaseAtCost(branch?.branchType);
      const staleCostRepairs: Array<{
        itemId: string;
        estimatedLineProductCostKgs: number;
        estimatedUnitCost: number;
        totalAmount: number;
        approvedLineTotalKgs: number | null;
      }> = [];

      const enrichedItems = await Promise.all(
        request.items.map(async (item) => {
          const metrics = stockMetrics.get(item.productId);
          const generalAvailable = metrics?.generalAvailableQuantity ?? 0;
          const bookedQuantity =
            bookedMap.get(item.id) ?? (item as { bookedQuantity?: number }).bookedQuantity ?? 0;
          const availableForThisRequest = this.hqStockBookingService.availableForRequestLine(
            generalAvailable,
            bookedQuantity,
          );
          const approved = item.approvedQuantity ?? null;
          const missingQty =
            approved !== null
              ? Math.max(item.quantity - approved, 0)
              : Math.max(item.quantity - availableForThisRequest, 0);
          const lineQuantity = approved ?? item.quantity;
          const storedLineCost = roundDisplayMoney(
            Number((item as { estimatedLineProductCostKgs?: unknown }).estimatedLineProductCostKgs ?? 0),
          );
          let estimatedLineProductCostKgs = storedLineCost;
          const storedUnitCost = Number((item as { estimatedUnitCost?: unknown }).estimatedUnitCost ?? 0);
          let estimatedUnitCost = storedUnitCost;
          const storedTotalAmount = roundDisplayMoney(
            Number((item as { totalAmount?: unknown }).totalAmount ?? 0),
          );
          let totalAmount = storedTotalAmount;
          let approvedLineTotalKgs =
            (item as { approvedLineTotalKgs?: unknown }).approvedLineTotalKgs != null
              ? roundDisplayMoney(Number((item as { approvedLineTotalKgs?: unknown }).approvedLineTotalKgs))
              : null;

          if (lineQuantity > 0) {
            const fifoCost = await resolveBranchPurchaseFifoLineCost(this.pricingFifoService, this.prisma, {
              productId: item.productId,
              warehouseId: assignedHqWarehouseId,
              quantity: lineQuantity,
              branchType: branch?.branchType,
              hqToBranchMarkupPercent: Number(branch?.hqToBranchMarkupPercent ?? 0),
              fallbackUnitCost: estimatedUnitCost,
              fallbackUnitPrice: Number(
                (item as { resolvedBranchPriceKgs?: unknown }).resolvedBranchPriceKgs ?? 0,
              ),
            });
            const resolvedLineCost = resolveEnrichedBranchPurchaseLineCost({
              storedLineCostKgs: storedLineCost,
              fifoLineCostKgs: fifoCost.estimatedLineProductCostKgs,
              fifoAllocatedQty: fifoCost.allocatedQty,
              lineQuantity,
              transferCostLocked,
            });
            estimatedLineProductCostKgs = resolvedLineCost.estimatedLineProductCostKgs;
            estimatedUnitCost = resolvedLineCost.estimatedUnitCost;

            const payableAmount = resolveBranchPurchaseLinePayableAmount({
              branchType: branch?.branchType,
              quantity: lineQuantity,
              estimatedLineProductCostKgs,
              unitPriceKgs: Number(
                (item as { resolvedBranchPriceKgs?: unknown }).resolvedBranchPriceKgs ??
                  (item as { wholesalePriceKgs?: unknown }).wholesalePriceKgs ??
                  0,
              ),
              hasPricingPolicy: pricingAvailability.get(item.id) ?? true,
            });
            if (payableAmount > 0) {
              totalAmount = payableAmount;
              if (approved != null && approved > 0) {
                approvedLineTotalKgs = payableAmount;
              }
            }

            if (
              !transferCostLocked &&
              fifoCost.allocatedQty >= lineQuantity &&
              resolvedLineCost.estimatedLineProductCostKgs > 0 &&
              (Math.abs(resolvedLineCost.estimatedLineProductCostKgs - storedLineCost) > 0.009 ||
                Math.abs(resolvedLineCost.estimatedUnitCost - storedUnitCost) > 0.009 ||
                Math.abs(totalAmount - storedTotalAmount) > 0.009)
            ) {
              staleCostRepairs.push({
                itemId: item.id,
                estimatedLineProductCostKgs: resolvedLineCost.estimatedLineProductCostKgs,
                estimatedUnitCost: resolvedLineCost.estimatedUnitCost,
                totalAmount,
                approvedLineTotalKgs,
              });
            }
          }

          this.logger.log({
            message: 'HQ_STOCK_RESOLVED_FOR_REQUEST',
            requestId: request.id,
            requestLineId: item.id,
            productId: item.productId,
            resolvedProductId: metrics?.resolvedProductId,
            hqWarehouseId: assignedHqWarehouseId,
            physicalQuantity: metrics?.physicalQuantity ?? 0,
            totalBookedQuantity: metrics?.totalActiveBookedQuantity ?? 0,
            thisRequestBookedQuantity: bookedQuantity,
            availableForThisRequest,
          });

          return {
            ...item,
            bookedQuantity,
            hqPhysicalStock: metrics?.physicalQuantity ?? null,
            totalActiveBookedQuantity: metrics?.totalActiveBookedQuantity ?? 0,
            hqAvailableStock: generalAvailable,
            availableForThisRequest,
            missingQty,
            pricingPolicyAvailable: pricingAvailability.get(item.id) ?? false,
            estimatedLineProductCostKgs,
            estimatedUnitCost,
            totalAmount,
            approvedLineTotalKgs,
          };
        }),
      );

      const totalProductCostKgs = sumDisplayMoneyTotals(
        enrichedItems.map((item) => Number(item.estimatedLineProductCostKgs ?? 0)),
      );
      const totalEstimatedAmount = resolveBranchPurchaseEstimatedAmountKgs({
        branchType: branch?.branchType,
        totalProductCostKgs,
        storedEstimatedAmountKgs: sumDisplayMoneyTotals(
          enrichedItems.map((item) => Number(item.totalAmount ?? 0)),
        ),
      });

      if (staleCostRepairs.length > 0 || transferAtCost) {
        const storedEstimated = roundDisplayMoney(
          Number((request as { totalEstimatedAmount?: unknown }).totalEstimatedAmount ?? 0),
        );
        const needsHeaderRepair =
          transferAtCost && Math.abs(storedEstimated - totalEstimatedAmount) > 0.009;

        if (staleCostRepairs.length > 0 || needsHeaderRepair) {
          await Promise.all(
            staleCostRepairs.map((repair) =>
              this.prisma.branchPurchaseRequestItem.update({
                where: { id: repair.itemId },
                data: {
                  estimatedLineProductCostKgs: repair.estimatedLineProductCostKgs,
                  estimatedUnitCost: repair.estimatedUnitCost,
                  totalAmount: repair.totalAmount,
                  approvedLineTotalKgs: repair.approvedLineTotalKgs,
                },
              }),
            ),
          );
          if (needsHeaderRepair || staleCostRepairs.length > 0) {
            await this.prisma.branchPurchaseRequest.update({
              where: { id: request.id },
              data: { totalEstimatedAmount },
            });
          }
          await this.prisma.auditLog.create({
            data: {
              userId: user.id,
              role: user.role,
              action: 'COST_RECONCILIATION_REPAIRED',
              entity: 'BranchPurchaseRequest',
              entityId: request.id,
              metadata: {
                requestId: request.id,
                branchOrderId: request.id,
                oldAmount: storedEstimated,
                correctedAmount: totalEstimatedAmount,
                difference: roundDisplayMoney(totalEstimatedAmount - storedEstimated),
                reason: 'estimated_amount_aligned_to_fifo_product_cost',
                repairedLineCount: staleCostRepairs.length,
                itemIds: staleCostRepairs.map((row) => row.itemId),
                timestamp: new Date().toISOString(),
              } as Prisma.InputJsonValue,
            },
          });
          this.logger.log({
            message: 'COST_RECONCILIATION_REPAIRED',
            requestId: request.id,
            repairedLineCount: staleCostRepairs.length,
            totalEstimatedAmount,
            totalProductCostKgs,
          });
        }
      }

      return {
        ...request,
        hqStockStatus: 'loaded' as const,
        bookingExpiresAt: (request as { bookingExpiresAt?: Date | null }).bookingExpiresAt ?? null,
        totalProductCostKgs,
        totalEstimatedAmount,
        items: enrichedItems,
      };
    } catch (error) {
      this.logger.error({
        message: 'HQ stock resolution failed for branch request',
        requestId: request.id,
        hqWarehouseId: assignedHqWarehouseId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new BadRequestException('Не удалось получить остатки склада HQ');
    }
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
    const scope = this.salesManagerAssignmentService.buildAssignedRequestScope(warehouseIds);
    return scope ?? {};
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

    const assignedIds = await this.salesManagerAssignmentService.getActiveAssignedWarehouseIds(user.id);
    if (!assignedIds.length) {
      return;
    }

    const warehouseId = await this.resolveRequestAssignedHqWarehouseId(request);
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

  private async notifyHqSalesBranchRequestSubmitted(
    user: AuthUser,
    request: {
      id: string;
      requestNumber: string;
      branchId: string;
      totalQuantity?: number;
      items: Array<{ quantity: number }>;
    },
  ) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: request.branchId, deletedAt: null },
      select: { name: true },
    });
    const branchName = branch?.name ?? request.branchId;
    const itemCount = request.items.length;
    const totalQuantity =
      request.totalQuantity ?? request.items.reduce((sum, item) => sum + item.quantity, 0);
    const alerts = await this.notificationsService.notify(user, {
      type: AlertType.BRANCH_ORDER_SUBMITTED,
      branchId: request.branchId,
      entityType: 'BranchPurchaseRequest',
      entityId: request.id,
      referenceNumber: request.requestNumber,
      title: 'Новый заказ филиала',
      message: `Филиал ${branchName} отправил новый заказ на проверку.`,
    });
    await this.auditBranchRequest(
      user,
      request.branchId,
      'HQ_SALES_REQUEST_NOTIFICATION_CREATED',
      'BranchPurchaseRequest',
      request.id,
      {
        requestNumber: request.requestNumber,
        branchName,
        itemCount,
        totalQuantity,
        alertIds: alerts.map((alert) => alert.id),
      },
    );
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

  private async enrichBranchProductOptionsWithPricing(
    branchId: string,
    products: Array<{
      id: string;
      catalogProductId: string;
      name: string;
      sku: string;
      barcode: string | null;
      category: string | null;
      productCode: string | null;
      unit: string;
      branchPurchasePriceKgs: number | null;
      hasPricingPolicy: boolean;
      pricingPending: boolean;
    }>,
  ) {
    return Promise.all(
      products.map(async (product) => {
        const pricing = await this.resolveBranchRequestProductPricing(branchId, product.catalogProductId);
        const availableQuantity = await this.resolveHqCatalogAvailableQuantity(product.catalogProductId);
        return {
          productId: product.catalogProductId,
          ...product,
          availableQuantity,
          branchPurchasePriceKgs: pricing.branchPurchasePriceKgs,
          branchPriceKgs: pricing.branchPurchasePriceKgs,
          finalBranchPriceKgs: pricing.branchPurchasePriceKgs,
          finalBranchPrice: pricing.branchPurchasePriceKgs,
          costPriceKgs: pricing.costPriceSnapshot,
          markupPercent: pricing.markupSnapshot,
          markupAmount: pricing.markupAmountSnapshot,
          pricingPolicyVersionId: pricing.pricingPolicyVersionId,
          branchPriceProfileId: pricing.pricingProfileId,
          pricingSource: pricing.pricingSource,
          hasPricingPolicy: pricing.hasPricingPolicy,
          priceConfigured: pricing.priceConfigured,
          priceMissingReason: pricing.priceMissingReason,
          pricingPending: !pricing.priceConfigured,
        };
      }),
    );
  }

  private async resolveHqCatalogAvailableQuantity(catalogProductId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: catalogProductId, deletedAt: null },
      select: { id: true, sku: true },
    });
    if (!product) return 0;
    const sku = product.sku?.trim();
    const ids = new Set<string>([product.id]);
    if (sku) {
      const siblings = await this.prisma.product.findMany({
        where: { sku, deletedAt: null },
        select: { id: true },
      });
      for (const row of siblings) ids.add(row.id);
    }
    const balance = await this.prisma.inventoryBalance.aggregate({
      where: {
        productId: { in: [...ids] },
        warehouse: { warehouseType: WarehouseType.HQ, deletedAt: null, isActive: true },
      },
      _sum: { quantity: true },
    });
    return Math.max(0, Number(balance._sum.quantity ?? 0));
  }

  private async resolveBranchRequestProductPricing(branchId: string, catalogProductId: string) {
    const resolution = await this.branchPriceResolver.resolveBranchPrice(catalogProductId, { branchId });
    const priceConfigured = resolution.priceConfigured;
    const branchPurchasePriceKgs = priceConfigured ? resolution.branchPrice : null;

    return {
      hasPricingPolicy: priceConfigured,
      priceConfigured,
      priceMissingReason: resolution.priceMissingReason,
      branchPurchasePriceKgs,
      resolvedBranchPriceKgs: branchPurchasePriceKgs,
      costPriceSnapshot: priceConfigured ? resolution.costPrice : null,
      markupSnapshot: priceConfigured ? resolution.markupPercent : null,
      markupAmountSnapshot: priceConfigured ? resolution.markupAmount : null,
      pricingPolicyVersionId: resolution.pricingPolicyVersionId,
      pricingProfileId: resolution.branchPriceProfileId,
      pricingSource: resolution.pricingSource,
      appliedRuleType: resolution.appliedRuleType,
      appliedRuleId: resolution.sourceRuleId,
      appliedAdjustmentMode: resolution.appliedAdjustmentMode,
      appliedAdjustmentValue: priceConfigured ? resolution.appliedAdjustmentValue : null,
      priceResolvedAt: priceConfigured ? new Date() : null,
    };
  }

  private async resolveBranchRequestPricingAvailability(
    branchId: string,
    items: Array<{
      id?: string;
      productId: string;
      sku: string;
      resolvedBranchPriceKgs?: unknown;
      hasPricingPolicyAtSubmit?: boolean | null;
    }>,
  ) {
    const result = new Map<string, boolean>();
    const hqBranch = await ensureHqCatalogBranch(this.prisma);

    await Promise.all(
      items.map(async (item) => {
        const key = item.id ?? item.productId;
        if (item.hasPricingPolicyAtSubmit === true) {
          result.set(key, true);
          return;
        }
        if (item.resolvedBranchPriceKgs != null && Number(item.resolvedBranchPriceKgs) > 0) {
          result.set(key, true);
          return;
        }

        const catalogProduct = await this.prisma.product.findFirst({
          where: {
            sku: item.sku,
            branchId: hqBranch.id,
            deletedAt: null,
            isActive: true,
          },
          select: { id: true },
        });
        const pricing = await this.resolveBranchRequestProductPricing(
          branchId,
          catalogProduct?.id ?? item.productId,
        );
        result.set(key, pricing.hasPricingPolicy);
      }),
    );

    return result;
  }

  private normalizeLineReviewInputs(
    dto: any,
    items: Array<{ id: string; quantity: number }>,
  ): LineReviewInput[] {
    const rows = (dto?.items as Array<Record<string, unknown>>) ?? [];
    if (!rows.length) {
      return items.map((item) => ({
        id: item.id,
        action: 'APPROVE' as LineReviewAction,
        approvedQuantity: item.quantity,
      }));
    }

    return rows.map((row) => ({
      id: String(row.id ?? ''),
      action: (String(row.action ?? 'APPROVE').toUpperCase() as LineReviewAction) || 'APPROVE',
      approvedQuantity:
        row.approvedQuantity !== undefined ? Number(row.approvedQuantity) : undefined,
      publicComment: typeof row.publicComment === 'string' ? row.publicComment : undefined,
    }));
  }

  private async upsertBranchRequestIssueInTx(
    tx: PrismaTx,
    user: AuthUser,
    input: {
      issueType: BranchRequestIssueType;
      request: {
        id: string;
        requestNumber: string;
        branchId: string;
        branch?: { name?: string | null } | null;
        createdAt: Date;
        assignedHqWarehouse?: { name?: string | null } | null;
      };
      item: {
        id: string;
        productId: string;
        productName: string;
        sku: string;
        quantity: number;
      };
      availableQuantity: number;
      unavailableQuantity: number;
      publicComment: string | null;
      hqWarehouseId: string;
      alertType: AlertType;
      alertTitle: string;
      alertMessage: string;
    },
  ) {
    const existingIssue = await tx.branchRequestIssue.findFirst({
      where: {
        issueType: input.issueType,
        branchRequestItemId: input.item.id,
        productId: input.item.productId,
        status: { in: [BranchRequestIssueStatus.OPEN, BranchRequestIssueStatus.WAITING_FOR_SUPPLY] },
      },
    });

    const issue =
      existingIssue ??
      (await tx.branchRequestIssue.create({
        data: {
          issueType: input.issueType,
          branchRequestId: input.request.id,
          branchRequestItemId: input.item.id,
          branchId: input.request.branchId,
          productId: input.item.productId,
          requestedQuantity: input.item.quantity,
          availableQuantity: input.availableQuantity,
          unavailableQuantity: input.unavailableQuantity,
          hqWarehouseId: input.hqWarehouseId,
          publicComment: input.publicComment,
        },
      }));

    if (existingIssue) {
      await tx.branchRequestIssue.update({
        where: { id: existingIssue.id },
        data: {
          requestedQuantity: input.item.quantity,
          availableQuantity: input.availableQuantity,
          unavailableQuantity: input.unavailableQuantity,
          publicComment: input.publicComment,
        },
      });
    }

    const alerts = await this.notificationsService.notifyInTx(tx, user, {
      type: input.alertType,
      branchId: input.request.branchId,
      entityType: 'BranchPurchaseRequest',
      entityId: input.request.id,
      referenceNumber: input.request.requestNumber,
      title: input.alertTitle,
      message: `${input.alertMessage} Заказ: ${input.request.requestNumber}. Товар: ${input.item.productName} (${input.item.sku}). Запрошено: ${input.item.quantity}. Дата: ${input.request.createdAt.toLocaleDateString('ru-RU')}.`,
      recipientRoles: [Role.CEO, Role.OWNER],
    });

    const alertId = alerts[0]?.id;
    if (alertId) {
      await tx.branchRequestIssue.update({
        where: { id: issue.id },
        data: { latestAlertId: alertId },
      });
    }

    const auditAction =
      input.issueType === BranchRequestIssueType.NO_PRICING_POLICY
        ? 'CEO_NOTIFICATION_NO_PRICING_POLICY_CREATED'
        : 'CEO_NOTIFICATION_OUT_OF_STOCK_CREATED';

    await this.auditInTx(tx, user, input.request.branchId, auditAction, 'BranchRequestIssue', issue.id, {
      requestId: input.request.id,
      requestLineId: input.item.id,
      productId: input.item.productId,
      issueType: input.issueType,
      requestedQuantity: input.item.quantity,
      availableQuantity: input.availableQuantity,
      unavailableQuantity: input.unavailableQuantity,
      publicComment: input.publicComment,
      createdById: user.id,
      timestamp: new Date().toISOString(),
    });
  }

  private async notifyBranchSalesReviewOutcome(
    user: AuthUser,
    request: {
      id: string;
      requestNumber: string;
      branchId: string;
      status: BranchPurchaseRequestStatus;
      items?: Array<{ lineStatus?: BranchPurchaseRequestLineStatus | null; unavailableQuantity?: number | null }>;
    },
  ) {
    let type: AlertType;
    if (request.status === BranchPurchaseRequestStatus.REJECTED) {
      type = AlertType.BRANCH_ORDER_REJECTED;
    } else if (
      request.status === BranchPurchaseRequestStatus.PARTIALLY_APPROVED ||
      (request.items?.some(
        (item) =>
          item.lineStatus === BranchPurchaseRequestLineStatus.PARTIALLY_APPROVED ||
          (item.unavailableQuantity ?? 0) > 0,
      ) ??
        false)
    ) {
      type = AlertType.BRANCH_ORDER_PARTIALLY_APPROVED;
    } else {
      type = AlertType.BRANCH_ORDER_APPROVED;
    }

    await this.notificationsService.notify(user, {
      type,
      branchId: request.branchId,
      entityType: 'BranchPurchaseRequest',
      entityId: request.id,
      referenceNumber: request.requestNumber,
    });

    await this.auditBranchRequest(user, request.branchId, 'BRANCH_ORDER_REVIEW_NOTIFICATION_CREATED', 'BranchPurchaseRequest', request.id, {
      alertType: type,
      status: request.status,
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
