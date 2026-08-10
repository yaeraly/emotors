'use client';

import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { API_URL, apiFetch, getToken } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';
import type { User } from '@/lib/types';
import {
  canConfirmSupplierPayment,
  canCreateProcurementOrder,
  canCreateSupplierPayment,
  hasFullAccess,
} from '@/lib/rbac';

import { toast } from '@/lib/toast';

type TransportExpense = {
  id: string;
  expenseNumber: string;
  expenseType: string;
  supplierCarrier: string;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  amount: number;
  currency: string;
  exchangeRate?: number | null;
  amountKgs: number;
  dueDate?: string | null;
  comment?: string | null;
  status: string;
  returnReason?: string | null;
  paidAt?: string | null;
  transactionNumber?: string | null;
  accountant?: { fullName?: string } | null;
  cashier?: { fullName?: string } | null;
  invoices?: Array<{ id: string; fileName: string; fileUrl: string }>;
  receipts?: Array<{ id: string; fileName: string; fileUrl: string }>;
};

const EXPENSE_TYPES = [
  'CHINA_WAREHOUSE',
  'DOMESTIC_CHINA_TRANSPORT',
  'INTERNATIONAL_FREIGHT',
  'CUSTOMS_BROKER',
  'LOCAL_DELIVERY',
  'OTHER_LOGISTICS',
] as const;

type Props = {
  orderId: string;
  user: User | null;
};

