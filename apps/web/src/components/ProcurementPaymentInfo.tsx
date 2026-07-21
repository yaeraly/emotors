'use client';

import { ChangeEvent, useEffect, useState } from 'react';
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

  function load() {
    if (!canView) return;
    apiFetch<PaymentInfoVersion[]>(`/procurement/orders/${orderId}/payment-info`)
      .then((rows) => {
        const current = rows.find((v) => v.isActive) ?? rows[0] ?? null;
        setActive(current);
        if (current) {
          onChange({
            paymentMethod: current.paymentMethod,
            bankName: current.bankName ?? '',
            accountHolder: current.accountHolder ?? '',
            accountNumber: current.accountNumber ?? '',
          });
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  async function ensureDraft(method: 'BANK_ACCOUNT' | 'QR_CODE') {
    const saved = await apiFetch<PaymentInfoVersion>(`/procurement/orders/${orderId}/payment-info`, {
      method: 'PUT',
      body: JSON.stringify({
        paymentMethod: method,
        bankName: method === 'BANK_ACCOUNT' ? value.bankName || undefined : undefined,
        accountHolder: method === 'BANK_ACCOUNT' ? value.accountHolder || undefined : undefined,
        accountNumber: method === 'BANK_ACCOUNT' ? value.accountNumber || undefined : undefined,
      }),
    });
    setActive(saved);
    return saved;
  }

  async function uploadQr(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !canEdit) return;
    setBusy(true);
    setError('');
    try {
      let version = active;
      if (!version || version.paymentMethod !== 'QR_CODE') {
        version = await ensureDraft('QR_CODE');
      }
      const token = getToken();
      if (!token) return;
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
          value={value.paymentMethod}
          disabled={!canEdit || busy}
          onChange={(e) =>
            onChange({
              ...value,
              paymentMethod: e.target.value as 'BANK_ACCOUNT' | 'QR_CODE',
            })
          }
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value="BANK_ACCOUNT">{t('procurement.paymentInfo.method.BANK_ACCOUNT')}</option>
          <option value="QR_CODE">{t('procurement.paymentInfo.method.QR_CODE')}</option>
        </select>
      </label>

      {value.paymentMethod === 'BANK_ACCOUNT' ? (
        <div className="grid gap-2 md:grid-cols-3">
          <label className="block md:col-span-1">
            <span className="text-xs font-semibold text-slate-700">{t('procurement.paymentInfo.accountNumber')}</span>
            <input
              required
              disabled={!canEdit}
              value={value.accountNumber}
              onChange={(e) => onChange({ ...value, accountNumber: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-700">
              {t('procurement.paymentInfo.bankName')} ({t('common.optional')})
            </span>
            <input
              disabled={!canEdit}
              value={value.bankName}
              onChange={(e) => onChange({ ...value, bankName: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-700">
              {t('procurement.paymentInfo.accountHolder')} ({t('common.optional')})
            </span>
            <input
              disabled={!canEdit}
              value={value.accountHolder}
              onChange={(e) => onChange({ ...value, accountHolder: e.target.value })}
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
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                className="hidden"
                disabled={busy}
                onChange={(e) => void uploadQr(e)}
              />
            </label>
          ) : null}
          {active?.qrCodes?.length ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {active.qrCodes.map((qr) => (
                <div key={qr.id} className="rounded-lg border border-slate-200 bg-white p-2 text-sm">
                  <a
                    href={`${API_URL}${qr.fileUrl}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-blue-700"
                  >
                    {qr.fileName}
                  </a>
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
          ) : (
            <p className="text-xs text-slate-500">{t('procurement.paymentInfo.noQrYet')}</p>
          )}
        </div>
      )}
    </div>
  );
}
