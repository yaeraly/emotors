'use client';

import { useEffect, useState } from 'react';
import { subscribeToast, type ToastPayload, type ToastVariant } from '@/lib/toast';

const VARIANT_CLASS: Record<ToastVariant, string> = {
  success: 'bg-emerald-600',
  error: 'bg-red-600',
  warning: 'bg-amber-600',
  info: 'bg-slate-800',
};

/**
 * Single global toast host. Mount once in root layout.
 * Position: bottom-right (desktop + mobile-safe).
 */
export function ToastProvider() {
  const [toasts, setToasts] = useState<ToastPayload[]>([]);

  useEffect(() => {
    return subscribeToast((toast) => {
      setToasts((current) => {
        // One visible stack; newest action toast replaces same-variant noise.
        const withoutSameVariant = current.filter((item) => item.variant !== toast.variant);
        return [...withoutSameVariant, toast].slice(-3);
      });
      window.setTimeout(() => {
        setToasts((current) => current.filter((item) => item.id !== toast.id));
      }, toast.durationMs);
    });
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2 sm:bottom-6 sm:right-6"
      aria-live="polite"
      aria-relevant="additions"
    >
      {toasts.map((item) => (
        <div
          key={item.id}
          role={item.variant === 'error' ? 'alert' : 'status'}
          className={`pointer-events-auto rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg ${VARIANT_CLASS[item.variant]}`}
        >
          {item.message}
        </div>
      ))}
    </div>
  );
}