export function ProcurementTransportExpenses({ orderId, user }: Props) {
  const { t } = useTranslation();
  const canCreate = canCreateProcurementOrder(user) || hasFullAccess(user);
  const canApprove = canCreateSupplierPayment(user);
  const canConfirm = canConfirmSupplierPayment(user);
  const [rows, setRows] = useState<TransportExpense[]>([]);
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string; availableBalance?: number }>>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    expenseType: 'DOMESTIC_CHINA_TRANSPORT',
    supplierCarrier: '',
    invoiceNumber: '',
    invoiceDate: '',
    amount: '',
    currency: 'KGS',
    dueDate: '',
    comment: '',
  });
  const [approveTarget, setApproveTarget] = useState<TransportExpense | null>(null);
  const [approveForm, setApproveForm] = useState({ exchangeRate: '', financeAccountId: '', accountantComment: '' });
  const [confirmTarget, setConfirmTarget] = useState<TransportExpense | null>(null);
  const [confirmForm, setConfirmForm] = useState({ financeAccountId: '', transactionNumber: '', cashierComment: '' });
  const [returnTarget, setReturnTarget] = useState<TransportExpense | null>(null);
  const [returnReason, setReturnReason] = useState('');

  function load() {
    apiFetch<TransportExpense[]>(`/procurement/transport-expenses?orderId=${orderId}`)
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }

  useEffect(() => {
    load();
    if (canApprove || canConfirm) {
      apiFetch<Array<{ id: string; name: string; availableBalance?: number }>>('/procurement/supplier-payment-accounts')
        .then(setAccounts)
        .catch(() => setAccounts([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  async function createExpense(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiFetch('/procurement/transport-expenses', {
        method: 'POST',
        body: JSON.stringify({
          procurementOrderId: orderId,
          expenseType: form.expenseType,
          supplierCarrier: form.supplierCarrier,
          invoiceNumber: form.invoiceNumber || undefined,
          invoiceDate: form.invoiceDate || undefined,
          amount: Number(form.amount),
          currency: form.currency,
          dueDate: form.dueDate || undefined,
          comment: form.comment || undefined,
        }),
      });
      setShowForm(false);
      setForm({
        expenseType: 'DOMESTIC_CHINA_TRANSPORT',
        supplierCarrier: '',
        invoiceNumber: '',
        invoiceDate: '',
        amount: '',
        currency: 'KGS',
        dueDate: '',
        comment: '',
      });
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function upload(id: string, kind: 'invoice' | 'receipt', event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const token = getToken();
    if (!token) return;
    const body = new FormData();
    body.append('file', file);
    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/procurement/transport-expenses/${id}/attachments/${kind}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || t('common.error'));
      }
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function submit(id: string) {
    setSaving(true);
    try {
      await apiFetch(`/procurement/transport-expenses/${id}/submit`, { method: 'POST', body: JSON.stringify({}) });
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function approve() {
    if (!approveTarget) return;
    setSaving(true);
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
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function confirm() {
    if (!confirmTarget) return;
    setSaving(true);
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
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function returnExpense() {
    if (!returnTarget || returnReason.trim().length < 3) return;
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
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-bold">{t('procurement.transportExpense.title')}</h3>
        {canCreate ? (
          <button type="button" onClick={() => setShowForm((v) => !v)} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
            {t('procurement.transportExpense.create')}
          </button>
        ) : null}
      </div>
      {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      {showForm ? (
        <form onSubmit={createExpense} className="mb-6 grid gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-semibold">{t('procurement.transportExpense.expenseType')}</span>
            <select value={form.expenseType} onChange={(e) => setForm({ ...form, expenseType: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2">
              {EXPENSE_TYPES.map((type) => (
                <option key={type} value={type}>{t(`procurement.transportExpense.type.${type}`)}</option>
              ))}
            </select>
          </label>
          <label className="block"><span className="text-sm font-semibold">{t('procurement.transportExpense.supplierCarrier')}</span><input required value={form.supplierCarrier} onChange={(e) => setForm({ ...form, supplierCarrier: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
          <label className="block"><span className="text-sm font-semibold">{t('procurement.transportExpense.invoiceNumber')}</span><input value={form.invoiceNumber} onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
          <label className="block"><span className="text-sm font-semibold">{t('procurement.transportExpense.invoiceDate')}</span><input type="date" value={form.invoiceDate} onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
          <label className="block"><span className="text-sm font-semibold">{t('procurement.transportExpense.amount')}</span><input required type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
          <label className="block">
            <span className="text-sm font-semibold">{t('procurement.transportExpense.currency')}</span>
            <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2">
              <option value="KGS">KGS</option>
              <option value="CNY">CNY</option>
              <option value="USD">USD</option>
            </select>
          </label>
          <label className="block"><span className="text-sm font-semibold">{t('procurement.transportExpense.dueDate')}</span><input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
          <label className="block md:col-span-2"><span className="text-sm font-semibold">{t('procurement.transportExpense.comment')}</span><textarea value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} className="mt-2 min-h-20 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
          <div className="md:col-span-2">
            <button type="submit" disabled={saving} className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white disabled:bg-blue-300">
              {saving ? t('common.loading') : t('common.save')}
            </button>
          </div>
        </form>
      ) : null}

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-3 py-2">{t('procurement.transportExpense.number')}</th>
              <th className="px-3 py-2">{t('procurement.transportExpense.expenseType')}</th>
              <th className="px-3 py-2">{t('procurement.transportExpense.amount')}</th>
              <th className="px-3 py-2">{t('distribution.status')}</th>
              <th className="px-3 py-2">{t('procurement.payments.accountant')}</th>
              <th className="px-3 py-2">{t('procurement.payments.cashier')}</th>
              <th className="px-3 py-2">{t('procurement.payments.receipt')}</th>
              <th className="px-3 py-2">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100 align-top">
                <td className="px-3 py-2">
                  <div className="font-semibold">{row.expenseNumber}</div>
                  <div className="text-xs text-slate-500">{row.invoiceNumber || '-'}</div>
                </td>
                <td className="px-3 py-2">{t(`procurement.transportExpense.type.${row.expenseType}`)}</td>
                <td className="px-3 py-2">{Number(row.amount).toFixed(2)} {row.currency}{row.amountKgs ? ` / ${Number(row.amountKgs).toFixed(2)} KGS` : ''}</td>
                <td className="px-3 py-2">{t(`procurement.transportExpense.status.${row.status}`)}</td>
                <td className="px-3 py-2">{row.accountant?.fullName || '-'}</td>
                <td className="px-3 py-2">{row.cashier?.fullName || '-'}</td>
                <td className="px-3 py-2">
                  {(row.receipts?.length ? row.receipts : row.invoices)?.map((file) => (
                    <a key={file.id} href={`${API_URL}${file.fileUrl}`} target="_blank" rel="noreferrer" className="block text-blue-700">{file.fileName}</a>
                  )) || '-'}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-2">
                    {canCreate && (row.status === 'DRAFT' || row.status === 'RETURNED') ? (
                      <>
                        <label className="cursor-pointer rounded-lg border px-2 py-1 text-xs font-semibold">
                          {t('procurement.transportExpense.uploadInvoice')}
                          <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => void upload(row.id, 'invoice', e)} />
                        </label>
                        <button type="button" onClick={() => void submit(row.id)} className="rounded-lg border border-blue-200 px-2 py-1 text-xs font-semibold text-blue-700">
                          {t('procurement.transportExpense.sendToAccountant')}
                        </button>
                      </>
                    ) : null}
                    {canApprove && row.status === 'WAITING_ACCOUNTANT' ? (
                      <>
                        <button type="button" onClick={() => { setApproveTarget(row); setApproveForm({ exchangeRate: '', financeAccountId: '', accountantComment: '' }); }} className="rounded-lg bg-blue-600 px-2 py-1 text-xs font-semibold text-white">
                          {t('procurement.transportExpense.approve')}
                        </button>
                        <button type="button" onClick={() => { setReturnTarget(row); setReturnReason(''); }} className="rounded-lg border border-amber-300 px-2 py-1 text-xs font-semibold text-amber-800">
                          {t('procurement.payments.returnToAccountant')}
                        </button>
                      </>
                    ) : null}
                    {canConfirm && row.status === 'PENDING_CASHIER' ? (
                      <>
                        <label className="cursor-pointer rounded-lg border px-2 py-1 text-xs font-semibold">
                          {t('procurement.payments.uploadReceipt')}
                          <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => void upload(row.id, 'receipt', e)} />
                        </label>
                        <button type="button" onClick={() => { setConfirmTarget(row); setConfirmForm({ financeAccountId: '', transactionNumber: '', cashierComment: '' }); }} className="rounded-lg bg-blue-600 px-2 py-1 text-xs font-semibold text-white">
                          {t('procurement.transportExpense.confirm')}
                        </button>
                        <button type="button" onClick={() => { setReturnTarget(row); setReturnReason(''); }} className="rounded-lg border border-amber-300 px-2 py-1 text-xs font-semibold text-amber-800">
                          {t('procurement.payments.returnToAccountant')}
                        </button>
                      </>
                    ) : null}
                    {row.returnReason ? <span className="text-xs text-amber-800">{row.returnReason}</span> : null}
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr><td colSpan={8} className="px-3 py-6 text-slate-500">{t('procurement.transportExpense.empty')}</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {approveTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <h4 className="text-xl font-bold">{t('procurement.transportExpense.approve')}</h4>
            {approveTarget.currency !== 'KGS' ? (
              <label className="mt-4 block"><span className="text-sm font-semibold">{t('procurement.payments.exchangeRate')}</span><input type="number" step="0.0001" value={approveForm.exchangeRate} onChange={(e) => setApproveForm({ ...approveForm, exchangeRate: e.target.value })} className="mt-2 w-full rounded-xl border px-3 py-2" /></label>
            ) : null}
            <label className="mt-4 block">
              <span className="text-sm font-semibold">{t('procurement.payments.financeAccount')}</span>
              <select value={approveForm.financeAccountId} onChange={(e) => setApproveForm({ ...approveForm, financeAccountId: e.target.value })} className="mt-2 w-full rounded-xl border px-3 py-2">
                <option value="">{t('common.select')}</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            <div className="mt-4 flex justify-end gap-3">
              <button type="button" onClick={() => setApproveTarget(null)} className="rounded-xl border px-4 py-2 font-semibold">{t('common.cancel')}</button>
              <button type="button" disabled={saving} onClick={() => void approve()} className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white">{t('common.confirm')}</button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <h4 className="text-xl font-bold">{t('procurement.transportExpense.confirm')}</h4>
            <label className="mt-4 block">
              <span className="text-sm font-semibold">{t('procurement.payments.financeAccount')}</span>
              <select required value={confirmForm.financeAccountId} onChange={(e) => setConfirmForm({ ...confirmForm, financeAccountId: e.target.value })} className="mt-2 w-full rounded-xl border px-3 py-2">
                <option value="">{t('common.select')}</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            <label className="mt-4 block"><span className="text-sm font-semibold">{t('procurement.payments.transactionNumber')}</span><input value={confirmForm.transactionNumber} onChange={(e) => setConfirmForm({ ...confirmForm, transactionNumber: e.target.value })} className="mt-2 w-full rounded-xl border px-3 py-2" /></label>
            <div className="mt-4 flex justify-end gap-3">
              <button type="button" onClick={() => setConfirmTarget(null)} className="rounded-xl border px-4 py-2 font-semibold">{t('common.cancel')}</button>
              <button type="button" disabled={saving || !confirmForm.financeAccountId} onClick={() => void confirm()} className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white">{t('common.confirm')}</button>
            </div>
          </div>
        </div>
      ) : null}

      {returnTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <h4 className="text-xl font-bold">{t('procurement.payments.returnToAccountant')}</h4>
            <textarea value={returnReason} onChange={(e) => setReturnReason(e.target.value)} className="mt-4 min-h-28 w-full rounded-xl border px-3 py-2" />
            <div className="mt-4 flex justify-end gap-3">
              <button type="button" onClick={() => setReturnTarget(null)} className="rounded-xl border px-4 py-2 font-semibold">{t('common.cancel')}</button>
              <button type="button" disabled={saving || returnReason.trim().length < 3} onClick={() => void returnExpense()} className="rounded-xl bg-amber-600 px-4 py-2 font-semibold text-white">{t('common.confirm')}</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
