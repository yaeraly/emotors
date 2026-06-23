import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { FULL_ACCESS_ROLES, requiresBranch } from '../rbac/rbac';

const TEMP_PASSWORD = 'Emotors@2026';

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
    this.assertCanManage(user, dto.branchId, dto.role);
    this.validatePassword(dto.password ?? TEMP_PASSWORD);
    const username = String(dto.username ?? '').trim().toLowerCase();
    if (!username) throw new BadRequestException('Username is required');
    const email = dto.email?.trim().toLowerCase() || `${username}@emotors.local`;
    const branchId = this.resolveBranchId(user, dto.branchId, dto.role);
    const passwordHash = await bcrypt.hash(dto.password ?? TEMP_PASSWORD, 12);
    const created = await this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        employeeId: dto.employeeId,
        phone: dto.phone,
        email,
        username,
        passwordHash,
        role: dto.role,
        branchId,
        status: dto.status ?? UserStatus.ACTIVE,
        mustChangePassword: true,
      },
      include: { branch: true },
    });
    await this.syncUserRole(created.id, created.role);
    await this.audit(user, 'user_created', 'User', created.id);
    return { ...this.safeUser(created), temporaryPassword: dto.password ? undefined : TEMP_PASSWORD };
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
    const role = dto.role ?? existing.role;
    const branchId = this.resolveBranchId(user, dto.branchId ?? existing.branchId ?? undefined, role);
    this.assertCanManage(user, branchId ?? undefined, role);
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        fullName: dto.fullName,
        employeeId: dto.employeeId,
        phone: dto.phone,
        email: dto.email,
        username: dto.username?.toLowerCase(),
        role: dto.role,
        branchId,
        status: dto.status,
      },
      include: { branch: true },
    });
    if (dto.role) await this.syncUserRole(id, dto.role);
    await this.audit(user, 'user_updated', 'User', id);
    return this.safeUser(updated);
  }

  async resetPassword(user: AuthUser, id: string) {
    if (!FULL_ACCESS_ROLES.includes(user.role)) {
      throw new ForbiddenException('Only CEO or system administrator can reset passwords');
    }
    const passwordHash = await bcrypt.hash(TEMP_PASSWORD, 12);
    const updated = await this.prisma.user.update({
      where: { id },
      data: { passwordHash, mustChangePassword: true },
      include: { branch: true },
    });
    await this.audit(user, 'password_reset', 'User', id);
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
    if (FULL_ACCESS_ROLES.includes(user.role)) return {};
    if (user.role === Role.FRANCHISE_OWNER) return { branchId: user.branchId };
    throw new ForbiddenException('No user management access');
  }

  private assertCanManage(user: AuthUser, branchId?: string, role?: Role) {
    if (FULL_ACCESS_ROLES.includes(user.role)) return;
    if (user.role === Role.FRANCHISE_OWNER) {
      if (branchId && branchId !== user.branchId) throw new ForbiddenException('Forbidden branch');
      const hqRoles: Role[] = [Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR];
      if (role && hqRoles.includes(role)) {
        throw new ForbiddenException('Cannot create HQ users');
      }
      return;
    }
    throw new ForbiddenException('No user management access');
  }

  private resolveBranchId(user: AuthUser, branchId?: string, role?: Role) {
    if (role && requiresBranch(role) && !branchId) {
      throw new BadRequestException('Branch is required for this role');
    }
    if (FULL_ACCESS_ROLES.includes(user.role)) return branchId ?? null;
    if (branchId && branchId !== user.branchId) throw new ForbiddenException('Forbidden branch');
    return user.branchId;
  }

  private validatePassword(password: string) {
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
      throw new BadRequestException('Password must contain uppercase, lowercase and number');
    }
  }

  private async syncUserRole(userId: string, roleCode: string) {
    const role = await this.prisma.rbacRole.upsert({
      where: { code: roleCode },
      update: { name: roleCode.replaceAll('_', ' ') },
      create: { code: roleCode, name: roleCode.replaceAll('_', ' ') },
    });
    await this.prisma.userRole.deleteMany({
      where: {
        userId,
        roleId: { not: role.id },
      },
    });
    await this.prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId: role.id } },
      update: {},
      create: { userId, roleId: role.id },
    });
  }

  private audit(user: AuthUser, action: string, entity: string, entityId?: string) {
    return this.prisma.auditLog.create({
      data: { userId: user.id, role: user.role, action, entity, entityId },
    });
  }

  private safeUser(user: any) {
    const { passwordHash, ...rest } = user;
    return rest;
  }
}
