import type { User } from './types';
import { usesUnifiedNav } from './unified-nav';

/** Branch Sales pages rely on unified module tabs for the primary page title. */
export function usesUnifiedNavPageTitle(user: User | null | undefined) {
  return usesUnifiedNav(user);
}
