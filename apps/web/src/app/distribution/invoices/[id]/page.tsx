'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { canRecordDistributionPayment } from '@/lib/rbac';
import type { BranchInvoice, BranchPaymentMethod, User } from '@/lib/types';
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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess('');
    try {
      setInvoice(await apiFetch<BranchInvoice>(`/distribution/invoices/${id}/payments`, { method: 'POST', body: JSON.stringify({ amount: Number(amount), method, note }) }));
      setAmount('');
      setNote('');
      setSuccess(t('distribution.paymentAdded'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  const canPay = canRecordDistributionPayment(currentUser);

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('distribution.invoice')}</p><h2 className="text-3xl font-bold">{invoice?.invoiceNumber ?? '-'}</h2></div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}
        {invoice ? <>
          <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-4">
            <Info label={t('distribution.branch')} value={invoice.branch?.name ?? ''} />
            <Info label={t('distribution.totalAmount')} value={formatKgs(invoice.totalAmount)} />
            <Info label={t('distribution.paidAmount')} value={formatKgs(invoice.paidAmount)} />
            <Info label={t('distribution.debtAmount')} value={formatKgs(invoice.debtAmount)} />
            <Info label={t('distribution.status')} value={invoice.status} />
            <Info label={t('distribution.dueDate')} value={new Date(invoice.dueDate).toLocaleDateString()} />
            <Info label={t('distribution.issuedAt')} value={new Date(invoice.issuedAt).toLocaleDateString()} />
          </section>
          {canPay ? (
          <form onSubmit={submit} className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-4">
            <label className="block"><span className="text-sm font-semibold text-slate-700">{t('distribution.paidAmount')}</span><input value={amount} onChange={(event) => setAmount(event.target.value)} type="number" min="0.01" step="0.01" className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" required /></label>
            <label className="block"><span className="text-sm font-semibold text-slate-700">{t('distribution.paymentMethod')}</span><select value={method} onChange={(event) => setMethod(event.target.value as BranchPaymentMethod)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2">{methods.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label className="block"><span className="text-sm font-semibold text-slate-700">{t('crm.notes')}</span><input value={note} onChange={(event) => setNote(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
            <button className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white" type="submit">{t('distribution.addPayment')}</button>
          </form>
          ) : null}
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold">{t('sales.paymentHistory')}</h3>
            <div className="mt-4 space-y-3">{invoice.payments?.map((payment) => <div key={payment.id} className="rounded-2xl bg-slate-50 p-4 text-sm"><p className="font-bold">{formatKgs(payment.amount)} · {payment.method}</p><p>{new Date(payment.paidAt).toLocaleString()}</p><p>{payment.note}</p></div>)}</div>
          </section>
        </> : null}
      </section>
    </ProtectedShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase text-slate-400">{label}</p><p className="font-bold text-slate-950">{value}</p></div>;
}
function formatKgs(value: number | string | null | undefined) {
  return `${Number(value ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} сом`;
}
