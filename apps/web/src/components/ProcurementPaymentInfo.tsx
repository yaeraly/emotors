'use client';

import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { API_URL, apiFetch, getToken } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';
import type { User } from '@/lib/types';
import { canCreateProcurementOrder, canCreateSupplierPayment, hasFullAccess } from '@/lib/rbac';

type QrCode = {
  id: string;
  fileName: string;
  fileUrl: string;
  description?: string | null;
};

type PaymentInfoVersion = {
  id: string;
  versionNumber: number;
  paymentMethod: 'BANK_ACCOUNT' | 'QR_CODE';
  bankName?: string | null;
  accountHolder?: string | null;
  accountNumber?: string | null;
  swiftCode?: string | null;
  bankAddress?: string | null;
  comment?: string | null;
  reason?: string | null;
  isActive: boolean;
  createdAt: string;
  createdBy?: { fullName?: string } | null;
  qrCodes?: QrCode[];
};

type Props = {
  orderId: string;
  user: User | null;
  hasCompletedPayments: boolean;
  onChanged?: () => void;
};

export function ProcurementPaymentInfo({ orderId, user, hasCompletedPayments, onChanged }: Props) {
  const { t } = useTranslation();
  const canEdit = canCreateProcurementOrder(user) || hasFullAccess(user);
  const canView = canEdit || canCreateSupplierPayment(user) || hasFullAccess(user);
  const [versions, setVersions] = useState<PaymentInfoVersion[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    paymentMethod: 'QR_CODE' as 'BANK_ACCOUNT' | 'QR_CODE',
    bankName: '',
    accountHolder: '',
    accountNumber: '',
    swiftCode: '',
    comment: '',
    reason: '',
  });
  const [qrDescription, setQrDescription] = useState('');

  const active = versions.find((v) => v.isActive) ?? versions[0] ?? null;

  function load() {
    if (!canView) return;
    apiFetch<PaymentInfoVersion[]>(`/procurement/orders/${orderId}/payment-info`)
      .then((rows) => {
        setVersions(rows);
        const current = rows.find((v) => v.isActive) ?? rows[0];
        if (current) {
          setForm({
            paymentMethod: current.paymentMethod,
            bankName: current.bankName ?? '',
            accountHolder: current.accountHolder ?? '',
            accountNumber: current.accountNumber ?? '',
            swiftCode: current.swiftCode ?? '',
            comment: current.comment ?? '',
            reason: '',
          });
        } else {
          setForm((prev) => ({ ...prev, paymentMethod: 'QR_CODE' }));
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canEdit) return;
    if (hasCompletedPayments && form.reason.trim().length < 3) {
      setError(t('procurement.paymentInfo.versionReasonRequired'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/procurement/orders/${orderId}/payment-info`, {
        method: 'PUT',
        body: JSON.stringify({
          paymentMethod: form.paymentMethod,
          bankName: form.paymentMethod === 'BANK_ACCOUNT' ? form.bankName || undefined : undefined,
          accountHolder: form.paymentMethod === 'BANK_ACCOUNT' ? form.accountHolder || undefined : undefined,
          accountNumber: form.paymentMethod === 'BANK_ACCOUNT' ? form.accountNumber || undefined : undefined,
          swiftCode: form.paymentMethod === 'BANK_ACCOUNT' ? form.swiftCode || undefined : undefined,
          comment: form.comment || undefined,
          reason: hasCompletedPayments ? form.reason : undefined,
        }),
      });
      load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function uploadQr(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !canEdit) return;
    if (!active) {
      setError(t('procurement.paymentInfo.saveMethodFirst'));
      return;
    }
    const token = getToken();
    if (!token) return;
    const body = new FormData();
    body.append('file', file);
    if (qrDescription.trim()) body.append('description', qrDescription.trim());
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/procurement/orders/${orderId}/payment-info/qr`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || t('common.error'));
      }
      setQrDescription('');
      load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function removeQr(attachmentId: string) {
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/procurement/orders/${orderId}/payment-info/qr/${attachmentId}`, {
        method: 'DELETE',
      });
      load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  if (!canView) return null;

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="mb-2 text-lg font-bold">{t('procurement.payments.paymentMethod')}</h3>
      <p className="mb-4 text-sm text-slate-500">{t('procurement.paymentInfo.methodHelp')}</p>
      {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {hasCompletedPayments ? (
        <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {t('procurement.paymentInfo.versionAfterPaymentHint')}
        </p>
      ) : null}

      {canEdit ? (
        <form onSubmit={save} className="mb-6 grid gap-3 md:grid-cols-2">
          <label className="block md:col-span-2">
            <span className="text-sm font-semibold">{t('procurement.payments.paymentMethod')}</span>
            <select
              value={form.paymentMethod}
              onChange={(e) => setForm({ ...form, paymentMethod: e.target.value as 'BANK_ACCOUNT' | 'QR_CODE' })}
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
            >
              <option value="QR_CODE">{t('procurement.paymentInfo.method.QR_CODE')}</option>
              <option value="BANK_ACCOUNT">{t('procurement.paymentInfo.method.BANK_ACCOUNT')}</option>
            </select>
          </label>

          {form.paymentMethod === 'BANK_ACCOUNT' ? (
            <>
              <label className="block">
                <span className="text-sm font-semibold">{t('procurement.paymentInfo.bankName')}</span>
                <input
                  required
                  value={form.bankName}
                  onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold">{t('procurement.paymentInfo.accountHolder')}</span>
                <input
                  required
                  value={form.accountHolder}
                  onChange={(e) => setForm({ ...form, accountHolder: e.target.value })}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold">{t('procurement.paymentInfo.accountNumber')}</span>
                <input
                  required
                  value={form.accountNumber}
                  onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold">{t('procurement.paymentInfo.swift')}</span>
                <input
                  value={form.swiftCode}
                  onChange={(e) => setForm({ ...form, swiftCode: e.target.value })}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </label>
            </>
          ) : (
            <p className="md:col-span-2 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-800">
              {t('procurement.paymentInfo.qrUnlimitedHint')}
            </p>
          )}

          <label className="block md:col-span-2">
            <span className="text-sm font-semibold">{t('procurement.paymentInfo.comment')}</span>
            <textarea
              value={form.comment}
              onChange={(e) => setForm({ ...form, comment: e.target.value })}
              className="mt-2 min-h-20 w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </label>

          {hasCompletedPayments ? (
            <label className="block md:col-span-2">
              <span className="text-sm font-semibold">{t('procurement.paymentInfo.versionReason')}</span>
              <input
                required
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </label>
          ) : null}

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white disabled:bg-blue-300"
            >
              {saving
                ? t('common.loading')
                : hasCompletedPayments
                  ? t('procurement.paymentInfo.createVersion')
                  : t('common.save')}
            </button>
          </div>
        </form>
      ) : active ? (
        <div className="mb-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {t('procurement.payments.paymentMethod')}:{' '}
          <strong>{t(`procurement.paymentInfo.method.${active.paymentMethod}`)}</strong>
          {active.paymentMethod === 'BANK_ACCOUNT' ? (
            <span className="mt-1 block">
              {[active.bankName, active.accountHolder, active.accountNumber].filter(Boolean).join(' · ')}
            </span>
          ) : null}
        </div>
      ) : null}

      {(form.paymentMethod === 'QR_CODE' || active?.paymentMethod === 'QR_CODE') && (
        <>
          {canEdit && !hasCompletedPayments ? (
            <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <label className="block flex-1">
                <span className="text-sm font-semibold">{t('procurement.paymentInfo.qrDescription')}</span>
                <input
                  value={qrDescription}
                  onChange={(e) => setQrDescription(e.target.value)}
                  placeholder={t('procurement.paymentInfo.qrDescriptionOptional')}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="cursor-pointer rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold">
                {t('procurement.paymentInfo.uploadQr')}
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  className="hidden"
                  onChange={(e) => void uploadQr(e)}
                />
              </label>
            </div>
          ) : null}

          {active?.qrCodes?.length ? (
            <div className="grid gap-3 md:grid-cols-3">
              {active.qrCodes.map((qr) => (
                <div key={qr.id} className="rounded-2xl border border-slate-200 p-3">
                  <a
                    href={`${API_URL}${qr.fileUrl}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-blue-700"
                  >
                    {qr.fileName}
                  </a>
                  {qr.description ? <p className="mt-1 text-xs text-slate-500">{qr.description}</p> : null}
                  {canEdit && !hasCompletedPayments ? (
                    <button
                      type="button"
                      onClick={() => void removeQr(qr.id)}
                      className="mt-2 text-xs font-semibold text-red-700"
                    >
                      {t('common.delete')}
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : form.paymentMethod === 'QR_CODE' ? (
            <p className="text-sm text-slate-500">{t('procurement.paymentInfo.noQrYet')}</p>
          ) : null}
        </>
      )}
    </section>
  );
}
