import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BranchStatus, Prisma, Role, UserStatus, WarehouseType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuthUser } from '../auth/auth.types';
import { HqWarehouseAssignmentService } from '../hq-warehouse/hq-warehouse-assignment.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  anyRoleRequiresBranch,
  hasAnyFullAccessRole,
  isHqRole,
  uniqueRoles,
  userHasPermission,
} from '../rbac/rbac';

const TEMP_PASSWORD = 'Emotors@2026';
const FRANCHISE_OWNER_PASSWORD_RESET_ALLOWED_ROLES: Role[] = [
  Role.MANAGER,
  Role.MASTER,
  Role.WAREHOUSE_OPERATOR,
  Role.CASHIER,
  Role.ACCOUNTANT,
];
const OWN_BRANCH_PASSWORD_RESET_ERROR =
  'You can reset passwords only for employees in your own branch.';
const HQ_ROLES: Role[] = [
  Role.CEO,
  Role.FRANCHISE_DIRECTOR,
  Role.SUPPLY_CHAIN_MANAGER,
  Role.HQ_SALES_MANAGER,
  Role.HQ_CASHIER,
  Role.WAREHOUSE_MANAGER,
  Role.FINANCE_MANAGER,
  Role.ACCOUNTANT,
  Role.MARKETING_MANAGER,
  Role.CONTENT_CREATOR,
  Role.ACADEMY_DIRECTOR,
  Role.SYSTEM_ADMINISTRATOR,
];
const BRANCH_ROLES: Role[] = [
  Role.FRANCHISE_OWNER,
  Role.MANAGER,
  Role.MASTER,
  Role.WAREHOUSE_OPERATOR,
  Role.CASHIER,
  Role.ACCOUNTANT,
];

