'use client';

/**
 * Compatibility shim for the global toast system.
 * Prefer: import { toast } from '@/lib/toast'
 */
import { useCallback } from 'react';
import { toast as globalToast, type ToastVariant } from '@/lib/toast';

export type BottomRightToastVariant = Extract<ToastVariant, 'success' | 'error'> | ToastVariant;

export type BottomRightToastState = {
  message: string;
  variant: BottomRightToastVariant;
} | null;

/** @deprecated Use `import { toast } from '@/lib/toast'` — global ToastProvider renders UI. */
export function useBottomRightToast(_durationMs?: number) {
  const show = useCallback((message: string, variant: BottomRightToastVariant) => {
    globalToast.show(message, variant);
  }, []);

  const showSuccess = useCallback((message: string) => globalToast.success(message), []);
  const showError = useCallback((message: string) => globalToast.error(message), []);
  const dismiss = useCallback(() => {
    /* global toasts auto-dismiss */
  }, []);

  return {
    toast: null as BottomRightToastState,
    showSuccess,
    showError,
    dismiss,
    show,
  };
}

/** @deprecated Global ToastProvider already renders toasts. Keep as no-op for call sites. */
export function BottomRightToast(_props: {
  toast: BottomRightToastState;
  onDismiss?: () => void;
}) {
  return null;
}
