import type { User } from '@/lib/types';

let cachedUser: User | null = null;
let inflight: Promise<User> | null = null;

export function getCachedUser(): User | null {
  return cachedUser;
}

export function setCachedUser(user: User | null) {
  cachedUser = user;
}

export function getCurrentUserInflight(): Promise<User> | null {
  return inflight;
}

export function setCurrentUserInflight(promise: Promise<User> | null) {
  inflight = promise;
}

export function clearCachedUser() {
  cachedUser = null;
  inflight = null;
}
