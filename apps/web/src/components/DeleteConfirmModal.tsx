'use client';

import { FormEvent, useState } from 'react';
import { useTranslation } from '@/i18n/useTranslation';

type Props = {
  open: boolean;
  title: string;
  message: string;
  requireReason?: boolean;
  /** Minimum trimmed reason length when requireReason is true. */
  minLength?: number;
  reasonPlaceholder?: string;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (reason?: string) => void | Promise<void>;
};

export function DeleteConfirmModal({
  open,
  title,
  message,
  requireReason = false,
  minLength = 1,
  reasonPlaceholder,
  loading = false,
  onClose,
  onConfirm,
}: Props) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');

  if (!open) return null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await onConfirm(reason.trim() || undefined);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <form onSubmit={(e) => void handleSubmit(e)} className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
        <h3 className="text-lg font-bold text-slate-950">{title}</h3>
        <p className="mt-3 text-sm text-slate-600">{message}</p>
        {requireReason ? (
          <label className="mt-4 block">
            <span className="text-sm font-semibold text-slate-700">{t('common.deleteReason')}</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={minLength}
              rows={3}
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              placeholder={reasonPlaceholder || t('common.deleteReasonPlaceholder')}
            />
          </label>
        ) : null}
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={loading} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={loading || (requireReason && reason.trim().length < minLength)}
            className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-red-300"
          >
            {loading ? t('common.loading') : t('common.delete')}
          </button>
        </div>
      </form>
    </div>
  );
}
