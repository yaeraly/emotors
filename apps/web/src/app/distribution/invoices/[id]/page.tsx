'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import {
  canApproveBranchOrderInstallment,
  canConfirmBranchInvoicePayment,
  canRequestBranchOrderInstallment,
  canSendInvoiceToCashier,
  canSubmitBranchInvoicePayment,
} from '@/lib/rbac';
import type { BranchInvoice, BranchPayment, BranchPaymentMethod, User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

const methods: BranchPaymentMethod[] = ['CASH', 'QR', 'BANK', 'TRANSFER', 'INSTALLMENT', 'BALANCE'];

export default function BranchInvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [invoice, setInvoice] = useState<BranchInvoice | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<BranchPaymentMethod>('CASH');
  const [note, setNote] = useState('');
  const [receiptReference, setReceiptReference] = useState('');
  const [rejectComment, setRejectComment] = useState('');
  const [installmentFirstPayment, setInstallmentFirstPayment] = useState('');
  const [installmentMonths, setInstallmentMonths] = useState('3');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function load() {
    try {
      const [invoiceData, me] = await Promise.all([
        apiFetch<BranchInvoice>(`/distribution/invoices/${id}`),
        apiFetch<User>('/auth/me'),
      ]);
      setInvoice(invoiceData);
      setCurrentUser(me);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess('');
    try {
      setInvoice(
        await apiFetch<BranchInvoice>(`/distribution/invoices/${id}/payments`, {
          method: 'POST',
          body: JSON.stringify({
            amount: Number(amount),
            method,
            note,
            receiptReference: receiptReference || undefined,
          }),
        }),
      );
      setAmount('');
      setNote('');
      setReceiptReference('');
      setSuccess(
        canSubmitBranchInvoicePayment(currentUser) && !canConfirmBranchInvoicePayment(currentUser)
          ? t('distribution.paymentSubmittedAuto')
          : t('distribution.paymentAdded'),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function confirmPayment(payment: BranchPayment) {
    setError('');
    setSuccess('');
    try {
      setInvoice(
        await apiFetch<BranchInvoice>(`/distribution/invoices/${id}/payments/${payment.id}/confirm`, {
          method: 'POST',
        }),
      );
      setSuccess(t('distribution.paymentConfirmed'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function rejectPayment(payment: BranchPayment) {
    if (!rejectComment.trim()) {
      setError(t('distribution.rejectionCommentRequired'));
      return;
    }
    setError('');
    setSuccess('');
    try {
      setInvoice(
        await apiFetch<BranchInvoice>(`/distribution/invoices/${id}/payments/${payment.id}/reject`, {
          method: 'POST',
          body: JSON.stringify({ comment: rejectComment.trim() }),
        }),
      );
      setRejectComment('');
      setSuccess(t('distribution.paymentRejected'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function requestInstallment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess('');
    try {
      setInvoice(
        await apiFetch<BranchInvoice>(`/distribution/invoices/${id}/installment`, {
          method: 'POST',
          body: JSON.stringify({
            firstPaymentAmount: Number(installmentFirstPayment),
            termMonths: Number(installmentMonths),
          }),
        }),
      );
      setSuccess(t('distribution.installmentRequested'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function approveInstallment() {
    setError('');
    setSuccess('');
    try {
      setInvoice(await apiFetch<BranchInvoice>(`/distribution/invoices/${id}/installment/approve`, { method: 'POST' }));
      setSuccess(t('distribution.installmentApproved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function sendToCashier() {
    setError('');
    setSuccess('');
    try {
      setInvoice(await apiFetch<BranchInvoice>(`/distribution/invoices/${id}/send-to-cashier`, { method: 'POST' }));
      setSuccess(t('distribution.sentToCashier'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  const canSubmitPayment = canSubmitBranchInvoicePayment(currentUser);
  const canConfirmPayment = canConfirmBranchInvoicePayment(currentUser);
  const canRequestInstallment = canRequestBranchOrderInstallment(currentUser);
  const canApproveInstallment = canApproveBranchOrderInstallment(currentUser);
  const canHandoffToCashier = canSendInvoiceToCashier(currentUser);
  const pendingPayment = invoice?.payments?.find((payment) => payment.confirmationStatus === 'PENDING_CONFIRMATION');
  const waitingForCashier = Boolean(invoice?.sentToBranchAt && !invoice?.sentToCashierAt);

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('distribution.invoice')}</p>
          <h2 className="text-3xl font-bold">{invoice?.invoiceNumber ?? '-'}</h2>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}
        {invoice ? (
          <>
            <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-4">
              <Info label={t('distribution.branch')} value={invoice.branch?.name ?? ''} />
              <Info label={t('distribution.totalAmount')} value={formatKgs(invoice.totalAmount)} />
              <Info label={t('distribution.paidAmount')} value={formatKgs(invoice.paidAmount)} />
              <Info label={t('distribution.debtAmount')} value={formatKgs(invoice.debtAmount)} />
              <Info label={t('distribution.status')} value={invoice.status} />
              <Info label={t('distribution.dueDate')} value={new Date(invoice.dueDate).toLocaleDateString()} />
              <Info label={t('distribution.issuedAt')} value={new Date(invoice.issuedAt).toLocaleDateString()} />
            </section>

            {canHandoffToCashier && waitingForCashier ? (
              <section className="rounded-3xl border border-blue-200 bg-blue-50 p-6 shadow-sm">
                <h3 className="text-lg font-bold">{t('distribution.accountantReview')}</h3>
                <p className="mt-2 text-sm text-slate-700">{t('distribution.accountantReviewHint')}</p>
                <button
                  className="mt-4 rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white"
                  type="button"
                  onClick={() => void sendToCashier()}
                >
                  {t('distribution.sendToCashier')}
                </button>
              </section>
            ) : null}

            {canSubmitPayment && invoice.sentToCashierAt && Number(invoice.debtAmount) > 0 ? (
              <form onSubmit={submitPayment} className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
                <h3 className="md:col-span-2 text-lg font-bold">{t('distribution.cashierPayment')}</h3>
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">{t('distribution.paidAmount')}</span>
                  <input value={amount} onChange={(event) => setAmount(event.target.value)} type="number" min="0.01" step="0.01" className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" required />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">{t('distribution.paymentMethod')}</span>
                  <select value={method} onChange={(event) => setMethod(event.target.value as BranchPaymentMethod)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2">
                    {methods.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">{t('distribution.receiptReference')}</span>
                  <input value={receiptReference} onChange={(event) => setReceiptReference(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">{t('crm.notes')}</span>
                  <input value={note} onChange={(event) => setNote(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" />
                </label>
                <button className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white md:col-span-2" type="submit">
                  {t('distribution.submitPaymentCashier')}
                </button>
              </form>
            ) : null}

            {canConfirmPayment && pendingPayment ? (
              <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
                <h3 className="text-lg font-bold">{t('distribution.pendingPaymentReview')}</h3>
                <p className="mt-2 text-sm">
                  {formatKgs(pendingPayment.amount)} · {pendingPayment.method}
                  {pendingPayment.receiptReference ? ` · ${pendingPayment.receiptReference}` : ''}
                </p>
                <label className="mt-4 block">
                  <span className="text-sm font-semibold text-slate-700">{t('distribution.rejectionComment')}</span>
                  <input value={rejectComment} onChange={(event) => setRejectComment(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" />
                </label>
                <div className="mt-4 flex gap-3">
                  <button className="rounded-xl bg-green-600 px-4 py-2 font-semibold text-white" type="button" onClick={() => void confirmPayment(pendingPayment)}>
                    {t('distribution.confirmPayment')}
                  </button>
                  <button className="rounded-xl bg-red-600 px-4 py-2 font-semibold text-white" type="button" onClick={() => void rejectPayment(pendingPayment)}>
                    {t('distribution.rejectPayment')}
                  </button>
                </div>
              </section>
            ) : null}

            {canRequestInstallment && !invoice.branchOrderInstallment && waitingForCashier ? (
              <form onSubmit={requestInstallment} className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-3">
                <h3 className="md:col-span-3 text-lg font-bold">{t('distribution.requestInstallment')}</h3>
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">{t('distribution.firstPaymentAmount')}</span>
                  <input value={installmentFirstPayment} onChange={(event) => setInstallmentFirstPayment(event.target.value)} type="number" min="0" step="0.01" className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" required />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">{t('distribution.installmentMonths')}</span>
                  <input value={installmentMonths} onChange={(event) => setInstallmentMonths(event.target.value)} type="number" min="1" className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" required />
                </label>
                <button className="rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white" type="submit">
                  {t('distribution.requestInstallment')}
                </button>
              </form>
            ) : null}

            {canApproveInstallment && invoice.branchOrderInstallment?.status === 'PENDING' ? (
              <section className="rounded-3xl border border-indigo-200 bg-indigo-50 p-6 shadow-sm">
                <h3 className="text-lg font-bold">{t('distribution.installmentApproval')}</h3>
                <p className="mt-2 text-sm">
                  {formatKgs(invoice.branchOrderInstallment.firstPaymentAmount)} / {invoice.branchOrderInstallment.termMonths} {t('distribution.months')}
                </p>
                <button className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 font-semibold text-white" type="button" onClick={() => void approveInstallment()}>
                  {t('distribution.approveInstallment')}
                </button>
              </section>
            ) : null}

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-bold">{t('sales.paymentHistory')}</h3>
              <div className="mt-4 space-y-3">
                {invoice.payments?.map((payment) => (
                  <div key={payment.id} className="rounded-2xl bg-slate-50 p-4 text-sm">
                    <p className="font-bold">
                      {formatKgs(payment.amount)} · {payment.method}
                      {payment.confirmationStatus ? ` · ${payment.confirmationStatus}` : ''}
                    </p>
                    <p>{new Date(payment.paidAt).toLocaleString()}</p>
                    {payment.receiptReference ? <p>{payment.receiptReference}</p> : null}
                    <p>{payment.note}</p>
                  </div>
                ))}
              </div>
            </section>
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
