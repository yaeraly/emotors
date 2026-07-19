import { Role, WarehouseType } from '@prisma/client';

export type InventoryApprovalScope = 'BRANCH' | 'HQ';

export type InventoryWarehouseScope = {
  warehouseType: WarehouseType;
  branchId: string | null;
};

export function resolveInventoryApprovalScope(
  warehouse: InventoryWarehouseScope,
): InventoryApprovalScope {
  return warehouse.warehouseType === WarehouseType.BRANCH && warehouse.branchId
    ? 'BRANCH'
    : 'HQ';
}

export function resolveInventoryApproverRoles(
  warehouse: InventoryWarehouseScope,
): Role[] {
  return resolveInventoryApprovalScope(warehouse) === 'BRANCH'
    ? [Role.FRANCHISE_OWNER]
    : [Role.CEO, Role.OWNER];
}

export function resolveInventoryCountingFeedbackRoles(
  warehouse: InventoryWarehouseScope,
): Role[] {
  return resolveInventoryApprovalScope(warehouse) === 'BRANCH'
    ? [Role.WAREHOUSE_OPERATOR]
    : [Role.WAREHOUSE_MANAGER];
}

export function isHqInventoryExecutive(
  roles: Role[],
  branchId?: string | null,
) {
  return roles.some((role) => role === Role.CEO || role === Role.OWNER) && !branchId;
}

export function canUserApproveInventoryForWarehouse(
  roles: Role[],
  userBranchId: string | null | undefined,
  warehouse: InventoryWarehouseScope,
) {
  const scope = resolveInventoryApprovalScope(warehouse);
  if (scope === 'BRANCH') {
    return (
      roles.includes(Role.FRANCHISE_OWNER) &&
      !!userBranchId &&
      warehouse.branchId === userBranchId
    );
  }
  return isHqInventoryExecutive(roles, userBranchId);
}
