import type { User } from './types';
import {
  canCreateServiceOrder,
  canEnterBranchTransportCost,
  canManageUsers,
  canViewBranchPurchaseRequests,
  canViewDistribution,
  canViewInventoryCount,
  hasPermission,
  isBranchOwnerUser,
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
      { href: '/customers?archived=1', labelKey: 'nav.customersArchive', isVisible: crmVisible },
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
      { href: '/returns', labelKey: 'operations.returns', isVisible: (user) => salesVisible(user) || hasPermission(user, 'payments.manage') },
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
    defaultHref: '/inventory',
    pathPrefixes: ['/inventory', '/inventory/count', '/products', '/warehouses', '/stock-movements', '/warehouse-release'],
    sidebarVisible: inventoryVisible,
    pages: [
      { href: '/inventory', labelKey: 'nav.inventory', isVisible: inventoryVisible },
      {
        href: '/inventory/count',
        labelKey: 'inventoryCount.title',
        isVisible: (user) => isBranchOwnerUser(user) && canViewInventoryCount(user),
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
        isVisible: canEnterBranchTransportCost,
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

export function visibleBranchOwnerSidebarModules(user: User | null | undefined): UnifiedNavModule[] {
  if (!user || !isBranchOwnerUser(user)) return [];
  return branchOwnerNavModules.filter((module) => {
    if (!module.sidebarVisible(user)) return false;
    return visibleModulePages(module, user).length > 0;
  });
}

export function visibleModulePages(module: UnifiedNavModule, user: User | null | undefined): UnifiedNavPage[] {
  if (!user) return [];
  return module.pages.filter((page) => page.isVisible(user));
}

export function resolveModuleForPath(pathname: string, user: User | null | undefined): UnifiedNavModule | null {
  if (!user || !isBranchOwnerUser(user)) return null;
  return (
    branchOwnerNavModules.find((module) =>
      module.pathPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)),
    ) ?? null
  );
}

export function shouldShowModuleTopNav(module: UnifiedNavModule | null, user: User | null | undefined): boolean {
  if (!module || !user) return false;
  return visibleModulePages(module, user).length >= 2;
}

export function isUnifiedNavPageActive(pathname: string, search: string, href: string): boolean {
  const [pagePath, pageQuery] = href.split('?');
  const pathMatches = pathname === pagePath || pathname.startsWith(`${pagePath}/`);
  if (!pathMatches) return false;
  if (!pageQuery) {
    if (pagePath === '/customers') {
      return !search.includes('archived=1');
    }
    return true;
  }
  const expected = new URLSearchParams(pageQuery);
  const current = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  for (const [key, value] of expected.entries()) {
    if (current.get(key) !== value) return false;
  }
  return true;
}

export function usesUnifiedBranchOwnerNav(user: User | null | undefined): boolean {
  return isBranchOwnerUser(user);
}

export function isUnifiedNavModuleActive(pathname: string, module: UnifiedNavModule): boolean {
  return module.pathPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function sidebarHrefForModule(module: UnifiedNavModule, user: User): string {
  const pages = visibleModulePages(module, user);
  if (pages.length === 1) {
    return pages[0].href;
  }
  return module.defaultHref;
}
