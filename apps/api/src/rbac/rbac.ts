import { Role } from '@prisma/client';

/** CEO (and legacy OWNER) bypass role/permission checks in guards. */
export const FULL_ACCESS_ROLES: Role[] = [Role.OWNER, Role.CEO];

/** Only CEO is the HQ super administrator. */
export const SUPER_ADMIN_ROLES: Role[] = [Role.CEO];

export const HQ_ROLES: Role[] = [
  Role.CEO,
  Role.SYSTEM_ADMINISTRATOR,
  Role.FRANCHISE_DIRECTOR,
  Role.SUPPLY_CHAIN_MANAGER,
  Role.WAREHOUSE_MANAGER,
  Role.FINANCE_MANAGER,
  Role.ACCOUNTANT,
  Role.MARKETING_MANAGER,
  Role.CONTENT_CREATOR,
  Role.ACADEMY_DIRECTOR,
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
  'roles.manage',
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
  'procurement.landed_cost.view',
  'distribution.manage',
  'academy.manage',
  'marketing.manage',
  'marketing.content',
  'analytics.view',
  'audit.view',
  'settings.manage',
  'products.view',
  'products.manage',
  'products.archive',
] as const;

export type PermissionCode = (typeof ALL_PERMISSION_CODES)[number];

export const ROLE_PERMISSIONS: Record<Role, string[]> = {
  OWNER: [...ALL_PERMISSION_CODES],
  CEO: [...ALL_PERMISSION_CODES],
  SYSTEM_ADMINISTRATOR: [
    'users.manage',
    'roles.manage',
    'audit.view',
    'settings.manage',
  ],
  FRANCHISE_DIRECTOR: [
    'branches.manage',
    'academy.manage',
    'kpi.view',
    'audit.view',
    'analytics.view',
  ],
  SUPPLY_CHAIN_MANAGER: [
    'procurement.manage',
    'distribution.manage',
    'inventory.manage',
    'inventory.view',
    'products.view',
    'products.manage',
    'products.archive',
  ],
  WAREHOUSE_MANAGER: [
    'inventory.manage',
    'inventory.view',
    'distribution.manage',
    'products.view',
    'products.manage',
  ],
  FINANCE_MANAGER: [
    'finance.view',
    'payroll.manage',
    'reports.view',
    'analytics.view',
    'procurement.landed_cost.view',
    'products.view',
  ],
  ACCOUNTANT: ['finance.view', 'payments.manage', 'payroll.manage'],
  MARKETING_MANAGER: ['marketing.manage'],
  CONTENT_CREATOR: ['marketing.content'],
  ACADEMY_DIRECTOR: ['academy.manage'],
  ACADEMY_MANAGER: ['academy.manage'],
  PROCUREMENT_MANAGER: ['procurement.manage'],
  INVESTMENT_MANAGER: ['analytics.view', 'branches.manage'],
  EXPANSION_MANAGER: ['analytics.view', 'branches.manage'],
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
  CASHIER: ['payments.manage', 'sales.manage', 'products.view'],
  SALESPERSON: ['sales.manage', 'products.view'],
};

export const PRODUCT_CATALOG_MANAGE_ROLES: Role[] = [
  Role.CEO,
  Role.SUPPLY_CHAIN_MANAGER,
  Role.WAREHOUSE_MANAGER,
];

export const PRODUCT_CATALOG_ARCHIVE_ROLES: Role[] = [
  Role.CEO,
  Role.SUPPLY_CHAIN_MANAGER,
];

export function userCanManageProductCatalog(user: { role: Role; roles?: Role[] }) {
  const roles = uniqueRoles(user.roles?.length ? user.roles : [user.role]);
  return roles.some((role) => PRODUCT_CATALOG_MANAGE_ROLES.includes(role));
}

export function userCanArchiveProductCatalog(user: { role: Role; roles?: Role[] }) {
  const roles = uniqueRoles(user.roles?.length ? user.roles : [user.role]);
  return roles.some((role) => PRODUCT_CATALOG_ARCHIVE_ROLES.includes(role));
}

export function isFullAccessRole(role: Role) {
  return FULL_ACCESS_ROLES.includes(role);
}

export function isSuperAdminRole(role: Role) {
  return SUPER_ADMIN_ROLES.includes(role);
}

export function isHqRole(role: Role) {
  return HQ_ROLES.includes(role);
}

export function canAccessAllBranches(role: Role) {
  return isFullAccessRole(role) || isHqRole(role);
}

export function userCanAccessAllBranches(user: { role: Role; roles?: Role[] }) {
  const roles = user.roles?.length ? user.roles : [user.role];
  return roles.some((role) => canAccessAllBranches(role));
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

export function hasAnyFullAccessRole(roles: Role[]) {
  return uniqueRoles(roles).some((role) => isFullAccessRole(role));
}

export function hasAnySuperAdminRole(roles: Role[]) {
  return uniqueRoles(roles).some((role) => isSuperAdminRole(role));
}

export function hasAnyHqRole(roles: Role[]) {
  return uniqueRoles(roles).some((role) => isHqRole(role));
}

export function anyRoleRequiresBranch(roles: Role[]) {
  return uniqueRoles(roles).some((role) => requiresBranch(role));
}

export function userHasPermission(
  user: { role: Role; roles?: Role[]; permissions?: string[] },
  ...required: string[]
) {
  if (!required.length) return true;
  const roles = user.roles?.length ? user.roles : [user.role];
  if (hasAnyFullAccessRole(roles)) return true;
  const permissions = user.permissions?.length
    ? user.permissions
    : permissionsForRoles(roles);
  return required.some((code) => permissions.includes(code));
}

export function userHasAllPermissions(
  user: { role: Role; roles?: Role[]; permissions?: string[] },
  ...required: string[]
) {
  if (!required.length) return true;
  const roles = user.roles?.length ? user.roles : [user.role];
  if (hasAnyFullAccessRole(roles)) return true;
  const permissions = user.permissions?.length
    ? user.permissions
    : permissionsForRoles(roles);
  return required.every((code) => permissions.includes(code));
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
