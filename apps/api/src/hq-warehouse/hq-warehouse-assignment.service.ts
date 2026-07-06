import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { HqWarehouseAssignmentStatus, Prisma, Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { hasAnyFullAccessRole, resolveUserRoles } from '../rbac/rbac';
import { activeHqWarehouseWhere, isHqWarehouse } from '../warehouse/warehouse.util';
import {
  HQ_WAREHOUSE_ACCESS_DENIED,
  HQ_WAREHOUSE_ACCESS_DENIED_MESSAGES,
} from './hq-warehouse-assignment.constants';

type PrismaClientLike = PrismaService | Prisma.TransactionClient;

@Injectable()
export class HqWarehouseAssignmentService {
  constructor(private readonly prisma: PrismaService) {}

  async getActiveAssignedWarehouseIds(userId: string, client: PrismaClientLike = this.prisma) {
    const rows = await client.hqWarehouseManagerAssignment.findMany({
      where: { userId, status: HqWarehouseAssignmentStatus.ACTIVE },
      select: { warehouseId: true },
    });
    return rows.map((row) => row.warehouseId);
  }

  async assertCanAccessHqWarehouse(user: AuthUser, warehouseId: string, client: PrismaClientLike = this.prisma) {
    const roles = resolveUserRoles(user);
    if (hasAnyFullAccessRole(roles) || roles.includes(Role.SUPPLY_CHAIN_MANAGER)) {
      return;
    }
    if (!roles.includes(Role.WAREHOUSE_MANAGER)) {
      throw new ForbiddenException('You do not have access to HQ warehouses');
    }
    await this.assertAssignedToWarehouse(user.id, warehouseId, client);
  }

  async assertAssignedToWarehouse(userId: string, warehouseId: string, client: PrismaClientLike = this.prisma) {
    const assignment = await client.hqWarehouseManagerAssignment.findFirst({
      where: {
        userId,
        warehouseId,
        status: HqWarehouseAssignmentStatus.ACTIVE,
      },
    });
    if (!assignment) {
      throw new ForbiddenException({
        message: HQ_WAREHOUSE_ACCESS_DENIED,
        messages: HQ_WAREHOUSE_ACCESS_DENIED_MESSAGES,
      });
    }
  }

  async listAssignmentsForUser(targetUserId: string) {
    return this.prisma.hqWarehouseManagerAssignment.findMany({
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
    if (!targetRoles.includes(Role.WAREHOUSE_MANAGER)) {
      throw new ForbiddenException('Only HQ Warehouse Manager users can have warehouse assignments');
    }

    const uniqueWarehouseIds = Array.from(new Set(warehouseIds.filter(Boolean)));
    for (const warehouseId of uniqueWarehouseIds) {
      await this.ensureHqWarehouse(warehouseId);
    }

    const currentIds = await this.getActiveAssignedWarehouseIds(targetUserId);
    const toAdd = uniqueWarehouseIds.filter((id) => !currentIds.includes(id));
    const toRemove = currentIds.filter((id) => !uniqueWarehouseIds.includes(id));

    for (const warehouseId of toRemove) {
      await this.unassignManager(actor, warehouseId, targetUserId);
    }
    for (const warehouseId of toAdd) {
      await this.assignManager(actor, warehouseId, targetUserId);
    }

    if (toAdd.length || toRemove.length) {
      await this.audit(actor, 'HQ_WAREHOUSE_MANAGER_REASSIGNED', targetUserId, {
        userId: targetUserId,
        assignedById: actor.id,
        oldAssignment: currentIds,
        newAssignment: uniqueWarehouseIds,
      });
    }

    return this.listAssignmentsForUser(targetUserId);
  }

  async listActiveManagersByWarehouseIds(warehouseIds: string[]) {
    if (!warehouseIds.length) {
      return new Map<string, Array<{ id: string; fullName: string }>>();
    }
    const rows = await this.prisma.hqWarehouseManagerAssignment.findMany({
      where: {
        warehouseId: { in: warehouseIds },
        status: HqWarehouseAssignmentStatus.ACTIVE,
      },
      include: {
        user: { select: { id: true, fullName: true } },
      },
      orderBy: { assignedAt: 'asc' },
    });
    const map = new Map<string, Array<{ id: string; fullName: string }>>();
    for (const row of rows) {
      const current = map.get(row.warehouseId) ?? [];
      current.push({ id: row.user.id, fullName: row.user.fullName });
      map.set(row.warehouseId, current);
    }
    return map;
  }

  buildAssignedWarehouseScope(user: AuthUser): Prisma.WarehouseWhereInput | null {
    const roles = resolveUserRoles(user);
    if (hasAnyFullAccessRole(roles) || roles.includes(Role.SUPPLY_CHAIN_MANAGER)) {
      return null;
    }
    if (roles.includes(Role.WAREHOUSE_MANAGER)) {
      return {
        ...activeHqWarehouseWhere,
        hqManagerAssignments: {
          some: {
            userId: user.id,
            status: HqWarehouseAssignmentStatus.ACTIVE,
          },
        },
      };
    }
    return { id: '__none__' };
  }

  async listManagersForWarehouse(user: AuthUser, warehouseId: string) {
    this.assertCanAssign(user);
    await this.ensureHqWarehouse(warehouseId);
    return this.prisma.hqWarehouseManagerAssignment.findMany({
      where: { warehouseId, status: HqWarehouseAssignmentStatus.ACTIVE },
      include: {
        user: { select: { id: true, fullName: true, email: true, role: true, employeeId: true } },
        assignedBy: { select: { id: true, fullName: true, role: true } },
      },
      orderBy: { assignedAt: 'desc' },
    });
  }

  async assignManager(user: AuthUser, warehouseId: string, targetUserId: string) {
    this.assertCanAssign(user);
    await this.ensureHqWarehouse(warehouseId);
    const targetUser = await this.prisma.user.findFirst({
      where: { id: targetUserId, deletedAt: null, status: 'ACTIVE' },
      include: { userRoles: { include: { role: true } } },
    });
    if (!targetUser) {
      throw new NotFoundException('User not found');
    }
    const targetRoles = targetUser.userRoles?.length
      ? targetUser.userRoles.map((entry) => entry.role.code)
      : [targetUser.role];
    if (!targetRoles.includes(Role.WAREHOUSE_MANAGER)) {
      throw new ForbiddenException('Only HQ Warehouse Manager users can be assigned');
    }

    const existing = await this.prisma.hqWarehouseManagerAssignment.findUnique({
      where: { userId_warehouseId: { userId: targetUserId, warehouseId } },
    });

    const assignment = existing
      ? await this.prisma.hqWarehouseManagerAssignment.update({
          where: { id: existing.id },
          data: {
            status: HqWarehouseAssignmentStatus.ACTIVE,
            assignedById: user.id,
            assignedAt: new Date(),
          },
          include: {
            user: { select: { id: true, fullName: true, email: true, role: true } },
            assignedBy: { select: { id: true, fullName: true, role: true } },
          },
        })
      : await this.prisma.hqWarehouseManagerAssignment.create({
          data: {
            userId: targetUserId,
            warehouseId,
            assignedById: user.id,
            status: HqWarehouseAssignmentStatus.ACTIVE,
          },
          include: {
            user: { select: { id: true, fullName: true, email: true, role: true } },
            assignedBy: { select: { id: true, fullName: true, role: true } },
          },
        });

    await this.audit(user, 'HQ_WAREHOUSE_MANAGER_ASSIGNED', warehouseId, {
      userId: targetUserId,
      warehouseId,
      role: Role.WAREHOUSE_MANAGER,
      assignedById: user.id,
      oldValue: existing ? { status: existing.status } : null,
      newValue: { status: HqWarehouseAssignmentStatus.ACTIVE, assignmentId: assignment.id },
    });

    return assignment;
  }

  async unassignManager(user: AuthUser, warehouseId: string, targetUserId: string) {
    this.assertCanAssign(user);
    await this.ensureHqWarehouse(warehouseId);
    const existing = await this.prisma.hqWarehouseManagerAssignment.findUnique({
      where: { userId_warehouseId: { userId: targetUserId, warehouseId } },
    });
    if (!existing || existing.status !== HqWarehouseAssignmentStatus.ACTIVE) {
      throw new NotFoundException('Assignment not found');
    }

    const assignment = await this.prisma.hqWarehouseManagerAssignment.update({
      where: { id: existing.id },
      data: { status: HqWarehouseAssignmentStatus.INACTIVE },
      include: {
        user: { select: { id: true, fullName: true, email: true, role: true } },
        assignedBy: { select: { id: true, fullName: true, role: true } },
      },
    });

    await this.audit(user, 'HQ_WAREHOUSE_MANAGER_UNASSIGNED', warehouseId, {
      userId: targetUserId,
      warehouseId,
      role: Role.WAREHOUSE_MANAGER,
      assignedById: user.id,
      oldValue: { status: HqWarehouseAssignmentStatus.ACTIVE, assignmentId: existing.id },
      newValue: { status: HqWarehouseAssignmentStatus.INACTIVE },
    });

    return assignment;
  }

  private assertCanAssign(user: AuthUser) {
    if (!hasAnyFullAccessRole(resolveUserRoles(user))) {
      throw new ForbiddenException('Only CEO can assign HQ warehouse managers');
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
          timestamp: new Date().toISOString(),
          ...metadata,
        } as Prisma.InputJsonValue,
      },
    });
  }
}
