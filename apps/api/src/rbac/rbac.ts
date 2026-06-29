import { Role } from '@prisma/client';

export const FULL_ACCESS_ROLES: Role[] = [
  Role.OWNER,
  Role.CEO,
  Role.SYSTEM_ADMINISTRATOR,
];

export const HQ_ROLES: Role[] = [
  ...FULL_ACCESS_ROLES,
  Role.FRANCHISE_DIRECTOR,
  Role.FINANCE_MANAGER,
  Role.WAREHOUSE_MANAGER,
  Role.CONTENT_CREATOR,
  Role.ACADEMY_DIRECTOR,
  Role.ACADEMY_MANAGER,
  Role.MARKETING_MANAGER,
  Role.PROCUREMENT_MANAGER,
  Role.SUPPLY_CHAIN_MANAGER,
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
  'analytics.view',
] as const;

export const ROLE_PERMISSIONS: Record<Role, string[]> = {
  OWNER: [...ALL_PERMISSION_CODES],
  CEO: [...ALL_PERMISSION_CODES],
  SYSTEM_ADMINISTRATOR: [...ALL_PERMISSION_CODES],
  FRANCHISE_DIRECTOR: ['branches.manage', 'academy.manage', 'analytics.view'],
  FINANCE_MANAGER: ['finance.view', 'payroll.manage', 'analytics.view', 'procurement.landed_cost.view'],
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
  MASTER: ['service.manage', 'kpi.view'],
  WAREHOUSE_OPERATOR: ['inventory.manage', 'distribution.manage'],
  CASHIER: ['payments.manage', 'sales.manage'],
  ACCOUNTANT: ['finance.view', 'payroll.manage'],
  SALESPERSON: ['sales.manage'],
};

export function isFullAccessRole(role: Role) {
  return FULL_ACCESS_ROLES.includes(role);
}

export function isHqRole(role: Role) {
  return HQ_ROLES.includes(role);
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
