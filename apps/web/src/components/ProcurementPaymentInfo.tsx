'use client';

import { ChangeEvent, useEffect, useRef, useState } from 'react';
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
  isActive: boolean;
  qrCodes?: QrCode[];
};

export type SupplierAccountFormValue = {
  paymentMethod: 'BANK_ACCOUNT' | 'QR_CODE';
  bankName: string;
  accountHolder: string;
  accountNumber: string;
};

type Props = {
  orderId: string;
  user: User | null;
  value: SupplierAccountFormValue;
  onChange: (value: SupplierAccountFormValue) => void;
  disabled?: boolean;
  onQrChanged?: () => void;
};

const EMPTY_FORM: SupplierAccountFormValue = {
  paymentMethod: 'BANK_ACCOUNT',
  bankName: '',
  accountHolder: '',
  accountNumber: '',
};

function normalizeForm(
  next: Partial<SupplierAccountFormValue> | null | undefined,
  previous?: SupplierAccountFormValue,
): SupplierAccountFormValue {
  const base = previous ?? EMPTY_FORM;
  return {
    paymentMethod:
      next?.paymentMethod === 'QR_CODE'
        ? 'QR_CODE'
        : next?.paymentMethod === 'BANK_ACCOUNT'
          ? 'BANK_ACCOUNT'
          : base.paymentMethod === 'QR_CODE'
            ? 'QR_CODE'
            : 'BANK_ACCOUNT',
    bankName: next?.bankName ?? base.bankName ?? '',
    accountHolder: next?.accountHolder ?? base.accountHolder ?? '',
    // Always a string for the full lifecycle — never undefined/null.
    accountNumber: next?.accountNumber ?? base.accountNumber ?? '',
  };
}

