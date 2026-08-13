import { clearCachedUser } from '@/lib/current-user-cache';
import { mapFetchError } from '@/lib/fetch-errors.util';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
export const UPLOAD_TIMEOUT_MS = 120_000;
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

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
    });
  } catch (error) {
    throw new Error(mapFetchError(error));
  }

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

export async function apiUpload<T = unknown>(
  path: string,
  formData: FormData,
  options: Omit<RequestInit, 'body' | 'method'> & { timeoutMs?: number } = {},
): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const timeoutMs = options.timeoutMs ?? UPLOAD_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      method: 'POST',
      headers,
      body: formData,
      signal: controller.signal,
    });

    if (response.status === 401) {
      clearToken();
      throw new Error('Unauthorized');
    }

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      const rawMessage = errorBody?.message ?? `Request failed with status ${response.status}`;
      const message = Array.isArray(rawMessage) ? rawMessage.join(', ') : String(rawMessage);
      throw new Error(message);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Превышено время ожидания загрузки. Повторите попытку.');
    }
    throw new Error(mapFetchError(error));
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function login(email: string, password: string) {
  return apiFetch<{ accessToken: string; user: import('./types').User }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}
