import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';

export function normalizeBranchId(branchId?: string | null) {
  const normalized = branchId?.trim();
  return normalized ? normalized : undefined;
}

export function resolveWritableBranchId(
  user: AuthUser,
  requestedBranchId: string | undefined,
  canAccessAllBranches: boolean,
) {
  const requested = normalizeBranchId(requestedBranchId);
  const userBranch = normalizeBranchId(user.branchId);

  if (canAccessAllBranches) {
    const branchId = requested ?? userBranch;
    if (!branchId) {
      throw new BadRequestException('Branch is required');
    }
    return branchId;
  }

  if (requested && requested !== userBranch) {
    throw new ForbiddenException('You can only access your own branch');
  }

  if (!userBranch) {
    throw new BadRequestException('Branch is required');
  }

  return userBranch;
}
