import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthUser } from '../auth/auth.types';
import { userHasAnyPermission } from '../rbac/rbac';
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

    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;

    if (!user || !userHasAnyPermission(user, requiredPermissions)) {
      this.logger.warn({
        message: 'Forbidden resource',
        userId: user?.id,
        roles: user?.roles,
        requiredPermissions,
        permissions: user?.permissions,
      });
      throw new ForbiddenException('Forbidden resource');
    }

    return true;
  }
}
