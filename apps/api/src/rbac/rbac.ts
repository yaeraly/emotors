import { ForbiddenException } from '@nestjs/common';
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
  Role.HQ_ACCOUNTANT,
  Role.MARKETING_MANAGER,
  Role.CONTENT_CREATOR,
  Role.ACADEMY_DIRECTOR,
  Role.SYSTEM_ADMINISTRATOR,
  Role.HQ_SALES_MANAGER,
  Role.HQ_CASHIER,
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
  'distribution.view',
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
  const roles = resolveUserRoles(user);
  if (roles.includes(Role.WAREHOUSE_MANAGER) && !hasAnyFullAccessRole(roles)) {
    return false;
  }
  return (
    hasAnyFullAccessRole(roles) ||
    roles.includes(Role.SUPPLY_CHAIN_MANAGER)
  );
}

export function canCreateProduct(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  return canManageProductCatalog(user);
}

export function canEditProductUnit(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  const roles = resolveUserRoles(user);
  return hasAnyFullAccessRole(roles) || roles.includes(Role.SUPPLY_CHAIN_MANAGER);
}

export function canArchiveProduct(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  return hasAnyFullAccessRole(resolveUserRoles(user));
}

export function canEditSellingPrice(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  return hasAnyFullAccessRole(resolveUserRoles(user));
}

export function canManagePricingPolicy(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  return resolveUserRoles(user).includes(Role.CEO);
}

/** CEO and OWNER may view internal price calculation breakdown. */
export function canViewPriceExplanation(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  return hasAnyFullAccessRole(resolveUserRoles(user));
}

export function canViewPricing(user: Pick<AuthUser, 'role' | 'roles' | 'permissions' | 'branchId'>) {
  const roles = resolveUserRoles(user);
  if (isBranchWarehouseOperator(user)) return false;
  if (roles.includes(Role.SUPPLY_CHAIN_MANAGER)) return false;
  if (hasAnyFullAccessRole(roles)) return true;
  if (roles.includes(Role.ACADEMY_DIRECTOR)) return false;
  return [
    Role.HQ_SALES_MANAGER,
    Role.WAREHOUSE_MANAGER,
    Role.FINANCE_MANAGER,
    Role.HQ_ACCOUNTANT,
    Role.ACCOUNTANT,
    Role.MARKETING_MANAGER,
    Role.CONTENT_CREATOR,
    Role.SYSTEM_ADMINISTRATOR,
    Role.HQ_CASHIER,
    Role.FRANCHISE_OWNER,
    Role.MANAGER,
    Role.CASHIER,
  ].some((role) => roles.includes(role));
}

export function isBranchWarehouseOperator(user: Pick<AuthUser, 'role' | 'roles' | 'branchId'>) {
  const roles = resolveUserRoles(user);
  return !!user.branchId && roles.includes(Role.WAREHOUSE_OPERATOR) && !hasAnyFullAccessRole(roles);
}

export function isBranchCashierUser(user: Pick<AuthUser, 'role' | 'roles' | 'branchId'>) {
  const roles = resolveUserRoles(user);
  if (!user.branchId || hasAnyFullAccessRole(roles)) return false;
  if (roles.includes(Role.HQ_CASHIER)) return false;
  return roles.includes(Role.CASHIER);
}

export function isBranchAccountantUser(user: Pick<AuthUser, 'role' | 'roles' | 'branchId'>) {
  const roles = resolveUserRoles(user);
  if (!user.branchId || hasAnyFullAccessRole(roles)) return false;
  if (roles.includes(Role.HQ_ACCOUNTANT)) return false;
  return roles.includes(Role.ACCOUNTANT);
}

export function assertBranchCashierCannotManageSales(user: Pick<AuthUser, 'role' | 'roles' | 'branchId'>) {
  if (isBranchCashierUser(user)) {
    throw new ForbiddenException('Branch cashier cannot create or edit sales');
  }
}

