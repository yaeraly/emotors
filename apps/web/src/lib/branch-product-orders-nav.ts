import type { ModuleSectionLink } from '@/components/ModuleSectionNav';
import { isPathUnderPrefixes } from './nav-matching';
import { isBranchSalesManagerUser } from './rbac';
import type { User } from './types';
import { branchSalesManagerNavModules, visibleModulePages } from './unified-nav';

export const BRANCH_PRODUCT_ORDERS_LIST_HREF = '/branch-purchase-requests';
export const BRANCH_INCOMING_SHIPMENTS_HREF = '/branch-manager/shipments';

export function branchProductOrdersModuleForUser(user: User | null | undefined) {
  if (!user || !isBranchSalesManagerUser(user)) return null;
  return branchSalesManagerNavModules.find((module) => module.id === 'distribution') ?? null;
}

export function visibleBranchProductOrdersNavSections(user: User | null | undefined): ModuleSectionLink[] {
  const module = branchProductOrdersModuleForUser(user);
  if (!module) return [];
  return visibleModulePages(module, user).map((page) => ({
    href: page.href,
    labelKey: page.labelKey,
  }));
}

export function usesBranchProductOrdersPageNav(pathname: string, user: User | null | undefined): boolean {
  const module = branchProductOrdersModuleForUser(user);
  if (!module?.pageLevelSectionNav) return false;
  return isPathUnderPrefixes(pathname, module.pathPrefixes);
}
