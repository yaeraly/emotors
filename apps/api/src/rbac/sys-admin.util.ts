import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { isHqAdminUser } from './rbac';

/** HQ SysAdmin (SYSTEM_ADMINISTRATOR) — full testing access, permanent delete, business-date edit. */
export function isSysAdminUser(
  user: Pick<AuthUser, 'role' | 'roles' | 'permissions'> | null | undefined,
) {
  if (!user) return false;
  return isHqAdminUser(user);
}

export function assertIsSysAdmin(user: AuthUser) {
  if (!isSysAdminUser(user)) {
    throw new ForbiddenException('Only HQ SysAdmin can perform this action');
  }
}

export function isProtectedSysAdminRole(role: Role) {
  return role === Role.SYSTEM_ADMINISTRATOR;
}
