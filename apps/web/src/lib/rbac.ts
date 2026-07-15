import type { Role, User } from './types';

const ALL_PERMISSIONS = [
  'users.manage',
  'branches.manage',
  'crm.manage',
  'sales.manage',
  'inventory.manage',
  'inventory.view',
  'products.manage',
  'products.view',
  'products.archive',
  'service.manage',
  'finance.view',
  'payments.manage',
  'payroll.manage',
  'kpi.view',
  'reports.view',
  'procurement.manage',
  'procurement.view',
  'procurement.receive',
  'distribution.manage',
  'distribution.view',
  'academy.manage',
  'marketing.manage',
  'analytics.view',
] as const;

const ROLE_PERMISSIONS: Record<Role, string[]> = {
  OWNER: [...ALL_PERMISSIONS],
  CEO: [...ALL_PERMISSIONS],
  SYSTEM_ADMINISTRATOR: ['users.manage', 'reports.view'],
  FRANCHISE_DIRECTOR: ['branches.manage', 'academy.manage', 'kpi.view', 'reports.view'],
  FINANCE_MANAGER: ['finance.view', 'payroll.manage', 'kpi.view', 'reports.view', 'products.view'],
  WAREHOUSE_MANAGER: [
    'inventory.manage',
    'inventory.view',
    'distribution.manage',
    'procurement.receive',
    'products.view',
  ],
  CONTENT_CREATOR: ['marketing.manage'],
  ACADEMY_DIRECTOR: ['academy.manage'],
  ACADEMY_MANAGER: ['academy.manage'],
  MARKETING_MANAGER: ['marketing.manage', 'analytics.view'],
  PROCUREMENT_MANAGER: ['procurement.manage'],
  SUPPLY_CHAIN_MANAGER: [
    'inventory.view',
    'procurement.manage',
    'procurement.view',
    'distribution.view',
    'products.manage',
  ],
  HQ_SALES_MANAGER: [
    'distribution.manage',
    'distribution.view',
    'inventory.view',
    'products.view',
  ],
  HQ_CASHIER: [
    'distribution.view',
    'payments.manage',
  ],
  INVESTMENT_MANAGER: ['analytics.view'],
  EXPANSION_MANAGER: ['analytics.view'],
  FRANCHISE_OWNER: [
    'users.manage',
    'crm.manage',
    'sales.manage',
    'inventory.manage',
    'inventory.view',
    'products.view',
    'service.manage',
    'finance.view',
    'payments.manage',
    'kpi.view',
    'reports.view',
  ],
  MANAGER: ['crm.manage', 'sales.manage', 'inventory.view', 'products.view'],
  MASTER: ['service.manage', 'kpi.view', 'products.view'],
  WAREHOUSE_OPERATOR: ['inventory.manage', 'distribution.manage'],
  CASHIER: ['payments.manage'],
  ACCOUNTANT: ['finance.view', 'payments.manage', 'payroll.manage'],
  HQ_ACCOUNTANT: ['finance.view', 'payments.manage', 'payroll.manage'],
  SALESPERSON: ['sales.manage'],
};

export function roleCodesForUser(user: Pick<User, 'role' | 'roles'> | null | undefined) {
  if (!user) return [];
  return user.roles?.length ? user.roles : [user.role];
}

export function permissionsForUser(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  if (!user) return [];
  return user.permissions?.length
    ? user.permissions
    : Array.from(new Set(roleCodesForUser(user).flatMap((role) => ROLE_PERMISSIONS[role] ?? [])));
}

export function hasPermission(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined, permission: string) {
  return permissionsForUser(user).includes(permission);
}

export function hasRole(user: Pick<User, 'role' | 'roles'> | null | undefined, role: Role) {
  return roleCodesForUser(user).includes(role);
}

function hasAnyRole(user: Pick<User, 'role' | 'roles'> | null | undefined, roles: Role[]) {
  return roles.some((role) => hasRole(user, role));
}

export function hasFullAccess(user: Pick<User, 'role' | 'roles'> | null | undefined) {
  return hasAnyRole(user, ['OWNER', 'CEO']);
}

export function isCeoUser(user: Pick<User, 'role' | 'roles'> | null | undefined) {
  return hasFullAccess(user);
}

export function canCreateServiceOrder(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  if (!user) return false;
  return hasPermission(user, 'service.manage') && !hasFullAccess(user);
}

export function canDeleteEmployee(user: Pick<User, 'role' | 'roles'> | null | undefined) {
  return hasFullAccess(user);
}

export function isSupplyChainManagerUser(user: Pick<User, 'role' | 'roles'> | null | undefined) {
  if (!user || hasFullAccess(user)) return false;
  return hasRole(user, 'SUPPLY_CHAIN_MANAGER');
}

export function isWarehouseManagerUser(user: Pick<User, 'role' | 'roles'> | null | undefined) {
  if (!user || hasFullAccess(user)) return false;
  if (hasRole(user, 'SUPPLY_CHAIN_MANAGER')) return false;
  if (hasRole(user, 'HQ_SALES_MANAGER')) return false;
  if (hasRole(user, 'HQ_CASHIER')) return false;
  return hasRole(user, 'WAREHOUSE_MANAGER');
}

export function isHqSalesManagerUser(user: Pick<User, 'role' | 'roles'> | null | undefined) {
  if (!user || hasFullAccess(user)) return false;
  return hasRole(user, 'HQ_SALES_MANAGER');
}

export function isHqCashierUser(user: Pick<User, 'role' | 'roles'> | null | undefined) {
  if (!user || hasFullAccess(user)) return false;
  return hasRole(user, 'HQ_CASHIER');
}

const WAREHOUSE_MANAGER_FORBIDDEN_PREFIXES = [
  '/finance',
  '/reports',
  '/users',
  '/settings',
  '/crm',
  '/customers',
  '/dashboard',
  '/analytics',
  '/tax',
  '/payments',
  '/kpi',
  '/sales',
  '/service',
  '/reservations',
  '/returns',
  '/users',
  '/branches',
  '/academy',
  '/marketing',
  '/investment',
  '/expansion',
  '/royalty',
  '/ai',
  '/payroll',
  '/commissions',
  '/compensation',
  '/warehouse-release',
  '/warranty',
  '/supplier-claims',
  '/branch-purchase-requests',
  '/supply-chain',
  '/alerts',
  '/notifications',
];

