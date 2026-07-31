import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BranchStatus, BranchType, Prisma, Role, UserStatus, WarehouseType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuthUser } from '../auth/auth.types';
import { HqWarehouseAssignmentService } from '../hq-warehouse/hq-warehouse-assignment.service';
import { HqSalesManagerAssignmentService } from '../hq-warehouse/hq-sales-manager-assignment.service';
import { PrismaService } from '../prisma/prisma.service';
import { resolveDefaultPriceProfileId } from '../pricing/pricing-profile-defaults.util';
import {
  anyRoleRequiresBranch,
  hasAnyFullAccessRole,
  uniqueRoles,
  userHasPermission,
} from '../rbac/rbac';
import {
  assessUserDeleteProtection,
  assertCanHqCeoManageLifecycle,
  revokeUserSessions,
  userHasBusinessHistory,
} from '../lifecycle/hq-ceo-lifecycle.util';
import {
  USER_DELETE_ACTIVE_OPERATIONS_MESSAGE,
  USER_DELETE_LAST_CEO_MESSAGE,
  USER_DELETE_SELF_MESSAGE,
} from '../lifecycle/hq-ceo-lifecycle.constants';
import { assertCanPermanentDeleteBusinessData } from '../rbac/permanent-delete.util';
import { EMPLOYEE_ID_GENERATION_FAILED, generateBranchEmployeeId } from './employee-id.util';
import { BRANCH_CODE_GENERATION_FAILED, generateBranchCode } from '../branches/branch-code.util';

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
  Role.HQ_ACCOUNTANT,
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

