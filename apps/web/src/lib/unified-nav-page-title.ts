import type { User } from './types';
import { isBranchOwnerUser } from './rbac';
import { usesUnifiedNav } from './unified-nav';

/** Branch Sales pages rely on unified module tabs for the primary page title. */
export function usesUnifiedNavPageTitle(user: User | null | undefined) {
  return usesUnifiedNav(user);
}

/** Branch CEO pages should hide in-page titles that duplicate unified module tabs. */
export function shouldHideBranchCeoDuplicateNavTitle(user: User | null | undefined) {
  return isBranchOwnerUser(user);
}
