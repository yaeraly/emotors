/**
 * Global imperative toast API for EMOTORS OS.
 * ToastProvider (mounted once in root layout) renders bottom-right notifications.
 */

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export type ToastPayload = {
  id: number;
  message: string;
  variant: ToastVariant;
  durationMs: number;
};

type ToastListener = (toast: ToastPayload) => void;

const DEFAULT_DURATIONS: Record<ToastVariant, number> = {
  success: 3500,
  info: 3500,
  warning: 4500,
  error: 5500,
};

let nextId = 1;
const listeners = new Set<ToastListener>();

function emit(message: string, variant: ToastVariant, durationMs?: number) {
  const trimmed = String(message ?? '').trim();
  if (!trimmed) return;
  const toast: ToastPayload = {
    id: nextId++,
    message: trimmed,
    variant,
    durationMs: durationMs ?? DEFAULT_DURATIONS[variant],
  };
  listeners.forEach((listener) => listener(toast));
}

export function subscribeToast(listener: ToastListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Imperative global toast — one action → one toast. */
export const toast = {
  success(message: string, durationMs?: number) {
    emit(message, 'success', durationMs);
  },
  error(message: string, durationMs?: number) {
    emit(message, 'error', durationMs);
  },
  warning(message: string, durationMs?: number) {
    emit(message, 'warning', durationMs);
  },
  info(message: string, durationMs?: number) {
    emit(message, 'info', durationMs);
  },
  show(message: string, variant: ToastVariant = 'info', durationMs?: number) {
    emit(message, variant, durationMs);
  },
};

/**
 * Shared user-facing error message extractor.
 * Prefer backend business text when present; fall back to translated generic.
 */
export function getErrorMessage(
  error: unknown,
  fallback = 'Something went wrong',
): string {
  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string' &&
    (error as { message: string }).message.trim()
  ) {
    return (error as { message: string }).message.trim();
  }
  return fallback;
}

/** Show an error toast from an unknown catch value. */
export function toastError(error: unknown, fallback?: string) {
  toast.error(getErrorMessage(error, fallback));
}
