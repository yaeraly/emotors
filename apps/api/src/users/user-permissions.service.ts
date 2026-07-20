import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  CASHIER_CAPABILITY_PERMISSION,
  canGrantCashierCapability,
  canRevokeCashierCapability,
  expandCashierCapabilityPermissions,
} from '../rbac/cashier-capability.util';
import { isBranchOwnerUser } from '../rbac/rbac';

type PrismaTx = Prisma.TransactionClient;

@Injectable()
export class UserPermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async listAdditionalPermissionsForUser(userId: string) {
    const rows = await this.prisma.userPermission.findMany({
      where: { userId, isActive: true },
      include: { permission: true },
    });
    return rows.map((row) => row.permission.code);
  }

  async permissionsForUser(userId: string, rolePermissions: string[]) {
    const rows = await this.prisma.userPermission.findMany({
      where: { userId, isActive: true },
      include: { permission: true },
    });
    const additional = rows.map((row) => row.permission.code);
    return expandCashierCapabilityPermissions(Array.from(new Set([...rolePermissions, ...additional])));
  }

  async grantCashierCapability(actor: AuthUser, targetUserId: string) {
    if (!canGrantCashierCapability(actor)) {
      throw new ForbiddenException('Only Branch CEO can grant cashier permission');
    }

    const target = await this.prisma.user.findFirst({
      where: { id: targetUserId, deletedAt: null },
    });
    if (!target) throw new NotFoundException('User not found');
    if (!target.branchId || target.branchId !== actor.branchId) {
      throw new ForbiddenException('You can only manage employees in your branch');
    }

    const permission = await this.getCashierPermission();
    const result = await this.prisma.$transaction(async (tx) => {
      const record = await tx.userPermission.upsert({
        where: {
          userId_permissionId: {
            userId: targetUserId,
            permissionId: permission.id,
          },
        },
        create: {
          userId: targetUserId,
          permissionId: permission.id,
          grantedById: actor.id,
          isActive: true,
          grantedAt: new Date(),
        },
        update: {
          isActive: true,
          grantedById: actor.id,
          grantedAt: new Date(),
          revokedById: null,
          revokedAt: null,
        },
      });

      await this.auditInTx(tx, actor, 'CASHIER_PERMISSION_GRANTED', targetUserId, {
        branchId: target.branchId,
        employeeId: targetUserId,
        grantedById: actor.id,
      });

      return record;
    });

    return { userId: targetUserId, cashier: true, grantedAt: result.grantedAt };
  }

  async revokeCashierCapability(actor: AuthUser, targetUserId: string) {
    if (!canRevokeCashierCapability(actor)) {
      throw new ForbiddenException('Only Branch CEO can revoke cashier permission');
    }

    const target = await this.prisma.user.findFirst({
      where: { id: targetUserId, deletedAt: null },
    });
    if (!target) throw new NotFoundException('User not found');
    if (!target.branchId || target.branchId !== actor.branchId) {
      throw new ForbiddenException('You can only manage employees in your branch');
    }

    const permission = await this.getCashierPermission();
    const existing = await this.prisma.userPermission.findUnique({
      where: {
        userId_permissionId: {
          userId: targetUserId,
          permissionId: permission.id,
        },
      },
    });
    if (!existing || !existing.isActive) {
      throw new BadRequestException('Cashier permission is not active for this employee');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userPermission.update({
        where: { id: existing.id },
        data: {
          isActive: false,
          revokedById: actor.id,
          revokedAt: new Date(),
        },
      });

      await tx.financeAccountAssignment.updateMany({
        where: { userId: targetUserId, isActive: true },
        data: { isActive: false },
      });

      await this.auditInTx(tx, actor, 'CASHIER_PERMISSION_REVOKED', targetUserId, {
        branchId: target.branchId,
        employeeId: targetUserId,
        revokedById: actor.id,
      });
    });

    return { userId: targetUserId, cashier: false };
  }

  async getCashierCapabilityStatus(actor: AuthUser, targetUserId: string) {
    const target = await this.prisma.user.findFirst({
      where: { id: targetUserId, deletedAt: null },
    });
    if (!target) throw new NotFoundException('User not found');
    if (isBranchOwnerUser(actor) && actor.branchId && target.branchId !== actor.branchId) {
      throw new ForbiddenException('Branch isolation violation');
    }

    const permission = await this.getCashierPermission();
    const record = await this.prisma.userPermission.findUnique({
      where: {
        userId_permissionId: {
          userId: targetUserId,
          permissionId: permission.id,
        },
      },
    });

    return {
      userId: targetUserId,
      cashier: !!record?.isActive,
      grantedAt: record?.grantedAt ?? null,
      revokedAt: record?.revokedAt ?? null,
    };
  }

  private async getCashierPermission() {
    const permission = await this.prisma.permission.findUnique({
      where: { code: CASHIER_CAPABILITY_PERMISSION },
    });
    if (!permission) {
      throw new BadRequestException('Cashier permission is not configured');
    }
    return permission;
  }

  private auditInTx(
    tx: PrismaTx,
    actor: AuthUser,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ) {
    return tx.auditLog.create({
      data: {
        userId: actor.id,
        role: actor.role,
        action,
        entity: 'UserPermission',
        entityId,
        metadata: {
          role: actor.role,
          ...metadata,
        },
      },
    });
  }
}
