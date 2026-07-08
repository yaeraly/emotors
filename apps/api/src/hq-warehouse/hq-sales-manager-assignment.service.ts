import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { HqWarehouseAssignmentStatus, Prisma, Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { hasAnyFullAccessRole, resolveUserRoles } from '../rbac/rbac';
import { activeHqWarehouseWhere, isHqWarehouse } from '../warehouse/warehouse.util';

type PrismaClientLike = PrismaService | Prisma.TransactionClient;

@Injectable()
export class HqSalesManagerAssignmentService {
  constructor(private readonly prisma: PrismaService) {}

  async getActiveAssignedWarehouseIds(userId: string, client: PrismaClientLike = this.prisma) {
    const rows = await client.hqSalesManagerWarehouseAssignment.findMany({
      where: { userId, status: HqWarehouseAssignmentStatus.ACTIVE },
      select: { warehouseId: true },
    });
    return rows.map((row) => row.warehouseId);
  }

  async listAssignmentsForUser(targetUserId: string) {
    return this.prisma.hqSalesManagerWarehouseAssignment.findMany({
      where: { userId: targetUserId, status: HqWarehouseAssignmentStatus.ACTIVE },
      include: {
        warehouse: {
          select: { id: true, name: true, code: true, city: true, isActive: true },
        },
        assignedBy: { select: { id: true, fullName: true, role: true } },
      },
      orderBy: { assignedAt: 'desc' },
    });
  }

  async syncUserAssignments(actor: AuthUser, targetUserId: string, warehouseIds: string[]) {
    this.assertCanAssign(actor);
    const targetUser = await this.prisma.user.findFirst({
      where: { id: targetUserId, deletedAt: null },
      include: { userRoles: { include: { role: true } } },
    });
    if (!targetUser) {
      throw new NotFoundException('User not found');
    }
    const targetRoles = targetUser.userRoles?.length
      ? targetUser.userRoles.map((entry) => entry.role.code as Role)
      : [targetUser.role];
    if (!targetRoles.includes(Role.HQ_SALES_MANAGER)) {
      throw new ForbiddenException('Only HQ Sales Manager users can have sales warehouse assignments');
    }

    const uniqueWarehouseIds = Array.from(new Set(warehouseIds.filter(Boolean)));
    for (const warehouseId of uniqueWarehouseIds) {
      await this.ensureHqWarehouse(warehouseId);
    }

    const currentIds = await this.getActiveAssignedWarehouseIds(targetUserId);
    const toAdd = uniqueWarehouseIds.filter((id) => !currentIds.includes(id));
    const toRemove = currentIds.filter((id) => !uniqueWarehouseIds.includes(id));

    for (const warehouseId of toRemove) {
      await this.unassign(actor, warehouseId, targetUserId);
    }
    for (const warehouseId of toAdd) {
      await this.assign(actor, warehouseId, targetUserId);
    }

    return this.listAssignmentsForUser(targetUserId);
  }

  buildAssignedRequestScope(
    warehouseIds: string[],
  ): Prisma.BranchPurchaseRequestWhereInput | null {
    if (!warehouseIds.length) {
      return { id: '__none__' };
    }
    return {
      OR: [
        { assignedHqWarehouseId: { in: warehouseIds } },
        {
          assignedHqWarehouseId: null,
          branch: { assignedHqWarehouseId: { in: warehouseIds } },
        },
      ],
    };
  }

  isHqSalesManagerScoped(user: AuthUser) {
    const roles = resolveUserRoles(user);
    return roles.includes(Role.HQ_SALES_MANAGER) && !hasAnyFullAccessRole(roles);
  }

  private async assign(actor: AuthUser, warehouseId: string, targetUserId: string) {
    const existing = await this.prisma.hqSalesManagerWarehouseAssignment.findUnique({
      where: { userId_warehouseId: { userId: targetUserId, warehouseId } },
    });

    const assignment = existing
      ? await this.prisma.hqSalesManagerWarehouseAssignment.update({
          where: { id: existing.id },
          data: {
            status: HqWarehouseAssignmentStatus.ACTIVE,
            assignedById: actor.id,
            assignedAt: new Date(),
          },
        })
      : await this.prisma.hqSalesManagerWarehouseAssignment.create({
          data: {
            userId: targetUserId,
            warehouseId,
            assignedById: actor.id,
            status: HqWarehouseAssignmentStatus.ACTIVE,
          },
        });

    await this.audit(actor, 'HQ_SALES_MANAGER_ASSIGNED_TO_WAREHOUSE', warehouseId, {
      userId: targetUserId,
      warehouseId,
      role: Role.HQ_SALES_MANAGER,
      assignedById: actor.id,
      oldValue: existing ? { status: existing.status } : null,
      newValue: { status: HqWarehouseAssignmentStatus.ACTIVE, assignmentId: assignment.id },
    });

    return assignment;
  }

  private async unassign(actor: AuthUser, warehouseId: string, targetUserId: string) {
    const existing = await this.prisma.hqSalesManagerWarehouseAssignment.findUnique({
      where: { userId_warehouseId: { userId: targetUserId, warehouseId } },
    });
    if (!existing || existing.status !== HqWarehouseAssignmentStatus.ACTIVE) {
      return null;
    }

    const assignment = await this.prisma.hqSalesManagerWarehouseAssignment.update({
      where: { id: existing.id },
      data: { status: HqWarehouseAssignmentStatus.INACTIVE },
    });

    await this.audit(actor, 'HQ_SALES_MANAGER_UNASSIGNED_FROM_WAREHOUSE', warehouseId, {
      userId: targetUserId,
      warehouseId,
      role: Role.HQ_SALES_MANAGER,
      assignedById: actor.id,
      oldValue: { status: HqWarehouseAssignmentStatus.ACTIVE, assignmentId: existing.id },
      newValue: { status: HqWarehouseAssignmentStatus.INACTIVE },
    });

    return assignment;
  }

  private assertCanAssign(user: AuthUser) {
    if (!hasAnyFullAccessRole(resolveUserRoles(user))) {
      throw new ForbiddenException('Only CEO can assign HQ Sales Manager warehouses');
    }
  }

  private async ensureHqWarehouse(warehouseId: string) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: warehouseId, ...activeHqWarehouseWhere },
    });
    if (!warehouse || !isHqWarehouse(warehouse)) {
      throw new NotFoundException('HQ warehouse not found');
    }
    return warehouse;
  }

  private audit(
    user: AuthUser,
    action: string,
    warehouseId: string,
    metadata: Record<string, unknown>,
  ) {
    return this.prisma.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action,
        entity: 'Warehouse',
        entityId: warehouseId,
        metadata: {
          roles: user.roles ?? [user.role],
          warehouseId,
          hqWarehouseId: warehouseId,
          timestamp: new Date().toISOString(),
          ...metadata,
        } as Prisma.InputJsonValue,
      },
    });
  }
}
