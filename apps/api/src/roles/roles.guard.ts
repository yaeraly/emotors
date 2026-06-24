import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { anyRoleRequiresBranch, permissionsForRoles, rolesCanAccessRequiredRoles } from '../rbac/rbac';
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

    const userRoles = user?.roles?.length ? user.roles : user ? [user.role] : [];

    if (!user || !rolesCanAccessRequiredRoles(userRoles, requiredRoles)) {
      this.logForbidden(context, request, user, requiredRoles);
      throw new ForbiddenException('Forbidden resource');
    }

    if (anyRoleRequiresBranch(userRoles) && !user.branchId) {
      this.logForbidden(context, request, user, requiredRoles);
      throw new ForbiddenException('Forbidden resource');
    }

    return true;
  }

  private logForbidden(
    context: ExecutionContext,
    request: { method?: string; url?: string },
    user: AuthUser | undefined,
    requiredRoles: Role[],
  ) {
    this.logger.warn({
      message: 'Forbidden resource',
      userId: user?.id,
      username: user?.username,
      role: user?.role,
      roles: user?.roles,
      branchId: user?.branchId,
      route: `${request.method ?? 'UNKNOWN'} ${request.url ?? 'unknown'}`,
      controller: context.getClass().name,
      action: context.getHandler().name,
      requiredRoles,
      requiredPermissions: permissionsForRoles(requiredRoles),
      permissions: user?.permissions,
    });
  }
}