const HQ_NO_LOGIN_ALLOWED_ROLES: Role[] = [
  Role.FRANCHISE_DIRECTOR,
  Role.SUPPLY_CHAIN_MANAGER,
  Role.WAREHOUSE_MANAGER,
  Role.FINANCE_MANAGER,
  Role.HQ_ACCOUNTANT,
  Role.MARKETING_MANAGER,
  Role.CONTENT_CREATOR,
  Role.ACADEMY_DIRECTOR,
  Role.SYSTEM_ADMINISTRATOR,
  Role.HQ_SALES_MANAGER,
  Role.HQ_CASHIER,
];
const BRANCH_EMPLOYEE_ROLES: Role[] = [
  Role.MANAGER,
  Role.MASTER,
  Role.WAREHOUSE_OPERATOR,
  Role.CASHIER,
  Role.ACCOUNTANT,
];
const HQ_ONLY_ROLES: Role[] = HQ_ROLES.filter((role) => !BRANCH_ROLES.includes(role));
const NO_LOGIN_PASSWORD_PLACEHOLDER = 'no-login-placeholder';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hqWarehouseAssignmentService: HqWarehouseAssignmentService,
    private readonly hqSalesManagerAssignmentService: HqSalesManagerAssignmentService,
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
    const normalizedBranchId = this.normalizeOptionalString(dto.branchId);
    this.validateUserTypeForCreate(user, userType, roles, normalizedBranchId);
    const primaryRole = this.primaryRole(roles, dto.role);
    this.assertCanManage(user, normalizedBranchId ?? undefined, roles);

    const hasLogin = dto.hasLogin !== false;
    const phone = this.normalizeOptionalString(dto.phone);
    let employeeId = this.normalizeOptionalString(dto.employeeId);
    const password = this.resolvePassword(dto.password);

    if (!hasLogin) {
      if (!this.hasFullAccess(user)) {
        throw new ForbiddenException('Only CEO can create employees without login');
      }
      if (userType !== 'HQ') {
        throw new BadRequestException('Employees without login are supported for HQ staff only');
      }
      if (!roles.every((role) => HQ_NO_LOGIN_ALLOWED_ROLES.includes(role))) {
        throw new BadRequestException('Selected role cannot be created without login');
      }
      if (!dto.fullName?.trim()) {
        throw new BadRequestException('Full name is required');
      }
      if (!phone) {
        throw new BadRequestException('Phone is required');
      }
    } else {
      this.validatePassword(password);
    }

    const username = hasLogin ? String(dto.username ?? '').trim().toLowerCase() : null;
    if (hasLogin && !username) throw new BadRequestException('Username is required');

    const email = hasLogin
      ? dto.email?.trim().toLowerCase() || `${username}@emotors.local`
      : dto.email?.trim().toLowerCase() || `no-login+${Date.now()}@emotors.internal`;

    const branchId = userType === 'HQ' ? null : this.resolveBranchId(user, normalizedBranchId ?? undefined, roles);

    if (!employeeId && userType === 'BRANCH' && branchId) {
      try {
        employeeId = await this.prisma.$transaction((tx) => generateBranchEmployeeId(tx, branchId));
      } catch (error) {
        if (error instanceof Error && error.message === EMPLOYEE_ID_GENERATION_FAILED) {
          throw new BadRequestException(EMPLOYEE_ID_GENERATION_FAILED);
        }
        throw error;
      }
    }

    await this.assertUserIdentifiersAvailable({ email, username, phone, employeeId });
    const passwordHash = hasLogin
      ? await bcrypt.hash(password, 12)
      : await bcrypt.hash(`${NO_LOGIN_PASSWORD_PLACEHOLDER}:${Date.now()}:${Math.random()}`, 12);

    const created = await this.prisma.user.create({
      data: {
        fullName: dto.fullName?.trim(),
        employeeId,
        phone,
        email,
        username,
        passwordHash,
        role: primaryRole,
        branchId,
        status: dto.status ?? UserStatus.ACTIVE,
        hasLogin,
        department: dto.department?.trim() || null,
        notes: dto.notes?.trim() || null,
        salary: dto.salary != null && dto.salary !== '' ? Number(dto.salary) : null,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        mustChangePassword: hasLogin,
      },
      include: { branch: true, userRoles: { include: { role: true } } },
    });
    const synced = await this.syncUserRoles(created.id, roles, user);
    if (roles.includes(Role.WAREHOUSE_MANAGER) && Array.isArray(dto.hqWarehouseIds)) {
      await this.hqWarehouseAssignmentService.syncUserAssignments(user, created.id, dto.hqWarehouseIds);
    }
    if (roles.includes(Role.HQ_SALES_MANAGER) && Array.isArray(dto.hqWarehouseIds)) {
      await this.hqSalesManagerAssignmentService.syncUserAssignments(user, created.id, dto.hqWarehouseIds);
    }
    const auditAction =
      userType === 'HQ'
        ? 'HQ_EMPLOYEE_REGISTERED'
        : this.hasRole(user, Role.FRANCHISE_OWNER)
          ? 'BRANCH_EMPLOYEE_CREATED'
          : 'user_created';
    await this.audit(user, auditAction, 'User', created.id, {
      branchId: created.branchId ?? undefined,
      roles,
      hasLogin,
      department: created.department,
      entityType: 'User',
      entityId: created.id,
    });
    if (userType === 'BRANCH' && this.hasRole(user, Role.FRANCHISE_OWNER)) {
      await this.audit(user, 'BRANCH_USER_CREATE_SUCCESS', 'User', created.id, {
        branchId: created.branchId ?? undefined,
        roles,
        entityType: 'User',
        entityId: created.id,
      });
      if (created.employeeId) {
        await this.audit(user, 'EMPLOYEE_ID_GENERATED', 'User', created.id, {
          userId: created.id,
          employeeId: created.employeeId,
          branchId: created.branchId ?? undefined,
          createdById: user.id,
          timestamp: new Date().toISOString(),
        });
      }
    }
    if (roles.includes(Role.HQ_ACCOUNTANT)) {
      await this.audit(user, 'HQ_ACCOUNTANT_CREATED', 'User', created.id, {
        entityType: 'User',
        entityId: created.id,
        roles,
      });
    }
    if (roles.includes(Role.ACCOUNTANT) && userType === 'BRANCH') {
      await this.audit(user, 'BRANCH_ACCOUNTANT_CREATED', 'User', created.id, {
        entityType: 'User',
        entityId: created.id,
        branchId: created.branchId ?? undefined,
        roles,
      });
    }
    const assignments = await this.loadWarehouseAssignments(created.id, roles);
    return {
      ...(await this.enrichUser({ ...created, userRoles: synced }, assignments)),
      temporaryPassword: hasLogin && !dto.password?.trim() ? TEMP_PASSWORD : undefined,
    };
  }

  async createLogin(user: AuthUser, id: string, dto: any) {
    if (!this.hasFullAccess(user)) {
      throw new ForbiddenException('Only CEO can create login credentials');
    }
    const existing = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: { userRoles: { include: { role: true } } },
    });
    if (!existing) throw new NotFoundException('User not found');
    if (existing.hasLogin) {
      throw new BadRequestException('Employee already has login credentials');
    }

    const username = String(dto.username ?? '').trim().toLowerCase();
    if (!username) throw new BadRequestException('Username is required');
    this.validatePassword(dto.password ?? TEMP_PASSWORD);
    const email = dto.email?.trim().toLowerCase() || existing.email;
    const passwordHash = await bcrypt.hash(dto.password ?? TEMP_PASSWORD, 12);

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        username,
        email,
        passwordHash,
        hasLogin: true,
        mustChangePassword: true,
      },
      include: { branch: true, userRoles: { include: { role: true } } },
    });

    await this.audit(user, 'EMPLOYEE_LOGIN_CREATED', 'User', id, {
      userId: id,
      oldValue: { hasLogin: false },
      newValue: { hasLogin: true, username, email },
    });

    return {
      ...this.safeUser(updated),
      temporaryPassword: dto.password ? undefined : TEMP_PASSWORD,
    };
  }

  async removeEmployee(user: AuthUser, id: string, reason?: string) {
    assertCanHqCeoManageLifecycle(user);

    const trimmedReason = reason?.trim() || null;

    await this.audit(user, 'USER_DELETE_REQUESTED', 'User', id, {
      actorUserId: user.id,
      targetUserId: id,
      reason: trimmedReason,
    });

    const protection = await this.prisma.$transaction(async (tx) => {
      return assessUserDeleteProtection(tx, user.id, id);
    });

    if (protection.blocked) {
      await this.audit(user, 'USER_DELETE_BLOCKED', 'User', id, {
        actorUserId: user.id,
        targetUserId: id,
        reason: protection.reason,
        blockingRecords: 'details' in protection ? protection.details : undefined,
      });

      if (protection.reason === 'SELF') {
        throw new BadRequestException(USER_DELETE_SELF_MESSAGE);
      }
      if (protection.reason === 'LAST_CEO') {
        throw new BadRequestException(USER_DELETE_LAST_CEO_MESSAGE);
      }
      if (protection.reason === 'OPEN_CASH_SHIFT' || protection.reason === 'ACTIVE_OPERATIONS') {
        throw new BadRequestException(USER_DELETE_ACTIVE_OPERATIONS_MESSAGE);
      }
      if (protection.reason === 'NOT_FOUND') {
        throw new NotFoundException('User not found');
      }
      throw new BadRequestException(USER_DELETE_ACTIVE_OPERATIONS_MESSAGE);
    }

    const existing = protection.target!;
    const oldValue = this.safeUser(existing);

    const hasHistory = await this.prisma.$transaction((tx) => userHasBusinessHistory(tx, id));

    if (!hasHistory) {
      await this.prisma.$transaction(async (tx) => {
        await tx.hqWarehouseManagerAssignment.deleteMany({ where: { userId: id } });
        await tx.hqSalesManagerWarehouseAssignment.deleteMany({ where: { userId: id } });
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userPermission.deleteMany({ where: { userId: id } });
        await revokeUserSessions(tx, id, user.id, user.role);
        await tx.user.delete({ where: { id } });
        await this.auditInTx(tx, user, 'USER_DELETED', 'User', id, {
          actorUserId: user.id,
          targetUserId: id,
          entityType: 'User',
          oldValue,
          reason: trimmedReason,
        });
      });
      return { success: true, archived: false, deactivated: false, message: 'Пользователь удалён' };
    }

    if (!trimmedReason) {
      throw new BadRequestException('Укажите причину деактивации пользователя с историей операций');
    }

    const archived = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { status: UserStatus.INACTIVE, deletedAt: new Date() },
        include: { branch: true, userRoles: { include: { role: true } } },
      });

      await tx.hqWarehouseManagerAssignment.updateMany({
        where: { userId: id, status: 'ACTIVE' },
        data: { status: 'INACTIVE' },
      });
      await tx.hqSalesManagerWarehouseAssignment.updateMany({
        where: { userId: id, status: 'ACTIVE' },
        data: { status: 'INACTIVE' },
      });

      await revokeUserSessions(tx, id, user.id, user.role);

      await this.auditInTx(tx, user, 'USER_DEACTIVATED', 'User', id, {
        actorUserId: user.id,
        targetUserId: id,
        entityType: 'User',
        oldValue,
        newValue: this.safeUser(updated),
        oldStatus: existing.status,
        newStatus: UserStatus.INACTIVE,
        reason: trimmedReason,
      });

      await this.auditInTx(tx, user, 'USER_ARCHIVED', 'User', id, {
        actorUserId: user.id,
        targetUserId: id,
        oldStatus: existing.status,
        newStatus: UserStatus.INACTIVE,
        reason: trimmedReason,
      });

      return updated;
    });

    return {
      success: true,
      archived: true,
      deactivated: true,
      message: 'Пользователь деактивирован',
      user: this.safeUser(archived),
    };
  }

  async createBranchOwner(user: AuthUser, dto: import('./dto/create-branch-owner.dto').CreateBranchOwnerDto) {
    if (!this.hasFullAccess(user)) {
      throw new ForbiddenException('Only CEO can create branch owners');
    }

    const username = String(dto.username ?? '').trim().toLowerCase();
    if (!username) throw new BadRequestException('Username is required');
    this.validatePassword(dto.password);

    const branchCodeInput = dto.branchCode?.trim().toUpperCase() || null;
    if (branchCodeInput) {
      const existingBranch = await this.prisma.branch.findUnique({ where: { code: branchCodeInput } });
      if (existingBranch) {
        throw new ConflictException('Branch code already exists');
      }
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
    const branchType = dto.branchType ?? BranchType.FRANCHISE;
    const priceProfileId = await resolveDefaultPriceProfileId(this.prisma, branchType);

    let result;
    try {
      result = await this.prisma.$transaction(async (tx) => {
        const branchCode = branchCodeInput ?? (await generateBranchCode(tx, branchType));
        const warehouseName = `${dto.branchName.trim()}нын склады`;
        const warehouseCode = `${branchCode}-WH`;

        const branch = await tx.branch.create({
          data: {
            name: dto.branchName.trim(),
            code: branchCode,
            city: dto.city?.trim() || null,
            address: dto.address?.trim() || null,
            phone: dto.branchPhone?.trim() || dto.phone?.trim() || null,
            ownerName: dto.fullName.trim(),
            status: dto.branchStatus ?? BranchStatus.ACTIVE,
            branchType,
            priceProfileId,
            openedAt: new Date(),
          },
        });

        await tx.auditLog.create({
          data: {
            userId: user.id,
            role: user.role,
            action: 'BRANCH_CODE_GENERATED',
            entity: 'Branch',
            entityId: branch.id,
            metadata: {
              branchId: branch.id,
              branchCode: branch.code,
              branchType,
              generatedById: user.id,
              generationMethod: branchCodeInput ? 'manual' : 'auto_sequence',
              timestamp: new Date().toISOString(),
            },
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
          branchCode: branch.code,
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
    } catch (error) {
      if (error instanceof Error && error.message === BRANCH_CODE_GENERATION_FAILED) {
        throw new BadRequestException(BRANCH_CODE_GENERATION_FAILED);
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException(BRANCH_CODE_GENERATION_FAILED);
      }
      throw error;
    }

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
    assertCanPermanentDeleteBusinessData(user);

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
    const assignments = await this.loadWarehouseAssignments(found.id, this.extractRoles(found));
    return await this.enrichUser(found, assignments);
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
        department: dto.department !== undefined ? dto.department?.trim() || null : undefined,
        notes: dto.notes !== undefined ? dto.notes?.trim() || null : undefined,
        salary: dto.salary !== undefined ? (dto.salary != null ? Number(dto.salary) : null) : undefined,
        startDate: dto.startDate !== undefined ? (dto.startDate ? new Date(dto.startDate) : null) : undefined,
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
    if (roles.includes(Role.HQ_SALES_MANAGER) && Array.isArray(dto.hqWarehouseIds)) {
      await this.hqSalesManagerAssignmentService.syncUserAssignments(user, id, dto.hqWarehouseIds);
    } else if (!roles.includes(Role.HQ_SALES_MANAGER) && existingRoles.includes(Role.HQ_SALES_MANAGER)) {
      const currentIds = await this.hqSalesManagerAssignmentService.getActiveAssignedWarehouseIds(id);
      await this.hqSalesManagerAssignmentService.syncUserAssignments(user, id, []);
    }
    await this.audit(user, 'user_updated', 'User', id, {
      rolesBefore: existingRoles,
      rolesAfter: roles,
    });
    const assignments = await this.loadWarehouseAssignments(id, roles);
    return await this.enrichUser({ ...updated, userRoles: synced }, assignments);
  }

  async resetPassword(user: AuthUser, id: string) {
    const target = await this.prisma.user.findUnique({
      where: { id },
      include: { branch: true, userRoles: { include: { role: true } } },
    });
    if (!target) throw new NotFoundException('User not found');
    if (!target.hasLogin) {
      throw new BadRequestException('Employee does not have login credentials. Use Create Login instead.');
    }

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
    const base = { deletedAt: null };
    if (this.hasFullAccess(user)) return base;
    if (this.isHqUserManager(user)) return { ...base, branchId: null };
    if (this.hasRole(user, Role.FRANCHISE_OWNER)) return { ...base, branchId: user.branchId };
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
      if (roles.some((role) => HQ_ONLY_ROLES.includes(role))) {
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

  private resolvePassword(password: unknown) {
    const value = typeof password === 'string' ? password.trim() : '';
    return value || TEMP_PASSWORD;
  }

  private normalizeOptionalString(value: unknown) {
    if (value == null) return null;
    const trimmed = String(value).trim();
    return trimmed || null;
  }

  private async assertUserIdentifiersAvailable(input: {
    email: string;
    username: string | null;
    phone: string | null;
    employeeId: string | null;
  }) {
    const orConditions: Prisma.UserWhereInput[] = [{ email: input.email }];
    if (input.username) orConditions.push({ username: input.username });
    if (input.phone) orConditions.push({ phone: input.phone });
    if (input.employeeId) orConditions.push({ employeeId: input.employeeId });

    const existing = await this.prisma.user.findFirst({
      where: { OR: orConditions },
      select: { id: true, email: true, username: true, phone: true, employeeId: true },
    });
    if (!existing) return;

    if (existing.email === input.email) {
      throw new ConflictException('User with this email already exists');
    }
    if (input.username && existing.username === input.username) {
      throw new ConflictException('User with this username already exists');
    }
    if (input.phone && existing.phone === input.phone) {
      throw new ConflictException('User with this phone already exists');
    }
    if (input.employeeId && existing.employeeId === input.employeeId) {
      throw new ConflictException('User with this employee ID already exists');
    }
    throw new ConflictException('User with the same login, email, or phone already exists');
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

  private async loadWarehouseAssignments(userId: string, roles: Role[]) {
    if (roles.includes(Role.WAREHOUSE_MANAGER)) {
      return this.hqWarehouseAssignmentService.listAssignmentsForUser(userId);
    }
    if (roles.includes(Role.HQ_SALES_MANAGER)) {
      return this.hqSalesManagerAssignmentService.listAssignmentsForUser(userId);
    }
    return [];
  }

  private async enrichUser(user: any, assignments: Array<{ warehouseId: string; warehouse: { id: string; name: string; code: string } }>) {
    const safe = this.safeUser(user);
    const additionalPermissions = await this.prisma.userPermission.findMany({
      where: { userId: user.id, isActive: true },
      include: { permission: true },
    });
    return {
      ...safe,
      additionalPermissions: additionalPermissions.map((row) => row.permission.code),
      cashierCapability: additionalPermissions.some((row) => row.permission.code === 'cashier'),
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
      Role.FINANCE_MANAGER,
      Role.HQ_ACCOUNTANT,
      Role.ACCOUNTANT,
      Role.MARKETING_MANAGER,
      Role.CONTENT_CREATOR,
      Role.ACADEMY_DIRECTOR,
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
