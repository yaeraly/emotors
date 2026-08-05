import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { anyRoleRequiresBranch, permissionsForRoles, uniqueRoles } from '../rbac/rbac';
import { AuthUser } from './auth.types';

type JwtPayload = {
  sub: string;
  email: string;
  role: AuthUser['role'];
  roles?: AuthUser['roles'];
  branchId: string;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        username: true,
        fullName: true,
        role: true,
        branchId: true,
        status: true,
      },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Аккаунт деактивирован. Вход недоступен.');
    }

    const userRoles = await this.prisma.userRole.findMany({
      where: { userId: user.id },
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
    const permissions = userRoles.flatMap((userRole) =>
      userRole.role.permissions.map((rolePermission) => rolePermission.permission.code),
    );
    const roles = uniqueRoles(userRoles.map((userRole) => userRole.role.code as AuthUser['role']));
    const assignedRoles = uniqueRoles([user.role, ...roles]);

    if (anyRoleRequiresBranch(assignedRoles) && !user.branchId) {
      throw new UnauthorizedException('User branch is not assigned');
    }

    return {
      ...user,
      branchId: user.branchId ?? '',
      roles: assignedRoles,
      permissions: Array.from(new Set([...permissionsForRoles(assignedRoles), ...permissions])),
    };
  }
}
