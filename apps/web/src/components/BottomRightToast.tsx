'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type BottomRightToastVariant = 'success' | 'error';

export type BottomRightToastState = {
  message: string;
  variant: BottomRightToastVariant;
} | null;

const DEFAULT_DURATION_MS = 3500;

export function useBottomRightToast(durationMs = DEFAULT_DURATION_MS) {
  const [toast, setToast] = useState<BottomRightToastState>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current != null) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    clearHideTimer();
    setToast(null);
  }, [clearHideTimer]);

  const show = useCallback(
    (message: string, variant: BottomRightToastVariant) => {
      clearHideTimer();
      setToast({ message, variant });
      hideTimerRef.current = setTimeout(() => {
        setToast(null);
        hideTimerRef.current = null;
      }, durationMs);
    },
    [clearHideTimer, durationMs],
  );

  const showSuccess = useCallback((message: string) => show(message, 'success'), [show]);
  const showError = useCallback((message: string) => show(message, 'error'), [show]);

  useEffect(() => () => clearHideTimer(), [clearHideTimer]);

  return { toast, showSuccess, showError, dismiss };
}

type BottomRightToastProps = {
  toast: BottomRightToastState;
  onDismiss?: () => void;
};

/** Bottom-right toast matching existing workspace save feedback styling. */
export function BottomRightToast({ toast, onDismiss }: BottomRightToastProps) {
  if (!toast) return null;

  const toneClass =
    toast.variant === 'error'
      ? 'bg-red-600'
      : 'bg-emerald-600';

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-6 right-6 z-50 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg ${toneClass}`}
      onClick={onDismiss}
    >
      {toast.message}
    </div>
  );
}