/** Compact supplier account fields — no Save button; parent submits via send. */
export function ProcurementPaymentInfo({
  orderId,
  user,
  value,
  onChange,
  disabled = false,
  onQrChanged,
}: Props) {
  const { t } = useTranslation();
  const canEdit = (canCreateProcurementOrder(user) || hasFullAccess(user)) && !disabled;
  const canView = canEdit || canCreateSupplierPayment(user) || hasFullAccess(user);
  const [active, setActive] = useState<PaymentInfoVersion | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingQr, setPendingQr] = useState<{ file: File; previewUrl: string } | null>(null);
  const [form, setForm] = useState<SupplierAccountFormValue>(() => normalizeForm(value));
  const formRef = useRef(form);

  const accountNumber = form.accountNumber ?? '';

  function commitForm(
    updater: (previous: SupplierAccountFormValue) => Partial<SupplierAccountFormValue>,
  ) {
    // Compute outside setState so parent onChange is never called during render.
    const previous = formRef.current;
    const next = normalizeForm(updater(previous), previous);
    formRef.current = next;
    setForm(next);
    onChange(next);
  }

  function load() {
    if (!canView) return;
    apiFetch<PaymentInfoVersion[]>(`/procurement/orders/${orderId}/payment-info`)
      .then((rows) => {
        const current = rows.find((v) => v.isActive) ?? rows[0] ?? null;
        setActive(current);
        if (current) {
          commitForm((previous) => ({
            paymentMethod: current.paymentMethod === 'QR_CODE' ? 'QR_CODE' : 'BANK_ACCOUNT',
            bankName: current.bankName ?? previous.bankName ?? '',
            accountHolder: current.accountHolder ?? previous.accountHolder ?? '',
            accountNumber: current.accountNumber ?? previous.accountNumber ?? '',
          }));
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }

  useEffect(() => {
    const initial = normalizeForm(value);
    formRef.current = initial;
    setForm(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  useEffect(() => {
    return () => {
      if (pendingQr?.previewUrl) URL.revokeObjectURL(pendingQr.previewUrl);
    };
  }, [pendingQr?.previewUrl]);

  async function ensureDraft(method: 'BANK_ACCOUNT' | 'QR_CODE') {
    const snapshot = formRef.current;
    const saved = await apiFetch<PaymentInfoVersion>(`/procurement/orders/${orderId}/payment-info`, {
      method: 'PUT',
      body: JSON.stringify({
        paymentMethod: method,
        bankName: method === 'BANK_ACCOUNT' ? snapshot.bankName || undefined : undefined,
        accountHolder: method === 'BANK_ACCOUNT' ? snapshot.accountHolder || undefined : undefined,
        accountNumber: method === 'BANK_ACCOUNT' ? snapshot.accountNumber || undefined : undefined,
      }),
    });
    setActive(saved);
    commitForm((previous) => ({
      paymentMethod: saved.paymentMethod === 'QR_CODE' ? 'QR_CODE' : 'BANK_ACCOUNT',
      // Preserve locally entered bank fields when server clears them for QR mode.
      bankName: saved.bankName ?? previous.bankName ?? '',
      accountHolder: saved.accountHolder ?? previous.accountHolder ?? '',
      accountNumber: saved.accountNumber ?? previous.accountNumber ?? '',
    }));
    return saved;
  }

  async function onPaymentMethodChange(nextMethod: 'BANK_ACCOUNT' | 'QR_CODE') {
    // Update only the method — preserve all other fields including accountNumber.
    commitForm((previous) => ({
      paymentMethod: nextMethod,
      bankName: previous.bankName ?? '',
      accountHolder: previous.accountHolder ?? '',
      accountNumber: previous.accountNumber ?? '',
    }));
    if (!canEdit) return;
    // Persist QR method immediately so subsequent QR uploads succeed.
    // Bank method is persisted on invoice send (account number may still be empty here).
    if (nextMethod !== 'QR_CODE') return;
    setBusy(true);
    setError('');
    try {
      await ensureDraft('QR_CODE');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  async function uploadQr(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file || !canEdit) return;

    if (pendingQr?.previewUrl) URL.revokeObjectURL(pendingQr.previewUrl);
    const previewUrl = URL.createObjectURL(file);
    setPendingQr({ file, previewUrl });

    setBusy(true);
    setError('');
    try {
      let version = active;
      if (!version || version.paymentMethod !== 'QR_CODE') {
        version = await ensureDraft('QR_CODE');
      }
      const token = getToken();
      if (!token) {
        throw new Error(t('common.error'));
      }
      const body = new FormData();
      body.append('file', file);
      const response = await fetch(`${API_URL}/procurement/orders/${orderId}/payment-info/qr`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || t('common.error'));
      }
      URL.revokeObjectURL(previewUrl);
      setPendingQr(null);
      load();
      onQrChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  async function removeQr(attachmentId: string) {
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/procurement/orders/${orderId}/payment-info/qr/${attachmentId}`, {
        method: 'DELETE',
      });
      load();
      onQrChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  if (!canView) return null;

  return (
    <div className="space-y-3">
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <label className="block">
        <span className="text-xs font-semibold text-slate-700">{t('procurement.paymentInfo.paymentMethod')}</span>
        <select
          value={form.paymentMethod || 'BANK_ACCOUNT'}
          disabled={!canEdit || busy}
          onChange={(e) =>
            void onPaymentMethodChange(e.target.value === 'QR_CODE' ? 'QR_CODE' : 'BANK_ACCOUNT')
          }
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value="BANK_ACCOUNT">{t('procurement.paymentInfo.method.BANK_ACCOUNT')}</option>
          <option value="QR_CODE">{t('procurement.paymentInfo.method.QR_CODE')}</option>
        </select>
      </label>

      {form.paymentMethod === 'BANK_ACCOUNT' ? (
        <div className="grid gap-2 md:grid-cols-3">
          <label className="block md:col-span-1">
            <span className="text-xs font-semibold text-slate-700">{t('procurement.paymentInfo.accountNumber')}</span>
            <input
              required
              disabled={!canEdit}
              value={accountNumber}
              onChange={(e) =>
                commitForm(() => ({
                  accountNumber: e.target.value ?? '',
                }))
              }
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-700">
              {t('procurement.paymentInfo.bankName')} ({t('common.optional')})
            </span>
            <input
              disabled={!canEdit}
              value={form.bankName ?? ''}
              onChange={(e) =>
                commitForm(() => ({
                  bankName: e.target.value ?? '',
                }))
              }
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-700">
              {t('procurement.paymentInfo.accountHolder')} ({t('common.optional')})
            </span>
            <input
              disabled={!canEdit}
              value={form.accountHolder ?? ''}
              onChange={(e) =>
                commitForm(() => ({
                  accountHolder: e.target.value ?? '',
                }))
              }
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
          </label>
        </div>
      ) : (
        <div className="space-y-2">
          {canEdit ? (
            <label className="inline-flex cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold">
              {busy ? t('common.loading') : t('procurement.paymentInfo.uploadQr')}
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp,application/pdf"
                className="hidden"
                disabled={busy}
                onChange={(e) => void uploadQr(e)}
              />
            </label>
          ) : null}
          {pendingQr ? (
            <div className="rounded-lg border border-slate-200 bg-white p-2 text-sm">
              <p className="font-semibold text-slate-800">{pendingQr.file.name}</p>
              {pendingQr.file.type.startsWith('image/') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={pendingQr.previewUrl}
                  alt={pendingQr.file.name}
                  className="mt-2 max-h-40 rounded-md border border-slate-100 object-contain"
                />
              ) : null}
              {busy ? <p className="mt-1 text-xs text-slate-500">{t('common.loading')}</p> : null}
            </div>
          ) : null}
          {active?.qrCodes?.length ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {active.qrCodes.map((qr) => (
                <div key={qr.id} className="rounded-lg border border-slate-200 bg-white p-2 text-sm">
                  <a
                    href={`${API_URL}${qr.fileUrl || ''}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-blue-700"
                  >
                    {qr.fileName || 'QR'}
                  </a>
                  {qr.fileUrl && /\.(png|jpe?g|webp)$/i.test(qr.fileUrl) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`${API_URL}${qr.fileUrl}`}
                      alt={qr.fileName || 'QR'}
                      className="mt-2 max-h-40 w-full rounded-md border border-slate-100 object-contain"
                    />
                  ) : null}
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => void removeQr(qr.id)}
                      className="mt-1 block text-xs font-semibold text-red-700"
                    >
                      {t('common.delete')}
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : !pendingQr ? (
            <p className="text-xs text-slate-500">{t('procurement.paymentInfo.noQrYet')}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
