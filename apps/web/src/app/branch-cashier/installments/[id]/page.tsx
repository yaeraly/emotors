'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ProtectedShell } from '@/components/ProtectedShell';
import { useTranslation } from '@/i18n/useTranslation';
import { apiFetch } from '@/lib/api';
import type { BranchAccountantInvoice, BranchPaymentMethod } from '@/lib/types';

const methods: BranchPaymentMethod[] = ['CASH', 'QR', 'BANK', 'TRANSFER'];

export default function BranchCashierInstallmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [invoice, setInvoice] = useState<BranchAccountantInvoice | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<BranchPaymentMethod>('CASH');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function load() {
    try {
      const data = await apiFetch<BranchAccountantInvoice>(`/branch-cashier/installments/${id}`);
      setInvoice(data);
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
        await apiFetch<BranchAccountantInvoice>(`/branch-cashier/installments/${id}/payments`, {
          method: 'POST',
          body: JSON.stringify({
            amount: Number(amount),
            method,
            note: note || undefined,
          }),
        }),
      );
      setAmount('');
      setSuccess(t('sales.installmentPaymentRecorded'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  const retail = invoice?.retailInstallment;

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('branchCashier.installments')}</p>
            <h2 className="text-3xl font-bold">{invoice?.invoiceNumber ?? '—'}</h2>
          </div>
          <Link href="/branch-cashier/installments" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold">
            {t('common.back')}
          </Link>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}
        {invoice ? (
          <>
            <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-3">
              <Info label={t('sales.customer')} value={invoice.customerName ?? '—'} />
              <Info label={t('distribution.totalAmount')} value={formatKgs(invoice.totalAmount)} />
              <Info label={t('sales.paidAmount')} value={formatKgs(invoice.paidAmount)} />
              <Info label={t('sales.installmentRemainingDebt')} value={formatKgs(invoice.remainingAmount)} />
              <Info
                label={t('sales.installmentInitialPayment')}
                value={formatKgs(retail?.initialPayment ?? 0)}
              />
              <Info
                label={t('sales.installmentColDueDate')}
                value={invoice.nextPaymentDate ? new Date(invoice.nextPaymentDate).toLocaleDateString('ru-RU') : '—'}
              />
            </section>

            {invoice.workflowStatus !== 'PAID' && Number(invoice.remainingAmount) > 0 ? (
              <form onSubmit={submitPayment} className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
                <h3 className="md:col-span-2 text-lg font-bold">{t('branchCashier.receivedAmount')}</h3>
                <label className="block md:col-span-2">
                  <span className="text-sm font-semibold">{t('branchCashier.receivedAmount')}</span>
                  <input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    type="number"
                    min="0.01"
                    step="0.01"
                    max={Number(invoice.remainingAmount)}
                    className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
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
