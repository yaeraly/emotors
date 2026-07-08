import { BranchPurchaseRequestStatus } from '@prisma/client';
import { canManageOwnBranchProductRequest } from '../rbac/rbac';
import type { AuthUser } from '../auth/auth.types';

export function canSeeHqStockInBranchRequests(user: AuthUser, canViewAll: boolean) {
  return canViewAll;
}

export function isBranchOnlyRequestUser(user: AuthUser, canViewAll: boolean) {
  return canManageOwnBranchProductRequest(user) && !canViewAll;
}

export function resolveBranchDisplayStatus(
  status: BranchPurchaseRequestStatus,
  items: Array<{ quantity: number; approvedQuantity?: number | null }>,
) {
  const hasPartial =
    status === BranchPurchaseRequestStatus.APPROVED ||
    status === BranchPurchaseRequestStatus.PARTIALLY_APPROVED
      ? items.some((item) => {
          const approved = item.approvedQuantity ?? item.quantity;
          return approved < item.quantity;
        })
      : false;

  if (status === BranchPurchaseRequestStatus.SUBMITTED || status === BranchPurchaseRequestStatus.SUBMITTED_TO_HQ) {
    return 'SUBMITTED';
  }
  if (status === BranchPurchaseRequestStatus.PARTIALLY_APPROVED || (status === BranchPurchaseRequestStatus.APPROVED && hasPartial)) {
    return 'PARTIALLY_APPROVED';
  }
  if (status === BranchPurchaseRequestStatus.APPROVED) return 'ACCEPTED';
  if (status === BranchPurchaseRequestStatus.REJECTED) return 'REJECTED';
  if (status === BranchPurchaseRequestStatus.SENT_TO_HQ_WAREHOUSE || status === BranchPurchaseRequestStatus.SHIPPED) {
    return 'SHIPPED';
  }
  if (status === BranchPurchaseRequestStatus.COMPLETED || status === BranchPurchaseRequestStatus.RECEIVED) {
    return 'COMPLETED';
  }
  if (status === BranchPurchaseRequestStatus.CANCELLED) return 'CANCELLED';
  if (status === BranchPurchaseRequestStatus.DRAFT) return 'DRAFT';
  return status;
}

export function sanitizeBranchPurchaseRequest<T extends {
  status: BranchPurchaseRequestStatus;
    items: Array<{
    quantity: number;
    approvedQuantity?: number | null;
    hqAvailableStock?: number | null;
    currentBranchStock?: number;
    missingQty?: number | null;
    transportExpenseAllocation?: unknown;
    estimatedUnitCost?: unknown;
    totalAmount?: unknown;
    wholesalePriceKgs?: unknown;
  }>;
}>(request: T, hideSensitive: boolean) {
  if (!hideSensitive) {
    return {
      ...request,
      branchDisplayStatus: resolveBranchDisplayStatus(request.status, request.items),
      partialFulfillmentMessage: null,
    };
  }

  const branchDisplayStatus = resolveBranchDisplayStatus(request.status, request.items);
  const partialFulfillmentMessage =
    branchDisplayStatus === 'PARTIALLY_APPROVED' ? 'PARTIAL_FULFILLMENT_LATER' : null;

  return {
    ...request,
    branchDisplayStatus,
    partialFulfillmentMessage,
    items: request.items.map((item) => ({
      id: (item as { id?: string }).id,
      productId: (item as { productId?: string }).productId,
      sku: (item as { sku?: string }).sku,
      productName: (item as { productName?: string }).productName,
      quantity: item.approvedQuantity ?? item.quantity,
      approvedQuantity: undefined,
      unit: (item as { unit?: string }).unit,
      note: (item as { note?: string | null }).note,
      weightKg: undefined,
      hqAvailableStock: undefined,
      missingQty: undefined,
      currentBranchStock: undefined,
      transportExpenseAllocation: undefined,
      estimatedUnitCost: undefined,
      totalAmount: undefined,
    })),
  };
}
