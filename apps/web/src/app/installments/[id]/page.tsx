'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { SALE_PAYMENT_METHODS, formatPaymentMethodLabel } from '@/lib/sale-payment-methods';
import type { PaymentMethod, SaleInstallmentApproval } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';
import { installmentStatusLabelKey } from '@/lib/sale-installment';

type InstallmentDetail = SaleInstallmentApproval & {
  sale: {
    id: string;
    receiptNumber: string;
    totalAmount: number;
    customer: { fullName: string; phone: string };
    seller?: { fullName: string };
  };
  manager?: { fullName: string } | null;
  paymentHistory: Array<{
    id: string;
    amount: number;
    method: PaymentMethod;
    note?: string | null;
    paidAfterTotal: number;
    remainingAfter: number;
    createdAt: string;
    createdBy?: { fullName: string };
  }>;
};

function formatKgs(value: number) {
  return `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} KGS`;
}

export default function InstallmentDetailPage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const [installment, setInstallment] = useState<InstallmentDetail | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod | ''>('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function loadInstallment() {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<InstallmentDetail>(`/sales/installments/${params.id}`);
      setInstallment(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadInstallment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function receivePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      if (!method) {
        setError(t('sales.paymentMethodRequired'));
        return;
      }
      await apiFetch(`/sales/installments/${params.id}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(amount),
          method,
          note: note.trim() || undefined,
        }),
      });
      setAmount('');
      setNote('');
      setSuccess(t('sales.installmentPaymentRecorded'));
      await loadInstallment();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  const statusKey = installmentStatusLabelKey(installment?.status);
  const remaining = installment?.remainingDebt ?? installment?.financedAmount ?? 0;
  const paid = installment?.paidAmount ?? installment?.installmentPaidAmount ?? 0;
  const total = installment?.totalAmount ?? 0;
  const down = installment?.downPayment ?? installment?.initialPayment ?? 0;
  const progress = total > 0 ? Math.min((paid / total) * 100, 100) : 0;

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <Link href="/installments" className="text-sm font-semibold text-blue-700 hover:text-blue-800">
          {t('nav.installments')}
        </Link>

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {success ? (
          <p className="rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">{success}</p>
        ) : null}

        {loading || !installment ? (
          <p className="rounded-3xl border border-slate-200 bg-white p-8 text-slate-500 shadow-sm">
            {t('common.loading')}
          </p>
        ) : (
          <>
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col justify-between gap-4 md:flex-row">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">
                    {installment.installmentNumber ?? installment.requestNumber}
                  </p>
                  <h2 className="text-3xl font-bold text-slate-950">{installment.sale.customer.fullName}</h2>
                  <p className="mt-2 text-slate-600">{installment.sale.customer.phone}</p>
                </div>
                <span className="h-fit rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700">
                  {statusKey ? t(statusKey) : installment.status}
                </span>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
                <Metric label={t('sales.receipt')} value={installment.sale.receiptNumber} />
                <Metric label={t('sales.seller')} value={installment.manager?.fullName ?? installment.sale.seller?.fullName ?? '—'} />
                <Metric label={t('sales.totalAmount')} value={formatKgs(total)} />
                <Metric label={t('sales.downPayment')} value={formatKgs(down)} />
                <Metric label={t('sales.paidAmount')} value={formatKgs(paid)} />
                <Metric label={t('sales.installmentFinancedAmount')} value={formatKgs(remaining)} />
              </div>

              <div className="mt-6">
                <div className="mb-2 flex justify-between text-sm font-semibold text-slate-600">
                  <span>{t('sales.installmentProgress')}</span>
                  <span>{progress.toFixed(0)}%</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-blue-600" style={{ width: `${progress}%` }} />
                </div>
              </div>

              {installment.dueDate ? (
                <p className="mt-4 text-sm text-slate-600">
                  {t('sales.finalPaymentDate')}: {new Date(installment.dueDate).toLocaleDateString()}
                </p>
              ) : null}
              {installment.notes ? (
                <p className="mt-2 text-sm text-slate-600">
                  {t('sales.installmentComment')}: {installment.notes}
                </p>
              ) : null}
            </div>

            {installment.status === 'ACTIVE' ? (
              <form
                onSubmit={receivePayment}
                className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <h3 className="text-lg font-bold text-slate-950">{t('sales.receiveInstallmentPayment')}</h3>
                <p className="mt-2 text-sm text-slate-600">
                  {t('sales.installmentFinancedAmount')}: {formatKgs(remaining)}
                </p>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <label className="block">
                    <span className="text-sm font-semibold text-slate-700">{t('sales.paidAmount')}</span>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      max={remaining}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      required
                      className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-semibold text-slate-700">{t('sales.paymentMethod')}</span>
                    <select
                      value={method}
                      onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                      required
                      className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                    >
                      <option value="">{t('sales.paymentMethodRequired')}</option>
                      {SALE_PAYMENT_METHODS.map((item) => (
                        <option key={item} value={item}>
                          {formatPaymentMethodLabel(item, t)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-sm font-semibold text-slate-700">{t('crm.notes')}</span>
                    <input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                    />
                  </label>
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="mt-4 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? t('common.loading') : t('sales.receiveInstallmentPayment')}
                </button>
              </form>
            ) : null}

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-bold text-slate-950">{t('sales.installmentPaymentHistory')}</h3>
              {installment.paymentHistory?.length ? (
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-bold uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2">{t('common.date')}</th>
                        <th className="px-3 py-2">{t('sales.paidAmount')}</th>
                        <th className="px-3 py-2">{t('sales.paymentMethod')}</th>
                        <th className="px-3 py-2">{t('sales.seller')}</th>
                        <th className="px-3 py-2">{t('crm.notes')}</th>
                        <th className="px-3 py-2">{t('sales.paidAfter')}</th>
                        <th className="px-3 py-2">{t('sales.remainingAfter')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {installment.paymentHistory.map((payment) => (
                        <tr key={payment.id} className="border-t border-slate-100">
                          <td className="px-3 py-2">{new Date(payment.createdAt).toLocaleString()}</td>
                          <td className="px-3 py-2">{formatKgs(payment.amount)}</td>
                          <td className="px-3 py-2">{formatPaymentMethodLabel(payment.method, t)}</td>
                          <td className="px-3 py-2">{payment.createdBy?.fullName ?? '—'}</td>
                          <td className="px-3 py-2">{payment.note ?? '—'}</td>
                          <td className="px-3 py-2">{formatKgs(payment.paidAfterTotal)}</td>
                          <td className="px-3 py-2">{formatKgs(payment.remainingAfter)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-500">{t('sales.noInstallmentPayments')}</p>
              )}
            </div>
          </>
        )}
      </section>
    </ProtectedShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase text-slate-400">{label}</p>
      <p className="mt-1 font-bold text-slate-900">{value}</p>
    </div>
  );
}
