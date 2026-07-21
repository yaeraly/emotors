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
  description?: string | null;
};

type SectionExpense = {
  id: string;
  expenseNumber: string;
  expenseType: string;
  requestType?: string | null;
  supplierCarrier: string;
  expenseName?: string | null;
  expenseCategory?: string | null;
  recipientName?: string | null;
  route?: string | null;
  vehicleInfo?: string | null;
  shipmentReference?: string | null;
  paymentMethod: 'BANK_ACCOUNT' | 'QR_CODE';
  bankName?: string | null;
  accountHolder?: string | null;
  accountNumber?: string | null;
  swiftCode?: string | null;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  amount: number;
  currency: string;
  exchangeRate?: number | null;
  amountKgs: number;
  comment?: string | null;
  status: string;
  returnReason?: string | null;
  paidAt?: string | null;
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
  sectionTotalAmount?: number;
  defaultCarrier?: string;
  showOtherExpenseFields?: boolean;
  showRoute?: boolean;
  showVehicle?: boolean;
  showShipmentReference?: boolean;
};

const ACTIVE = new Set(['WAITING_ACCOUNTANT', 'PENDING_CASHIER']);

function summarize(rows: SectionExpense[], sectionTotal?: number) {
  const paid = rows.filter((row) => row.status === 'PAID');
  const pending = rows.filter((row) => ACTIVE.has(row.status));
  const paidAmount = paid.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const requested = rows
    .filter((row) => row.status !== 'CANCELLED')
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const total = Number(sectionTotal || 0) > 0 ? Number(sectionTotal) : requested;
  const remaining = Math.max(0, Math.round((total - paidAmount) * 100) / 100);
  return {
    totalRequested: Math.round(total * 100) / 100,
    paidAmount: Math.round(paidAmount * 100) / 100,
    remainingAmount: remaining,
    paymentCount: paid.length,
    pendingCount: pending.length,
    status:
      paidAmount <= 0 && pending.length === 0
        ? 'UNPAID'
        : remaining <= 0.009
          ? 'PAID'
          : paidAmount > 0
            ? 'PARTIALLY_PAID'
            : 'AWAITING_ACCOUNTANT',
  };
}

