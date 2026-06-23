import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { permissionsForRole, requiresBranch } from '../rbac/rbac';
import { AuthUser } from './auth.types';

type JwtPayload = {
  sub: string;
  email: string | null;
  role: AuthUser['role'];
  branchId: string | null;
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
        fullName: true,
        role: true,
        branchId: true,
        status: true,
      },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User no longer exists');
    }

    if (requiresBranch(user.role) && !user.branchId) {
      throw new UnauthorizedException('User branch is not assigned');
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

    return {
      ...user,
      permissions: permissions.length ? Array.from(new Set(permissions)) : permissionsForRole(user.role),
    };
  }
}
