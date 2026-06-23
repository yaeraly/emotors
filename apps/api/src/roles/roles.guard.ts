import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { requiresBranch, roleCanAccessRequiredRoles } from '../rbac/rbac';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      method?: string;
      url?: string;
      user?: AuthUser;
    }>();
    const user = request.user;

    if (!user || !roleCanAccessRequiredRoles(user.role, requiredRoles)) {
      this.logForbidden(request, user, requiredRoles);
      throw new ForbiddenException('Forbidden resource');
    }

    if (requiresBranch(user.role) && !user.branchId) {
      this.logForbidden(request, user, requiredRoles);
      throw new ForbiddenException('Forbidden resource');
    }

    return true;
  }

  private logForbidden(
    request: { method?: string; url?: string },
    user: AuthUser | undefined,
    requiredRoles: Role[],
  ) {
    this.logger.warn({
      message: 'Forbidden resource',
      userId: user?.id,
      role: user?.role,
      branchId: user?.branchId,
      route: `${request.method ?? 'UNKNOWN'} ${request.url ?? 'unknown'}`,
      requiredRoles,
      permissions: user?.permissions,
    });
  }
}
