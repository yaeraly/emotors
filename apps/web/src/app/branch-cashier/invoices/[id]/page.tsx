'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ProtectedShell } from '@/components/ProtectedShell';
import { useTranslation } from '@/i18n/useTranslation';
import { apiFetch } from '@/lib/api';
import { translateStatus } from '@/lib/translate-status';
import type { BranchAccountantInvoice, BranchPaymentMethod } from '@/lib/types';

const methods: BranchPaymentMethod[] = ['CASH', 'QR', 'BANK', 'TRANSFER'];

export default function BranchCashierInvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [invoice, setInvoice] = useState<BranchAccountantInvoice | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<BranchPaymentMethod>('CASH');
  const [receiptReference, setReceiptReference] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function load() {
    try {
      const data = await apiFetch<BranchAccountantInvoice>(`/branch-cashier/invoices/${id}`);
      setInvoice(data);
      setAmount(String(data.requiredPaymentAmount ?? data.remainingAmount));
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
        await apiFetch<BranchAccountantInvoice>(`/branch-cashier/invoices/${id}/payments`, {
          method: 'POST',
          body: JSON.stringify({
            amount: Number(amount),
            method,
            note,
            receiptReference: receiptReference || undefined,
          }),
        }),
      );
      setSuccess(t('distribution.paymentSubmittedAuto'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  const early = invoice?.activeEarlyPaymentRequest ?? null;
  const amountLocked = Boolean(early);

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('branchCashier.invoicesToPay')}</p>
            <h2 className="text-3xl font-bold">{invoice?.invoiceNumber ?? '—'}</h2>
          </div>
          <Link href="/branch-cashier/invoices" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold">
            {t('common.back')}
          </Link>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}
        {invoice ? (
          <>
            <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-3">
              <Info label={t('branchAccountant.orderNo')} value={invoice.orderNumber ?? '—'} />
              <Info label={t('distribution.totalAmount')} value={formatKgs(invoice.totalAmount)} />
              <Info label={t('branchCashier.requiredPayment')} value={formatKgs(invoice.requiredPaymentAmount)} />
              <Info label={t('distribution.debtAmount')} value={formatKgs(invoice.remainingAmount)} />
              <Info label={t('distribution.dueDate')} value={new Date(invoice.dueDate).toLocaleDateString()} />
              <Info label={t('distribution.status')} value={translateStatus(t, invoice.workflowStatus, 'branchAccountant')} />
            </section>

            {early ? (
              <section className="grid gap-4 rounded-3xl border border-indigo-200 bg-indigo-50 p-6 shadow-sm md:grid-cols-3">
                <Info label={t('branchCashier.installmentId')} value={early.installmentId ?? invoice.branchOrderInstallment?.id ?? '—'} />
                <Info label={t('branchCashier.approvedAmount')} value={formatKgs(early.approvedAmount ?? early.requestedAmount)} />
                <Info
                  label={t('branchCashier.paymentPurpose')}
                  value={t(`branchAccountant.earlyPaymentType.${early.paymentType}`)}
                />
                <Info label={t('branchCashier.cashbox')} value={early.financeAccount?.name ?? '—'} />
                <Info
                  label={t('branchCashier.branchCeoApprovedBy')}
                  value={early.branchCeoApprovedBy?.fullName ?? '—'}
                />
                <Info
                  label={t('branchCashier.branchCeoApprovedAt')}
                  value={early.branchCeoApprovedAt ? new Date(early.branchCeoApprovedAt).toLocaleString() : '—'}
                />
                <Info label={t('branchCashier.sentByAccountant')} value={early.sentToCashierBy?.fullName ?? '—'} />
                <Info
                  label={t('branchCashier.sentAt')}
                  value={early.sentToCashierAt ? new Date(early.sentToCashierAt).toLocaleString() : '—'}
                />
                <Info
                  label={t('branchCashier.expectedDebtAfter')}
                  value={formatKgs(early.expectedRemainingDebtAfterPayment ?? Math.max(invoice.remainingAmount - invoice.requiredPaymentAmount, 0))}
                />
              </section>
            ) : null}

            {invoice.workflowStatus !== 'PAID' ? (
              <form onSubmit={submitPayment} className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
                <h3 className="md:col-span-2 text-lg font-bold">{t('distribution.cashierPayment')}</h3>
                <label className="block">
                  <span className="text-sm font-semibold">{t('distribution.paidAmount')}</span>
                  <input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    type="number"
                    min="0.01"
                    step="0.01"
                    readOnly={amountLocked}
                    className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 read-only:bg-slate-50"
                    required
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold">{t('distribution.paymentMethod')}</span>
                  <select value={method} onChange={(e) => setMethod(e.target.value as BranchPaymentMethod)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2">
                    {methods.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm font-semibold">{t('distribution.receiptReference')}</span>
                  <input value={receiptReference} onChange={(e) => setReceiptReference(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold">{t('crm.notes')}</span>
                  <input value={note} onChange={(e) => setNote(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" />
                </label>
                <button type="submit" className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white md:col-span-2">
                  {t('distribution.submitPaymentCashier')}
                </button>
              </form>
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
