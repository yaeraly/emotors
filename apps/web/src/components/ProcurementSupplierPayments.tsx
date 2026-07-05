'use client';

import { ChangeEvent, useState } from 'react';
import { API_URL, apiFetch, getToken } from '@/lib/api';
import {
  canCreateSupplierPayment,
  canEditSupplierPayment,
  canVoidSupplierPayment,
} from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

export type SupplierPayment = {
  id: string;
  paymentDate: string;
  amountYuan: number;
  exchangeRate: number;
  amountKgs: number;
  paymentMethod: 'BANK' | 'CASH' | 'TRANSFER';
  receiptNumber?: string | null;
  notes?: string | null;
  status: 'ACTIVE' | 'VOID';
  createdBy?: { fullName: string };
  attachments?: Array<{ id: string; fileName: string; fileUrl: string }>;
};

type ProcurementOrderPayments = {
  id: string;
  totalYuan: number;
  totalPaidYuan?: number;
  totalPaidKgs?: number;
  remainingYuan?: number;
  weightedAverageYuanRate?: number | null;
  effectiveYuanRate?: number;
  supplierPaymentStatus?: string;
  yuanRateLocked?: boolean;
  hqStockMovementCreatedAt?: string | null;
  supplierPayments?: SupplierPayment[];
};

type Props = {
  order: ProcurementOrderPayments;
  user: User | null;
  onChanged: () => Promise<void>;
};

const paymentMethods = ['BANK', 'CASH', 'TRANSFER'] as const;

type EditForm = {
  paymentDate: string;
  amountYuan: string;
  exchangeRate: string;
  notes: string;
  changeReason: string;
};

