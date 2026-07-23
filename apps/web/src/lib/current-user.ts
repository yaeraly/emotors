import { apiFetch } from '@/lib/api';
import {
  clearCachedUser,
  getCachedUser,
  getCurrentUserInflight,
  setCachedUser,
  setCurrentUserInflight,
} from '@/lib/current-user-cache';
import type { User } from '@/lib/types';

export { clearCachedUser, getCachedUser, setCachedUser };

/** Session-scoped /auth/me with in-flight dedupe. Cleared on logout / 401. */
export async function fetchCurrentUser(options?: { force?: boolean }): Promise<User> {
  if (!options?.force && getCachedUser()) {
    return getCachedUser()!;
  }

  const existing = getCurrentUserInflight();
  if (existing) {
    return existing;
  }

  const promise = apiFetch<User>('/auth/me')
    .then((user) => {
      setCachedUser(user);
      setCurrentUserInflight(null);
      return user;
    })
    .catch((error) => {
      setCurrentUserInflight(null);
      throw error;
    });

  setCurrentUserInflight(promise);
  return promise;
}