const BRANCH_EMPLOYEE_ROLES: Role[] = [
  Role.MANAGER,
  Role.MASTER,
  Role.WAREHOUSE_OPERATOR,
  Role.CASHIER,
  Role.ACCOUNTANT,
];

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hqWarehouseAssignmentService: HqWarehouseAssignmentService,
  ) {}

  list(user: AuthUser, roleFilter?: string) {
    this.assertRoleFilterAllowed(user, roleFilter);
    return this.prisma.user.findMany({
      where: this.userScope(user),
      include: { branch: true, userRoles: { include: { role: true } } },
      orderBy: { fullName: 'asc' },
    }).then((users) => users.map((item) => this.safeUser(item)));
  }

  async create(user: AuthUser, dto: any) {
    const userType = dto.userType === 'HQ' ? 'HQ' : 'BRANCH';
    const roles = this.normalizeRoles(
      dto.roles,
      dto.role ? [dto.role] : [userType === 'HQ' ? Role.SUPPLY_CHAIN_MANAGER : Role.MANAGER],
    );
    this.validateUserTypeForCreate(user, userType, roles, dto.branchId);
    const primaryRole = this.primaryRole(roles, dto.role);
    this.assertCanManage(user, dto.branchId, roles);
    this.validatePassword(dto.password ?? TEMP_PASSWORD);
    const username = String(dto.username ?? '').trim().toLowerCase();
    if (!username) throw new BadRequestException('Username is required');
    const email = dto.email?.trim().toLowerCase() || `${username}@emotors.local`;
    const branchId = userType === 'HQ' ? null : this.resolveBranchId(user, dto.branchId, roles);
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
    if (roles.includes(Role.WAREHOUSE_MANAGER) && Array.isArray(dto.hqWarehouseIds)) {
      await this.hqWarehouseAssignmentService.syncUserAssignments(user, created.id, dto.hqWarehouseIds);
    }
    const auditAction = this.hasRole(user, Role.FRANCHISE_OWNER) ? 'BRANCH_EMPLOYEE_CREATED' : 'user_created';
    await this.audit(user, auditAction, 'User', created.id, {
      branchId: created.branchId ?? undefined,
      roles,
    });
    const assignments = roles.includes(Role.WAREHOUSE_MANAGER)
      ? await this.hqWarehouseAssignmentService.listAssignmentsForUser(created.id)
      : [];
    return {
      ...this.enrichUser({ ...created, userRoles: synced }, assignments),
      temporaryPassword: dto.password ? undefined : TEMP_PASSWORD,
    };
  }

  async createBranchOwner(user: AuthUser, dto: import('./dto/create-branch-owner.dto').CreateBranchOwnerDto) {
    if (!this.hasFullAccess(user)) {
      throw new ForbiddenException('Only CEO can create branch owners');
    }

    const username = String(dto.username ?? '').trim().toLowerCase();
    if (!username) throw new BadRequestException('Username is required');
    this.validatePassword(dto.password);

    const branchCode = dto.branchCode.trim().toUpperCase();
    const existingBranch = await this.prisma.branch.findUnique({ where: { code: branchCode } });
    if (existingBranch) {
      throw new ConflictException('Branch code already exists');
    }

    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [
          { username },
          ...(dto.email ? [{ email: dto.email.trim().toLowerCase() }] : []),
          ...(dto.phone ? [{ phone: dto.phone.trim() }] : []),
        ],
      },
    });
    if (existingUser) {
      throw new ConflictException('User with the same login, email, or phone already exists');
    }

    const email = dto.email?.trim().toLowerCase() || `${username}@emotors.local`;
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const warehouseName = `${dto.branchName.trim()}нын склады`;
    const warehouseCode = `${branchCode}-WH`;

    const result = await this.prisma.$transaction(async (tx) => {
      const branch = await tx.branch.create({
        data: {
          name: dto.branchName.trim(),
          code: branchCode,
          city: dto.city?.trim() || null,
          address: dto.address?.trim() || null,
          phone: dto.branchPhone?.trim() || dto.phone?.trim() || null,
          ownerName: dto.fullName.trim(),
          status: dto.branchStatus ?? BranchStatus.ACTIVE,
          openedAt: new Date(),
        },
      });

      const warehouse = await tx.warehouse.create({
        data: {
          branchId: branch.id,
          warehouseType: WarehouseType.BRANCH,
          name: warehouseName,
          code: warehouseCode,
          address: dto.address?.trim() || null,
          city: dto.city?.trim() || null,
          isActive: true,
        },
      });

      const owner = await tx.user.create({
        data: {
          fullName: dto.fullName.trim(),
          phone: dto.phone?.trim() || null,
          email,
          username,
          passwordHash,
          role: Role.FRANCHISE_OWNER,
          branchId: branch.id,
          status: dto.status ?? UserStatus.ACTIVE,
          mustChangePassword: true,
        },
        include: { branch: true, userRoles: { include: { role: true } } },
      });

      await this.auditInTx(tx, user, 'BRANCH_CREATED', 'Branch', branch.id, {
        branchId: branch.id,
        warehouseId: warehouse.id,
        newValue: { name: branch.name, code: branch.code },
      });
      await this.auditInTx(tx, user, 'BRANCH_WAREHOUSE_CREATED', 'Warehouse', warehouse.id, {
        branchId: branch.id,
        warehouseId: warehouse.id,
        newValue: { name: warehouse.name, code: warehouse.code, warehouseType: WarehouseType.BRANCH },
      });
      await this.auditInTx(tx, user, 'BRANCH_OWNER_CREATED', 'User', owner.id, {
        branchId: branch.id,
        warehouseId: warehouse.id,
        newValue: { fullName: owner.fullName, username: owner.username },
      });

      return { owner, branch, warehouse };
    });

    const synced = await this.syncUserRoles(result.owner.id, [Role.FRANCHISE_OWNER], user);
    return {
      ...this.safeUser({ ...result.owner, userRoles: synced }),
      branch: result.branch,
      warehouse: result.warehouse,
    };
  }

  async updateBranchOwner(user: AuthUser, id: string, dto: import('./dto/update-branch-owner.dto').UpdateBranchOwnerDto) {
    if (!this.hasFullAccess(user)) {
      throw new ForbiddenException('Only CEO can edit branch owners');
    }

    const existing = await this.prisma.user.findFirst({
      where: { id },
      include: { branch: true, userRoles: { include: { role: true } } },
    });
    if (!existing) throw new NotFoundException('Branch owner not found');
    const existingRoles = this.extractRoles(existing);
    if (!existingRoles.includes(Role.FRANCHISE_OWNER) || !existing.branchId) {
      throw new BadRequestException('User is not a branch owner');
    }

    if (dto.branchCode && dto.branchCode.trim().toUpperCase() !== existing.branch?.code) {
      const duplicate = await this.prisma.branch.findUnique({
        where: { code: dto.branchCode.trim().toUpperCase() },
      });
      if (duplicate) throw new ConflictException('Branch code already exists');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const branch = await tx.branch.update({
        where: { id: existing.branchId! },
        data: {
          ...(dto.branchName ? { name: dto.branchName.trim() } : {}),
          ...(dto.branchCode ? { code: dto.branchCode.trim().toUpperCase() } : {}),
          ...(dto.city !== undefined ? { city: dto.city?.trim() || null } : {}),
          ...(dto.address !== undefined ? { address: dto.address?.trim() || null } : {}),
          ...(dto.branchPhone !== undefined ? { phone: dto.branchPhone?.trim() || null } : {}),
          ...(dto.branchStatus ? { status: dto.branchStatus } : {}),
          ...(dto.fullName ? { ownerName: dto.fullName.trim() } : {}),
        },
      });

      const owner = await tx.user.update({
        where: { id },
        data: {
          ...(dto.fullName ? { fullName: dto.fullName.trim() } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone?.trim() || null } : {}),
          ...(dto.email ? { email: dto.email.trim().toLowerCase() } : {}),
          ...(dto.username ? { username: dto.username.trim().toLowerCase() } : {}),
          ...(dto.status ? { status: dto.status } : {}),
        },
        include: { branch: true, userRoles: { include: { role: true } } },
      });

      await this.auditInTx(tx, user, 'user_updated', 'User', id, {
        branchId: branch.id,
        rolesBefore: existingRoles,
        rolesAfter: existingRoles,
      });

      return { owner, branch };
    });

    return this.safeUser(updated.owner);
  }

  async deleteBranchOwner(user: AuthUser, id: string) {
    if (!this.hasFullAccess(user)) {
      throw new ForbiddenException('Only CEO can delete branch owners');
    }

    const existing = await this.prisma.user.findFirst({
      where: { id },
      include: { branch: true, userRoles: { include: { role: true } } },
    });
    if (!existing) throw new NotFoundException('Branch owner not found');
    const existingRoles = this.extractRoles(existing);
    if (!existingRoles.includes(Role.FRANCHISE_OWNER) || !existing.branchId) {
      throw new BadRequestException('User is not a branch owner');
    }

    const branchId = existing.branchId;
    const [users, customers, sales] = await Promise.all([
      this.prisma.user.count({ where: { branchId, id: { not: id } } }),
      this.prisma.customer.count({ where: { branchId } }),
      this.prisma.sale.count({ where: { branchId } }),
    ]);
    if (users + customers + sales > 0) {
      throw new BadRequestException(
        'Branch owner cannot be deleted while branch has employees, customers, or sales. Deactivate instead.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { status: UserStatus.INACTIVE },
      });
      await tx.branch.update({
        where: { id: branchId },
        data: { status: BranchStatus.INACTIVE, deletedAt: new Date() },
      });
      await tx.warehouse.updateMany({
        where: { branchId },
        data: { isActive: false, deletedAt: new Date() },
      });
      await this.auditInTx(tx, user, 'user_suspended', 'User', id, { branchId });
    });

    return { success: true, deactivated: true };
  }

  listBranchOwners(user: AuthUser) {
    if (!this.hasFullAccess(user)) {
      throw new ForbiddenException('Only CEO can list all branch owners');
    }
    return this.prisma.user.findMany({
      where: {
        userRoles: { some: { role: { code: Role.FRANCHISE_OWNER } } },
      },
      include: { branch: true, userRoles: { include: { role: true } } },
      orderBy: { fullName: 'asc' },
    }).then((users) => users.map((item) => this.safeUser(item)));
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
    const assignments = found.role === Role.WAREHOUSE_MANAGER || this.extractRoles(found).includes(Role.WAREHOUSE_MANAGER)
      ? await this.hqWarehouseAssignmentService.listAssignmentsForUser(found.id)
      : [];
    return this.enrichUser(found, assignments);
  }

  async update(user: AuthUser, id: string, dto: any) {
    const existing = await this.prisma.user.findFirst({ where: { id, ...this.userScope(user) } });
    if (!existing) throw new NotFoundException('User not found');
    const existingRoles = await this.currentRoles(id, existing.role);
    const roles = this.normalizeRoles(dto.roles, dto.role ? [dto.role] : existingRoles);
    const primaryRole = this.primaryRole(roles, dto.role);
    const targetUserType = existing.branchId === null ? 'HQ' : 'BRANCH';
    this.validateUserTypeForUpdate(user, targetUserType, roles, dto.branchId);
    const branchId =
      targetUserType === 'HQ'
        ? null
        : this.resolveBranchId(user, dto.branchId ?? existing.branchId ?? undefined, roles);
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
    if (roles.includes(Role.WAREHOUSE_MANAGER) && Array.isArray(dto.hqWarehouseIds)) {
      await this.hqWarehouseAssignmentService.syncUserAssignments(user, id, dto.hqWarehouseIds);
    } else if (!roles.includes(Role.WAREHOUSE_MANAGER) && existingRoles.includes(Role.WAREHOUSE_MANAGER)) {
      const currentIds = await this.hqWarehouseAssignmentService.getActiveAssignedWarehouseIds(id);
      await this.hqWarehouseAssignmentService.syncUserAssignments(user, id, []);
    }
    await this.audit(user, 'user_updated', 'User', id, {
      rolesBefore: existingRoles,
      rolesAfter: roles,
    });
    const assignments = roles.includes(Role.WAREHOUSE_MANAGER)
      ? await this.hqWarehouseAssignmentService.listAssignmentsForUser(id)
      : [];
    return this.enrichUser({ ...updated, userRoles: synced }, assignments);
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
    if (this.isHqUserManager(user)) return { branchId: null };
    if (this.hasRole(user, Role.FRANCHISE_OWNER)) return { branchId: user.branchId };
    throw new ForbiddenException('No user management access');
  }

  private assertRoleFilterAllowed(user: AuthUser, roleFilter?: string) {
    if (!roleFilter || this.hasFullAccess(user)) return;
    if (this.hasRole(user, Role.FRANCHISE_OWNER) && !BRANCH_ROLES.includes(roleFilter as Role)) {
      throw new BadRequestException('Branch users can filter only branch roles.');
    }
  }

  private assertCanManage(user: AuthUser, branchId: string | undefined, roles: Role[]) {
    if (this.hasFullAccess(user)) return;
    if (this.isHqUserManager(user)) {
      if (branchId) {
        throw new ForbiddenException('HQ managers can only manage HQ employees');
      }
      if (roles.some((role) => !HQ_ROLES.includes(role))) {
        throw new ForbiddenException('Cannot assign non-HQ roles');
      }
      return;
    }
    if (this.hasRole(user, Role.FRANCHISE_OWNER)) {
      if (branchId && branchId !== user.branchId) throw new ForbiddenException('Forbidden branch');
      if (roles.some((role) => isHqRole(role))) {
        throw new ForbiddenException('Cannot create HQ users');
      }
      if (roles.includes(Role.FRANCHISE_OWNER)) {
        throw new ForbiddenException('Branch owners cannot create another branch owner');
      }
      if (roles.some((role) => !BRANCH_EMPLOYEE_ROLES.includes(role))) {
        throw new ForbiddenException('Branch owners can only assign branch employee roles');
      }
      return;
    }
    throw new ForbiddenException('No user management access');
  }

  private validateUserTypeForCreate(
    user: AuthUser,
    userType: 'HQ' | 'BRANCH',
    roles: Role[],
    branchId?: string | null,
  ) {
    if (userType === 'HQ') {
      if (!this.hasRole(user, Role.CEO) && !this.hasRole(user, Role.SYSTEM_ADMINISTRATOR)) {
        throw new ForbiddenException('Only CEO or system administrator can create HQ employees');
      }
      if (branchId) {
        throw new BadRequestException('HQ employees cannot belong to a branch.');
      }
      if (!roles.length || roles.some((role) => !HQ_ROLES.includes(role))) {
        throw new BadRequestException('HQ employees can only have HQ roles.');
      }
      return;
    }

    if (!roles.length || roles.some((role) => !BRANCH_ROLES.includes(role))) {
      throw new BadRequestException('Branch employees can only have branch roles.');
    }
    if (!branchId && !this.hasRole(user, Role.FRANCHISE_OWNER)) {
      throw new BadRequestException('Branch is required for branch employees');
    }
  }

  private validateUserTypeForUpdate(
    user: AuthUser,
    userType: 'HQ' | 'BRANCH',
    roles: Role[],
    branchId?: string | null,
  ) {
    if (userType === 'HQ') {
      if (!this.hasRole(user, Role.CEO) && !this.hasRole(user, Role.SYSTEM_ADMINISTRATOR)) {
        throw new ForbiddenException('Only CEO or system administrator can manage HQ employees');
      }
      if (branchId) {
        throw new BadRequestException('HQ employees cannot belong to a branch.');
      }
      if (!roles.length || roles.some((role) => !HQ_ROLES.includes(role))) {
        throw new BadRequestException('HQ employees can only have HQ roles.');
      }
      return;
    }

    if (!roles.length || roles.some((role) => !BRANCH_ROLES.includes(role))) {
      throw new BadRequestException('Branch employees can only have branch roles.');
    }
    if (!branchId) {
      throw new BadRequestException('Branch is required for branch employees');
    }
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
      data: {
        userId: user.id,
        role: user.role,
        action,
        entity,
        entityId,
        metadata: {
          roles: user.roles ?? [user.role],
          ...(metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {}),
        },
      },
    });
  }

  private auditInTx(
    tx: Prisma.TransactionClient,
    user: AuthUser,
    action: string,
    entity: string,
    entityId?: string,
    metadata?: Prisma.InputJsonValue,
  ) {
    return tx.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action,
        entity,
        entityId,
        metadata: {
          roles: user.roles ?? [user.role],
          ...(metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {}),
        },
      },
    });
  }

  private safeUser(user: any) {
    const { passwordHash, ...rest } = user;
    const roles = rest.userRoles?.map((userRole: any) => userRole.role.code) ?? [rest.role];
    return { ...rest, roles };
  }

  private enrichUser(user: any, assignments: Array<{ warehouseId: string; warehouse: { id: string; name: string; code: string } }>) {
    const safe = this.safeUser(user);
    return {
      ...safe,
      assignedHqWarehouseIds: assignments.map((row) => row.warehouseId),
      assignedHqWarehouses: assignments.map((row) => row.warehouse),
    };
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
      Role.HQ_SALES_MANAGER,
      Role.HQ_CASHIER,
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

  private isHqUserManager(user: AuthUser) {
    return userHasPermission(user, 'users.manage') && user.branchId === null;
  }

  private hasRole(user: AuthUser, role: Role) {
    return (user.roles?.length ? user.roles : [user.role]).includes(role);
  }

  private assertCanResetPassword(
    user: AuthUser,
    target: { branchId: string | null; role: Role },
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
