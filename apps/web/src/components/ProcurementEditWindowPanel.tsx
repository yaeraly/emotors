'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from '@/i18n/useTranslation';

type EditWindowStatus = 'DRAFT_EDITABLE' | 'EDITABLE' | 'LOCKED' | 'CEO_UNLOCKED';

type Props = {
  sentToSupplierAt?: string | null;
  editableUntil?: string | null;
  unlockedAt?: string | null;
  unlockExpiresAt?: string | null;
  unlockReason?: string | null;
  isEditable?: boolean;
  editWindowStatus?: EditWindowStatus;
  secondsRemaining?: number | null;
  unlockedBy?: { fullName?: string } | null;
  showUnlockForm?: boolean;
  unlocking?: boolean;
  onUnlock?: (reason: string) => void;
};

function formatCountdown(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function ProcurementEditWindowPanel({
  sentToSupplierAt,
  editableUntil,
  unlockedAt,
  unlockExpiresAt,
  unlockReason,
  isEditable,
  editWindowStatus,
  secondsRemaining,
  unlockedBy,
  showUnlockForm,
  unlocking,
  onUnlock,
}: Props) {
  const { t } = useTranslation();
  const [countdown, setCountdown] = useState(secondsRemaining ?? 0);
  const [unlockReasonInput, setUnlockReasonInput] = useState('');

  useEffect(() => {
    setCountdown(secondsRemaining ?? 0);
  }, [secondsRemaining]);

  useEffect(() => {
    if (!isEditable || countdown <= 0) return;
    const timer = window.setInterval(() => {
      setCountdown((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isEditable, countdown]);

  if (!sentToSupplierAt) {
    return null;
  }

  const badgeClass =
    editWindowStatus === 'EDITABLE' || editWindowStatus === 'CEO_UNLOCKED'
      ? 'bg-green-100 text-green-800'
      : editWindowStatus === 'LOCKED'
        ? 'bg-slate-200 text-slate-700'
        : 'bg-blue-100 text-blue-800';

  const badgeLabel =
    editWindowStatus === 'CEO_UNLOCKED'
      ? t('procurement.orders.editWindow.ceoUnlocked')
      : editWindowStatus === 'EDITABLE'
        ? t('procurement.orders.editWindow.editable')
        : editWindowStatus === 'LOCKED'
          ? t('procurement.orders.editWindow.locked')
          : t('procurement.orders.editWindow.editable');

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-bold">{t('procurement.orders.editWindow.title')}</h3>
        <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${badgeClass}`}>
          {badgeLabel}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-3 text-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('procurement.orders.editWindow.sentAt')}</p>
          <p className="font-medium">{sentToSupplierAt ? new Date(sentToSupplierAt).toLocaleString() : '-'}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('procurement.orders.editWindow.editableUntil')}</p>
          <p className="font-medium">{editableUntil ? new Date(editableUntil).toLocaleString() : '-'}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('procurement.orders.editWindow.countdown')}</p>
          <p className="font-mono font-semibold text-blue-700">
            {isEditable && countdown > 0 ? formatCountdown(countdown) : '-'}
          </p>
        </div>
      </div>

      {editWindowStatus === 'CEO_UNLOCKED' ? (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p>{t('procurement.orders.editWindow.unlockedBy').replace('{name}', unlockedBy?.fullName ?? '-')}</p>
          {unlockReason ? <p className="mt-1">{t('procurement.orders.editWindow.unlockReason')}: {unlockReason}</p> : null}
          {unlockExpiresAt ? (
            <p className="mt-1">{t('procurement.orders.editWindow.unlockExpires')}: {new Date(unlockExpiresAt).toLocaleString()}</p>
          ) : null}
        </div>
      ) : null}

      {!isEditable && editWindowStatus === 'LOCKED' ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{t('procurement.orders.editWindow.expired')}</p>
      ) : null}

      {showUnlockForm ? (
        <div className="rounded-xl border border-slate-200 p-4 space-y-3">
          <p className="text-sm font-semibold text-slate-800">{t('procurement.orders.editWindow.unlockTitle')}</p>
          <textarea
            value={unlockReasonInput}
            onChange={(event) => setUnlockReasonInput(event.target.value)}
            placeholder={t('procurement.orders.editWindow.unlockReasonPlaceholder')}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            rows={3}
          />
          <button
            type="button"
            disabled={unlocking || !unlockReasonInput.trim()}
            onClick={() => onUnlock?.(unlockReasonInput.trim())}
            className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-amber-300"
          >
            {unlocking ? t('common.loading') : t('procurement.orders.editWindow.unlockAction')}
          </button>
        </div>
      ) : null}
    </section>
  );
}
