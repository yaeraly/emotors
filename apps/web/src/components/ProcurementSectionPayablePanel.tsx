'use client';

import { ChangeEvent, useEffect, useMemo, useState, type ReactNode } from 'react';
import { API_URL, apiFetch, getToken } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';
import type { User } from '@/lib/types';
import {
  canConfirmSupplierPayment,
  canCreateProcurementOrder,
  canCreateSupplierPayment,
  hasFullAccess,
} from '@/lib/rbac';
import { translateStatus } from '@/lib/translate-status';

type QrCode = {
  id: string;
  fileName: string;
  fileUrl: string;
};

type SectionExpense = {
  id: string;
  expenseNumber: string;
  expenseType: string;
  supplierCarrier: string;
  expenseName?: string | null;
  recipientName?: string | null;
  paymentMethod: 'BANK_ACCOUNT' | 'QR_CODE';
  bankName?: string | null;
  accountHolder?: string | null;
  accountNumber?: string | null;
  amount: number;
  currency: string;
  exchangeRate?: number | null;
  amountKgs: number;
  status: string;
  returnReason?: string | null;
  accountant?: { fullName?: string } | null;
  cashier?: { fullName?: string } | null;
  invoices?: Array<{ id: string; fileName: string; fileUrl: string }>;
  receipts?: Array<{ id: string; fileName: string; fileUrl: string }>;
  qrCodes?: QrCode[];
};

type Props = {
  orderId: string;
  user: User | null;
  expenseType:
    | 'DOMESTIC_CHINA_TRANSPORT'
    | 'INTERNATIONAL_FREIGHT'
    | 'LOCAL_DELIVERY'
    | 'OTHER_LOGISTICS';
  requestType:
    | 'CHINA_DOMESTIC_TRANSPORT'
    | 'CARGO_PAYMENT'
    | 'KYRGYZSTAN_DOMESTIC_TRANSPORT'
    | 'OTHER_EXPENSE';
  defaultCurrency?: string;
  showExpenseName?: boolean;
};

const ACTIVE = new Set(['WAITING_ACCOUNTANT', 'PENDING_CASHIER']);

