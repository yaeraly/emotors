import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  anyRoleRequiresBranch,
  hasAnyFullAccessRole,
  isHqRole,
  uniqueRoles,
} from '../rbac/rbac';

const TEMP_PASSWORD = 'Emotors@2026';
const FRANCHISE_OWNER_PASSWORD_RESET_ALLOWED_ROLES: Role[] = [
  Role.MANAGER,
  Role.MASTER,
  Role.WAREHOUSE_OPERATOR,
  Role.CASHIER,
];
const OWN_BRANCH_PASSWORD_RESET_ERROR =
  'You can reset passwords only for employees in your own branch.';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  list(user: AuthUser) {
    return this.prisma.user.findMany({
      where: this.userScope(user),
      include: { branch: true, userRoles: { include: { role: true } } },
      orderBy: { fullName: 'asc' },
    }).then((users) => users.map((item) => this.safeUser(item)));
  }

  async create(user: AuthUser, dto: any) {
    const roles = this.normalizeRoles(dto.roles, dto.role ? [dto.role] : [Role.MANAGER]);
    const primaryRole = this.primaryRole(roles, dto.role);
    this.assertCanManage(user, dto.branchId, roles);
    this.validatePassword(dto.password ?? TEMP_PASSWORD);
    const username = String(dto.username ?? '').trim().toLowerCase();
    if (!username) throw new BadRequestException('Username is required');
    const email = dto.email?.trim().toLowerCase() || `${username}@emotors.local`;
    const branchId = this.resolveBranchId(user, dto.branchId, roles);
    const passwordHash = await bcrypt.hash(dto.password ?? TEMP_PASSWORD, 12);
    const created = await this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        employeeId: dto.employeeId,
        phone: dto.phone,
        email,
        username,
        passwordHash,
        role: primaryRole,
        branchId,
        status: dto.status ?? UserStatus.ACTIVE,
        mustChangePassword: true,
      },
      include: { branch: true, userRoles: { include: { role: true } } },
    });
    const synced = await this.syncUserRoles(created.id, roles, user);
    await this.audit(user, 'user_created', 'User', created.id);
    return { ...this.safeUser({ ...created, userRoles: synced }), temporaryPassword: dto.password ? undefined : TEMP_PASSWORD };
  }

  async detail(user: AuthUser, id: string) {
    const found = await this.prisma.user.findFirst({
      where: { id, ...this.userScope(user) },
      include: {
        branch: true,
        userRoles: { include: { role: true } },
        loginHistory: { orderBy: { loginAt: 'desc' }, take: 50 },
      },
    });
    if (!found) throw new NotFoundException('User not found');
    return this.safeUser(found);
  }

  async update(user: AuthUser, id: string, dto: any) {
    const existing = await this.prisma.user.findFirst({ where: { id, ...this.userScope(user) } });
    if (!existing) throw new NotFoundException('User not found');
    const existingRoles = await this.currentRoles(id, existing.role);
    const roles = this.normalizeRoles(dto.roles, dto.role ? [dto.role] : existingRoles);
    const primaryRole = this.primaryRole(roles, dto.role);
    const branchId = this.resolveBranchId(user, dto.branchId ?? existing.branchId ?? undefined, roles);
    this.assertCanManage(user, branchId ?? undefined, roles);
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        fullName: dto.fullName,
        employeeId: dto.employeeId,
        phone: dto.phone,
        email: dto.email,
        username: dto.username?.toLowerCase(),
        role: primaryRole,
        branchId,
        status: dto.status,
      },
      include: { branch: true, userRoles: { include: { role: true } } },
    });
    const synced = await this.syncUserRoles(id, roles, user);
    await this.audit(user, 'user_updated', 'User', id, {
      rolesBefore: existingRoles,
      rolesAfter: roles,
    });
    return this.safeUser({ ...updated, userRoles: synced });
  }

  async resetPassword(user: AuthUser, id: string) {
    const target = await this.prisma.user.findUnique({
      where: { id },
      include: { branch: true, userRoles: { include: { role: true } } },
    });
    if (!target) throw new NotFoundException('User not found');

    const targetRoles = this.extractRoles(target);
    this.assertCanResetPassword(user, target, targetRoles);

    const passwordHash = await bcrypt.hash(TEMP_PASSWORD, 12);
    const updated = await this.prisma.user.update({
      where: { id },
      data: { passwordHash, mustChangePassword: true },
      include: { branch: true, userRoles: { include: { role: true } } },
    });
    await this.audit(user, 'PASSWORD_RESET', 'User', id, {
      actorUserId: user.id,
      targetUserId: id,
      branchId: updated.branchId,
      action: 'PASSWORD_RESET',
    });
    return { ...this.safeUser(updated), temporaryPassword: TEMP_PASSWORD };
  }

  setStatus(user: AuthUser, id: string, status: UserStatus) {
    return this.update(user, id, { status }).then(async (updated) => {
      await this.audit(user, status === UserStatus.ACTIVE ? 'user_activated' : 'user_suspended', 'User', id);
      return updated;
    });
  }

  loginHistory(user: AuthUser, id: string) {
    return this.detail(user, id).then(() =>
      this.prisma.loginHistory.findMany({
        where: { userId: id },
        orderBy: { loginAt: 'desc' },
        take: 100,
      }),
    );
  }

  private userScope(user: AuthUser) {
    if (this.hasFullAccess(user)) return {};
    if (this.hasRole(user, Role.FRANCHISE_OWNER)) return { branchId: user.branchId };
    throw new ForbiddenException('No user management access');
  }

  private assertCanManage(user: AuthUser, branchId: string | undefined, roles: Role[]) {
    if (this.hasFullAccess(user)) return;
    if (this.hasRole(user, Role.FRANCHISE_OWNER)) {
      if (branchId && branchId !== user.branchId) throw new ForbiddenException('Forbidden branch');
      if (roles.some((role) => isHqRole(role))) {
        throw new ForbiddenException('Cannot create HQ users');
      }
      return;
    }
    throw new ForbiddenException('No user management access');
  }

  private resolveBranchId(user: AuthUser, branchId: string | undefined, roles: Role[]) {
    if (anyRoleRequiresBranch(roles) && !branchId) {
      throw new BadRequestException('Branch is required for this role');
    }
    if (this.hasFullAccess(user)) return branchId ?? user.branchId;
    if (branchId && branchId !== user.branchId) throw new ForbiddenException('Forbidden branch');
    return user.branchId;
  }

  private validatePassword(password: string) {
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
      throw new BadRequestException('Password must contain uppercase, lowercase and number');
    }
  }

  private async syncUserRoles(userId: string, roleCodes: Role[], actor: AuthUser) {
    const roles = await Promise.all(
      roleCodes.map((roleCode) =>
        this.prisma.rbacRole.upsert({
          where: { code: roleCode },
          update: { name: roleCode.replaceAll('_', ' ') },
          create: { code: roleCode, name: roleCode.replaceAll('_', ' ') },
        }),
      ),
    );
    const existing = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: true },
    });
    const nextRoleIds = new Set(roles.map((role) => role.id));
    const nextRoleCodes = new Set(roleCodes);

    for (const current of existing) {
      if (!nextRoleIds.has(current.roleId)) {
        await this.prisma.userRole.delete({ where: { id: current.id } });
        await this.audit(actor, 'role_removed', 'UserRole', userId, {
          targetUserId: userId,
          role: current.role.code,
        });
      }
    }

    for (const role of roles) {
      const created = await this.prisma.userRole.upsert({
        where: { userId_roleId: { userId, roleId: role.id } },
        update: {},
        create: { userId, roleId: role.id, assignedById: actor.id },
        include: { role: true },
      });
      if (!existing.some((current) => current.roleId === role.id)) {
        await this.audit(actor, 'role_added', 'UserRole', userId, {
          targetUserId: userId,
          role: role.code,
        });
      }
      nextRoleCodes.delete(role.code as Role);
      void created;
    }

    await this.audit(actor, 'user_roles_updated', 'User', userId, {
      targetUserId: userId,
      roles: roleCodes,
    });

    return this.prisma.userRole.findMany({
      where: { userId },
      include: { role: true },
    });
  }

  private audit(user: AuthUser, action: string, entity: string, entityId?: string, metadata?: Prisma.InputJsonValue) {
    return this.prisma.auditLog.create({
      data: { userId: user.id, role: user.role, action, entity, entityId, metadata },
    });
  }

  private safeUser(user: any) {
    const { passwordHash, ...rest } = user;
    const roles = rest.userRoles?.map((userRole: any) => userRole.role.code) ?? [rest.role];
    return { ...rest, roles };
  }

  private normalizeRoles(value: unknown, fallback: Role[]) {
    const input = Array.isArray(value) ? value : fallback;
    const validRoles = new Set(Object.values(Role));
    const roles = uniqueRoles(
      input
        .map((role) => String(role) as Role)
        .filter((role): role is Role => validRoles.has(role)),
    );
    if (!roles.length) throw new BadRequestException('At least one role is required');
    return roles;
  }

  private primaryRole(roles: Role[], preferred?: Role) {
    if (preferred && roles.includes(preferred)) return preferred;
    const priority = [
      Role.OWNER,
      Role.CEO,
      Role.SYSTEM_ADMINISTRATOR,
      Role.FRANCHISE_OWNER,
      Role.SUPPLY_CHAIN_MANAGER,
      Role.WAREHOUSE_MANAGER,
      Role.PROCUREMENT_MANAGER,
      Role.MANAGER,
      Role.MASTER,
      Role.WAREHOUSE_OPERATOR,
      Role.CASHIER,
    ];
    return priority.find((role) => roles.includes(role)) ?? roles[0];
  }

  private async currentRoles(userId: string, fallback: Role) {
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: true },
    });
    return this.normalizeRoles(userRoles.map((userRole) => userRole.role.code), [fallback]);
  }

  private hasFullAccess(user: AuthUser) {
    return hasAnyFullAccessRole(user.roles?.length ? user.roles : [user.role]);
  }

  private hasRole(user: AuthUser, role: Role) {
    return (user.roles?.length ? user.roles : [user.role]).includes(role);
  }

  private assertCanResetPassword(
    user: AuthUser,
    target: { branchId: string; role: Role },
    targetRoles: Role[],
  ) {
    if (this.hasFullAccess(user)) return;

    if (!this.hasRole(user, Role.FRANCHISE_OWNER)) {
      throw new ForbiddenException(OWN_BRANCH_PASSWORD_RESET_ERROR);
    }

    if (target.branchId !== user.branchId) {
      throw new ForbiddenException(OWN_BRANCH_PASSWORD_RESET_ERROR);
    }

    if (!targetRoles.length || targetRoles.some((role) => !FRANCHISE_OWNER_PASSWORD_RESET_ALLOWED_ROLES.includes(role))) {
      throw new ForbiddenException(OWN_BRANCH_PASSWORD_RESET_ERROR);
    }
  }

  private extractRoles(user: { role: Role; userRoles?: { role: { code: string } }[] }) {
    const roles = user.userRoles?.map((userRole) => userRole.role.code as Role) ?? [];
    return uniqueRoles(roles.length ? roles : [user.role]);
  }
}
