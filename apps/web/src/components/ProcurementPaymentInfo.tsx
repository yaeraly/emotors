'use client';

import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { API_URL, apiFetch, getToken } from '@/lib/api';
import { ImagePreviewModal } from '@/components/ImagePreviewModal';
import { useTranslation } from '@/i18n/useTranslation';
import type { User } from '@/lib/types';
import { canCreateProcurementOrder, canCreateSupplierPayment, hasFullAccess } from '@/lib/rbac';
import {
  EMPTY_SUPPLIER_ACCOUNT_FORM,
  controlledString,
  formForPaymentMethod,
  formFromPaymentInfoApi,
  normalizeSupplierAccountForm,
  type PaymentInfoMethod,
  type SupplierAccountFormValue,
} from '@/lib/procurement-payment-info-form';

import { toast } from '@/lib/toast';

export type { SupplierAccountFormValue };

type QrCode = {
  id: string;
  fileName: string;
  fileUrl: string;
  description?: string | null;
};

type PaymentInfoVersion = {
  id: string;
  versionNumber: number;
  paymentMethod: PaymentInfoMethod;
  bankName?: string | null;
  accountHolder?: string | null;
  accountNumber?: string | null;
  isActive: boolean;
  qrCodes?: QrCode[];
};

type Props = {
  orderId: string;
  user: User | null;
  value: SupplierAccountFormValue;
  onChange: (value: SupplierAccountFormValue) => void;
  disabled?: boolean;
  onQrChanged?: () => void;
  onValidityChange?: (valid: boolean) => void;
};

