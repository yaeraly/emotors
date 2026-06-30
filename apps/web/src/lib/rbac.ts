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
    'products.manage',
    'procurement.view',
    'procurement.receive',
  ],
  CONTENT_CREATOR: ['marketing.manage'],
  ACADEMY_DIRECTOR: ['academy.manage'],
  ACADEMY_MANAGER: ['academy.manage'],
  MARKETING_MANAGER: ['marketing.manage', 'analytics.view'],
  PROCUREMENT_MANAGER: ['procurement.manage'],
  SUPPLY_CHAIN_MANAGER: [
    'inventory.manage',
    'inventory.view',
    'procurement.manage',
    'procurement.view',
    'procurement.receive',
    'distribution.manage',
    'products.manage',
    'products.archive',
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

const FRANCHISE_OWNER_PASSWORD_RESET_ALLOWED_ROLES: Role[] = [
  'MANAGER',
  'MASTER',
  'WAREHOUSE_OPERATOR',
  'CASHIER',
];

export function getDefaultRoute(role: Role) {
  if (role === 'OWNER' || role === 'CEO' || role === 'SYSTEM_ADMINISTRATOR') return '/dashboard';
  if (role === 'SUPPLY_CHAIN_MANAGER') return '/procurement';
  if (role === 'WAREHOUSE_MANAGER') return '/inventory';
  if (role === 'FINANCE_MANAGER' || role === 'ACCOUNTANT') return '/finance';
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
  if (pathname.startsWith('/procurement')) return canViewProcurement(user);
  if (pathname.startsWith('/branch-purchase-requests')) {
    return hasPermission(user, 'procurement.manage') || hasPermission(user, 'crm.manage') || hasPermission(user, 'sales.manage');
  }
  if (pathname.startsWith('/reservations')) return hasPermission(user, 'sales.manage');
  if (pathname.startsWith('/warehouse-release')) return hasPermission(user, 'inventory.manage') || hasPermission(user, 'sales.manage');
  if (pathname.startsWith('/returns')) return hasPermission(user, 'sales.manage') || hasPermission(user, 'payments.manage');
  if (pathname.startsWith('/warranty/claims')) return hasPermission(user, 'service.manage') || hasPermission(user, 'distribution.manage');
  if (pathname.startsWith('/supplier-claims')) return hasPermission(user, 'procurement.manage') || hasPermission(user, 'distribution.manage');
  if (pathname.startsWith('/alerts')) return true;
  if (pathname.startsWith('/distribution/invoices')) {
    return hasPermission(user, 'distribution.manage') || hasPermission(user, 'finance.view') || hasPermission(user, 'payments.manage') || hasPermission(user, 'sales.manage');
  }
  if (pathname.startsWith('/distribution/orders/new')) return canCreateDistributionOrder(user);
  if (pathname.startsWith('/distribution')) {
    return hasPermission(user, 'distribution.manage') || hasPermission(user, 'finance.view');
  }
  if (pathname.startsWith('/supply-chain')) return hasPermission(user, 'distribution.manage');
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
  return hasPermission(user, 'products.manage');
}

export function canEditProductCatalog(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  return canManageProductCatalog(user);
}

export function canArchiveProduct(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  return hasPermission(user, 'products.archive');
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

export function canManageProcurement(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  return hasPermission(user, 'procurement.manage');
}

export function canCreateProcurementOrder(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  return canManageProcurement(user);
}

export function canViewProcurement(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  return hasPermission(user, 'procurement.manage') || hasPermission(user, 'procurement.view');
}

export function canReceiveProcurementToHq(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  return hasPermission(user, 'procurement.receive') || hasPermission(user, 'procurement.manage');
}

export function canCreateDistributionOrder(user: Pick<User, 'role' | 'roles'> | null | undefined) {
  return hasFullAccess(user) || hasRole(user, 'SUPPLY_CHAIN_MANAGER');
}

export function canDispatchFromHq(user: Pick<User, 'role' | 'roles'> | null | undefined) {
  return hasFullAccess(user) || hasRole(user, 'WAREHOUSE_MANAGER');
}

export function canManageUsers(user: Pick<User, 'role' | 'roles' | 'permissions' | 'branchId'> | null | undefined) {
  if (!user) return false;
  if (hasFullAccess(user)) return true;
  return hasPermission(user, 'users.manage');
}
