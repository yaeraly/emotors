import type { User } from './types';
import {
  isPathUnderPrefixes,
  isRouteActive,
  resolveActiveRouteHref,
  resolveModuleByLongestPrefix,
} from './nav-matching';
import {
  canCreateServiceOrder,
  canManageUsers,
  canViewBranchPurchaseRequests,
  canViewDistribution,
  canViewInventoryCount,
  canViewProductCatalog,
  hasPermission,
  isBranchManagerUser,
  isBranchOwnerUser,
  isBranchSalesManagerUser,
} from './rbac';

export type UnifiedNavPage = {
  href: string;
  labelKey: string;
  isVisible: (user: User) => boolean;
};

export type UnifiedNavModule = {
  id: string;
  labelKey: string;
  defaultHref: string;
  pathPrefixes: string[];
  sidebarVisible: (user: User) => boolean;
  pages: UnifiedNavPage[];
};

function salesVisible(user: User) {
  return hasPermission(user, 'sales.manage');
}

function crmVisible(user: User) {
  return hasPermission(user, 'crm.manage');
}

function inventoryVisible(user: User) {
  return hasPermission(user, 'inventory.manage') || hasPermission(user, 'inventory.view');
}

function serviceVisible(user: User) {
  return hasPermission(user, 'service.manage');
}

function financeVisible(user: User) {
  return hasPermission(user, 'finance.view') || hasPermission(user, 'payments.manage');
}

function reportsVisible(user: User) {
  return hasPermission(user, 'kpi.view') || hasPermission(user, 'reports.view') || hasPermission(user, 'analytics.view');
}

