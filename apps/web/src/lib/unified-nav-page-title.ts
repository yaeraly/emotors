import type { User } from './types';
import { isBranchCashierUser, isBranchOwnerUser } from './rbac';
import { usesUnifiedNav } from './unified-nav';

/** Branch Sales pages rely on unified module tabs for the primary page title. */
export function usesUnifiedNavPageTitle(user: User | null | undefined) {
  return usesUnifiedNav(user) || isBranchCashierUser(user);
}

/** Branch Cashier sidebar already labels pages such as service payment and returns. */
export function shouldHideBranchCashierDuplicateNavTitle(user: User | null | undefined) {
  return isBranchCashierUser(user);
}

/** Branch CEO pages should hide in-page titles that duplicate unified module tabs. */
export function shouldHideBranchCeoDuplicateNavTitle(user: User | null | undefined) {
  return isBranchOwnerUser(user);
}