/** Compact supplier account fields — no Save button; parent submits via send. */
export function ProcurementPaymentInfo({
  orderId,
  user,
  value,
  onChange,
  disabled = false,
  onQrChanged,
  onValidityChange,
}: Props) {
  const { t } = useTranslation();
  const canEdit = (canCreateProcurementOrder(user) || hasFullAccess(user)) && !disabled;
  const canView = canEdit || canCreateSupplierPayment(user) || hasFullAccess(user);
  const [active, setActive] = useState<PaymentInfoVersion | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingQr, setPendingQr] = useState<{ file: File; previewUrl: string } | null>(null);
  const [qrPreview, setQrPreview] = useState<{
    images: Array<{ src: string; alt?: string; label?: string }>;
    initialIndex: number;
  } | null>(null);
  const [form, setForm] = useState<SupplierAccountFormValue>(() =>
    normalizeSupplierAccountForm(value, EMPTY_SUPPLIER_ACCOUNT_FORM),
  );
  const formRef = useRef(form);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const draftRequestIdRef = useRef(0);

  function applyForm(next: SupplierAccountFormValue) {
    // Every field is a defined string/enum before it touches React state or inputs.
    const controlled = normalizeSupplierAccountForm(next, EMPTY_SUPPLIER_ACCOUNT_FORM);
    formRef.current = controlled;
    setForm({
      paymentMethod: controlled.paymentMethod,
      bankName: controlled.bankName ?? '',
      accountHolder: controlled.accountHolder ?? '',
      accountNumber: controlled.accountNumber ?? '',
    });
    onChangeRef.current(controlled);
  }

  function patchForm(patch: Partial<SupplierAccountFormValue>) {
    applyForm(normalizeSupplierAccountForm(patch, formRef.current));
  }

  function openQrPreview(index: number) {
    const codes = active?.qrCodes ?? [];
    if (!codes.length) return;
    setQrPreview({
      images: codes.map((qr) => {
        const src = qr.fileUrl?.startsWith('http') ? qr.fileUrl : `${API_URL}${qr.fileUrl || ''}`;
        return { src, alt: qr.fileName || 'QR', label: qr.fileName || 'QR' };
      }),
      initialIndex: index,
    });
  }

  function load() {
    if (!canView) return;
    apiFetch<PaymentInfoVersion[]>(`/procurement/orders/${orderId}/payment-info`)
      .then((rows) => {
        const current = rows.find((v) => v.isActive) ?? rows[0] ?? null;
        setActive(current);
        if (!current) return;
        applyForm(formFromPaymentInfoApi(current, formRef.current));
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }

  useEffect(() => {
    const initial = normalizeSupplierAccountForm(value, EMPTY_SUPPLIER_ACCOUNT_FORM);
    formRef.current = initial;
    setForm(initial);
    setActive(null);
    setError('');
    if (pendingQr?.previewUrl) URL.revokeObjectURL(pendingQr.previewUrl);
    setPendingQr(null);
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

  useEffect(() => {
    if (!onValidityChange) return;
    if (form.paymentMethod === 'BANK_ACCOUNT') {
      onValidityChange(Boolean((form.accountNumber ?? '').trim()));
      return;
    }
    onValidityChange(Boolean(active?.qrCodes?.length));
  }, [active?.qrCodes?.length, form.accountNumber, form.paymentMethod, onValidityChange]);

  async function ensureDraft(method: PaymentInfoMethod) {
    const requestId = ++draftRequestIdRef.current;
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
    if (requestId !== draftRequestIdRef.current) return saved;
    setActive(saved);
    // Prefer local controlled strings when API returns null for the inactive method.
    applyForm(
      normalizeSupplierAccountForm(
        {
          paymentMethod: saved.paymentMethod,
          bankName: controlledString(saved.bankName ?? snapshot.bankName),
          accountHolder: controlledString(saved.accountHolder ?? snapshot.accountHolder),
          accountNumber: controlledString(saved.accountNumber ?? snapshot.accountNumber),
        },
        snapshot,
      ),
    );
    return saved;
  }

  async function onPaymentMethodChange(nextMethod: PaymentInfoMethod) {
    // Reset fields that do not belong to the new method; keep valid bank fields as strings.
    applyForm(formForPaymentMethod(formRef.current, nextMethod));
    if (!canEdit) return;
    // Persist QR method immediately so subsequent QR uploads succeed.
    if (nextMethod !== 'QR_CODE') return;
    setBusy(true);
    setError('');
    try {
      await ensureDraft('QR_CODE');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
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
      toast.error(err instanceof Error ? err.message : t('common.error'));
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
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  if (!canView) return null;

  const paymentMethod = form.paymentMethod === 'QR_CODE' ? 'QR_CODE' : 'BANK_ACCOUNT';
  const bankName = form.bankName ?? '';
  const accountHolder = form.accountHolder ?? '';
  const accountNumber = form.accountNumber ?? '';

  return (
    <div className="space-y-3">
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <label className="block">
        <span className="text-xs font-semibold text-slate-700">{t('procurement.paymentInfo.paymentMethod')}</span>
        <select
          value={paymentMethod}
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

      {paymentMethod === 'BANK_ACCOUNT' ? (
        <div className="grid gap-2 md:grid-cols-3">
          <label className="block md:col-span-1">
            <span className="text-xs font-semibold text-slate-700">{t('procurement.paymentInfo.accountNumber')}</span>
            <input
              required
              disabled={!canEdit}
              value={accountNumber}
              onChange={(e) => patchForm({ accountNumber: e.target.value ?? '' })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-700">
              {t('procurement.paymentInfo.bankName')} ({t('common.optional')})
            </span>
            <input
              disabled={!canEdit}
              value={bankName}
              onChange={(e) => patchForm({ bankName: e.target.value ?? '' })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-700">
              {t('procurement.paymentInfo.accountHolder')} ({t('common.optional')})
            </span>
            <input
              disabled={!canEdit}
              value={accountHolder}
              onChange={(e) => patchForm({ accountHolder: e.target.value ?? '' })}
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
              {busy ? <p className="mt-1 text-xs text-slate-500">{t('common.loading')}</p> : null}
            </div>
          ) : null}
          {active?.qrCodes?.length ? (
            <ul className="space-y-1">
              {active.qrCodes.map((qr, index) => (
                <li key={qr.id} className="flex flex-wrap items-center gap-3 text-sm">
                  <button
                    type="button"
                    onClick={() => openQrPreview(index)}
                    className="font-semibold text-blue-700 underline-offset-2 hover:underline"
                  >
                    {t('procurement.paymentInfo.showQr')}
                  </button>
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => void removeQr(qr.id)}
                      className="text-xs font-semibold text-red-700"
                    >
                      {t('common.delete')}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : !pendingQr ? (
            <p className="text-xs text-slate-500">{t('procurement.paymentInfo.noQrYet')}</p>
          ) : null}
        </div>
      )}

      {qrPreview ? (
        <ImagePreviewModal
          images={qrPreview.images}
          initialIndex={qrPreview.initialIndex}
          title={t('procurement.paymentInfo.showQr')}
          onClose={() => setQrPreview(null)}
        />
      ) : null}
    </div>
  );
}
