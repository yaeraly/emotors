import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtSignOptions, JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { permissionsForRole, requiresBranch } from '../rbac/rbac';
import { AuthUser } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

type JwtPayload = {
  sub: string;
  email: string;
  role: Role;
  branchId: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(dto: LoginDto, meta?: { ip?: string; userAgent?: string }) {
    const identifier = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier },
          { username: identifier },
          { phone: dto.email.trim() },
        ],
      },
      include: { branch: true },
    });

    if (!user) {
      await this.recordLogin(null, false, meta);
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status !== 'ACTIVE') {
      await this.recordLogin(user.id, false, meta);
      throw new UnauthorizedException('User is not active');
    }

    if (requiresBranch(user.role) && !user.branchId) {
      await this.recordLogin(user.id, false, meta);
      throw new UnauthorizedException('User branch is not assigned');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);

    if (!passwordMatches) {
      await this.recordLogin(user.id, false, meta);
      throw new UnauthorizedException('Invalid email or password');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      branchId: user.branchId,
    };

    const expiresIn =
      this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m';
    const signOptions: JwtSignOptions = {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: expiresIn as JwtSignOptions['expiresIn'],
    };

    const accessToken = await this.jwtService.signAsync(payload, signOptions);
    const permissions = await this.permissionsForUser(user.id, user.role);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    await this.recordLogin(user.id, true, meta);
    await this.audit(user.id, user.role, 'login', 'User', user.id);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        branchId: user.branchId,
        branch: user.branch,
        status: user.status,
        permissions,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }

  async getCurrentUser(user: AuthUser) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        branchId: true,
        branch: true,
        employeeId: true,
        phone: true,
        username: true,
        status: true,
        mustChangePassword: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!currentUser) {
      throw new UnauthorizedException('User no longer exists');
    }

    const permissions = await this.permissionsForUser(user.id, currentUser.role);

    return {
      ...currentUser,
      permissions,
    };
  }

  async changePassword(user: AuthUser, dto: ChangePasswordDto) {
    const currentUser = await this.prisma.user.findUnique({ where: { id: user.id } });
    if (!currentUser) throw new UnauthorizedException('User no longer exists');
    const matches = await bcrypt.compare(dto.currentPassword, currentUser.passwordHash);
    if (!matches) throw new UnauthorizedException('Invalid current password');
    this.validatePassword(dto.newPassword);
    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: false },
    });
    await this.audit(user.id, user.role, 'password_changed', 'User', user.id);
    return { success: true };
  }

  async logout(user: AuthUser) {
    const lastLogin = await this.prisma.loginHistory.findFirst({
      where: { userId: user.id, success: true, logoutAt: null },
      orderBy: { loginAt: 'desc' },
    });
    if (lastLogin) {
      await this.prisma.loginHistory.update({
        where: { id: lastLogin.id },
        data: { logoutAt: new Date() },
      });
    }
    await this.audit(user.id, user.role, 'logout', 'User', user.id);
    return { success: true };
  }

  private validatePassword(password: string) {
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
      throw new BadRequestException('Password must contain uppercase, lowercase and number');
    }
  }

  private recordLogin(userId: string | null, success: boolean, meta?: { ip?: string; userAgent?: string }) {
    return this.prisma.loginHistory.create({
      data: {
        userId,
        success,
        ipAddress: meta?.ip,
        browser: meta?.userAgent,
        device: meta?.userAgent,
      },
    });
  }

  private audit(userId: string | null, role: string | null, action: string, entity: string, entityId?: string) {
    return this.prisma.auditLog.create({
      data: { userId, role, action, entity, entityId },
    });
  }

  private async permissionsForUser(userId: string, role: Role) {
    const rows = await this.prisma.userRole.findMany({
      where: { userId },
      include: {
        role: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
      },
    });
    const permissions = rows.flatMap((row) =>
      row.role.permissions.map((rolePermission) => rolePermission.permission.code),
    );
    return permissions.length ? Array.from(new Set(permissions)) : permissionsForRole(role);
  }
}
