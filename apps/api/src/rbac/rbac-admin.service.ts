import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ALL_PERMISSION_CODES, ROLE_PERMISSIONS } from './rbac';

@Injectable()
export class RbacAdminService {
  constructor(private readonly prisma: PrismaService) {}

  listRoles() {
    return this.prisma.rbacRole.findMany({
      where: { isActive: true },
      include: {
        permissions: {
          include: { permission: true },
        },
      },
      orderBy: { code: 'asc' },
    });
  }

  listPermissions() {
    return this.prisma.permission.findMany({ orderBy: { code: 'asc' } });
  }

  async syncPermissionCatalog() {
    for (const code of ALL_PERMISSION_CODES) {
      const [module, action] = code.split('.');
      await this.prisma.permission.upsert({
        where: { code },
        update: { module, action },
        create: { code, module, action },
      });
    }

    for (const [roleCode, permissions] of Object.entries(ROLE_PERMISSIONS)) {
      const role = await this.prisma.rbacRole.upsert({
        where: { code: roleCode },
        update: { name: roleCode.replaceAll('_', ' '), isActive: true },
        create: { code: roleCode, name: roleCode.replaceAll('_', ' ') },
      });

      const permissionRows = await this.prisma.permission.findMany({
        where: { code: { in: permissions } },
      });
      const permissionIds = new Set(permissionRows.map((row) => row.id));

      const existing = await this.prisma.rolePermission.findMany({
        where: { roleId: role.id },
      });

      for (const row of existing) {
        if (!permissionIds.has(row.permissionId)) {
          await this.prisma.rolePermission.delete({ where: { id: row.id } });
        }
      }

      for (const permission of permissionRows) {
        await this.prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId: permission.id,
            },
          },
          update: {},
          create: { roleId: role.id, permissionId: permission.id },
        });
      }
    }

    return { synced: true, permissions: ALL_PERMISSION_CODES.length };
  }
}