export const branchOwnerNavModules: UnifiedNavModule[] = [
  {
    id: 'dashboard',
    labelKey: 'nav.dashboard',
    defaultHref: '/dashboard',
    pathPrefixes: ['/dashboard', '/branch-dashboard'],
    sidebarVisible: () => true,
    pages: [{ href: '/dashboard', labelKey: 'nav.dashboard', isVisible: () => true }],
  },
  {
    id: 'crm',
    labelKey: 'nav.crm',
    defaultHref: '/crm',
    pathPrefixes: ['/crm', '/follow-ups'],
    sidebarVisible: crmVisible,
    pages: [
      { href: '/crm', labelKey: 'nav.crm', isVisible: crmVisible },
      { href: '/follow-ups', labelKey: 'nav.followUps', isVisible: crmVisible },
    ],
  },
  {
    id: 'clients',
    labelKey: 'nav.customers',
    defaultHref: '/customers',
    pathPrefixes: ['/customers'],
    sidebarVisible: crmVisible,
    pages: [
      { href: '/customers', labelKey: 'nav.customers', isVisible: crmVisible },
      { href: '/customers/archive', labelKey: 'nav.customersArchive', isVisible: crmVisible },
    ],
  },
  {
    id: 'sales',
    labelKey: 'nav.sales',
    defaultHref: '/sales',
    pathPrefixes: ['/sales', '/installments', '/reservations', '/returns'],
    sidebarVisible: salesVisible,
    pages: [
      { href: '/sales', labelKey: 'nav.sales', isVisible: salesVisible },
      { href: '/sales/installment-requests', labelKey: 'nav.installmentRequests', isVisible: isBranchOwnerUser },
      { href: '/installments', labelKey: 'nav.installments', isVisible: salesVisible },
      { href: '/reservations', labelKey: 'operations.reservations', isVisible: salesVisible },
      { href: '/returns', labelKey: 'operations.returns', isVisible: (user) => salesVisible(user) || hasPermission(user, 'payments.manage') },
    ],
  },
  {
    id: 'product-directory',
    labelKey: 'productMaster.title',
    defaultHref: '/branch-ceo/product-directory',
    pathPrefixes: ['/branch-ceo/product-directory'],
    sidebarVisible: (user) => isBranchOwnerUser(user) && canViewProductCatalog(user),
    pages: [
      {
        href: '/branch-ceo/product-directory',
        labelKey: 'productMaster.title',
        isVisible: (user) => isBranchOwnerUser(user) && canViewProductCatalog(user),
      },
    ],
  },
  {
    id: 'service',
    labelKey: 'service.title',
    defaultHref: '/service',
    pathPrefixes: ['/service', '/warranty'],
    sidebarVisible: serviceVisible,
    pages: [
      { href: '/service', labelKey: 'service.title', isVisible: serviceVisible },
      { href: '/service/warranties', labelKey: 'service.warranties', isVisible: serviceVisible },
      { href: '/service/reports', labelKey: 'nav.reports', isVisible: serviceVisible },
      { href: '/service/parts-requests', labelKey: 'operations.partsRequests', isVisible: serviceVisible },
    ],
  },
  {
    id: 'warehouse',
    labelKey: 'nav.inventory',
    defaultHref: '/branch-ceo/warehouse',
    pathPrefixes: ['/branch-ceo/warehouse'],
    sidebarVisible: inventoryVisible,
    pages: [
      {
        href: '/branch-ceo/warehouse',
        labelKey: 'branchWarehouseOperator.warehouseTab',
        isVisible: (user) => isBranchOwnerUser(user) && inventoryVisible(user),
      },
      {
        href: '/branch-ceo/warehouse/inventory',
        labelKey: 'branchWarehouseOperator.inventory',
        isVisible: (user) => isBranchOwnerUser(user) && inventoryVisible(user),
      },
    ],
  },
  {
    id: 'distribution',
    labelKey: 'nav.branchProductOrders',
    defaultHref: '/branch-purchase-requests',
    pathPrefixes: ['/branch-purchase-requests', '/distribution', '/branch-manager'],
    sidebarVisible: (user) => canViewBranchPurchaseRequests(user) || canViewDistribution(user),
    pages: [
      {
        href: '/branch-purchase-requests',
        labelKey: 'nav.distributionBranchRequests',
        isVisible: canViewBranchPurchaseRequests,
      },
      {
        href: '/distribution/receivings',
        labelKey: 'nav.distributionIncoming',
        isVisible: canViewDistribution,
      },
      {
        href: '/distribution/shortage-reports',
        labelKey: 'nav.distributionDiscrepancies',
        isVisible: canViewDistribution,
      },
      {
        href: '/branch-manager/shipments',
        labelKey: 'branchManager.incomingShipments',
        isVisible: (user) => isBranchManagerUser(user) || isBranchOwnerUser(user),
      },
    ],
  },
  {
    id: 'finance',
    labelKey: 'nav.finance',
    defaultHref: '/finance',
    pathPrefixes: ['/finance', '/payments', '/tax', '/payroll', '/commissions', '/compensation'],
    sidebarVisible: financeVisible,
    pages: [
      { href: '/finance', labelKey: 'nav.finance', isVisible: (user) => hasPermission(user, 'finance.view') },
      { href: '/payments', labelKey: 'nav.payments', isVisible: (user) => hasPermission(user, 'payments.manage') },
      { href: '/tax', labelKey: 'tax.title', isVisible: (user) => hasPermission(user, 'finance.view') },
      { href: '/payroll', labelKey: 'payroll.title', isVisible: (user) => hasPermission(user, 'payroll.manage') },
      { href: '/commissions', labelKey: 'commissions.title', isVisible: (user) => hasPermission(user, 'payroll.manage') },
    ],
  },
  {
    id: 'reports',
    labelKey: 'nav.reports',
    defaultHref: '/kpi',
    pathPrefixes: ['/kpi', '/analytics', '/ai'],
    sidebarVisible: reportsVisible,
    pages: [
      { href: '/kpi', labelKey: 'nav.kpi', isVisible: (user) => hasPermission(user, 'kpi.view') },
      { href: '/analytics', labelKey: 'nav.analytics', isVisible: (user) => hasPermission(user, 'reports.view') || hasPermission(user, 'analytics.view') },
    ],
  },
  {
    id: 'users',
    labelKey: 'nav.users',
    defaultHref: '/users',
    pathPrefixes: ['/users'],
    sidebarVisible: canManageUsers,
    pages: [{ href: '/users', labelKey: 'nav.usersEmployees', isVisible: canManageUsers }],
  },
];

