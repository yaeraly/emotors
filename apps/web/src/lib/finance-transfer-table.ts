import type { User } from './types';
import { isBranchAccountantUser, isBranchOwnerUser } from './rbac';

/** Branch Accountant and Branch CEO see a compact transfers table with an Open detail action. */
export function usesCompactFinanceTransferTable(user: Pick<User, 'role' | 'roles' | 'branchId'> | null | undefined) {
  if (!user) return false;
  return isBranchAccountantUser(user) || isBranchOwnerUser(user);
}