export function ProcurementSectionPayablePanel({
  orderId,
  user,
  expenseType,
  requestType,
  defaultCurrency = 'KGS',
  showExpenseName = false,
}: Props) {
  const { t } = useTranslation();
  const canCreate = canCreateProcurementOrder(user) || hasFullAccess(user);
  const canApprove = canCreateSupplierPayment(user);
  const canConfirm = canConfirmSupplierPayment(user);
  const [rows, setRows] = useState<SectionExpense[]>([]);
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string }>>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingQrFiles, setPendingQrFiles] = useState<File[]>([]);
  const [pendingInvoice, setPendingInvoice] = useState<File | null>(null);
  const [form, setForm] = useState({
    expenseName: '',
    recipient: '',
    amount: '',
    currency: defaultCurrency,
    paymentMethod: 'QR_CODE' as 'BANK_ACCOUNT' | 'QR_CODE',
    bankName: '',
    accountHolder: '',
    accountNumber: '',
  });
  const [approveTarget, setApproveTarget] = useState<SectionExpense | null>(null);
  const [approveForm, setApproveForm] = useState({ exchangeRate: '', financeAccountId: '', accountantComment: '' });
  const [confirmTarget, setConfirmTarget] = useState<SectionExpense | null>(null);
  const [confirmForm, setConfirmForm] = useState({ financeAccountId: '', transactionNumber: '', cashierComment: '' });
  const [returnTarget, setReturnTarget] = useState<SectionExpense | null>(null);
  const [returnReason, setReturnReason] = useState('');

  const sectionRows = useMemo(
    () => rows.filter((row) => row.expenseType === expenseType),
    [rows, expenseType],
  );
  const hasActiveRequest = sectionRows.some((row) => ACTIVE.has(row.status));

  function load() {
    apiFetch<SectionExpense[]>(`/procurement/transport-expenses?orderId=${orderId}`)
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, expenseType]);

  useEffect(() => {
    if (!canApprove && !canConfirm) return;
    void apiFetch<Array<{ id: string; name: string }>>('/procurement/supplier-payment-accounts')
      .then(setAccounts)
      .catch(() => setAccounts([]));
  }, [canApprove, canConfirm]);

  async function uploadQrToExpense(expenseId: string, file: File) {
    const token = getToken();
    if (!token) throw new Error(t('common.error'));
    const body = new FormData();
    body.append('file', file);
    const response = await fetch(`${API_URL}/procurement/transport-expenses/${expenseId}/attachments/qr`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body,
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.message || t('common.error'));
    }
  }

  async function uploadInvoiceToExpense(expenseId: string, file: File) {
    const token = getToken();
    if (!token) throw new Error(t('common.error'));
    const body = new FormData();
    body.append('file', file);
    const response = await fetch(
      `${API_URL}/procurement/transport-expenses/${expenseId}/attachments/invoice`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body,
      },
    );
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.message || t('common.error'));
    }
  }

  async function sendToAccountant() {
    if (!canCreate || saving || hasActiveRequest) return;
    if (!(Number(form.amount) > 0)) {
      setError(t('procurement.sectionPayable.amountRequired'));
      return;
    }
    if (form.paymentMethod === 'BANK_ACCOUNT' && !form.accountNumber.trim()) {
      setError(t('procurement.paymentInfo.accountNumberRequired'));
      return;
    }
    if (form.paymentMethod === 'QR_CODE' && pendingQrFiles.length === 0) {
      setError(t('procurement.sectionPayable.qrRequired'));
      return;
    }

    setSaving(true);
    setError('');
    try {
      const created = await apiFetch<SectionExpense>('/procurement/transport-expenses', {
        method: 'POST',
        body: JSON.stringify({
          procurementOrderId: orderId,
          expenseType,
          requestType,
          supplierCarrier: form.recipient || form.expenseName || t('procurement.sectionPayable.defaultCarrier'),
          expenseName: form.expenseName || undefined,
          recipientName: form.recipient || undefined,
          amount: Number(form.amount),
          currency: form.currency,
          paymentMethod: form.paymentMethod,
          bankName: form.paymentMethod === 'BANK_ACCOUNT' ? form.bankName || undefined : undefined,
          accountHolder: form.paymentMethod === 'BANK_ACCOUNT' ? form.accountHolder || undefined : undefined,
          accountNumber: form.paymentMethod === 'BANK_ACCOUNT' ? form.accountNumber || undefined : undefined,
          sendToAccountant: form.paymentMethod === 'BANK_ACCOUNT' && !pendingInvoice,
        }),
      });

      for (const file of pendingQrFiles) {
        await uploadQrToExpense(created.id, file);
      }
      if (pendingInvoice) {
        await uploadInvoiceToExpense(created.id, pendingInvoice);
      }

      if (form.paymentMethod === 'QR_CODE' || pendingInvoice) {
        await apiFetch(`/procurement/transport-expenses/${created.id}/submit`, {
          method: 'POST',
          body: '{}',
        });
      }

      setPendingQrFiles([]);
      setPendingInvoice(null);
      setForm({
        expenseName: '',
        recipient: '',
        amount: '',
        currency: defaultCurrency,
        paymentMethod: 'QR_CODE',
        bankName: '',
        accountHolder: '',
        accountNumber: '',
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  function onPickQr(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;
    setPendingQrFiles((current) => [...current, ...files]);
  }

  async function approve() {
    if (!approveTarget) return;
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/procurement/transport-expenses/${approveTarget.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({
          exchangeRate: approveForm.exchangeRate ? Number(approveForm.exchangeRate) : undefined,
          financeAccountId: approveForm.financeAccountId || undefined,
          accountantComment: approveForm.accountantComment || undefined,
          sendToCashier: true,
        }),
      });
      setApproveTarget(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function confirmPay() {
    if (!confirmTarget) return;
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/procurement/transport-expenses/${confirmTarget.id}/confirm`, {
        method: 'POST',
        body: JSON.stringify({
          financeAccountId: confirmForm.financeAccountId,
          transactionNumber: confirmForm.transactionNumber || undefined,
          cashierComment: confirmForm.cashierComment || undefined,
        }),
      });
      setConfirmTarget(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function uploadReceipt(expenseId: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const token = getToken();
    if (!token) return;
    const body = new FormData();
    body.append('file', file);
    setSaving(true);
    try {
      const response = await fetch(
        `${API_URL}/procurement/transport-expenses/${expenseId}/attachments/receipt`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || t('common.error'));
      }
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function submitReturn() {
    if (!returnTarget) return;
    setSaving(true);
    try {
      await apiFetch(`/procurement/transport-expenses/${returnTarget.id}/return`, {
        method: 'POST',
        body: JSON.stringify({ reason: returnReason.trim() }),
      });
      setReturnTarget(null);
      setReturnReason('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <h4 className="text-sm font-semibold text-slate-900">{t('procurement.sectionPayable.title')}</h4>
      {error ? <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      {canCreate ? (
        <div className="mt-3 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          {showExpenseName ? (
            <CompactField
              label={t('procurement.sectionPayable.expenseName')}
              value={form.expenseName}
              onChange={(value) => setForm({ ...form, expenseName: value })}
            />
          ) : null}
          <CompactField
            label={t('procurement.sectionPayable.recipient')}
            value={form.recipient}
            onChange={(value) => setForm({ ...form, recipient: value })}
          />
          <CompactField
            label={t('procurement.sectionPayable.amount')}
            type="number"
            value={form.amount}
            onChange={(value) => setForm({ ...form, amount: value })}
          />
          <CompactField
            label={t('procurement.sectionPayable.currency')}
            value={form.currency}
            onChange={(value) => setForm({ ...form, currency: value })}
          />
          <label className="block">
            <span className="text-xs font-semibold text-slate-700">{t('procurement.paymentInfo.paymentMethod')}</span>
            <select
              value={form.paymentMethod}
              onChange={(e) =>
                setForm({ ...form, paymentMethod: e.target.value as 'BANK_ACCOUNT' | 'QR_CODE' })
              }
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            >
              <option value="QR_CODE">{t('procurement.paymentInfo.method.QR_CODE')}</option>
              <option value="BANK_ACCOUNT">{t('procurement.paymentInfo.method.BANK_ACCOUNT')}</option>
            </select>
          </label>
          {form.paymentMethod === 'BANK_ACCOUNT' ? (
            <>
              <CompactField
                label={t('procurement.paymentInfo.accountNumber')}
                value={form.accountNumber}
                onChange={(value) => setForm({ ...form, accountNumber: value })}
              />
              <CompactField
                label={`${t('procurement.paymentInfo.bankName')} (${t('common.optional')})`}
                value={form.bankName}
                onChange={(value) => setForm({ ...form, bankName: value })}
              />
              <CompactField
                label={`${t('procurement.paymentInfo.accountHolder')} (${t('common.optional')})`}
                value={form.accountHolder}
                onChange={(value) => setForm({ ...form, accountHolder: value })}
              />
            </>
          ) : (
            <div className="md:col-span-2 lg:col-span-3 space-y-2">
              <label className="inline-flex cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold">
                {t('procurement.paymentInfo.uploadQr')}
                <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" multiple className="hidden" onChange={onPickQr} />
              </label>
              {pendingQrFiles.length ? (
                <ul className="space-y-1 text-xs text-slate-600">
                  {pendingQrFiles.map((file, index) => (
                    <li key={`${file.name}-${index}`} className="flex items-center gap-2">
                      <span>{file.name}</span>
                      <button
                        type="button"
                        className="font-semibold text-red-700"
                        onClick={() =>
                          setPendingQrFiles((current) => current.filter((_, i) => i !== index))
                        }
                      >
                        {t('common.delete')}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
          <label className="block">
            <span className="text-xs font-semibold text-slate-700">
              {t('procurement.sectionPayable.attachInvoice')} ({t('common.optional')})
            </span>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              className="mt-1 block w-full text-sm"
              onChange={(e) => setPendingInvoice(e.target.files?.[0] ?? null)}
            />
          </label>
          <div className="md:col-span-2 lg:col-span-3">
            <button
              type="button"
              disabled={saving || hasActiveRequest}
              onClick={() => void sendToAccountant()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-blue-300"
            >
              {hasActiveRequest
                ? t('procurement.payments.awaitingAccountant')
                : t('procurement.payments.sendInvoice')}
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-4 space-y-2">
        {sectionRows.length === 0 ? (
          <p className="text-xs text-slate-500">{t('procurement.sectionPayable.empty')}</p>
        ) : (
          sectionRows.map((row) => (
            <div key={row.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    {row.expenseNumber} · {Number(row.amount).toFixed(2)} {row.currency}
                  </p>
                  <p className="text-xs text-slate-600">
                    {translateStatus(t, row.status)} · {t(`procurement.paymentInfo.method.${row.paymentMethod}`)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canApprove && row.status === 'WAITING_ACCOUNTANT' ? (
                    <button
                      type="button"
                      className="rounded-md border border-blue-200 px-2 py-1 text-xs font-semibold text-blue-700"
                      onClick={() => {
                        setApproveTarget(row);
                        setApproveForm({ exchangeRate: '', financeAccountId: '', accountantComment: '' });
                      }}
                    >
                      {t('procurement.sectionPayable.approve')}
                    </button>
                  ) : null}
                  {(canApprove || canConfirm) &&
                  (row.status === 'WAITING_ACCOUNTANT' || row.status === 'PENDING_CASHIER') ? (
                    <button
                      type="button"
                      className="rounded-md border border-amber-200 px-2 py-1 text-xs font-semibold text-amber-800"
                      onClick={() => {
                        setReturnTarget(row);
                        setReturnReason('');
                      }}
                    >
                      {t('procurement.payments.returnToAccountant')}
                    </button>
                  ) : null}
                  {canConfirm && row.status === 'PENDING_CASHIER' ? (
                    <>
                      <label className="cursor-pointer rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold">
                        {t('procurement.payments.uploadReceipt')}
                        <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => void uploadReceipt(row.id, e)} />
                      </label>
                      <button
                        type="button"
                        className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white"
                        onClick={() => {
                          setConfirmTarget(row);
                          setConfirmForm({ financeAccountId: '', transactionNumber: '', cashierComment: '' });
                        }}
                      >
                        {t('procurement.sectionPayable.confirm')}
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
              {row.qrCodes?.length ? (
                <div className="mt-1 flex flex-wrap gap-2 text-xs">
                  {row.qrCodes.map((qr) => (
                    <a key={qr.id} href={`${API_URL}${qr.fileUrl}`} target="_blank" rel="noreferrer" className="text-blue-700">
                      {qr.fileName}
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>

      {approveTarget ? (
        <Modal title={t('procurement.sectionPayable.approve')} onClose={() => setApproveTarget(null)}>
          <CompactField label={t('procurement.payments.exchangeRate')} type="number" value={approveForm.exchangeRate} onChange={(v) => setApproveForm({ ...approveForm, exchangeRate: v })} />
          <label className="mt-2 block">
            <span className="text-xs font-semibold">{t('procurement.payments.financeAccount')}</span>
            <select
              value={approveForm.financeAccountId}
              onChange={(e) => setApproveForm({ ...approveForm, financeAccountId: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            >
              <option value="">{t('common.select')}</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>{account.name}</option>
              ))}
            </select>
          </label>
          <button type="button" disabled={saving} onClick={() => void approve()} className="mt-3 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white">
            {t('procurement.sectionPayable.approve')}
          </button>
        </Modal>
      ) : null}

      {confirmTarget ? (
        <Modal title={t('procurement.sectionPayable.confirm')} onClose={() => setConfirmTarget(null)}>
          <label className="block">
            <span className="text-xs font-semibold">{t('procurement.payments.financeAccount')}</span>
            <select
              value={confirmForm.financeAccountId}
              onChange={(e) => setConfirmForm({ ...confirmForm, financeAccountId: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            >
              <option value="">{t('common.select')}</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>{account.name}</option>
              ))}
            </select>
          </label>
          <button type="button" disabled={saving} onClick={() => void confirmPay()} className="mt-3 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white">
            {t('procurement.sectionPayable.confirm')}
          </button>
        </Modal>
      ) : null}

      {returnTarget ? (
        <Modal title={t('procurement.payments.returnToAccountant')} onClose={() => setReturnTarget(null)}>
          <CompactField label={t('procurement.payments.returnReason')} value={returnReason} onChange={setReturnReason} />
          <button type="button" disabled={saving} onClick={() => void submitReturn()} className="mt-3 rounded-lg bg-amber-700 px-3 py-1.5 text-sm font-semibold text-white">
            {t('common.save')}
          </button>
        </Modal>
      ) : null}
    </div>
  );
}

function CompactField({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
      />
    </label>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h4 className="font-semibold text-slate-900">{title}</h4>
          <button type="button" onClick={onClose} className="text-sm font-semibold text-slate-500">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
