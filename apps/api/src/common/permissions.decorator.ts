import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const PERMISSIONS_KEY = 'permissions';

export type PermissionArea =
  | 'CRM'
  | 'SALES'
  | 'INVENTORY'
  | 'SERVICE'
  | 'FINANCE'
  | 'USERS';

export const ROLE_PERMISSIONS: Record<Role, PermissionArea[]> = {
  OWNER: ['CRM', 'SALES', 'INVENTORY', 'SERVICE', 'FINANCE', 'USERS'],
  MANAGER: ['CRM', 'SALES', 'INVENTORY', 'SERVICE'],
  MASTER: ['SERVICE'],
  ACCOUNTANT: ['FINANCE'],
};

export const Permissions = (...permissions: PermissionArea[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
