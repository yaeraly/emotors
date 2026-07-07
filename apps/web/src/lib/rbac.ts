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
  WAREHOUSE_OPERATOR: ['inventory.manage', 'distribution.manage', 'products.view'],
  CASHIER: ['payments.manage', 'sales.manage'],
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
  '/supply-chain',
  '/alerts',
  '/notifications',
  '/branch-purchase-requests',
  '/supplier-claims',
];

const SUPPLY_CHAIN_MANAGER_FORBIDDEN_PREFIXES = [
  '/china-receiving',
  '/procurement/receiving',
  '/distribution',
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
  if (role === 'WAREHOUSE_MANAGER') return '/inventory';
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
  if (isSupplyChainManagerUser(user)) return '/supply-chain';
  if (isHqSalesManagerUser(user)) return '/distribution';
  if (isHqCashierUser(user)) return '/distribution/invoices';
  if (isWarehouseManagerUser(user)) return '/inventory';
  if (hasRole(user, 'FRANCHISE_OWNER')) return '/dashboard';
  if (hasPermission(user, 'procurement.view') || hasPermission(user, 'procurement.manage')) return '/procurement';
  if (hasRole(user, 'WAREHOUSE_MANAGER')) return '/inventory';
  if (hasRole(user, 'WAREHOUSE_OPERATOR')) return '/inventory';
  if (hasPermission(user, 'payments.manage')) return '/payments';
  if (hasPermission(user, 'finance.view')) return '/finance';
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
  if (pathname === '/dashboard') return true;
  if (pathname === '/branch-dashboard') {
    return hasPermission(user, 'crm.manage') || hasPermission(user, 'sales.manage');
  }
  if (pathname === '/finance') return hasPermission(user, 'finance.view');
  if (pathname === '/payments') return hasPermission(user, 'payments.manage') || hasPermission(user, 'sales.manage');
  if (pathname.startsWith('/customers')) return hasPermission(user, 'crm.manage');
  if (pathname.startsWith('/sales')) return hasPermission(user, 'sales.manage');
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
  if (pathname.startsWith('/inventory') ||
    pathname.startsWith('/warehouses')
  ) {
    return hasPermission(user, 'inventory.manage') || hasPermission(user, 'inventory.view');
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
  if (pathname.startsWith('/procurement')) return canViewProcurement(user);
  if (pathname.startsWith('/branch-purchase-requests')) {
    return canManageBranchPurchaseRequests(user) || hasPermission(user, 'crm.manage') || hasPermission(user, 'sales.manage') || hasPermission(user, 'distribution.view');
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

export function canViewProductMaster(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  if (!user) return false;
  if (isWarehouseManagerUser(user)) return false;
  return canViewProductCatalog(user);
}

export function canViewBranchWarehouses(user: Pick<User, 'role' | 'roles' | 'permissions' | 'branchId'> | null | undefined) {
  if (!user) return false;
  if (isWarehouseManagerUser(user)) return false;
  return (
    hasFullAccess(user) ||
    hasRole(user, 'SUPPLY_CHAIN_MANAGER') ||
    hasRole(user, 'HQ_SALES_MANAGER') ||
    hasRole(user, 'FRANCHISE_OWNER') ||
    hasRole(user, 'WAREHOUSE_OPERATOR') ||
    hasRole(user, 'MANAGER')
  );
}

export function canEditProductCatalog(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  return canManageProductCatalog(user);
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

export function canViewProductCatalog(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
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

export function canArchiveCustomer(user: Pick<User, 'role' | 'roles'> | null | undefined) {
  return hasFullAccess(user) || hasRole(user, 'FRANCHISE_OWNER');
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
  return hasFullAccess(user) || hasAnyRole(user, ['SUPPLY_CHAIN_MANAGER']);
}

export function canCreateHqEmployee(user: Pick<User, 'role' | 'roles'> | null | undefined) {
  return hasFullAccess(user) || hasRole(user, 'SYSTEM_ADMINISTRATOR');
}

export function canCreateStockMovement(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  return hasPermission(user, 'inventory.manage');
}

export function isBranchWarehouseOperator(user: Pick<User, 'role' | 'roles' | 'branchId'> | null | undefined) {
  if (!user?.branchId) return false;
  return hasRole(user, 'WAREHOUSE_OPERATOR');
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
  return canRecordHqDistributionPayment(user) || hasPermission(user, 'payments.manage');
}

export function canManageBranchPurchaseRequests(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  return canManageDistributionOrders(user);
}

export function canDispatchFromHq(user: Pick<User, 'role' | 'roles'> | null | undefined) {
  return hasFullAccess(user) || hasRole(user, 'WAREHOUSE_MANAGER');
}

export function canManageUsers(user: Pick<User, 'role' | 'roles' | 'permissions' | 'branchId'> | null | undefined) {
  if (!user) return false;
  if (hasFullAccess(user)) return true;
  return hasPermission(user, 'users.manage');
}
