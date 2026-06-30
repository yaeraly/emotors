import { SetMetadata } from '@nestjs/common';
import { PermissionCode } from '../rbac/rbac';

export const PERMISSIONS_KEY = 'permissions';

/** Require at least one of the listed permissions (CEO/OWNER bypass). */
export const Permissions = (...permissions: PermissionCode[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
