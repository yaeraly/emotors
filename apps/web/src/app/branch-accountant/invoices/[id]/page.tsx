'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ProtectedShell } from '@/components/ProtectedShell';
import { useTranslation } from '@/i18n/useTranslation';
import { apiFetch } from '@/lib/api';
import {
  buildBranchOrderInstallmentSchedulePreview,
  computeBranchOrderRemainingDebt,
} from '@/lib/branch-order-installment';
import { translateStatus } from '@/lib/translate-status';
import type { BranchAccountantInvoice } from '@/lib/types';

export default function BranchAccountantInvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [invoice, setInvoice] = useState<BranchAccountantInvoice | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [installmentFirstPayment, setInstallmentFirstPayment] = useState('0');
  const [installmentTermMonths, setInstallmentTermMonths] = useState('3');
  const [installmentDueDate, setInstallmentDueDate] = useState('');
  const [installmentComment, setInstallmentComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    try {
      setInvoice(await apiFetch<BranchAccountantInvoice>(`/branch-accountant/invoices/${id}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const installmentPreview = useMemo(() => {
    if (!invoice) return null;
    const totalAmount = Number(invoice.totalAmount);
    const firstPaymentRaw = installmentFirstPayment.trim();
    const firstPaymentAmount = firstPaymentRaw === '' ? 0 : Number(firstPaymentRaw);
    if (!Number.isFinite(firstPaymentAmount) || firstPaymentAmount < 0) return null;
    const remainingDebt = computeBranchOrderRemainingDebt(totalAmount, firstPaymentAmount);
    const termMonths = Math.max(1, Number(installmentTermMonths) || 1);
    return {
      totalAmount,
      firstPaymentAmount,
      remainingDebt,
      termMonths,
      schedule: buildBranchOrderInstallmentSchedulePreview(remainingDebt, termMonths),
    };
  }, [invoice, installmentFirstPayment, installmentTermMonths]);

  async function selectFullPayment() {
    setError('');
    setSuccess('');
    try {
      setInvoice(
        await apiFetch<BranchAccountantInvoice>(`/branch-accountant/invoices/${id}/select-payment-type`, {
          method: 'POST',
          body: JSON.stringify({ paymentType: 'FULL_PAYMENT' }),
        }),
      );
      setSuccess(t('branchAccountant.fullPaymentSelected'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function requestInstallment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!installmentPreview) return;
    setError('');
    setSuccess('');
    setSubmitting(true);
    try {
      setInvoice(
        await apiFetch<BranchAccountantInvoice>(`/branch-accountant/invoices/${id}/installment-request`, {
          method: 'POST',
          body: JSON.stringify({
            firstPaymentAmount: installmentPreview.firstPaymentAmount,
            termMonths: installmentPreview.termMonths,
            dueDate: installmentDueDate || undefined,
            comment: installmentComment || undefined,
          }),
        }),
      );
      setSuccess(t('branchAccountant.installmentRequested'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSubmitting(false);
    }
  }

  async function sendToCashier() {
    setError('');
    setSuccess('');
    try {
      setInvoice(await apiFetch<BranchAccountantInvoice>(`/branch-accountant/invoices/${id}/send-to-cashier`, { method: 'POST' }));
      setSuccess(t('distribution.sentToCashier'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  const canReview = invoice?.workflowStatus === 'PENDING_ACCOUNTANT_REVIEW';
  const installmentPending = invoice?.branchOrderInstallment?.status === 'PENDING';
  const installmentApproved = invoice?.branchOrderInstallment?.status === 'APPROVED';

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('branchAccountant.invoicesToPay')}</p>
            <h2 className="text-3xl font-bold">{invoice?.invoiceNumber ?? '—'}</h2>
          </div>
          <Link href="/branch-accountant/invoices" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold">
            {t('common.back')}
          </Link>
        </div>

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}

        {invoice ? (
          <>
            <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-4">
              <Info label={t('distribution.branch')} value={invoice.branch?.name ?? ''} />
              <Info label={t('branchAccountant.orderNo')} value={invoice.orderNumber ?? invoice.branchPurchaseRequestNumber ?? '—'} />
              <Info label={t('branchAccountant.date')} value={new Date(invoice.issuedAt).toLocaleDateString()} />
              <Info label={t('distribution.status')} value={translateStatus(t, invoice.workflowStatus, 'branchAccountant')} />
              <Info label={t('branchAccountant.paymentType')} value={invoice.paymentType ? t(`branchAccountant.paymentType.${invoice.paymentType}`) : '—'} />
              <Info label={t('distribution.totalAmount')} value={formatKgs(invoice.totalAmount)} />
              <Info label={t('distribution.paidAmount')} value={formatKgs(invoice.paidAmount)} />
              <Info label={t('distribution.debtAmount')} value={formatKgs(invoice.remainingAmount)} />
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-bold">{t('branchAccountant.products')}</h3>
              <table className="mt-4 min-w-full divide-y divide-slate-200 text-sm">
                <thead className="text-left text-xs font-bold uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">{t('inventory.product')}</th>
                    <th className="px-3 py-2">{t('inventory.sku')}</th>
                    <th className="px-3 py-2">{t('branchAccountant.quantity')}</th>
                    <th className="px-3 py-2">{t('branchAccountant.price')}</th>
                    <th className="px-3 py-2">{t('branchAccountant.lineTotal')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoice.items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2">{item.productName}</td>
                      <td className="px-3 py-2">{item.sku}</td>
                      <td className="px-3 py-2">{item.quantity}</td>
                      <td className="px-3 py-2">{formatKgs(item.unitPrice)}</td>
                      <td className="px-3 py-2 font-semibold">{formatKgs(item.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {canReview ? (
              <section className="grid gap-4 rounded-3xl border border-blue-200 bg-blue-50 p-6 shadow-sm md:grid-cols-2">
                <div>
                  <h3 className="text-lg font-bold">{t('branchAccountant.choosePaymentType')}</h3>
                  <p className="mt-2 text-sm text-slate-700">{t('branchAccountant.choosePaymentTypeHint')}</p>
                  <button type="button" onClick={() => void selectFullPayment()} className="mt-4 rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white">
                    {t('branchAccountant.fullPayment')}
                  </button>
                </div>
                <form onSubmit={requestInstallment} className="space-y-3 rounded-2xl bg-white p-4">
                  <h4 className="font-bold">{t('branchAccountant.installmentPayment')}</h4>
                  <label className="block text-sm">
                    <span className="font-semibold">{t('distribution.firstPaymentAmount')}</span>
                    <input
                      value={installmentFirstPayment}
                      onChange={(e) => setInstallmentFirstPayment(e.target.value)}
                      type="number"
                      min="0"
                      step="0.01"
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                      required
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="font-semibold">{t('distribution.installmentMonths')}</span>
                    <input
                      value={installmentTermMonths}
                      onChange={(e) => setInstallmentTermMonths(e.target.value)}
                      type="number"
                      min="1"
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                      required
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="font-semibold">{t('distribution.dueDate')}</span>
                    <input value={installmentDueDate} onChange={(e) => setInstallmentDueDate(e.target.value)} type="date" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" />
                  </label>
                  <label className="block text-sm">
                    <span className="font-semibold">{t('crm.notes')}</span>
                    <input value={installmentComment} onChange={(e) => setInstallmentComment(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" />
                  </label>
                  {installmentPreview ? (
                    <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                      <p>{t('distribution.totalAmount')}: {formatKgs(installmentPreview.totalAmount)}</p>
                      <p>{t('distribution.firstPaymentAmount')}: {formatKgs(installmentPreview.firstPaymentAmount)}</p>
                      <p>{t('sales.installmentFinancedAmount')}: {formatKgs(installmentPreview.remainingDebt)}</p>
                      <p>{t('finance.cashierBills.remainingDebt')}: {formatKgs(installmentPreview.remainingDebt)}</p>
                      <p>{t('distribution.installmentMonths')}: {installmentPreview.termMonths}</p>
                      <div className="mt-2">
                        <p className="font-semibold">{t('branchAccountant.paymentSchedule')}</p>
                        {installmentPreview.schedule.map((row) => (
                          <p key={row.installmentNumber}>
                            #{row.installmentNumber}: {formatKgs(row.amount)}
                          </p>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <button type="submit" disabled={submitting} className="rounded-xl bg-indigo-600 px-4 py-2 font-semibold text-white disabled:opacity-60">
                    {t('distribution.requestInstallment')}
                  </button>
                </form>
              </section>
            ) : null}

            {installmentPending ? (
              <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{t('branchAccountant.installmentPendingCeo')}</p>
            ) : null}

            {installmentApproved && invoice.branchOrderInstallment ? (
              <section className="rounded-3xl border border-green-200 bg-green-50 p-6 shadow-sm space-y-2">
                <h3 className="font-bold">{t('branchAccountant.installmentApproved')}</h3>
                <p className="text-sm">
                  {t('distribution.firstPaymentAmount')}: {formatKgs(invoice.branchOrderInstallment.firstPaymentAmount)} ·{' '}
                  {t('finance.cashierBills.remainingDebt')}: {formatKgs(invoice.branchOrderInstallment.remainingDebt ?? invoice.remainingAmount)} ·{' '}
                  {invoice.branchOrderInstallment.termMonths} {t('distribution.months')}
                </p>
                {invoice.branchOrderInstallment.paymentSchedule?.length ? (
                  <div className="text-sm">
                    <p className="font-semibold">{t('branchAccountant.paymentSchedule')}</p>
                    {invoice.branchOrderInstallment.paymentSchedule.map((row) => (
                      <p key={row.installmentNumber}>
                        #{row.installmentNumber}: {formatKgs(row.amount)} · {new Date(row.dueDate).toLocaleDateString()}
                      </p>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : null}

            {invoice.branchOrderInstallment?.status === 'REJECTED' ? (
              <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                {t('sales.installmentRejectionReason')}: {invoice.branchOrderInstallment.rejectionComment ?? '—'}
              </p>
            ) : null}

            {(invoice?.paymentType && !invoice.sentToCashierAt && invoice.branchOrderInstallment?.status !== 'PENDING') ? (
              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <button type="button" onClick={() => void sendToCashier()} className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white">
                  {t('distribution.sendToCashier')}
                </button>
              </section>
            ) : null}
          </>
        ) : null}
      </section>
    </ProtectedShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase text-slate-400">{label}</p>
      <p className="font-bold text-slate-950">{value}</p>
    </div>
  );
}

function formatKgs(value: number | string | null | undefined) {
  return `${Number(value ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} сом`;
}
