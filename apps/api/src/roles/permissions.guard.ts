import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthUser } from '../auth/auth.types';
import { hasAnyFullAccessRole, userHasPermission } from '../rbac/rbac';
import { PERMISSIONS_KEY } from './permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      method?: string;
      url?: string;
      user?: AuthUser;
    }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Forbidden resource');
    }

    const roles = user.roles?.length ? user.roles : [user.role];
    if (hasAnyFullAccessRole(roles) || userHasPermission(user, ...requiredPermissions)) {
      return true;
    }

    this.logger.warn({
      message: 'Forbidden resource',
      userId: user.id,
      username: user.username,
      role: user.role,
      roles: user.roles,
      route: `${request.method ?? 'UNKNOWN'} ${request.url ?? 'unknown'}`,
      controller: context.getClass().name,
      action: context.getHandler().name,
      requiredPermissions,
      permissions: user.permissions,
    });
    throw new ForbiddenException('Forbidden resource');
  }
}