const WAREHOUSE_MANAGER_ALLOWED_PREFIXES = [
  '/change-password',
  '/inventory',
  '/products',
  '/warehouses',
  '/stock-movements',
  '/hq-warehouses',
  '/distribution',
];

export function isWarehouseManagerForbiddenPath(pathname: string) {
  return WAREHOUSE_MANAGER_FORBIDDEN_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function canWarehouseManagerAccessPath(pathname: string) {
  if (pathname === '/') return false;
  if (pathname === '/inventory') return false;
  if (isWarehouseManagerForbiddenPath(pathname)) return false;

  if (
    pathname.startsWith('/procurement') &&
    !/^\/procurement\/orders\/[^/]+$/.test(pathname)
  ) {
    return false;
  }

  if (
    pathname.startsWith('/product-master') ||
    pathname.startsWith('/products/new') ||
    pathname.startsWith('/inventory/categories')
  ) {
    return false;
  }

  if (
    pathname.startsWith('/distribution/invoices') ||
    pathname.startsWith('/distribution/branch-balances') ||
    pathname.startsWith('/distribution/orders/new') ||
    pathname.startsWith('/hq-warehouses/new')
  ) {
    return false;
  }

  if (pathname.includes('/procurement/orders/') && pathname.endsWith('/edit')) {
    return false;
  }

  return WAREHOUSE_MANAGER_ALLOWED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

const SUPPLY_CHAIN_MANAGER_ALLOWED_PREFIXES = [
  '/change-password',
  '/inventory',
  '/products',
  '/product-master',
  '/warehouses',
  '/branch-warehouses',
  '/stock-movements',
  '/hq-warehouses',
  '/procurement',
  '/alerts',
  '/notifications',
  '/branch-purchase-requests',
  '/supplier-claims',
];

const SUPPLY_CHAIN_MANAGER_FORBIDDEN_PREFIXES = [
  '/china-receiving',
  '/procurement/receiving',
  '/distribution',
  '/hq-warehouses/new',
  '/supply-chain',
];

function canSupplyChainManagerAccessPath(pathname: string) {
  if (pathname === '/') return false;
  if (
    SUPPLY_CHAIN_MANAGER_FORBIDDEN_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  ) {
    return false;
  }
  if (pathname.startsWith('/distribution/orders/new')) return false;
  return SUPPLY_CHAIN_MANAGER_ALLOWED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

const HQ_SALES_MANAGER_ALLOWED_PREFIXES = [
  '/change-password',
  '/distribution',
  '/branch-purchase-requests',
  '/branch-warehouses',
  '/branches',
  '/inventory',
  '/products',
  '/product-master',
  '/alerts',
  '/notifications',
];

function canHqSalesManagerAccessPath(pathname: string) {
  if (pathname === '/') return false;
  return HQ_SALES_MANAGER_ALLOWED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

const HQ_CASHIER_ALLOWED_PREFIXES = [
  '/change-password',
  '/distribution',
  '/alerts',
  '/notifications',
];

function canHqCashierAccessPath(pathname: string) {
  if (pathname === '/') return false;
  if (pathname.startsWith('/distribution/orders/new')) return false;
  if (pathname.startsWith('/distribution/picking-tasks')) return false;
  return HQ_CASHIER_ALLOWED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Branch Sales Manager = branch-scoped MANAGER role (not Franchise Owner). */
export function isBranchSalesManagerUser(user: Pick<User, 'role' | 'roles' | 'branchId'> | null | undefined) {
  if (!user || !user.branchId || hasFullAccess(user)) return false;
  if (
    isSupplyChainManagerUser(user) ||
    isWarehouseManagerUser(user) ||
    isHqSalesManagerUser(user) ||
    isHqCashierUser(user)
  ) {
    return false;
  }
  if (hasRole(user, 'FRANCHISE_OWNER')) return false;
  return hasRole(user, 'MANAGER');
}

const BRANCH_SALES_MANAGER_FORBIDDEN_PREFIXES = [
  '/finance',
  '/reports',
  '/analytics',
  '/users',
  '/settings',
  '/dashboard',
  '/branch-dashboard',
  '/products/new',
  '/inventory/categories',
  '/stock-movements',
  '/warehouse-release',
  '/warehouses',
  '/distribution',
  '/procurement',
  '/service',
  '/reservations',
  '/returns',
  '/payments',
  '/tax',
  '/payroll',
  '/kpi',
  '/branches',
  '/academy',
  '/marketing',
  '/investment',
  '/expansion',
  '/royalty',
  '/ai',
  '/supply-chain',
  '/supplier-claims',
  '/warranty',
  '/hq-warehouses',
  '/branch-warehouses',
  '/product-master',
  '/commissions',
  '/compensation',
  '/warehouse/products',
  '/warehouse/issue',
  '/warehouse/list',
];

const BRANCH_WAREHOUSE_OPERATOR_ALLOWED_PREFIXES = [
  '/change-password',
  '/inventory',
  '/inventory/count',
  '/stock-movements',
  '/distribution/orders',
  '/distribution/receivings',
  '/service/parts-requests',
  '/alerts',
  '/notifications',
];

const BRANCH_WAREHOUSE_OPERATOR_FORBIDDEN_PREFIXES = [
  '/products',
  '/product-master',
  '/pricing',
  '/branch-purchase-requests',
  '/branch-warehouses',
  '/warehouses',
  '/branch-product-shortages',
  '/branch-request-issues',
  '/sales',
  '/customers',
  '/crm',
  '/procurement',
  '/hq-warehouses',
  '/dashboard',
  '/finance',
  '/users',
  '/branches',
];

const BRANCH_CASHIER_ALLOWED_PREFIXES = [
  '/change-password',
  '/payments',
  '/sales',
  '/service/cashier',
  '/returns',
  '/alerts',
  '/notifications',
];

const BRANCH_CASHIER_FORBIDDEN_PREFIXES = [
  '/dashboard',
  '/branch-dashboard',
  '/finance',
  '/analytics',
  '/kpi',
  '/ai',
  '/users',
  '/branches',
  '/settings',
  '/customers',
  '/crm',
  '/branch-purchase-requests',
  '/inventory',
  '/products',
  '/procurement',
  '/distribution',
  '/service/new',
  '/service/kpi',
  '/service/parts-requests',
  '/sales/new',
  '/reservations',
  '/warehouse-release',
  '/installments',
  '/follow-ups',
  '/tax',
  '/payroll',
  '/commissions',
  '/compensation',
];

const BRANCH_ACCOUNTANT_ALLOWED_PREFIXES = [
  '/change-password',
  '/payments',
  '/tax',
  '/payroll',
  '/commissions',
  '/compensation',
  '/returns',
  '/alerts',
  '/notifications',
];

const BRANCH_ACCOUNTANT_FORBIDDEN_PREFIXES = [
  '/dashboard',
  '/branch-dashboard',
  '/finance',
  '/analytics',
  '/kpi',
  '/ai',
  '/users',
  '/branches',
  '/settings',
  '/customers',
  '/crm',
  '/sales',
  '/service',
  '/inventory',
  '/products',
  '/procurement',
  '/distribution',
  '/branch-purchase-requests',
  '/reservations',
  '/warehouse-release',
  '/installments',
  '/follow-ups',
];

const BRANCH_SALES_MANAGER_ALLOWED_PREFIXES = [
  '/change-password',
  '/customers',
  '/crm',
  '/sales',
  '/installments',
  '/inventory',
  '/products',
  '/branch-purchase-requests',
  '/follow-ups',
  '/alerts',
  '/notifications',
];

export function isBranchWarehouseOperatorForbiddenPath(pathname: string) {
  return BRANCH_WAREHOUSE_OPERATOR_FORBIDDEN_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function canBranchWarehouseOperatorAccessPath(pathname: string) {
  if (pathname === '/') return false;
  if (isBranchWarehouseOperatorForbiddenPath(pathname)) return false;
  return BRANCH_WAREHOUSE_OPERATOR_ALLOWED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function isBranchSalesManagerForbiddenPath(pathname: string) {
  return BRANCH_SALES_MANAGER_FORBIDDEN_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function canBranchSalesManagerAccessPath(pathname: string) {
  if (pathname === '/') return false;
  if (isBranchSalesManagerForbiddenPath(pathname)) return false;
  if (pathname.startsWith('/products/') && pathname.endsWith('/edit')) return false;
  return BRANCH_SALES_MANAGER_ALLOWED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

const FRANCHISE_OWNER_PASSWORD_RESET_ALLOWED_ROLES: Role[] = [
  'MANAGER',
  'MASTER',
  'WAREHOUSE_OPERATOR',
  'CASHIER',
  'ACCOUNTANT',
];

export function getDefaultRoute(role: Role) {
  if (role === 'OWNER' || role === 'CEO' || role === 'SYSTEM_ADMINISTRATOR') return '/dashboard';
  if (role === 'SUPPLY_CHAIN_MANAGER') return '/procurement';
  if (role === 'HQ_SALES_MANAGER') return '/distribution';
  if (role === 'HQ_CASHIER') return '/distribution/invoices';
  if (role === 'WAREHOUSE_MANAGER') return '/hq-warehouses';
  if (role === 'FINANCE_MANAGER' || role === 'HQ_ACCOUNTANT' || role === 'ACCOUNTANT') return '/finance';
  if (role === 'FRANCHISE_OWNER') return '/dashboard';
  if (role === 'MANAGER') return '/sales';
  if (role === 'MASTER') return '/service';
  if (role === 'WAREHOUSE_OPERATOR') return '/inventory';
  if (role === 'CASHIER') return '/payments';
  if (role === 'SALESPERSON') return '/sales';
  if (role === 'PROCUREMENT_MANAGER') return '/procurement';
  if (role === 'ACADEMY_DIRECTOR' || role === 'ACADEMY_MANAGER') return '/academy';
  if (role === 'MARKETING_MANAGER' || role === 'CONTENT_CREATOR') return '/marketing';
  if (role === 'FRANCHISE_DIRECTOR') return '/branches';
  return '/dashboard';
}

export function getDefaultRouteForUser(user: Pick<User, 'role' | 'roles' | 'permissions' | 'branchId'>) {
  if (hasFullAccess(user)) return '/dashboard';
  if (isSupplyChainManagerUser(user)) return '/procurement';
  if (isHqSalesManagerUser(user)) return '/distribution';
  if (isHqCashierUser(user)) return '/distribution/invoices';
  if (isWarehouseManagerUser(user)) return '/hq-warehouses';
  if (hasRole(user, 'FRANCHISE_OWNER')) return '/dashboard';
  if (hasPermission(user, 'procurement.view') || hasPermission(user, 'procurement.manage')) return '/procurement';
  if (hasRole(user, 'WAREHOUSE_MANAGER')) return '/hq-warehouses';
  if (isBranchWarehouseOperator(user)) return '/inventory';
  if (isBranchCashierUser(user)) return '/payments';
  if (isBranchAccountantUser(user)) return '/payments';
  if (hasPermission(user, 'payments.manage')) return '/payments';
  if (hasPermission(user, 'finance.view') && !isBranchAccountantUser(user)) return '/finance';
  if (hasPermission(user, 'users.manage') && !user.branchId) return '/users';
  if (hasPermission(user, 'crm.manage')) return '/customers';
  if (hasPermission(user, 'sales.manage')) return '/sales';
  if (hasPermission(user, 'inventory.manage') || hasPermission(user, 'inventory.view')) return '/inventory';
  if (hasPermission(user, 'service.manage')) return '/service';
  if (hasPermission(user, 'academy.manage')) return '/academy';
  if (hasPermission(user, 'marketing.manage')) return '/marketing';
  if (hasPermission(user, 'branches.manage')) return '/branches';
  return getDefaultRoute(user.role);
}

export function canAccessPath(user: User, pathname: string) {
  if (pathname === '/change-password') return true;
  if (isSupplyChainManagerUser(user)) {
    return canSupplyChainManagerAccessPath(pathname);
  }
  if (isHqSalesManagerUser(user)) {
    return canHqSalesManagerAccessPath(pathname);
  }
  if (isHqCashierUser(user)) {
    return canHqCashierAccessPath(pathname);
  }
  if (isWarehouseManagerUser(user)) {
    return canWarehouseManagerAccessPath(pathname);
  }
  if (isBranchSalesManagerUser(user)) {
    return canBranchSalesManagerAccessPath(pathname);
  }
  if (isBranchWarehouseOperator(user)) {
    return canBranchWarehouseOperatorAccessPath(pathname);
  }
  if (isBranchCashierUser(user)) {
    return canBranchCashierAccessPath(pathname);
  }
  if (isBranchAccountantUser(user)) {
    return canBranchAccountantAccessPath(pathname);
  }
  if (pathname === '/dashboard') return true;
  if (pathname === '/branch-dashboard') {
    return hasPermission(user, 'crm.manage') || hasPermission(user, 'sales.manage');
  }
  if (pathname === '/finance') return hasPermission(user, 'finance.view');
  if (pathname === '/payments') return hasPermission(user, 'payments.manage') || hasPermission(user, 'sales.manage');
  if (pathname.startsWith('/customers')) return hasPermission(user, 'crm.manage');
  if (pathname.startsWith('/sales')) return canViewSalesForPayment(user) || canCreateSale(user);
  if (pathname.startsWith('/products/new') || pathname.startsWith('/inventory/categories')) {
    return canManageProductCatalog(user);
  }
  if (pathname.startsWith('/products')) {
    return canViewProductCatalog(user);
  }
  if (pathname.startsWith('/stock-movements')) {
    return hasPermission(user, 'inventory.manage');
  }
  if (pathname.startsWith('/hq-warehouses')) return canViewHqWarehouse(user);
  if (pathname.startsWith('/branch-warehouses')) return canViewBranchWarehouses(user);
  if (pathname.startsWith('/product-master')) return canViewProductMaster(user);
  if (pathname.startsWith('/pricing')) return canViewPricing(user);
  if (pathname.startsWith('/inventory') ||
    pathname.startsWith('/warehouses')
  ) {
    return hasPermission(user, 'inventory.manage') || hasPermission(user, 'inventory.view');
  }
  if (pathname.startsWith('/service/cashier')) {
    return hasPermission(user, 'payments.manage');
  }
  if (/^\/service\/[^/]+$/.test(pathname) && pathname !== '/service/new') {
    return hasPermission(user, 'service.manage') || hasPermission(user, 'payments.manage');
  }
  if (pathname.startsWith('/service/parts-requests') || pathname.startsWith('/service/kpi')) {
    return hasPermission(user, 'service.manage') || isBranchWarehouseOperator(user);
  }
  if (pathname.startsWith('/service')) return hasPermission(user, 'service.manage');
  if (pathname.startsWith('/users')) return hasPermission(user, 'users.manage');
  if (pathname.startsWith('/branches')) return hasPermission(user, 'branches.manage');
  if (pathname.startsWith('/procurement/orders/new') || pathname.startsWith('/procurement/suppliers/new') || pathname.startsWith('/procurement/factories/new')) {
    return canCreateProcurementOrder(user);
  }
  if (pathname.startsWith('/procurement/purchase-price-history')) {
    return canViewProcurement(user) || hasPermission(user, 'reports.view');
  }
  if (pathname.startsWith('/procurement/orders/')) {
    return canViewProcurement(user) || canViewSupplierPayments(user);
  }
  if (pathname.startsWith('/procurement/difference-acts')) {
    return canViewChinaReceivingActs(user);
  }
  if (pathname.startsWith('/procurement')) return canViewProcurement(user);
  if (pathname.startsWith('/branch-purchase-requests')) {
    return canViewBranchPurchaseRequests(user);
  }
  if (pathname.startsWith('/branch-product-shortages')) {
    return canViewBranchProductShortages(user);
  }
  if (pathname.startsWith('/branch-request-issues')) {
    return hasFullAccess(user) || hasRole(user, 'SYSTEM_ADMINISTRATOR');
  }
  if (pathname.startsWith('/supply-inquiries')) {
    return hasFullAccess(user) || hasRole(user, 'SUPPLY_CHAIN_MANAGER') || hasRole(user, 'SYSTEM_ADMINISTRATOR');
  }
  if (pathname.startsWith('/reservations')) return hasPermission(user, 'sales.manage');
  if (pathname.startsWith('/warehouse-release')) return hasPermission(user, 'inventory.manage') || hasPermission(user, 'sales.manage');
  if (pathname.startsWith('/returns')) return hasPermission(user, 'sales.manage') || hasPermission(user, 'payments.manage');
  if (pathname.startsWith('/warranty/claims')) return hasPermission(user, 'service.manage') || hasPermission(user, 'distribution.manage');
  if (pathname.startsWith('/supplier-claims')) return hasPermission(user, 'procurement.manage') || hasPermission(user, 'distribution.manage');
  if (pathname.startsWith('/alerts') || pathname.startsWith('/notifications')) return true;
  if (pathname.startsWith('/distribution/invoices')) {
    return canViewDistribution(user) || hasPermission(user, 'finance.view') || hasPermission(user, 'payments.manage');
  }
  if (pathname.startsWith('/distribution/orders/new')) return canManageDistributionOrders(user);
  if (pathname.startsWith('/distribution')) {
    return canViewDistribution(user) || hasPermission(user, 'finance.view');
  }
  if (pathname.startsWith('/supply-chain')) {
    return hasPermission(user, 'distribution.view') || hasPermission(user, 'procurement.view') || hasPermission(user, 'procurement.manage');
  }
  if (pathname.startsWith('/tax')) return hasPermission(user, 'finance.view');
  if (pathname.startsWith('/payroll') || pathname.startsWith('/commissions') || pathname.startsWith('/compensation')) {
    return hasPermission(user, 'payroll.manage');
  }
  if (pathname.startsWith('/kpi')) {
    return hasPermission(user, 'kpi.view') || hasPermission(user, 'analytics.view');
  }
  if (pathname.startsWith('/analytics') || pathname.startsWith('/ai')) {
    return hasPermission(user, 'reports.view') || hasPermission(user, 'analytics.view');
  }
  if (pathname.startsWith('/academy')) return hasPermission(user, 'academy.manage');
  if (pathname.startsWith('/marketing')) return hasPermission(user, 'marketing.manage');
  if (pathname.startsWith('/investment') || pathname.startsWith('/expansion')) return hasFullAccess(user);
  if (pathname.startsWith('/royalty')) return hasPermission(user, 'branches.manage');
  return true;
}

export function canResetUserPassword(
  actor: Pick<User, 'role' | 'roles' | 'branchId'> | null | undefined,
  target: Pick<User, 'role' | 'roles' | 'branchId'> | null | undefined,
) {
  if (!actor || !target) return false;
  if (hasFullAccess(actor) || hasRole(actor, 'SYSTEM_ADMINISTRATOR')) {
    return true;
  }
  if (!hasRole(actor, 'FRANCHISE_OWNER') || actor.branchId !== target.branchId) {
    return false;
  }
  const targetRoles = roleCodesForUser(target);
  return (
    targetRoles.length > 0 &&
    targetRoles.every((role) => FRANCHISE_OWNER_PASSWORD_RESET_ALLOWED_ROLES.includes(role))
  );
}

export function canManageProductCatalog(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  if (!user) return false;
  if (isWarehouseManagerUser(user)) return false;
  return hasFullAccess(user) || hasRole(user, 'SUPPLY_CHAIN_MANAGER');
}

export function canViewProductMaster(user: Pick<User, 'role' | 'roles' | 'permissions' | 'branchId'> | null | undefined) {
  if (!user) return false;
  if (isWarehouseManagerUser(user)) return false;
  return canViewProductCatalog(user);
}

export function canViewBranchWarehouses(user: Pick<User, 'role' | 'roles' | 'permissions' | 'branchId'> | null | undefined) {
  if (!user) return false;
  if (isWarehouseManagerUser(user)) return false;
  if (isBranchWarehouseOperator(user)) return false;
  return (
    hasFullAccess(user) ||
    hasRole(user, 'SUPPLY_CHAIN_MANAGER') ||
    hasRole(user, 'HQ_SALES_MANAGER') ||
    hasRole(user, 'FRANCHISE_OWNER') ||
    hasRole(user, 'MANAGER')
  );
}

/** HQ users who can open any branch warehouse for inspection (CEO, SCM, HQ Sales). */
export function canInspectAnyBranchWarehouse(user: Pick<User, 'role' | 'roles'> | null | undefined) {
  if (!user) return false;
  return (
    hasFullAccess(user) ||
    hasRole(user, 'SUPPLY_CHAIN_MANAGER') ||
    hasRole(user, 'HQ_SALES_MANAGER')
  );
}

export function canEditProductCatalog(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  return canManageProductCatalog(user);
}

export function canEditProductUnit(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  if (!user) return false;
  return hasFullAccess(user) || hasRole(user, 'SUPPLY_CHAIN_MANAGER');
}

export function shouldHideProductPricingFromProfile(user: Pick<User, 'role' | 'roles'> | null | undefined) {
  if (!user) return false;
  return isSupplyChainManagerUser(user) && !hasFullAccess(user);
}

export function canArchiveProduct(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  if (!user) return false;
  return hasFullAccess(user);
}

export function canDeleteCategory(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  return hasFullAccess(user);
}

export function canEditSellingPrice(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  if (!user) return false;
  return hasFullAccess(user);
}

export function canManagePricingPolicy(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  if (!user) return false;
  return hasRole(user, 'CEO');
}

export function canViewPriceExplanation(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  if (!user) return false;
  return hasFullAccess(user);
}

export function canViewPricing(user: Pick<User, 'role' | 'roles' | 'permissions' | 'branchId'> | null | undefined) {
  if (!user) return false;
  if (isBranchWarehouseOperator(user)) return false;
  if (hasFullAccess(user)) return true;
  if (hasRole(user, 'ACADEMY_DIRECTOR')) return false;
  return hasAnyRole(user, [
    'HQ_SALES_MANAGER',
    'WAREHOUSE_MANAGER',
    'FINANCE_MANAGER',
    'HQ_ACCOUNTANT',
    'ACCOUNTANT',
    'MARKETING_MANAGER',
    'CONTENT_CREATOR',
    'SYSTEM_ADMINISTRATOR',
    'HQ_CASHIER',
    'FRANCHISE_OWNER',
    'MANAGER',
    'CASHIER',
  ]);
}

export function canViewProductCost(user: Pick<User, 'role' | 'roles' | 'branchId'> | null | undefined) {
  if (!user) return false;
  return !isBranchWarehouseOperator(user);
}

export function canViewProductCatalog(user: Pick<User, 'role' | 'roles' | 'permissions' | 'branchId'> | null | undefined) {
  if (isBranchWarehouseOperator(user)) return false;
  return (
    hasPermission(user, 'products.view') ||
    hasPermission(user, 'products.manage') ||
    hasPermission(user, 'inventory.view') ||
    hasPermission(user, 'inventory.manage')
  );
}

export function canEditPurchasePriceYuan(user: Pick<User, 'role' | 'roles'> | null | undefined) {
  return hasFullAccess(user) || hasRole(user, 'SUPPLY_CHAIN_MANAGER');
}

export function canViewSupplierPayments(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  return (
    hasFullAccess(user) ||
    hasAnyRole(user, ['SUPPLY_CHAIN_MANAGER', 'PROCUREMENT_MANAGER', 'FINANCE_MANAGER', 'HQ_ACCOUNTANT', 'ACCOUNTANT']) ||
    hasPermission(user, 'procurement.view') ||
    hasPermission(user, 'procurement.manage') ||
    hasPermission(user, 'finance.view')
  );
}

export function canCreateSupplierPayment(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  return (
    hasFullAccess(user) ||
    hasAnyRole(user, ['SUPPLY_CHAIN_MANAGER', 'FINANCE_MANAGER', 'HQ_ACCOUNTANT', 'ACCOUNTANT'])
  );
}

export function canEditSupplierPayment(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  return hasFullAccess(user);
}

export function canVoidSupplierPayment(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  return hasFullAccess(user) || hasRole(user, 'FINANCE_MANAGER');
}

export function canAllowSupplierOverpayment(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  return hasFullAccess(user) || hasRole(user, 'FINANCE_MANAGER');
}

export function canArchiveCustomer(user: Pick<User, 'role' | 'roles' | 'branchId'> | null | undefined) {
  return hasFullAccess(user) || hasRole(user, 'FRANCHISE_OWNER') || isBranchSalesManagerUser(user);
}

export function canCancelSale(user: Pick<User, 'role' | 'roles'> | null | undefined) {
  return hasFullAccess(user) || hasRole(user, 'FRANCHISE_OWNER');
}

export function canVoidPayment(user: Pick<User, 'role' | 'roles'> | null | undefined) {
  return hasFullAccess(user) || hasRole(user, 'FRANCHISE_OWNER') || hasRole(user, 'CASHIER');
}

export function canViewHqWarehouse(user: Pick<User, 'role' | 'roles'> | null | undefined) {
  return hasFullAccess(user) || hasAnyRole(user, ['SUPPLY_CHAIN_MANAGER', 'WAREHOUSE_MANAGER']);
}

export function canManageHqWarehouse(user: Pick<User, 'role' | 'roles'> | null | undefined) {
  return hasFullAccess(user);
}

export function canEditWarehouseInfo(user: Pick<User, 'role' | 'roles'> | null | undefined) {
  return hasFullAccess(user);
}

export function canCreateHqEmployee(user: Pick<User, 'role' | 'roles'> | null | undefined) {
  return hasFullAccess(user) || hasRole(user, 'SYSTEM_ADMINISTRATOR');
}

export function canCreateStockMovement(user: Pick<User, 'role' | 'roles' | 'permissions' | 'branchId'> | null | undefined) {
  if (isBranchSalesManagerUser(user)) return false;
  return hasPermission(user, 'inventory.manage');
}

export function isBranchWarehouseOperator(user: Pick<User, 'role' | 'roles' | 'branchId'> | null | undefined) {
  if (!user?.branchId) return false;
  return hasRole(user, 'WAREHOUSE_OPERATOR');
}

/** Branch Owner (Branch CEO) = branch-scoped FRANCHISE_OWNER. */
export function isBranchOwnerUser(user: Pick<User, 'role' | 'roles' | 'branchId'> | null | undefined) {
  if (!user?.branchId || hasFullAccess(user)) return false;
  if (
    isSupplyChainManagerUser(user) ||
    isWarehouseManagerUser(user) ||
    isHqSalesManagerUser(user) ||
    isHqCashierUser(user) ||
    isBranchSalesManagerUser(user) ||
    isBranchWarehouseOperator(user) ||
    hasRole(user, 'MASTER') ||
    isBranchCashierUser(user) ||
    isBranchAccountantUser(user)
  ) {
    return false;
  }
  return hasRole(user, 'FRANCHISE_OWNER');
}

/** Branch Master = branch-scoped MASTER role (service/repair work). */
export function isBranchMasterUser(user: Pick<User, 'role' | 'roles' | 'branchId'> | null | undefined) {
  if (!user?.branchId || hasFullAccess(user)) return false;
  if (
    isSupplyChainManagerUser(user) ||
    isWarehouseManagerUser(user) ||
    isHqSalesManagerUser(user) ||
    isHqCashierUser(user) ||
    isBranchSalesManagerUser(user) ||
    isBranchWarehouseOperator(user) ||
    hasRole(user, 'FRANCHISE_OWNER') ||
    isBranchCashierUser(user) ||
    isBranchAccountantUser(user)
  ) {
    return false;
  }
  return hasRole(user, 'MASTER');
}

/** Branch Cashier = branch-scoped CASHIER (payment only, no sale creation). */
export function isBranchCashierUser(user: Pick<User, 'role' | 'roles' | 'branchId'> | null | undefined) {
  if (!user?.branchId || hasFullAccess(user)) return false;
  if (isHqCashierUser(user)) return false;
  return hasRole(user, 'CASHIER');
}

/** Branch Accountant = branch-scoped ACCOUNTANT (not HQ). */
export function isBranchAccountantUser(user: Pick<User, 'role' | 'roles' | 'branchId'> | null | undefined) {
  if (!user?.branchId || hasFullAccess(user)) return false;
  if (hasRole(user, 'HQ_ACCOUNTANT')) return false;
  return hasRole(user, 'ACCOUNTANT');
}

export function canCreateSale(user: Pick<User, 'role' | 'roles' | 'permissions' | 'branchId'> | null | undefined) {
  if (!user) return false;
  if (isBranchCashierUser(user)) return false;
  return hasPermission(user, 'sales.manage');
}

export function canViewSalesForPayment(user: Pick<User, 'role' | 'roles' | 'permissions' | 'branchId'> | null | undefined) {
  if (!user) return false;
  if (hasPermission(user, 'sales.manage')) return true;
  return isBranchCashierUser(user);
}

export function canManageSaleWorkflow(user: Pick<User, 'role' | 'roles' | 'permissions' | 'branchId'> | null | undefined) {
  return canCreateSale(user);
}

export function isBranchCashierForbiddenPath(pathname: string) {
  return BRANCH_CASHIER_FORBIDDEN_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function isBranchAccountantForbiddenPath(pathname: string) {
  return BRANCH_ACCOUNTANT_FORBIDDEN_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function canBranchCashierAccessPath(pathname: string) {
  if (pathname === '/') return false;
  if (isBranchCashierForbiddenPath(pathname)) return false;
  if (/^\/service\/[^/]+$/.test(pathname)) return true;
  return BRANCH_CASHIER_ALLOWED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function canBranchAccountantAccessPath(pathname: string) {
  if (pathname === '/') return false;
  if (isBranchAccountantForbiddenPath(pathname)) return false;
  return BRANCH_ACCOUNTANT_ALLOWED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function canCreateBranchOwner(user: Pick<User, 'role' | 'roles'> | null | undefined) {
  return hasFullAccess(user);
}

export function canViewInventoryCount(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  return (
    hasFullAccess(user) ||
    hasAnyRole(user, ['WAREHOUSE_MANAGER', 'SUPPLY_CHAIN_MANAGER', 'FRANCHISE_OWNER', 'WAREHOUSE_OPERATOR'])
  );
}

export function canManageInventoryCount(user: Pick<User, 'role' | 'roles' | 'permissions' | 'branchId'> | null | undefined) {
  return isWarehouseManagerUser(user) || isBranchWarehouseOperator(user);
}

export function canApproveInventoryCount(user: Pick<User, 'role' | 'roles' | 'permissions' | 'branchId'> | null | undefined) {
  return hasFullAccess(user) || (hasRole(user, 'FRANCHISE_OWNER') && !!user?.branchId);
}

export function canManageProcurement(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  return hasPermission(user, 'procurement.manage');
}

export function canCreateProcurementOrder(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  return canManageProcurement(user);
}

export function canViewProcurement(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  if (!user) return false;
  if (isWarehouseManagerUser(user)) return false;
  return hasPermission(user, 'procurement.manage') || hasPermission(user, 'procurement.view');
}

export function canReceiveProcurementToHq(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  if (!user) return false;
  if (hasFullAccess(user)) return true;
  if (hasRole(user, 'SUPPLY_CHAIN_MANAGER')) return false;
  return hasRole(user, 'WAREHOUSE_MANAGER') && hasPermission(user, 'procurement.receive');
}

export function canViewChinaReceiving(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  if (!user) return false;
  return canReceiveProcurementToHq(user);
}

export function canViewChinaReceivingActs(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  if (!user) return false;
  return canReceiveProcurementToHq(user) || isSupplyChainManagerUser(user) || hasFullAccess(user);
}

export function canArchiveDifferenceAct(user: Pick<User, 'role' | 'roles'> | null | undefined) {
  return hasFullAccess(user);
}

export function canViewChinaReceivingMenu(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  return canViewChinaReceiving(user);
}

export function canViewDistributionMenu(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  if (!user) return false;
  if (isSupplyChainManagerUser(user)) return false;
  return canViewDistribution(user);
}

export function canDeleteInventoryCount(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  return hasFullAccess(user);
}

export function canAssignHqWarehouseManager(user: Pick<User, 'role' | 'roles'> | null | undefined) {
  return hasFullAccess(user);
}

export function canManageInventoryCountForWarehouse(
  user: Pick<User, 'role' | 'roles' | 'permissions' | 'branchId' | 'assignedHqWarehouseIds'> | null | undefined,
  warehouseId?: string | null,
) {
  if (!canManageInventoryCount(user)) return false;
  if (!user || !warehouseId) return canManageInventoryCount(user);
  if (hasFullAccess(user)) return true;
  if (isWarehouseManagerUser(user)) {
    return (user.assignedHqWarehouseIds ?? []).includes(warehouseId);
  }
  return true;
}

export function canCreateHqInventoryCount(
  user: Pick<User, 'role' | 'roles' | 'permissions' | 'assignedHqWarehouseIds'> | null | undefined,
) {
  if (!user) return false;
  if (hasFullAccess(user)) return true;
  if (isWarehouseManagerUser(user)) {
    return (user.assignedHqWarehouseIds?.length ?? 0) > 0;
  }
  return false;
}

export function canEditProcurementOrderItems(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  if (!user) return false;
  if (hasRole(user, 'WAREHOUSE_MANAGER') || hasRole(user, 'FINANCE_MANAGER') || hasRole(user, 'HQ_ACCOUNTANT') || hasRole(user, 'ACCOUNTANT')) {
    return false;
  }
  return hasFullAccess(user) || hasRole(user, 'SUPPLY_CHAIN_MANAGER') || hasRole(user, 'PROCUREMENT_MANAGER');
}

export function canUnlockProcurementOrder(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  if (!user) return false;
  return hasFullAccess(user) || hasRole(user, 'CEO') || hasRole(user, 'OWNER');
}

export function canDeleteProcurementOrder(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  return canUnlockProcurementOrder(user);
}

export function canDeleteHqWarehouse(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  return canUnlockProcurementOrder(user);
}

export function isBranchPanelUser(user: Pick<User, 'branchId'> | null | undefined) {
  return !!user?.branchId;
}

export function canManageYuanRate(user: Pick<User, 'role' | 'roles' | 'permissions' | 'branchId'> | null | undefined) {
  if (!user) return false;
  return canManageProductCatalog(user);
}

export function canDeleteHqGoodsReceiving(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  return canUnlockProcurementOrder(user);
}

export function canManageTransportCompany(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  if (!user) return false;
  return hasFullAccess(user) || hasRole(user, 'SUPPLY_CHAIN_MANAGER');
}

export function canViewTransportCompany(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  if (!user) return false;
  return (
    canManageTransportCompany(user) ||
    hasAnyRole(user, ['WAREHOUSE_MANAGER', 'FINANCE_MANAGER', 'HQ_ACCOUNTANT', 'ACCOUNTANT', 'PROCUREMENT_MANAGER'])
  );
}

export function canManageSvhToHqTransport(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  if (!user) return false;
  return hasFullAccess(user) || hasRole(user, 'SUPPLY_CHAIN_MANAGER');
}

export function canEditLocalTransport(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  return canManageSvhToHqTransport(user);
}

export function canViewSvhToHqTransport(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  if (!user) return false;
  return (
    canManageSvhToHqTransport(user) ||
    hasAnyRole(user, ['WAREHOUSE_MANAGER', 'FINANCE_MANAGER', 'HQ_ACCOUNTANT', 'ACCOUNTANT', 'PROCUREMENT_MANAGER'])
  );
}

export function canConfirmSvhToHqArrival(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  if (!user) return false;
  return canManageSvhToHqTransport(user) || hasRole(user, 'WAREHOUSE_MANAGER');
}

export function canEditProcurementOrderItemsInWindow(
  user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined,
  editWindow: {
    isEditable?: boolean;
    editWindowStatus?: string;
    sentToSupplierAt?: string | null;
  },
) {
  if (!user) return false;
  if (!editWindow.sentToSupplierAt) {
    return canEditProcurementOrderItems(user);
  }
  if (!editWindow.isEditable) {
    return false;
  }
  if (editWindow.editWindowStatus === 'CEO_UNLOCKED') {
    return canUnlockProcurementOrder(user);
  }
  return canEditProcurementOrderItems(user);
}

export function canCreateDistributionOrder(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  return canManageDistributionOrders(user);
}

export function canManageDistributionOrders(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  if (!user) return false;
  return hasFullAccess(user) || hasRole(user, 'HQ_SALES_MANAGER');
}

export function canViewDistribution(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  if (!user) return false;
  return (
    canManageDistributionOrders(user) ||
    canDispatchFromHq(user) ||
    isSupplyChainManagerUser(user) ||
    hasRole(user, 'MANAGER') ||
    hasRole(user, 'FRANCHISE_OWNER') ||
    hasPermission(user, 'distribution.manage') ||
    hasPermission(user, 'distribution.view')
  );
}

export function canRecordHqDistributionPayment(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  if (!user) return false;
  return (
    hasFullAccess(user) ||
    hasRole(user, 'HQ_CASHIER') ||
    hasRole(user, 'FINANCE_MANAGER') ||
    hasRole(user, 'HQ_ACCOUNTANT') || hasRole(user, 'ACCOUNTANT')
  );
}

export function canRecordDistributionPayment(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  if (!user) return false;
  return canRecordHqDistributionPayment(user) || canSubmitBranchInvoicePayment(user) || hasPermission(user, 'payments.manage');
}

export function canSubmitBranchInvoicePayment(
  user: (Pick<User, 'role' | 'roles' | 'permissions'> & { branchId?: string | null }) | null | undefined,
) {
  if (!user?.branchId || hasFullAccess(user)) return false;
  if (hasRole(user, 'HQ_CASHIER') || hasRole(user, 'HQ_ACCOUNTANT') || hasRole(user, 'FINANCE_MANAGER')) return false;
  return hasRole(user, 'CASHIER') || hasRole(user, 'ACCOUNTANT') || hasPermission(user, 'payments.manage');
}

export function canConfirmBranchInvoicePayment(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  return canRecordHqDistributionPayment(user);
}

export function canRequestBranchOrderInstallment(user: Pick<User, 'role' | 'roles' | 'permissions' | 'branchId'> | null | undefined) {
  if (!user?.branchId || hasFullAccess(user)) return false;
  return hasRole(user, 'ACCOUNTANT') || hasPermission(user, 'finance.view');
}

export function canApproveBranchOrderInstallment(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  if (!user) return false;
  return hasFullAccess(user) || hasRole(user, 'CEO') || hasRole(user, 'OWNER');
}

export function canManageBranchPurchaseRequests(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  return canManageDistributionOrders(user);
}

export function canAssignBranchHqWarehouse(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  if (!user) return false;
  return hasFullAccess(user);
}

/** Only full-access HQ roles (CEO/OWNER/SYSTEM_ADMIN) may change Branch Type. */
export function canChangeBranchType(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  if (!user) return false;
  return hasFullAccess(user);
}

export function canManageBranches(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  if (!user) return false;
  if (hasFullAccess(user)) return true;
  return hasPermission(user, 'branches.manage');
}

/** Only Branch Manager (MANAGER) creates routine HQ orders. */
export function canCreateBranchHqOrder(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  if (!user) return false;
  if (hasFullAccess(user)) return true;
  return hasRole(user, 'MANAGER');
}

/** Branch Sales Manager creates product requests to HQ (not warehouse operator). */
export function canCreateBranchProductRequest(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  if (!user) return false;
  if (hasFullAccess(user)) return true;
  return false;
}

export function canManageOwnBranchProductRequest(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  return canCreateBranchHqOrder(user) || canCreateBranchProductRequest(user);
}

/** Branch Warehouse Operator receives HQ shipments at branch. */
export function canReceiveBranchDistribution(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  if (!user) return false;
  if (hasFullAccess(user)) return true;
  return hasRole(user, 'WAREHOUSE_OPERATOR');
}

/** Branch roles that can view branch purchase requests (not create). */
export function canViewBranchPurchaseRequests(user: Pick<User, 'role' | 'roles' | 'permissions' | 'branchId'> | null | undefined) {
  if (!user) return false;
  if (isBranchWarehouseOperator(user)) return false;
  if (hasFullAccess(user)) return true;
  if (canManageBranchPurchaseRequests(user)) return true;
  if (isHqSalesManagerUser(user)) return true;
  return hasAnyRole(user, ['MANAGER', 'FRANCHISE_OWNER', 'MASTER']);
}

export function canViewBranchDiscrepancyReports(user: Pick<User, 'role' | 'roles' | 'permissions' | 'branchId'> | null | undefined) {
  if (!user) return false;
  return hasFullAccess(user) || hasRole(user, 'HQ_SALES_MANAGER') || isBranchWarehouseOperator(user);
}

export function canSeeHqStockInBranchRequests(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  if (!user) return false;
  return hasFullAccess(user) || canManageBranchPurchaseRequests(user);
}

export function canViewBranchProductShortages(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  if (!user) return false;
  return hasFullAccess(user) || hasRole(user, 'SYSTEM_ADMINISTRATOR');
}

export function isExecutiveBranchOrderInspector(user: Pick<User, 'role' | 'roles'> | null | undefined) {
  return hasFullAccess(user) && !isHqSalesManagerUser(user);
}

export function canDispatchFromHq(user: Pick<User, 'role' | 'roles'> | null | undefined) {
  return hasFullAccess(user) || hasRole(user, 'WAREHOUSE_MANAGER');
}

export function canManageUsers(user: Pick<User, 'role' | 'roles' | 'permissions' | 'branchId'> | null | undefined) {
  if (!user) return false;
  if (hasFullAccess(user)) return true;
  return hasPermission(user, 'users.manage');
}