export function ProcurementSupplierPayments({ order, user, onChanged }: Props) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    paymentDate: new Date().toISOString().slice(0, 10),
    amountYuan: '',
    exchangeRate: '',
    paymentMethod: 'TRANSFER' as (typeof paymentMethods)[number],
    receiptNumber: '',
    notes: '',
  });
  const [editTarget, setEditTarget] = useState<SupplierPayment | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    paymentDate: '',
    amountYuan: '',
    exchangeRate: '',
    notes: '',
    changeReason: '',
  });
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  const canCreate = canCreateSupplierPayment(user);
  const canEdit = canEditSupplierPayment(user);
  const canVoid = canVoidSupplierPayment(user);
  const payments = order.supplierPayments ?? [];
  const hqReceived = Boolean(order.hqStockMovementCreatedAt);

  function openEdit(payment: SupplierPayment) {
    setEditTarget(payment);
    setEditForm({
      paymentDate: payment.paymentDate.slice(0, 10),
      amountYuan: String(payment.amountYuan),
      exchangeRate: String(payment.exchangeRate),
      notes: payment.notes ?? '',
      changeReason: '',
    });
    setShowConfirm(false);
    setError('');
  }

  function closeEdit() {
    setEditTarget(null);
    setShowConfirm(false);
    setError('');
  }

  function validateEditForm() {
    const amountYuan = Number(editForm.amountYuan);
    const exchangeRate = Number(editForm.exchangeRate);
    if (!amountYuan || amountYuan <= 0) {
      setError(t('procurement.payments.amountRequired'));
      return false;
    }
    if (!exchangeRate || exchangeRate <= 0) {
      setError(t('procurement.payments.exchangeRateRequired'));
      return false;
    }
    if (!editForm.changeReason.trim() || editForm.changeReason.trim().length < 3) {
      setError(t('procurement.payments.changeReasonRequired'));
      return false;
    }
    setError('');
    return true;
  }

  function requestSave() {
    if (!validateEditForm()) return;
    setShowConfirm(true);
  }

  async function saveEdit() {
    if (!editTarget || !validateEditForm()) return;
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/procurement/orders/${order.id}/supplier-payments/${editTarget.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          paymentDate: editForm.paymentDate,
          amountYuan: Number(editForm.amountYuan),
          exchangeRate: Number(editForm.exchangeRate),
          notes: editForm.notes || undefined,
          changeReason: editForm.changeReason.trim(),
        }),
      });
      closeEdit();
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
      setShowConfirm(false);
    } finally {
      setSaving(false);
    }
  }

  async function createPayment() {
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/procurement/orders/${order.id}/supplier-payments`, {
        method: 'POST',
        body: JSON.stringify({
          paymentDate: form.paymentDate,
          amountYuan: Number(form.amountYuan),
          exchangeRate: Number(form.exchangeRate),
          paymentMethod: form.paymentMethod,
          receiptNumber: form.receiptNumber || undefined,
          notes: form.notes || undefined,
        }),
      });
      setShowForm(false);
      setForm({
        paymentDate: new Date().toISOString().slice(0, 10),
        amountYuan: '',
        exchangeRate: '',
        paymentMethod: 'TRANSFER',
        receiptNumber: '',
        notes: '',
      });
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function voidPayment(paymentId: string) {
    if (!window.confirm(t('procurement.payments.confirmVoid'))) return;
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/procurement/orders/${order.id}/supplier-payments/${paymentId}/void`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function uploadReceipt(paymentId: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const token = getToken();
    if (!token) return;
    const formData = new FormData();
    formData.append('file', file);
    setSaving(true);
    setError('');
    try {
      const response = await fetch(
        `${API_URL}/procurement/orders/${order.id}/supplier-payments/${paymentId}/attachments`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || t('common.error'));
      }
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h3 className="text-lg font-bold">{t('procurement.payments.title')}</h3>
        {canCreate ? (
          <button
            type="button"
            onClick={() => setShowForm((current) => !current)}
            className="rounded-xl border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700"
          >
            {t('procurement.payments.addPayment')}
          </button>
        ) : null}
      </div>

      {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      <div className="mb-6 grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <SummaryCard label={t('procurement.payments.totalOrderYuan')} value={`¥${Number(order.totalYuan).toFixed(2)}`} />
        <SummaryCard label={t('procurement.payments.totalPaidYuan')} value={`¥${Number(order.totalPaidYuan ?? 0).toFixed(2)}`} />
        <SummaryCard label={t('procurement.payments.remainingYuan')} value={`¥${Number(order.remainingYuan ?? order.totalYuan).toFixed(2)}`} />
        <SummaryCard label={t('procurement.payments.totalPaidKgs')} value={formatKgs(order.totalPaidKgs ?? 0)} />
        <SummaryCard
          label={t('procurement.payments.weightedAverageRate')}
          value={order.weightedAverageYuanRate ? Number(order.weightedAverageYuanRate).toFixed(4) : '-'}
        />
        <SummaryCard label={t('procurement.payments.paymentStatus')} value={t(`procurement.payments.status.${order.supplierPaymentStatus ?? 'UNPAID'}`)} />
      </div>

      {order.yuanRateLocked ? (
        <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {t('procurement.payments.rateLocked')}
        </p>
      ) : null}

      {showForm && canCreate ? (
        <div className="mb-6 grid gap-4 rounded-2xl bg-slate-50 p-4 md:grid-cols-3">
          <Field label={t('procurement.payments.paymentDate')} type="date" value={form.paymentDate} onChange={(value) => setForm({ ...form, paymentDate: value })} />
          <Field label={t('procurement.payments.amountYuan')} type="number" value={form.amountYuan} onChange={(value) => setForm({ ...form, amountYuan: value })} />
          <Field label={t('procurement.payments.exchangeRate')} type="number" value={form.exchangeRate} onChange={(value) => setForm({ ...form, exchangeRate: value })} />
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">{t('procurement.payments.paymentMethod')}</span>
            <select
              value={form.paymentMethod}
              onChange={(e) => setForm({ ...form, paymentMethod: e.target.value as typeof form.paymentMethod })}
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
            >
              {paymentMethods.map((method) => (
                <option key={method} value={method}>{t(`procurement.payments.method.${method}`)}</option>
              ))}
            </select>
          </label>
          <Field label={t('procurement.payments.receiptNumber')} value={form.receiptNumber} onChange={(value) => setForm({ ...form, receiptNumber: value })} />
          <Field label={t('procurement.payments.notes')} value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />
          <div className="md:col-span-3">
            <button
              type="button"
              disabled={saving}
              onClick={() => void createPayment()}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-blue-300"
            >
              {saving ? t('common.loading') : t('procurement.payments.savePayment')}
            </button>
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">{t('procurement.payments.paymentDate')}</th>
              <th className="px-4 py-3">{t('procurement.payments.amountYuan')}</th>
              <th className="px-4 py-3">{t('procurement.payments.exchangeRate')}</th>
              <th className="px-4 py-3">{t('procurement.payments.amountKgs')}</th>
              <th className="px-4 py-3">{t('procurement.payments.paymentMethod')}</th>
              <th className="px-4 py-3">{t('procurement.payments.receipt')}</th>
              <th className="px-4 py-3">{t('procurement.orders.status')}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {payments.length ? payments.map((payment) => (
              <tr key={payment.id} className={payment.status === 'VOID' ? 'bg-slate-50 text-slate-400' : ''}>
                <td className="px-4 py-3">{new Date(payment.paymentDate).toLocaleDateString()}</td>
                <td className="px-4 py-3">¥{Number(payment.amountYuan).toFixed(2)}</td>
                <td className="px-4 py-3">{Number(payment.exchangeRate).toFixed(4)}</td>
                <td className="px-4 py-3">{formatKgs(payment.amountKgs)}</td>
                <td className="px-4 py-3">{t(`procurement.payments.method.${payment.paymentMethod}`)}</td>
                <td className="px-4 py-3">
                  {payment.attachments?.length ? (
                    <div className="space-y-1">
                      {payment.attachments.map((attachment) => (
                        <a key={attachment.id} href={`${API_URL}${attachment.fileUrl}`} target="_blank" rel="noreferrer" className="block text-blue-700">
                          {attachment.fileName}
                        </a>
                      ))}
                    </div>
                  ) : payment.receiptNumber || '-'}
                </td>
                <td className="px-4 py-3">{payment.status}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {canEdit && payment.status === 'ACTIVE' ? (
                      <button
                        type="button"
                        onClick={() => openEdit(payment)}
                        className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700"
                      >
                        {t('procurement.payments.edit')}
                      </button>
                    ) : null}
                    {canCreate && payment.status === 'ACTIVE' ? (
                      <label className="cursor-pointer rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold">
                        {t('procurement.payments.uploadReceipt')}
                        <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => void uploadReceipt(payment.id, e)} />
                      </label>
                    ) : null}
                    {canVoid && payment.status === 'ACTIVE' ? (
                      <button type="button" onClick={() => void voidPayment(payment.id)} className="rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-700">
                        {t('procurement.payments.voidPayment')}
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            )) : (
              <tr><td className="px-4 py-6 text-slate-500" colSpan={8}>{t('procurement.payments.noPayments')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl">
            <h4 className="text-xl font-bold text-slate-950">{t('procurement.payments.editPayment')}</h4>
            <p className="mt-2 text-sm text-slate-500">
              {t(`procurement.payments.method.${editTarget.paymentMethod}`)} · ¥{Number(editTarget.amountYuan).toFixed(2)}
            </p>

            {!showConfirm ? (
              <div className="mt-5 space-y-4">
                <Field label={t('procurement.payments.paymentDate')} type="date" value={editForm.paymentDate} onChange={(value) => setEditForm({ ...editForm, paymentDate: value })} />
                <Field label={t('procurement.payments.amountYuan')} type="number" value={editForm.amountYuan} onChange={(value) => setEditForm({ ...editForm, amountYuan: value })} />
                <Field label={t('procurement.payments.exchangeRate')} type="number" value={editForm.exchangeRate} onChange={(value) => setEditForm({ ...editForm, exchangeRate: value })} />
                <Field label={t('procurement.payments.notes')} value={editForm.notes} onChange={(value) => setEditForm({ ...editForm, notes: value })} />
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">{t('procurement.payments.changeReason')}</span>
                  <textarea
                    value={editForm.changeReason}
                    onChange={(e) => setEditForm({ ...editForm, changeReason: e.target.value })}
                    placeholder={t('procurement.payments.changeReasonPlaceholder')}
                    className="mt-2 min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <div className="flex justify-end gap-3">
                  <button type="button" onClick={closeEdit} className="rounded-xl border border-slate-300 px-4 py-2 font-semibold text-slate-700">
                    {t('common.cancel')}
                  </button>
                  <button type="button" onClick={requestSave} className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white">
                    {t('procurement.payments.saveChanges')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  {hqReceived
                    ? t('procurement.payments.confirmRateChangeHqReceived')
                    : t('procurement.payments.confirmRateChange')}
                </p>
                <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                  <p>{t('procurement.payments.exchangeRate')}: {Number(editTarget.exchangeRate).toFixed(4)} → {Number(editForm.exchangeRate || 0).toFixed(4)}</p>
                  <p className="mt-1">{t('procurement.payments.amountYuan')}: ¥{Number(editTarget.amountYuan).toFixed(2)} → ¥{Number(editForm.amountYuan || 0).toFixed(2)}</p>
                  <p className="mt-1">{t('procurement.payments.changeReason')}: {editForm.changeReason}</p>
                </div>
                <div className="flex justify-end gap-3">
                  <button type="button" onClick={() => setShowConfirm(false)} className="rounded-xl border border-slate-300 px-4 py-2 font-semibold text-slate-700">
                    {t('common.cancel')}
                  </button>
                  <button type="button" disabled={saving} onClick={() => void saveEdit()} className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white disabled:bg-blue-300">
                    {saving ? t('common.loading') : t('common.confirm')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase text-slate-400">{label}</p>
      <p className="mt-2 text-lg font-bold text-slate-950">{value}</p>
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
        step={type === 'number' ? '0.0001' : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
      />
    </label>
  );
}

function formatKgs(value: number | string | null | undefined) {
  return `${Number(value ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} сом`;
}
