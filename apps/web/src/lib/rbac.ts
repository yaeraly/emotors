import type { Role, User } from './types';

const ALL_PERMISSIONS = [
  'users.manage',
  'branches.manage',
  'crm.manage',
  'sales.manage',
  'inventory.manage',
  'inventory.view',
  'service.manage',
  'finance.view',
  'payments.manage',
  'payroll.manage',
  'kpi.view',
  'reports.view',
  'procurement.manage',
  'distribution.manage',
  'academy.manage',
  'marketing.manage',
  'analytics.view',
] as const;

const ROLE_PERMISSIONS: Record<Role, string[]> = {
  OWNER: [...ALL_PERMISSIONS],
  CEO: [...ALL_PERMISSIONS],
  SYSTEM_ADMINISTRATOR: [...ALL_PERMISSIONS],
  FRANCHISE_DIRECTOR: ['branches.manage', 'academy.manage', 'analytics.view'],
  FINANCE_MANAGER: ['finance.view', 'payroll.manage', 'analytics.view'],
  WAREHOUSE_MANAGER: ['inventory.manage', 'distribution.manage'],
  CONTENT_CREATOR: ['marketing.manage'],
  ACADEMY_DIRECTOR: ['academy.manage'],
  ACADEMY_MANAGER: ['academy.manage'],
  MARKETING_MANAGER: ['marketing.manage'],
  PROCUREMENT_MANAGER: ['procurement.manage'],
  SUPPLY_CHAIN_MANAGER: ['inventory.manage', 'procurement.manage', 'distribution.manage'],
  INVESTMENT_MANAGER: ['analytics.view'],
  EXPANSION_MANAGER: ['analytics.view'],
  FRANCHISE_OWNER: [
    'users.manage',
    'crm.manage',
    'sales.manage',
    'inventory.manage',
    'inventory.view',
    'service.manage',
    'finance.view',
    'payments.manage',
    'kpi.view',
    'reports.view',
  ],
  MANAGER: ['crm.manage', 'sales.manage', 'inventory.view'],
  MASTER: ['service.manage'],
  WAREHOUSE_OPERATOR: ['inventory.manage', 'distribution.manage'],
  CASHIER: ['payments.manage', 'sales.manage'],
  ACCOUNTANT: ['finance.view', 'payroll.manage'],
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
  if (role === 'FRANCHISE_OWNER') return '/branch-dashboard';
  if (role === 'MANAGER') return '/customers';
  if (role === 'MASTER') return '/service';
  if (role === 'WAREHOUSE_OPERATOR') return '/distribution/receivings';
  if (role === 'CASHIER' || role === 'SALESPERSON') return '/sales';
  if (role === 'PROCUREMENT_MANAGER') return '/procurement';
  if (role === 'ACADEMY_DIRECTOR' || role === 'ACADEMY_MANAGER') return '/academy';
  if (role === 'MARKETING_MANAGER' || role === 'CONTENT_CREATOR') return '/marketing';
  return '/dashboard';
}

export function getDefaultRouteForUser(user: Pick<User, 'role' | 'roles' | 'permissions'>) {
  if (hasRole(user, 'OWNER') || hasRole(user, 'CEO') || hasRole(user, 'SYSTEM_ADMINISTRATOR')) return '/dashboard';
  if (hasRole(user, 'FRANCHISE_OWNER')) return '/branch-dashboard';
  if (hasPermission(user, 'procurement.manage')) return '/procurement';
  if (hasRole(user, 'WAREHOUSE_MANAGER')) return '/inventory';
  if (hasRole(user, 'WAREHOUSE_OPERATOR')) return '/distribution/receivings';
  if (hasPermission(user, 'payments.manage')) return '/payments';
  if (hasPermission(user, 'finance.view')) return '/finance';
  if (hasPermission(user, 'crm.manage')) return '/customers';
  if (hasPermission(user, 'sales.manage')) return '/sales';
  if (hasPermission(user, 'inventory.manage') || hasPermission(user, 'inventory.view')) return '/inventory';
  if (hasPermission(user, 'service.manage')) return '/service';
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
  if (pathname.startsWith('/stock-movements')) {
    return hasPermission(user, 'inventory.manage');
  }
  if (
    pathname.startsWith('/inventory') ||
    pathname.startsWith('/products') ||
    pathname.startsWith('/warehouses')
  ) {
    return hasPermission(user, 'inventory.manage') || hasPermission(user, 'inventory.view');
  }
  if (pathname.startsWith('/service')) return hasPermission(user, 'service.manage');
  if (pathname.startsWith('/users')) return hasPermission(user, 'users.manage');
  if (pathname.startsWith('/branches')) return hasPermission(user, 'branches.manage');
  if (pathname.startsWith('/procurement')) return hasPermission(user, 'procurement.manage');
  if (pathname.startsWith('/distribution/invoices')) {
    return hasPermission(user, 'distribution.manage') || hasPermission(user, 'finance.view') || hasPermission(user, 'payments.manage') || hasPermission(user, 'sales.manage');
  }
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
  if (pathname.startsWith('/investment') || pathname.startsWith('/expansion')) return hasPermission(user, 'analytics.view');
  return true;
}

export function canResetUserPassword(
  actor: Pick<User, 'role' | 'roles' | 'branchId'> | null | undefined,
  target: Pick<User, 'role' | 'roles' | 'branchId'> | null | undefined,
) {
  if (!actor || !target) return false;
  if (hasRole(actor, 'OWNER') || hasRole(actor, 'CEO') || hasRole(actor, 'SYSTEM_ADMINISTRATOR')) {
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

export function canManageProductCatalog(user: Pick<User, 'role' | 'roles'> | null | undefined) {
  return hasAnyRole(user, ['OWNER', 'CEO', 'SYSTEM_ADMINISTRATOR', 'WAREHOUSE_MANAGER', 'SUPPLY_CHAIN_MANAGER']);
}

export function canArchiveCustomer(user: Pick<User, 'role' | 'roles'> | null | undefined) {
  return hasAnyRole(user, ['OWNER', 'CEO', 'SYSTEM_ADMINISTRATOR', 'FRANCHISE_OWNER']);
}

export function canCancelSale(user: Pick<User, 'role' | 'roles'> | null | undefined) {
  return hasAnyRole(user, ['OWNER', 'CEO', 'SYSTEM_ADMINISTRATOR', 'FRANCHISE_OWNER']);
}

export function canVoidPayment(user: Pick<User, 'role' | 'roles'> | null | undefined) {
  return hasAnyRole(user, ['OWNER', 'CEO', 'SYSTEM_ADMINISTRATOR', 'FRANCHISE_OWNER', 'CASHIER']);
}

export function canCreateStockMovement(user: Pick<User, 'role' | 'roles' | 'permissions'> | null | undefined) {
  return hasPermission(user, 'inventory.manage');
}
