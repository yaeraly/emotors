'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ProtectedShell } from '@/components/ProtectedShell';
import { useTranslation } from '@/i18n/useTranslation';
import { apiFetch } from '@/lib/api';
import { computeFullPaymentChange } from '@/lib/sale-full-payment';
import type { BranchAccountantInvoice, BranchPaymentMethod, FinanceAccount } from '@/lib/types';

const methods: BranchPaymentMethod[] = ['CASH', 'QR', 'BANK', 'TRANSFER'];

export default function BranchCashierInstallmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [invoice, setInvoice] = useState<BranchAccountantInvoice | null>(null);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<BranchPaymentMethod>('CASH');
  const [financeAccountId, setFinanceAccountId] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const idempotencyKeyRef = useRef<string | null>(null);

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === financeAccountId) ?? null,
    [accounts, financeAccountId],
  );

  async function loadAccounts(paymentMethod: BranchPaymentMethod) {
    const accountData = await apiFetch<FinanceAccount[]>(
      `/branch-cashier/accounts?paymentMethod=${paymentMethod}`,
    );
    setAccounts(accountData);
    if (accountData.some((account) => account.id === financeAccountId)) {
      return;
    }
    if (accountData.length === 1) {
      setFinanceAccountId(accountData[0].id);
    } else {
      setFinanceAccountId('');
    }
  }

  async function load() {
    try {
      const invoiceData = await apiFetch<BranchAccountantInvoice>(`/branch-cashier/installments/${id}`);
      setInvoice(invoiceData);
      await loadAccounts(method);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    void loadAccounts(method).catch((err) => {
      setError(err instanceof Error ? err.message : t('common.error'));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method]);

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError('');
    setSuccess('');
    if (!financeAccountId) {
      setError(t('branchCashier.selectAccount'));
      return;
    }
    try {
      setSubmitting(true);
      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = crypto.randomUUID();
      }
      const received = Number(amount || 0);
      const remaining = Number(invoice?.remainingAmount ?? 0);
      const change = computeFullPaymentChange(remaining, received).changeAmount;

      const updated = await apiFetch<BranchAccountantInvoice>(`/branch-cashier/installments/${id}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          amount: received,
          receivedAmount: received,
          changeAmount: change > 0.009 ? change : undefined,
          method,
          financeAccountId,
          note: note || undefined,
          idempotencyKey: idempotencyKeyRef.current,
        }),
      });
      setInvoice(updated);
      setAmount('');
      idempotencyKeyRef.current = null;
      await loadAccounts(method);
      setSuccess(
        Number(updated.remainingAmount) <= 0.009
          ? t('branchCashier.paymentAcceptedClosed')
          : t('branchCashier.paymentAcceptedPartial'),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSubmitting(false);
    }
  }

  const retail = invoice?.retailInstallment;
  const remainingAmount = Number(invoice?.remainingAmount ?? 0);
  const receivedAmount = Number(amount || 0);
  const changePreview =
    receivedAmount > 0
      ? computeFullPaymentChange(remainingAmount, receivedAmount)
      : null;

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
              <Info label={t('branchCashier.invoicesToPay')} value={invoice.invoiceNumber} />
              <Info label={t('sales.customer')} value={invoice.customerName ?? '—'} />
              <Info label={t('distribution.totalAmount')} value={formatKgs(invoice.totalAmount)} />
              <Info label={t('branchCashier.paidPreviously')} value={formatKgs(invoice.paidAmount)} />
              <Info label={t('branchCashier.remainingDebt')} value={formatKgs(invoice.remainingAmount)} />
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
                {changePreview && changePreview.changeAmount > 0.009 ? (
                  <div className="rounded-2xl bg-green-50 p-4 md:col-span-2">
                    <p className="text-xs font-semibold uppercase text-green-700">{t('sales.changeAmount')}</p>
                    <p className="font-bold text-green-900">{formatKgs(changePreview.changeAmount)}</p>
                  </div>
                ) : null}
                <label className="block md:col-span-2">
                  <span className="text-sm font-semibold">{t('branchCashier.depositAccount')}</span>
                  <select
                    value={financeAccountId}
                    onChange={(e) => setFinanceAccountId(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                    required
                  >
                    <option value="">{t('branchCashier.selectAccount')}</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name} ({account.accountNumber}) — {formatKgs(account.currentBalance)}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedAccount ? (
                  <div className="rounded-2xl bg-slate-50 p-4 md:col-span-2">
                    <p className="text-xs font-semibold uppercase text-slate-400">{t('branchCashier.accountBalance')}</p>
                    <p className="font-bold text-slate-950">{formatKgs(selectedAccount.currentBalance)}</p>
                  </div>
                ) : null}
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
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-60 md:col-span-2"
                >
                  {t('distribution.submitPaymentCashier')}
                </button>
              </form>
            ) : null}

            <section
              id="payment-history"
              className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <h3 className="text-lg font-bold">{t('branchCashier.paymentHistory')}</h3>
              {(invoice.payments?.length ?? 0) === 0 ? (
                <p className="mt-3 text-sm text-slate-500">—</p>
              ) : (
                <table className="mt-4 min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="text-left text-xs font-bold uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">{t('branchCashier.lastPaymentDate')}</th>
                      <th className="px-3 py-2">{t('branchAccountant.amount')}</th>
                      <th className="px-3 py-2">{t('distribution.paymentMethod')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(invoice.payments ?? []).map((payment) => (
                      <tr key={payment.id}>
                        <td className="px-3 py-2">
                          {payment.paidAt ? new Date(payment.paidAt).toLocaleString('ru-RU') : '—'}
                        </td>
                        <td className="px-3 py-2 font-semibold">{formatKgs(payment.amount)}</td>
                        <td className="px-3 py-2">{payment.method}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
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
