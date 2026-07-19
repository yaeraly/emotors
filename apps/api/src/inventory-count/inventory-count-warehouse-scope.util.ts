import { ForbiddenException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { hasAnyFullAccessRole, resolveUserRoles } from '../rbac/rbac';
import { activeBranchWarehouseWhere, activeHqWarehouseWhere } from '../warehouse/warehouse.util';
import { isHqInventoryExecutive } from './inventory-count-approver.util';

/**
 * Resolves warehouse scope for inventory-count list/detail queries.
 * Branch roles must be checked before HQ assignment scope — otherwise
 * buildAssignedWarehouseScope returns { id: '__none__' } and hides all branch data.
 */
export function resolveInventoryCountWarehouseScope(
  user: Pick<AuthUser, 'role' | 'roles' | 'branchId'>,
  assignmentScope: Prisma.WarehouseWhereInput | null,
): Prisma.WarehouseWhereInput | null {
  const roles = resolveUserRoles(user);

  if (isHqInventoryExecutive(roles, user.branchId)) {
    return activeHqWarehouseWhere;
  }

  if (hasAnyFullAccessRole(roles) || roles.includes(Role.SUPPLY_CHAIN_MANAGER)) {
    return null;
  }

  if (roles.includes(Role.FRANCHISE_OWNER) || roles.includes(Role.WAREHOUSE_OPERATOR)) {
    if (!user.branchId) {
      throw new ForbiddenException('Branch is required');
    }
    return { ...activeBranchWarehouseWhere, branchId: user.branchId };
  }

  if (roles.includes(Role.WAREHOUSE_MANAGER)) {
    return assignmentScope ?? { id: '__none__' };
  }

  return { id: '__none__' };
}
