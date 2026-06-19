export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export type ApiError = {
  message: string;
  statusCode?: number;
};

export function getAccessToken() {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.localStorage.getItem('emotors.accessToken');
}

export function setTokens(accessToken: string, refreshToken: string) {
  window.localStorage.setItem('emotors.accessToken', accessToken);
  window.localStorage.setItem('emotors.refreshToken', refreshToken);
}

export function clearTokens() {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem('emotors.accessToken');
    window.localStorage.removeItem('emotors.refreshToken');
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getAccessToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (response.status === 401) {
    clearTokens();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    const error = (await response.json().catch(() => ({
      message: response.statusText,
    }))) as ApiError;
    throw new Error(Array.isArray(error.message) ? error.message.join(', ') : error.message);
  }

  return response.json() as Promise<T>;
}
