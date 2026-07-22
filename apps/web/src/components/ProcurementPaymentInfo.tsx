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

function coercePaymentMethod(value: unknown): 'BANK_ACCOUNT' | 'QR_CODE' {
  return value === 'QR_CODE' ? 'QR_CODE' : 'BANK_ACCOUNT';
}

/** Every field is always a defined string / enum — never undefined or null. */
function normalizeForm(
  next: Partial<SupplierAccountFormValue> | null | undefined,
  previous?: SupplierAccountFormValue,
): SupplierAccountFormValue {
  const base = previous ?? EMPTY_FORM;
  return {
    paymentMethod: coercePaymentMethod(next?.paymentMethod ?? base.paymentMethod),
    bankName: next?.bankName ?? base.bankName ?? '',
    accountHolder: next?.accountHolder ?? base.accountHolder ?? '',
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
  const [pendingQrFile, setPendingQrFile] = useState<File | null>(null);
  const [pendingQrPreviewUrl, setPendingQrPreviewUrl] = useState('');
  const [form, setForm] = useState<SupplierAccountFormValue>(() => normalizeForm(value));
  const formRef = useRef(form);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  function clearPendingQr() {
    setPendingQrPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return '';
    });
    setPendingQrFile(null);
  }

  /**
   * Functional merge — never replace the whole form with a partial object.
   * Parent onChange runs after local state is computed (never inside a setState updater).
   */
  function patchForm(patch: Partial<SupplierAccountFormValue>) {
    const previous = formRef.current;
    const next = normalizeForm(
      {
        ...previous,
        paymentMethod: coercePaymentMethod(patch.paymentMethod ?? previous.paymentMethod),
        bankName: patch.bankName !== undefined ? patch.bankName ?? '' : previous.bankName ?? '',
        accountHolder:
          patch.accountHolder !== undefined ? patch.accountHolder ?? '' : previous.accountHolder ?? '',
        accountNumber:
          patch.accountNumber !== undefined ? patch.accountNumber ?? '' : previous.accountNumber ?? '',
      },
      previous,
    );
    formRef.current = next;
    // Functional merge keeps React state fully controlled for the whole lifecycle.
    setForm((prev) => ({
      ...prev,
      paymentMethod: next.paymentMethod ?? 'BANK_ACCOUNT',
      bankName: next.bankName ?? '',
      accountHolder: next.accountHolder ?? '',
      accountNumber: next.accountNumber ?? '',
    }));
    onChangeRef.current(next);
  }

  function load() {
    if (!canView) return;
    apiFetch<PaymentInfoVersion[]>(`/procurement/orders/${orderId}/payment-info`)
      .then((rows) => {
        const current = rows.find((v) => v.isActive) ?? rows[0] ?? null;
        setActive(current);
        if (!current) return;
        // Merge loaded values into existing form — keep any locally typed fields when API returns null.
        patchForm({
          paymentMethod: coercePaymentMethod(current.paymentMethod),
          bankName: current.bankName ?? formRef.current.bankName ?? '',
          accountHolder: current.accountHolder ?? formRef.current.accountHolder ?? '',
          accountNumber: current.accountNumber ?? formRef.current.accountNumber ?? '',
        });
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }

  useEffect(() => {
    const initial = normalizeForm(value);
    formRef.current = initial;
    setForm(initial);
    clearPendingQr();
    setActive(null);
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  useEffect(() => {
    return () => {
      if (pendingQrPreviewUrl) URL.revokeObjectURL(pendingQrPreviewUrl);
    };
  }, [pendingQrPreviewUrl]);

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
    // Preserve existing form state when server omits bank fields (e.g. QR mode).
    patchForm({
      paymentMethod: coercePaymentMethod(saved.paymentMethod),
      bankName: saved.bankName ?? snapshot.bankName ?? '',
      accountHolder: saved.accountHolder ?? snapshot.accountHolder ?? '',
      accountNumber: saved.accountNumber ?? snapshot.accountNumber ?? '',
    });
    return saved;
  }

  async function onPaymentMethodChange(nextMethod: 'BANK_ACCOUNT' | 'QR_CODE') {
    // Update only the method — preserve all other fields including accountNumber.
    patchForm({
      paymentMethod: nextMethod ?? 'BANK_ACCOUNT',
      bankName: formRef.current.bankName ?? '',
      accountHolder: formRef.current.accountHolder ?? '',
      accountNumber: formRef.current.accountNumber ?? '',
    });
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

    if (pendingQrPreviewUrl) URL.revokeObjectURL(pendingQrPreviewUrl);
    const previewUrl = URL.createObjectURL(file);
    setPendingQrFile(file);
    setPendingQrPreviewUrl(previewUrl ?? '');

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
      setPendingQrFile(null);
      setPendingQrPreviewUrl('');
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

  const paymentMethod = form.paymentMethod ?? 'BANK_ACCOUNT';
  const bankName = form.bankName ?? '';
  const accountHolder = form.accountHolder ?? '';
  const accountNumber = form.accountNumber ?? '';
  const qrFileName = pendingQrFile?.name ?? '';
  const qrPreview = pendingQrPreviewUrl ?? '';
  const qrMime = pendingQrFile?.type ?? '';

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
          {pendingQrFile && qrPreview ? (
            <div className="rounded-lg border border-slate-200 bg-white p-2 text-sm">
              <p className="font-semibold text-slate-800">{qrFileName}</p>
              {qrMime.startsWith('image/') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrPreview}
                  alt={qrFileName || 'QR'}
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
          ) : !pendingQrFile ? (
            <p className="text-xs text-slate-500">{t('procurement.paymentInfo.noQrYet')}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
