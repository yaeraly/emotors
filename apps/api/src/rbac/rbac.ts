import { Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';

export const FULL_ACCESS_ROLES: Role[] = [
  Role.OWNER,
  Role.CEO,
];

export const HQ_EMPLOYEE_ROLES: Role[] = [
  Role.CEO,
  Role.FRANCHISE_DIRECTOR,
  Role.SUPPLY_CHAIN_MANAGER,
  Role.WAREHOUSE_MANAGER,
  Role.FINANCE_MANAGER,
  Role.ACCOUNTANT,
  Role.MARKETING_MANAGER,
  Role.CONTENT_CREATOR,
  Role.ACADEMY_DIRECTOR,
  Role.SYSTEM_ADMINISTRATOR,
];

export const HQ_ROLES: Role[] = [
  ...FULL_ACCESS_ROLES,
  ...HQ_EMPLOYEE_ROLES.filter((role) => !FULL_ACCESS_ROLES.includes(role)),
  Role.ACADEMY_MANAGER,
  Role.PROCUREMENT_MANAGER,
  Role.INVESTMENT_MANAGER,
  Role.EXPANSION_MANAGER,
];

export const BRANCH_REQUIRED_ROLES: Role[] = [
  Role.FRANCHISE_OWNER,
  Role.MANAGER,
  Role.MASTER,
  Role.WAREHOUSE_OPERATOR,
  Role.CASHIER,
];

export const ALL_PERMISSION_CODES = [
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

export const ROLE_PERMISSIONS: Record<Role, string[]> = {
  OWNER: [...ALL_PERMISSION_CODES],
  CEO: [...ALL_PERMISSION_CODES],
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

export function isFullAccessRole(role: Role) {
  return FULL_ACCESS_ROLES.includes(role);
}

export function isHqRole(role: Role) {
  return HQ_ROLES.includes(role);
}

export function isHqEmployeeRole(role: Role) {
  return HQ_EMPLOYEE_ROLES.includes(role);
}

export function canAccessAllBranches(role: Role) {
  return isHqRole(role);
}

export function requiresBranch(role: Role) {
  return BRANCH_REQUIRED_ROLES.includes(role);
}

export function permissionsForRole(role: Role) {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function uniqueRoles(roles: Role[]) {
  return Array.from(new Set(roles));
}

export function permissionsForRoles(roles: Role[]) {
  return Array.from(
    new Set(uniqueRoles(roles).flatMap((role) => permissionsForRole(role))),
  );
}

export function resolveUserRoles(user: Pick<AuthUser, 'role' | 'roles'>) {
  return user.roles?.length ? user.roles : [user.role];
}

export function resolveUserPermissions(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  if (user.permissions?.length) {
    return user.permissions;
  }
  return permissionsForRoles(resolveUserRoles(user));
}

export function userHasPermission(
  user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>,
  permission: string,
) {
  return resolveUserPermissions(user).includes(permission);
}

export function userHasAnyPermission(
  user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>,
  permissions: string[],
) {
  const userRoles = resolveUserRoles(user);
  if (hasAnyFullAccessRole(userRoles)) {
    return true;
  }
  const userPermissions = resolveUserPermissions(user);
  return permissions.some((permission) => userPermissions.includes(permission));
}

export function hasAnyFullAccessRole(roles: Role[]) {
  return uniqueRoles(roles).some((role) => isFullAccessRole(role));
}

export function hasAnyHqRole(roles: Role[]) {
  return uniqueRoles(roles).some((role) => isHqRole(role));
}

export function anyRoleRequiresBranch(roles: Role[]) {
  return uniqueRoles(roles).some((role) => requiresBranch(role));
}

export function roleCanAccessRequiredRoles(role: Role, requiredRoles: Role[]) {
  return rolesCanAccessRequiredRoles([role], requiredRoles);
}

export function rolesCanAccessRequiredRoles(roles: Role[], requiredRoles: Role[]) {
  const userRoles = uniqueRoles(roles);
  if (!userRoles.length) {
    return false;
  }

  return hasAnyFullAccessRole(userRoles) || requiredRoles.some((requiredRole) => userRoles.includes(requiredRole));
}

export function canManageProductCatalog(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  return userHasPermission(user, 'products.manage');
}

export function canArchiveProduct(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  return userHasPermission(user, 'products.archive');
}

export function canViewProductCatalog(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  return userHasAnyPermission(user, [
    'products.view',
    'products.manage',
    'inventory.view',
    'inventory.manage',
  ]);
}

export function canEditPurchasePriceYuan(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  const roles = resolveUserRoles(user);
  return hasAnyFullAccessRole(roles) || roles.includes(Role.SUPPLY_CHAIN_MANAGER);
}

export function canCreateProcurementOrder(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  return userHasPermission(user, 'procurement.manage');
}

export function canViewProcurement(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  return userHasAnyPermission(user, ['procurement.manage', 'procurement.view']);
}

export function canReceiveProcurementToHq(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  return userHasAnyPermission(user, ['procurement.receive', 'procurement.manage']);
}

export function canCreateDistributionOrder(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  const roles = resolveUserRoles(user);
  return hasAnyFullAccessRole(roles) || roles.includes(Role.SUPPLY_CHAIN_MANAGER);
}

export function canDispatchFromHq(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  const roles = resolveUserRoles(user);
  return hasAnyFullAccessRole(roles) || roles.includes(Role.WAREHOUSE_MANAGER);
}

export function canManageUsers(user: Pick<AuthUser, 'role' | 'roles' | 'permissions' | 'branchId'>) {
  if (hasAnyFullAccessRole(resolveUserRoles(user))) {
    return true;
  }
  if (userHasPermission(user, 'users.manage')) {
    return true;
  }
  return false;
}

export function legacyRoleCanAccessRequiredRoles(role: Role, requiredRoles: Role[]) {
  if (isFullAccessRole(role) || requiredRoles.includes(role)) {
    return true;
  }

  const capabilityRoles = requiredRoles.filter((requiredRole) => !isFullAccessRole(requiredRole));
  if (!capabilityRoles.length) {
    return false;
  }

  const permissions = new Set(permissionsForRole(role));
  return capabilityRoles.some((requiredRole) =>
    permissionsForRole(requiredRole).some((permission) => permissions.has(permission)),
  );
}
