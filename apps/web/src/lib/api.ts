import { clearCachedUser } from '@/lib/current-user-cache';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const TOKEN_KEY = 'emotors_access_token';

export function getToken() {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  window.localStorage.removeItem(TOKEN_KEY);
  clearCachedUser();
}

export function clearAuthState() {
  clearToken();
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem('bsm-menu-audit');
  window.sessionStorage.removeItem('users.createSuccess');
  window.sessionStorage.removeItem('users.branchOwnerCreatedSuccess');
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);

  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    clearToken();
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const rawMessage = errorBody?.message ?? `Request failed with status ${response.status}`;
    const message = Array.isArray(rawMessage) ? rawMessage.join(', ') : String(rawMessage);
    if (message === 'HQ_WAREHOUSE_ACCESS_DENIED' && errorBody?.messages) {
      const storedLanguage =
        typeof window !== 'undefined'
          ? window.localStorage.getItem('emotors-language')
          : null;
      const localized =
        errorBody.messages[storedLanguage === 'ky' || storedLanguage === 'ru' ? storedLanguage : 'en'] ??
        errorBody.messages.en;
      throw new Error(localized);
    }
    if (message === 'HQ_SALES_MANAGER_ACCESS_DENIED' && errorBody?.messages) {
      const storedLanguage =
        typeof window !== 'undefined'
          ? window.localStorage.getItem('emotors-language')
          : null;
      const localized =
        errorBody.messages[storedLanguage === 'ky' || storedLanguage === 'ru' ? storedLanguage : 'en'] ??
        errorBody.messages.ru ??
        errorBody.messages.en;
      throw new Error(localized);
    }
    if (message === 'HQ_RECEIVING_BLOCKED' && errorBody?.messages) {
      const storedLanguage =
        typeof window !== 'undefined'
          ? window.localStorage.getItem('emotors-language')
          : null;
      const localized =
        errorBody.messages[storedLanguage === 'ky' || storedLanguage === 'ru' ? storedLanguage : 'en'] ??
        errorBody.messages.ru ??
        errorBody.messages.en;
      throw new Error(localized);
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export async function login(email: string, password: string) {
  return apiFetch<{ accessToken: string; user: import('./types').User }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}
