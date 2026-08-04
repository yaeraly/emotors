import { Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { hasAnyFullAccessRole, resolveUserRoles } from '../rbac/rbac';

export function shouldStripBranchWarehouseInventoryFinancials(user: AuthUser) {
  const roles = resolveUserRoles(user);
  if (hasAnyFullAccessRole(roles)) return false;
  return roles.includes(Role.WAREHOUSE_OPERATOR) || roles.includes(Role.WAREHOUSE_MANAGER);
}

export function sanitizeInventoryCountSummaryForUser(
  user: AuthUser,
  summary: {
    totalProducts: number;
    countedProducts: number;
    remainingProducts: number;
    shortages: number;
    overages: number;
    matched: number;
    totalDifferenceValueKgs?: number;
    surplusValueKgs?: number;
    shortageValueKgs?: number;
  },
) {
  if (!shouldStripBranchWarehouseInventoryFinancials(user)) {
    return summary;
  }
  // Warehouse roles may see quantity discrepancies only.
  // Do not expose monetary totals, breakdowns, or item-level cost fields.
  const {
    surplusValueKgs: _surplusValueKgs,
    shortageValueKgs: _shortageValueKgs,
    totalDifferenceValueKgs: _totalDifferenceValueKgs,
    ...safeSummary
  } = summary;
  return safeSummary;
}

export function sanitizeInventoryCountItemForUser(user: AuthUser, item: any) {
  if (!shouldStripBranchWarehouseInventoryFinancials(user)) {
    return {
      ...item,
      unitCostKgs: Number(item.unitCostKgs),
      differenceValueKgs: Number(item.differenceValueKgs),
    };
  }
  const {
    unitCostKgs: _unitCostKgs,
    differenceValueKgs: _differenceValueKgs,
    ...rest
  } = item;
  return rest;
}

export function sanitizeInventoryCountSessionForUser(user: AuthUser, session: any) {
  const summary = session.summary
    ? sanitizeInventoryCountSummaryForUser(user, session.summary)
    : session.summary;
  return {
    ...session,
    summary,
    items: session.items?.map((item: any) => sanitizeInventoryCountItemForUser(user, item)),
  };
}

export function sanitizeInventoryCountSearchResultForUser(
  user: AuthUser,
  row: {
    productId: string;
    sku: string;
    barcode?: string | null;
    productName: string;
    categoryName: string;
    shelf?: string | null;
    zone?: string | null;
    systemQuantity: number;
    unitCostKgs?: number;
  },
) {
  if (!shouldStripBranchWarehouseInventoryFinancials(user)) {
    return row;
  }
  const { unitCostKgs: _unitCostKgs, ...rest } = row;
  return rest;
}
