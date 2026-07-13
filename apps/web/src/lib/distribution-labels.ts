import type { User } from './types';
import {
  isBranchSalesManagerUser,
  isHqSalesManagerUser,
  isSupplyChainManagerUser,
  isWarehouseManagerUser,
} from './rbac';

/** Sidebar / page module title for the branch product order workflow. */
export function branchPurchaseRequestsTitleKey(user: User | null | undefined): string {
  if (isHqSalesManagerUser(user)) return 'nav.hqBranchOrders';
  return 'nav.branchProductOrders';
}

/** Hub and distribution pages module title based on the viewer role. */
export function distributionModuleTitleKey(user: User | null | undefined): string {
  if (isBranchSalesManagerUser(user)) return 'nav.branchProductOrders';
  if (isHqSalesManagerUser(user)) return 'nav.hqBranchOrders';
  if (isSupplyChainManagerUser(user)) return 'nav.supplyBranchFulfillment';
  if (isWarehouseManagerUser(user)) return 'distribution.titleWarehouse';
  return 'nav.supplyBranchFulfillment';
}