export function ProcurementSectionPayablePanel({
  orderId,
  user,
  expenseType,
  requestType,
  defaultCurrency = 'KGS',
  sectionTotalAmount,
  defaultCarrier = '',
  showOtherExpenseFields = false,
  showRoute = false,
  showVehicle = false,
  showShipmentReference = false,
}: Props) {
  const { t } = useTranslation();
  const canCreate = canCreateProcurementOrder(user) || hasFullAccess(user);
  const canApprove = canCreateSupplierPayment(user);
  const canConfirm = canConfirmSupplierPayment(user);
  const [rows, setRows] = useState<SectionExpense[]>([]);
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string; availableBalance?: number }>>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [qrDescription, setQrDescription] = useState('');
  const [draftId, setDraftId] = useState<string | null>(null);
  const [form, setForm] = useState({
    supplierCarrier: defaultCarrier,
    expenseName: '',
    expenseCategory: '',
    recipientName: '',
    route: '',
    vehicleInfo: '',
    shipmentReference: '',
    amount: '',
    currency: defaultCurrency,
    invoiceNumber: '',
    invoiceDate: '',
    comment: '',
    paymentMethod: 'QR_CODE' as 'BANK_ACCOUNT' | 'QR_CODE',
    bankName: '',
    accountHolder: '',
    accountNumber: '',
    swiftCode: '',
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
  const summary = useMemo(
    () => summarize(sectionRows, sectionTotalAmount),
    [sectionRows, sectionTotalAmount],
  );
  const draft = sectionRows.find((row) => row.id === draftId)
    ?? sectionRows.find((row) => row.status === 'DRAFT' || row.status === 'RETURNED')
    ?? null;
  const hasActiveRequest = sectionRows.some((row) => ACTIVE.has(row.status));

  function load() {
    apiFetch<SectionExpense[]>(`/procurement/transport-expenses?orderId=${orderId}`)
      .then((all) => {
        setRows(all);
        const currentDraft =
          all.find((row) => row.expenseType === expenseType && (row.status === 'DRAFT' || row.status === 'RETURNED'))
          ?? null;
        if (currentDraft) {
          setDraftId(currentDraft.id);
          setForm({
            supplierCarrier: currentDraft.supplierCarrier ?? defaultCarrier,
            expenseName: currentDraft.expenseName ?? '',
            expenseCategory: currentDraft.expenseCategory ?? '',
            recipientName: currentDraft.recipientName ?? '',
            route: currentDraft.route ?? '',
            vehicleInfo: currentDraft.vehicleInfo ?? '',
            shipmentReference: currentDraft.shipmentReference ?? '',
            amount: String(currentDraft.amount ?? ''),
            currency: currentDraft.currency || defaultCurrency,
            invoiceNumber: currentDraft.invoiceNumber ?? '',
            invoiceDate: currentDraft.invoiceDate ? String(currentDraft.invoiceDate).slice(0, 10) : '',
            comment: currentDraft.comment ?? '',
            paymentMethod: currentDraft.paymentMethod || 'QR_CODE',
            bankName: currentDraft.bankName ?? '',
            accountHolder: currentDraft.accountHolder ?? '',
            accountNumber: currentDraft.accountNumber ?? '',
            swiftCode: currentDraft.swiftCode ?? '',
          });
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, expenseType]);

  useEffect(() => {
    if (!canApprove && !canConfirm) return;
    void apiFetch<Array<{ id: string; name: string; availableBalance?: number }>>(
      '/procurement/supplier-payment-accounts',
    )
      .then(setAccounts)
      .catch(() => setAccounts([]));
  }, [canApprove, canConfirm]);

  async function persistDraft(): Promise<SectionExpense | null> {
    const payload = {
      procurementOrderId: orderId,
      expenseType,
      requestType,
      supplierCarrier: form.supplierCarrier || form.expenseName || t('procurement.sectionPayable.defaultCarrier'),
      expenseName: form.expenseName || undefined,
      expenseCategory: form.expenseCategory || undefined,
      recipientName: form.recipientName || undefined,
      route: form.route || undefined,
      vehicleInfo: form.vehicleInfo || undefined,
      shipmentReference: form.shipmentReference || undefined,
      amount: Number(form.amount),
      currency: form.currency,
      invoiceNumber: form.invoiceNumber || undefined,
      invoiceDate: form.invoiceDate || undefined,
      comment: form.comment || undefined,
      paymentMethod: form.paymentMethod,
      bankName: form.paymentMethod === 'BANK_ACCOUNT' ? form.bankName || undefined : undefined,
      accountHolder: form.paymentMethod === 'BANK_ACCOUNT' ? form.accountHolder || undefined : undefined,
      accountNumber: form.paymentMethod === 'BANK_ACCOUNT' ? form.accountNumber || undefined : undefined,
      swiftCode: form.paymentMethod === 'BANK_ACCOUNT' ? form.swiftCode || undefined : undefined,
      sectionTotalAmount: sectionTotalAmount,
      sendToAccountant: false,
    };
    let saved: SectionExpense;
    if (draft) {
      saved = await apiFetch<SectionExpense>(`/procurement/transport-expenses/${draft.id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    } else {
      saved = await apiFetch<SectionExpense>('/procurement/transport-expenses', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    }
    setDraftId(saved.id);
    return saved;
  }

  async function saveDraft() {
    if (!canCreate) return;
    setSaving(true);
    setError('');
    try {
      await persistDraft();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function sendToAccountant() {
    if (hasActiveRequest) {
      setError(t('procurement.sectionPayable.activeRequestExists'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const saved = await persistDraft();
      if (!saved) return;
      const latest = await apiFetch<SectionExpense>(`/procurement/transport-expenses/${saved.id}`);
      if (form.paymentMethod === 'QR_CODE' && !(latest.qrCodes?.length)) {
        setError(t('procurement.sectionPayable.qrRequired'));
        load();
        return;
      }
      await apiFetch(`/procurement/transport-expenses/${saved.id}/submit`, { method: 'POST', body: '{}' });
      setDraftId(null);
      setForm((prev) => ({
        ...prev,
        amount: '',
        invoiceNumber: '',
        invoiceDate: '',
        comment: '',
        expenseName: showOtherExpenseFields ? '' : prev.expenseName,
      }));
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function uploadQr(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setSaving(true);
    setError('');
    try {
      let target = draft;
      if (!target) {
        target = await persistDraft();
      }
      if (!target) return;
      const token = getToken();
      if (!token) return;
      const body = new FormData();
      body.append('file', file);
      if (qrDescription.trim()) body.append('description', qrDescription.trim());
      const response = await fetch(`${API_URL}/procurement/transport-expenses/${target.id}/attachments/qr`, {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function removeQr(attachmentId: string) {
    if (!draft) return;
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/procurement/transport-expenses/${draft.id}/attachments/qr/${attachmentId}`, {
        method: 'DELETE',
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function uploadInvoice(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setSaving(true);
    setError('');
    try {
      let target = draft;
      if (!target) target = await persistDraft();
      if (!target) return;
      const token = getToken();
      if (!token) return;
      const body = new FormData();
      body.append('file', file);
      const response = await fetch(
        `${API_URL}/procurement/transport-expenses/${target.id}/attachments/invoice`,
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
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
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
    setError('');
    try {
      const response = await fetch(
        `${API_URL}/procurement/transport-expenses/${expenseId}/attachments/receipt`,
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
    setError('');
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
    <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <h4 className="font-semibold text-slate-900">{t('procurement.sectionPayable.title')}</h4>
      <p className="mt-1 text-sm text-slate-600">{t('procurement.sectionPayable.help')}</p>

      {error ? <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      <div className="mt-4 grid gap-3 md:grid-cols-3 lg:grid-cols-5">
        <Summary label={t('procurement.sectionPayable.requested')} value={String(summary.totalRequested)} />
        <Summary label={t('procurement.sectionPayable.paid')} value={String(summary.paidAmount)} />
        <Summary label={t('procurement.sectionPayable.remaining')} value={String(summary.remainingAmount)} />
        <Summary label={t('procurement.sectionPayable.paymentCount')} value={String(summary.paymentCount)} />
        <Summary
          label={t('procurement.sectionPayable.status')}
          value={t(`procurement.sectionPayable.statusValue.${summary.status}`)}
        />
      </div>

      {canCreate ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {showOtherExpenseFields ? (
            <>
              <Field
                label={t('procurement.sectionPayable.expenseName')}
                value={form.expenseName}
                onChange={(value) => setForm({ ...form, expenseName: value })}
              />
              <Field
                label={t('procurement.sectionPayable.expenseCategory')}
                value={form.expenseCategory}
                onChange={(value) => setForm({ ...form, expenseCategory: value })}
              />
              <Field
                label={t('procurement.sectionPayable.recipient')}
                value={form.recipientName}
                onChange={(value) => setForm({ ...form, recipientName: value })}
              />
            </>
          ) : (
            <Field
              label={t('procurement.sectionPayable.carrier')}
              value={form.supplierCarrier}
              onChange={(value) => setForm({ ...form, supplierCarrier: value })}
            />
          )}
          {showRoute ? (
            <Field
              label={t('procurement.sectionPayable.route')}
              value={form.route}
              onChange={(value) => setForm({ ...form, route: value })}
            />
          ) : null}
          {showVehicle ? (
            <Field
              label={t('procurement.sectionPayable.vehicle')}
              value={form.vehicleInfo}
              onChange={(value) => setForm({ ...form, vehicleInfo: value })}
            />
          ) : null}
          {showShipmentReference ? (
            <Field
              label={t('procurement.sectionPayable.shipmentReference')}
              value={form.shipmentReference}
              onChange={(value) => setForm({ ...form, shipmentReference: value })}
            />
          ) : null}
          <Field
            label={t('procurement.sectionPayable.amount')}
            type="number"
            value={form.amount}
            onChange={(value) => setForm({ ...form, amount: value })}
          />
          <Field
            label={t('procurement.sectionPayable.currency')}
            value={form.currency}
            onChange={(value) => setForm({ ...form, currency: value })}
          />
          <Field
            label={t('procurement.sectionPayable.invoiceNumber')}
            value={form.invoiceNumber}
            onChange={(value) => setForm({ ...form, invoiceNumber: value })}
          />
          <Field
            label={t('procurement.sectionPayable.invoiceDate')}
            type="date"
            value={form.invoiceDate}
            onChange={(value) => setForm({ ...form, invoiceDate: value })}
          />
          <label className="block md:col-span-2 lg:col-span-3">
            <span className="text-sm font-semibold text-slate-700">{t('procurement.paymentInfo.paymentMethod')}</span>
            <select
              value={form.paymentMethod}
              onChange={(e) =>
                setForm({ ...form, paymentMethod: e.target.value as 'BANK_ACCOUNT' | 'QR_CODE' })
              }
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
            >
              <option value="QR_CODE">{t('procurement.paymentInfo.method.QR_CODE')}</option>
              <option value="BANK_ACCOUNT">{t('procurement.paymentInfo.method.BANK_ACCOUNT')}</option>
            </select>
          </label>
          {form.paymentMethod === 'BANK_ACCOUNT' ? (
            <>
              <Field label={t('procurement.paymentInfo.bankName')} value={form.bankName} onChange={(v) => setForm({ ...form, bankName: v })} />
              <Field label={t('procurement.paymentInfo.accountHolder')} value={form.accountHolder} onChange={(v) => setForm({ ...form, accountHolder: v })} />
              <Field label={t('procurement.paymentInfo.accountNumber')} value={form.accountNumber} onChange={(v) => setForm({ ...form, accountNumber: v })} />
              <Field label={t('procurement.paymentInfo.swift')} value={form.swiftCode} onChange={(v) => setForm({ ...form, swiftCode: v })} />
            </>
          ) : (
            <div className="md:col-span-2 lg:col-span-3 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-800">
              {t('procurement.paymentInfo.qrUnlimitedHint')}
            </div>
          )}
          <label className="block md:col-span-2 lg:col-span-3">
            <span className="text-sm font-semibold text-slate-700">{t('procurement.paymentInfo.comment')}</span>
            <textarea
              value={form.comment}
              onChange={(e) => setForm({ ...form, comment: e.target.value })}
              className="mt-2 min-h-20 w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">{t('procurement.sectionPayable.attachInvoice')}</span>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="mt-2 block w-full text-sm" onChange={(e) => void uploadInvoice(e)} />
          </label>
          {form.paymentMethod === 'QR_CODE' ? (
            <div className="md:col-span-2 flex flex-wrap items-end gap-3">
              <label className="block flex-1">
                <span className="text-sm font-semibold text-slate-700">{t('procurement.paymentInfo.qrDescription')}</span>
                <input
                  value={qrDescription}
                  onChange={(e) => setQrDescription(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="cursor-pointer rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold">
                {t('procurement.paymentInfo.uploadQr')}
                <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={(e) => void uploadQr(e)} />
              </label>
            </div>
          ) : null}
          {draft?.qrCodes?.length ? (
            <div className="md:col-span-2 lg:col-span-3 grid gap-2 md:grid-cols-3">
              {draft.qrCodes.map((qr) => (
                <div key={qr.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                  <a href={`${API_URL}${qr.fileUrl}`} target="_blank" rel="noreferrer" className="font-semibold text-blue-700">
                    {qr.fileName}
                  </a>
                  {qr.description ? <p className="mt-1 text-xs text-slate-500">{qr.description}</p> : null}
                  <button type="button" className="mt-2 text-xs font-semibold text-red-700" onClick={() => void removeQr(qr.id)}>
                    {t('common.delete')}
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <div className="md:col-span-2 lg:col-span-3 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveDraft()}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
            >
              {saving ? t('common.loading') : t('common.save')}
            </button>
            <button
              type="button"
              disabled={saving || hasActiveRequest}
              onClick={() => void sendToAccountant()}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-blue-300"
            >
              {hasActiveRequest
                ? t('procurement.payments.awaitingAccountant')
                : t('procurement.payments.sendInvoice')}
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-6 space-y-3">
        <h5 className="font-semibold text-slate-900">{t('procurement.sectionPayable.history')}</h5>
        {sectionRows.length === 0 ? (
          <p className="text-sm text-slate-500">{t('procurement.sectionPayable.empty')}</p>
        ) : (
          sectionRows.map((row) => (
            <div key={row.id} className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900">
                    {row.expenseNumber} · {Number(row.amount).toFixed(2)} {row.currency}
                  </p>
                  <p className="text-slate-600">
                    {translateStatus(t, row.status)} · {t(`procurement.paymentInfo.method.${row.paymentMethod}`)}
                  </p>
                  {row.exchangeRate != null ? (
                    <p className="text-slate-600">
                      {t('procurement.payments.exchangeRate')}: {Number(row.exchangeRate).toFixed(4)} ·{' '}
                      {Number(row.amountKgs).toFixed(2)} KGS
                    </p>
                  ) : null}
                  {row.accountant?.fullName ? (
                    <p className="text-slate-500">{t('procurement.payments.accountant')}: {row.accountant.fullName}</p>
                  ) : null}
                  {row.cashier?.fullName ? (
                    <p className="text-slate-500">{t('procurement.payments.cashier')}: {row.cashier.fullName}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {canApprove && row.status === 'WAITING_ACCOUNTANT' ? (
                    <button
                      type="button"
                      className="rounded-lg border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-700"
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
                      className="rounded-lg border border-amber-200 px-3 py-1 text-xs font-semibold text-amber-800"
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
                      <label className="cursor-pointer rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold">
                        {t('procurement.payments.uploadReceipt')}
                        <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => void uploadReceipt(row.id, e)} />
                      </label>
                      <button
                        type="button"
                        className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white"
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
                <div className="mt-2 flex flex-wrap gap-2">
                  {row.qrCodes.map((qr) => (
                    <a key={qr.id} href={`${API_URL}${qr.fileUrl}`} target="_blank" rel="noreferrer" className="text-blue-700">
                      QR: {qr.fileName}
                    </a>
                  ))}
                </div>
              ) : null}
              {row.receipts?.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {row.receipts.map((receipt) => (
                    <a key={receipt.id} href={`${API_URL}${receipt.fileUrl}`} target="_blank" rel="noreferrer" className="text-blue-700">
                      {receipt.fileName}
                    </a>
                  ))}
                </div>
              ) : null}
              {row.returnReason ? (
                <p className="mt-2 text-amber-800">{t('procurement.payments.returnReason')}: {row.returnReason}</p>
              ) : null}
            </div>
          ))
        )}
      </div>

      {approveTarget ? (
        <Modal title={t('procurement.sectionPayable.approve')} onClose={() => setApproveTarget(null)}>
          <Field label={t('procurement.payments.exchangeRate')} type="number" value={approveForm.exchangeRate} onChange={(v) => setApproveForm({ ...approveForm, exchangeRate: v })} />
          <label className="mt-3 block">
            <span className="text-sm font-semibold">{t('procurement.payments.financeAccount')}</span>
            <select
              value={approveForm.financeAccountId}
              onChange={(e) => setApproveForm({ ...approveForm, financeAccountId: e.target.value })}
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
            >
              <option value="">{t('common.select')}</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>{account.name}</option>
              ))}
            </select>
          </label>
          <Field label={t('procurement.paymentInfo.comment')} value={approveForm.accountantComment} onChange={(v) => setApproveForm({ ...approveForm, accountantComment: v })} />
          <button type="button" disabled={saving} onClick={() => void approve()} className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
            {t('procurement.sectionPayable.approve')}
          </button>
        </Modal>
      ) : null}

      {confirmTarget ? (
        <Modal title={t('procurement.sectionPayable.confirm')} onClose={() => setConfirmTarget(null)}>
          <label className="block">
            <span className="text-sm font-semibold">{t('procurement.payments.financeAccount')}</span>
            <select
              value={confirmForm.financeAccountId}
              onChange={(e) => setConfirmForm({ ...confirmForm, financeAccountId: e.target.value })}
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
            >
              <option value="">{t('common.select')}</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>{account.name}</option>
              ))}
            </select>
          </label>
          <Field label={t('procurement.payments.transactionNumber')} value={confirmForm.transactionNumber} onChange={(v) => setConfirmForm({ ...confirmForm, transactionNumber: v })} />
          <Field label={t('procurement.paymentInfo.comment')} value={confirmForm.cashierComment} onChange={(v) => setConfirmForm({ ...confirmForm, cashierComment: v })} />
          <button type="button" disabled={saving} onClick={() => void confirmPay()} className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">
            {t('procurement.sectionPayable.confirm')}
          </button>
        </Modal>
      ) : null}

      {returnTarget ? (
        <Modal title={t('procurement.payments.returnToAccountant')} onClose={() => setReturnTarget(null)}>
          <Field label={t('procurement.payments.returnReason')} value={returnReason} onChange={setReturnReason} />
          <button type="button" disabled={saving} onClick={() => void submitReturn()} className="mt-4 rounded-xl bg-amber-700 px-4 py-2 text-sm font-semibold text-white">
            {t('common.save')}
          </button>
        </Modal>
      ) : null}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white px-3 py-2">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function Field({
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
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
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
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-3">
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
