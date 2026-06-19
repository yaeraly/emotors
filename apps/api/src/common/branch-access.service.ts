import { ForbiddenException, Injectable } from '@nestjs/common';
import { AuthUser } from './auth-user';

@Injectable()
export class BranchAccessService {
  scope(user: AuthUser) {
    return user.role === 'OWNER' ? {} : { branchId: user.branchId };
  }

  resolveBranchId(user: AuthUser, requestedBranchId?: string) {
    if (user.role === 'OWNER') {
      return requestedBranchId ?? user.branchId;
    }

    if (requestedBranchId && requestedBranchId !== user.branchId) {
      throw new ForbiddenException('You can access only your branch');
    }

    return user.branchId;
  }

  assertCanAccess(user: AuthUser, branchId: string) {
    if (user.role !== 'OWNER' && branchId !== user.branchId) {
      throw new ForbiddenException('You can access only your branch');
    }
  }
}