export function assertBranchAccountantRestrictedRoute(user: Pick<AuthUser, 'role' | 'roles' | 'branchId'>) {
  if (isBranchAccountantUser(user)) {
    throw new ForbiddenException('Forbidden resource');
  }
}

export function canViewProductCost(user: Pick<AuthUser, 'role' | 'roles' | 'branchId'>) {
  return !isBranchWarehouseOperator(user);
}

export function canViewProductCatalog(user: Pick<AuthUser, 'role' | 'roles' | 'permissions' | 'branchId'>) {
  if (isBranchWarehouseOperator(user)) return false;
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

export function canViewSupplierPayments(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  const roles = resolveUserRoles(user);
  return (
    hasAnyFullAccessRole(roles) ||
    roles.includes(Role.SUPPLY_CHAIN_MANAGER) ||
    roles.includes(Role.PROCUREMENT_MANAGER) ||
    roles.includes(Role.FINANCE_MANAGER) ||
    roles.includes(Role.HQ_ACCOUNTANT) ||
    userHasPermission(user, 'procurement.view') ||
    userHasPermission(user, 'procurement.manage') ||
    userHasPermission(user, 'finance.view')
  );
}

export function canCreateSupplierPayment(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  const roles = resolveUserRoles(user);
  return (
    hasAnyFullAccessRole(roles) ||
    roles.includes(Role.SUPPLY_CHAIN_MANAGER) ||
    roles.includes(Role.FINANCE_MANAGER) ||
    roles.includes(Role.HQ_ACCOUNTANT)
  );
}

export function canEditSupplierPayment(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  return hasAnyFullAccessRole(resolveUserRoles(user));
}

export function canVoidSupplierPayment(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  const roles = resolveUserRoles(user);
  return hasAnyFullAccessRole(roles) || roles.includes(Role.FINANCE_MANAGER);
}

export function canAllowSupplierOverpayment(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  const roles = resolveUserRoles(user);
  return hasAnyFullAccessRole(roles) || roles.includes(Role.FINANCE_MANAGER);
}

export function canCreateProcurementOrder(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  return userHasPermission(user, 'procurement.manage');
}

export function canViewProcurement(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  const roles = resolveUserRoles(user);
  if (roles.includes(Role.WAREHOUSE_MANAGER) && !hasAnyFullAccessRole(roles)) {
    return false;
  }
  return userHasAnyPermission(user, ['procurement.manage', 'procurement.view']);
}

export function canReceiveProcurementToHq(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  const roles = resolveUserRoles(user);
  if (hasAnyFullAccessRole(roles)) {
    return true;
  }
  if (roles.includes(Role.SUPPLY_CHAIN_MANAGER)) {
    return false;
  }
  return roles.includes(Role.WAREHOUSE_MANAGER) && userHasPermission(user, 'procurement.receive');
}

export function canEditProcurementOrderItems(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  const roles = resolveUserRoles(user);
  if (roles.includes(Role.WAREHOUSE_MANAGER) || roles.includes(Role.FINANCE_MANAGER) || roles.includes(Role.HQ_ACCOUNTANT)) {
    return false;
  }
  return (
    hasAnyFullAccessRole(roles) ||
    roles.includes(Role.SUPPLY_CHAIN_MANAGER) ||
    roles.includes(Role.PROCUREMENT_MANAGER)
  );
}

export function canUnlockProcurementOrder(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  const roles = resolveUserRoles(user);
  return hasAnyFullAccessRole(roles) || roles.includes(Role.CEO) || roles.includes(Role.OWNER);
}

export function canDeleteProcurementOrder(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  return canUnlockProcurementOrder(user);
}

export function canDeleteHqWarehouse(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  return canUnlockProcurementOrder(user);
}

export function canCreateHqWarehouse(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  return hasAnyFullAccessRole(resolveUserRoles(user));
}

export function canDeactivateHqWarehouse(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  return hasAnyFullAccessRole(resolveUserRoles(user));
}

export function canDeleteHqGoodsReceiving(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  return canUnlockProcurementOrder(user);
}

export function canEditWarehouseInfo(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  return hasAnyFullAccessRole(resolveUserRoles(user));
}

export function canCreateDistributionOrder(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  return canManageDistributionOrders(user);
}

export function canManageDistributionOrders(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  const roles = resolveUserRoles(user);
  return hasAnyFullAccessRole(roles) || roles.includes(Role.HQ_SALES_MANAGER);
}

export function canViewDistribution(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  const roles = resolveUserRoles(user);
  return (
    canManageDistributionOrders(user) ||
    canDispatchFromHq(user) ||
    roles.includes(Role.SUPPLY_CHAIN_MANAGER) ||
    roles.includes(Role.MANAGER) ||
    roles.includes(Role.FRANCHISE_OWNER) ||
    roles.includes(Role.WAREHOUSE_OPERATOR) ||
    userHasAnyPermission(user, ['distribution.manage', 'distribution.view'])
  );
}

export function canRecordHqDistributionPayment(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  const roles = resolveUserRoles(user);
  return (
    hasAnyFullAccessRole(roles) ||
    roles.includes(Role.HQ_CASHIER) ||
    roles.includes(Role.FINANCE_MANAGER) ||
    roles.includes(Role.HQ_ACCOUNTANT)
  );
}

/** Branch Cashier / Accountant submits payment with receipt for HQ confirmation. */
export function canSubmitBranchInvoicePayment(
  user: Pick<AuthUser, 'role' | 'roles' | 'permissions'> & { branchId?: string | null },
) {
  const roles = resolveUserRoles(user);
  if (!user.branchId || hasAnyFullAccessRole(roles)) return false;
  if (roles.includes(Role.HQ_CASHIER) || roles.includes(Role.HQ_ACCOUNTANT) || roles.includes(Role.FINANCE_MANAGER)) {
    return false;
  }
  return roles.includes(Role.CASHIER) || roles.includes(Role.ACCOUNTANT) || userHasPermission(user, 'payments.manage');
}

/** HQ Finance confirms or rejects branch-submitted payments. */
export function canConfirmBranchInvoicePayment(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  return canRecordHqDistributionPayment(user);
}

export function canRequestBranchOrderInstallment(user: Pick<AuthUser, 'role' | 'roles' | 'permissions' | 'branchId'>) {
  const roles = resolveUserRoles(user);
  if (!user.branchId || hasAnyFullAccessRole(roles)) return false;
  return roles.includes(Role.ACCOUNTANT) || userHasPermission(user, 'finance.view');
}

export function canApproveBranchOrderInstallment(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  const roles = resolveUserRoles(user);
  return hasAnyFullAccessRole(roles) || roles.includes(Role.CEO) || roles.includes(Role.OWNER);
}

export function canRecordDistributionPayment(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  return canRecordHqDistributionPayment(user) || canSubmitBranchInvoicePayment(user) || userHasPermission(user, 'payments.manage');
}

export function canManageBranchPurchaseRequests(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  return canManageDistributionOrders(user);
}

export function canAssignBranchHqWarehouse(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  return hasAnyFullAccessRole(resolveUserRoles(user));
}

/** Only full-access HQ roles (CEO/OWNER/SYSTEM_ADMIN) may change Branch Type. */
export function canChangeBranchType(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  return hasAnyFullAccessRole(resolveUserRoles(user));
}

/** Only Branch Manager (MANAGER) creates routine HQ orders; CEO/OWNER for exceptional cases. */
export function canCreateBranchHqOrder(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  const roles = resolveUserRoles(user);
  if (hasAnyFullAccessRole(roles)) return true;
  return roles.includes(Role.MANAGER);
}

/** Branch Sales Manager creates product requests to HQ (not warehouse operator). */
export function canCreateBranchProductRequest(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  const roles = resolveUserRoles(user);
  if (hasAnyFullAccessRole(roles)) return true;
  return false;
}

export function canManageOwnBranchProductRequest(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  return canCreateBranchHqOrder(user) || canCreateBranchProductRequest(user);
}

export function isBranchSalesManagerUser(user: Pick<AuthUser, 'role' | 'roles' | 'branchId'>) {
  if (!user.branchId || hasAnyFullAccessRole(resolveUserRoles(user))) return false;
  const roles = resolveUserRoles(user);
  if (
    roles.includes(Role.SUPPLY_CHAIN_MANAGER) ||
    roles.includes(Role.WAREHOUSE_MANAGER) ||
    roles.includes(Role.HQ_SALES_MANAGER) ||
    roles.includes(Role.HQ_CASHIER)
  ) {
    return false;
  }
  if (roles.includes(Role.FRANCHISE_OWNER)) return false;
  return roles.includes(Role.MANAGER);
}

export function canArchiveCustomer(user: Pick<AuthUser, 'role' | 'roles' | 'branchId'>) {
  const roles = resolveUserRoles(user);
  return hasAnyFullAccessRole(roles) || roles.includes(Role.FRANCHISE_OWNER) || isBranchSalesManagerUser(user);
}

export function canBranchSalesManagerModifyStock(user: Pick<AuthUser, 'role' | 'roles' | 'branchId'>) {
  return !isBranchSalesManagerUser(user);
}

/** Branch Warehouse Operator receives HQ shipments at branch. */
export function canReceiveBranchDistribution(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  const roles = resolveUserRoles(user);
  if (hasAnyFullAccessRole(roles)) return true;
  return roles.includes(Role.WAREHOUSE_OPERATOR);
}

export function canViewBranchDiscrepancyReports(user: Pick<AuthUser, 'role' | 'roles' | 'permissions' | 'branchId'>) {
  const roles = resolveUserRoles(user);
  return (
    hasAnyFullAccessRole(roles) ||
    roles.includes(Role.HQ_SALES_MANAGER) ||
    isBranchWarehouseOperator(user)
  );
}

export function canDispatchFromHq(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  const roles = resolveUserRoles(user);
  return hasAnyFullAccessRole(roles) || roles.includes(Role.WAREHOUSE_MANAGER);
}

export function canManageTransportCompany(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  const roles = resolveUserRoles(user);
  return hasAnyFullAccessRole(roles) || roles.includes(Role.SUPPLY_CHAIN_MANAGER);
}

export function canViewTransportCompany(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  const roles = resolveUserRoles(user);
  return (
    canManageTransportCompany(user) ||
    roles.includes(Role.WAREHOUSE_MANAGER) ||
    roles.includes(Role.FINANCE_MANAGER) ||
    roles.includes(Role.HQ_ACCOUNTANT) ||
    roles.includes(Role.PROCUREMENT_MANAGER)
  );
}

export function canManageSvhToHqTransport(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  const roles = resolveUserRoles(user);
  return hasAnyFullAccessRole(roles) || roles.includes(Role.SUPPLY_CHAIN_MANAGER);
}

export function canViewSvhToHqTransport(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  const roles = resolveUserRoles(user);
  return (
    canManageSvhToHqTransport(user) ||
    roles.includes(Role.WAREHOUSE_MANAGER) ||
    roles.includes(Role.FINANCE_MANAGER) ||
    roles.includes(Role.HQ_ACCOUNTANT) ||
    roles.includes(Role.PROCUREMENT_MANAGER)
  );
}

export function canConfirmSvhToHqArrival(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  const roles = resolveUserRoles(user);
  return (
    canManageSvhToHqTransport(user) ||
    roles.includes(Role.WAREHOUSE_MANAGER)
  );
}

export function canApproveSvhTransportCostAdjustment(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  const roles = resolveUserRoles(user);
  return (
    hasAnyFullAccessRole(roles) ||
    roles.includes(Role.FINANCE_MANAGER) ||
    roles.includes(Role.CEO) ||
    roles.includes(Role.OWNER)
  );
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
