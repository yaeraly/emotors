import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../roles/permissions.decorator';
import { PermissionsGuard } from '../roles/permissions.guard';
import { RolesGuard } from '../roles/roles.guard';
import { RbacAdminService } from './rbac-admin.service';

@Controller('rbac')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class RbacAdminController {
  constructor(private readonly rbacAdminService: RbacAdminService) {}

  @Get('roles')
  @Permissions('roles.manage')
  listRoles() {
    return this.rbacAdminService.listRoles();
  }

  @Get('permissions')
  @Permissions('roles.manage')
  listPermissions() {
    return this.rbacAdminService.listPermissions();
  }

  @Post('sync')
  @Permissions('roles.manage', 'settings.manage')
  syncCatalog() {
    return this.rbacAdminService.syncPermissionCatalog();
  }
}
