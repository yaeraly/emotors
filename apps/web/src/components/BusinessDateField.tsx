'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from '@/i18n/useTranslation';
import { apiFetch } from '@/lib/api';

import { toast } from '@/lib/toast';

type AllowedRange = {
  minimumDate: string;
  maximumDate: string;
  minimumDateLocal: string;
  maximumDateLocal: string;
};

type Props = {
  open: boolean;
  entityType: string;
  entityId: string;
  fieldName: string;
  currentDate: string | Date;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
};

function toLocalDateInput(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDisplayDate(value: string | Date, locale: string): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString(locale === 'ky' ? 'ky-KG' : locale === 'ru' ? 'ru-RU' : 'en-GB');
}

export function BusinessDateEditModal({
  open,
  entityType,
  entityId,
  fieldName,
  currentDate,
  onClose,
  onSuccess,
}: Props) {
  const { t, language } = useTranslation();
  const locale = language ?? 'ru';
  const [newDate, setNewDate] = useState(toLocalDateInput(currentDate));
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<AllowedRange | null>(null);

  useEffect(() => {
    if (!open) return;
    setNewDate(toLocalDateInput(currentDate));
    setReason('');
    setError(null);
    void apiFetch<AllowedRange>('/business-date/allowed-range').then(setRange).catch(() => setRange(null));
  }, [open, currentDate]);

  if (!open) return null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await apiFetch('/business-date', {
        method: 'PATCH',
        body: JSON.stringify({
          entityType,
          entityId,
          fieldName,
          newDate,
          reason: reason.trim(),
        }),
      });
      await onSuccess();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl"
      >
        <h3 className="text-lg font-bold text-slate-950">{t('businessDate.modalTitle')}</h3>
        <p className="mt-2 text-sm text-slate-600">
          {t('businessDate.currentDate')}: {formatDisplayDate(currentDate, locale)}
        </p>
        {range ? (
          <p className="mt-1 text-xs text-slate-500">
            {t('businessDate.allowedRange')}: {formatDisplayDate(range.minimumDateLocal, locale)} —{' '}
            {formatDisplayDate(range.maximumDateLocal, locale)}
          </p>
        ) : null}
        <label className="mt-4 block">
          <span className="text-sm font-semibold text-slate-700">{t('businessDate.newDate')}</span>
          <input
            type="date"
            value={newDate}
            min={range?.minimumDateLocal}
            max={range?.maximumDateLocal}
            onChange={(e) => setNewDate(e.target.value)}
            required
            className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="mt-4 block">
          <span className="text-sm font-semibold text-slate-700">{t('businessDate.reason')}</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            minLength={1}
            rows={3}
            className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            placeholder={t('businessDate.reasonPlaceholder')}
          />
        </label>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={loading || !reason.trim()}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-blue-300"
          >
            {loading ? t('common.loading') : t('common.save')}
          </button>
        </div>
      </form>
    </div>
  );
}

type FieldProps = {
  entityType: string;
  entityId: string;
  fieldName: string;
  value: string | Date;
  canEdit?: boolean;
  onUpdated?: () => void | Promise<void>;
};

export function BusinessDateField({
  entityType,
  entityId,
  fieldName,
  value,
  canEdit = false,
  onUpdated,
}: FieldProps) {
  const { t, language } = useTranslation();
  const locale = language ?? 'ru';
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-slate-600">
        {t('businessDate.operationDate')}: {formatDisplayDate(value, locale)}
      </span>
      {canEdit ? (
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="text-sm font-semibold text-blue-600 hover:text-blue-800"
        >
          {t('businessDate.changeDate')}
        </button>
      ) : null}
      <BusinessDateEditModal
        open={modalOpen}
        entityType={entityType}
        entityId={entityId}
        fieldName={fieldName}
        currentDate={value}
        onClose={() => setModalOpen(false)}
        onSuccess={async () => {
          if (onUpdated) await onUpdated();
        }}
      />
    </div>
  );
}