export const branchSalesManagerNavModules: UnifiedNavModule[] = [
  {
    id: 'customers',
    labelKey: 'nav.customers',
    defaultHref: '/customers',
    pathPrefixes: ['/customers'],
    sidebarVisible: crmVisible,
    pages: [
      { href: '/customers', labelKey: 'nav.customers', isVisible: crmVisible },
      { href: '/customers/archive', labelKey: 'nav.customersArchive', isVisible: crmVisible },
    ],
  },
  {
    id: 'crm',
    labelKey: 'nav.crm',
    defaultHref: '/crm',
    pathPrefixes: ['/crm', '/follow-ups'],
    sidebarVisible: crmVisible,
    pages: [
      { href: '/crm', labelKey: 'nav.crm', isVisible: crmVisible },
      { href: '/follow-ups', labelKey: 'nav.followUps', isVisible: crmVisible },
    ],
  },
  {
    id: 'sales',
    labelKey: 'nav.sales',
    defaultHref: '/sales',
    pathPrefixes: ['/sales', '/installments', '/reservations', '/returns'],
    sidebarVisible: salesVisible,
    pages: [
      { href: '/sales', labelKey: 'nav.sales', isVisible: salesVisible },
      { href: '/installments', labelKey: 'nav.installments', isVisible: salesVisible },
      { href: '/reservations', labelKey: 'operations.reservations', isVisible: salesVisible },
      { href: '/returns', labelKey: 'operations.returns', isVisible: salesVisible },
    ],
  },
  {
    id: 'warehouse',
    labelKey: 'nav.inventory',
    defaultHref: '/inventory',
    pathPrefixes: ['/inventory', '/products'],
    sidebarVisible: inventoryVisible,
    pages: [{ href: '/inventory', labelKey: 'nav.inventory', isVisible: inventoryVisible }],
  },
  {
    id: 'distribution',
    labelKey: 'nav.branchProductOrders',
    defaultHref: '/branch-purchase-requests',
    pathPrefixes: ['/branch-purchase-requests', '/branch-manager'],
    sidebarVisible: canViewBranchPurchaseRequests,
    pages: [
      {
        href: '/branch-purchase-requests',
        labelKey: 'nav.distributionBranchRequests',
        isVisible: canViewBranchPurchaseRequests,
      },
      {
        href: '/branch-manager/shipments',
        labelKey: 'branchManager.incomingShipments',
        isVisible: (user) => isBranchManagerUser(user) || isBranchSalesManagerUser(user),
      },
    ],
  },
];

function navModulesForUser(user: User | null | undefined): UnifiedNavModule[] {
  if (!user) return [];
  if (isBranchOwnerUser(user)) return branchOwnerNavModules;
  if (isBranchSalesManagerUser(user)) return branchSalesManagerNavModules;
  return [];
}

export function usesUnifiedNav(user: User | null | undefined): boolean {
  return isBranchOwnerUser(user) || isBranchSalesManagerUser(user);
}

/** @deprecated Use usesUnifiedNav */
export function usesUnifiedBranchOwnerNav(user: User | null | undefined): boolean {
  return isBranchOwnerUser(user);
}

export function visibleUnifiedSidebarModules(user: User | null | undefined): UnifiedNavModule[] {
  if (!usesUnifiedNav(user)) return [];
  return navModulesForUser(user).filter((module) => {
    if (!module.sidebarVisible(user!)) return false;
    return visibleModulePages(module, user).length > 0;
  });
}

/** @deprecated Use visibleUnifiedSidebarModules */
export function visibleBranchOwnerSidebarModules(user: User | null | undefined): UnifiedNavModule[] {
  if (!user || !isBranchOwnerUser(user)) return [];
  return visibleUnifiedSidebarModules(user);
}

export function visibleModulePages(module: UnifiedNavModule, user: User | null | undefined): UnifiedNavPage[] {
  if (!user) return [];
  return module.pages.filter((page) => page.isVisible(user));
}

export function resolveModuleForPath(pathname: string, user: User | null | undefined): UnifiedNavModule | null {
  if (!usesUnifiedNav(user)) return null;
  return resolveModuleByLongestPrefix(pathname, navModulesForUser(user));
}

export function shouldShowModuleTopNav(module: UnifiedNavModule | null, user: User | null | undefined): boolean {
  if (!module || !user) return false;
  return visibleModulePages(module, user).length >= 2;
}

export function isUnifiedNavPageActive(pathname: string, search: string, href: string): boolean {
  return isRouteActive(pathname, href, search);
}

export function resolveActiveUnifiedNavPage(
  pathname: string,
  search: string,
  pages: UnifiedNavPage[],
): UnifiedNavPage | null {
  const hrefs = pages.map((page) => page.href);
  const activeHref = resolveActiveRouteHref(pathname, search, hrefs);
  if (!activeHref) return null;
  return pages.find((page) => page.href === activeHref) ?? null;
}

export function isUnifiedNavModuleActive(pathname: string, module: UnifiedNavModule): boolean {
  return isPathUnderPrefixes(pathname, module.pathPrefixes);
}

export function sidebarHrefForModule(module: UnifiedNavModule, user: User): string {
  const pages = visibleModulePages(module, user);
  if (pages.length === 1) {
    return pages[0].href;
  }
  return module.defaultHref;
}
