'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ProtectedShell } from '@/components/ProtectedShell';
import { useTranslation } from '@/i18n/useTranslation';
import { apiFetch } from '@/lib/api';
import {
  BRANCH_CASHIER_INSTALLMENT_PAYMENT_METHODS,
  branchCashierPaymentMethodLabelKey,
  buildReceivingAccountResolveQuery,
  type BranchCashierReceivingAccountResolution,
} from '@/lib/branch-cashier-receiving-account';
import { computeFullPaymentChange } from '@/lib/sale-full-payment';
import type { BranchAccountantInvoice, BranchPaymentMethod } from '@/lib/types';

import { toast } from '@/lib/toast';

export default function BranchCashierInstallmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [invoice, setInvoice] = useState<BranchAccountantInvoice | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<BranchPaymentMethod>('CASH');
  const [accountResolution, setAccountResolution] =
    useState<BranchCashierReceivingAccountResolution | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const idempotencyKeyRef = useRef<string | null>(null);

  const resolvedAccount =
    accountResolution?.status === 'resolved' ? accountResolution.account : null;
  const accountError =
    accountResolution && accountResolution.status !== 'resolved'
      ? accountResolution.message
      : '';

  async function loadInvoice() {
    const invoiceData = await apiFetch<BranchAccountantInvoice>(`/branch-cashier/installments/${id}`);
    setInvoice(invoiceData);
  }

  async function resolveAccount(paymentMethod: BranchPaymentMethod) {
    setAccountLoading(true);
    try {
      const resolution = await apiFetch<BranchCashierReceivingAccountResolution>(
        `/branch-cashier/accounts/resolve${buildReceivingAccountResolveQuery(paymentMethod, id)}`,
      );
      setAccountResolution(resolution);
    } catch (err) {
      setAccountResolution(null);
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setAccountLoading(false);
    }
  }

  useEffect(() => {
    void loadInvoice().catch((err) => {
      setError(err instanceof Error ? err.message : t('common.error'));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    void resolveAccount(method);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method, id]);

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !resolvedAccount) return;
    setError('');
    /* toast clear */ void 0;
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
          financeAccountId: resolvedAccount.id,
          note: note || undefined,
          idempotencyKey: idempotencyKeyRef.current,
        }),
      });
      setInvoice(updated);
      setAmount('');
      idempotencyKeyRef.current = null;
      await resolveAccount(method);
      toast.success(Number(updated.remainingAmount) <= 0.009
          ? t('branchCashier.paymentAcceptedClosed')
          : t('branchCashier.paymentAcceptedPartial'),);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
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
  const canSubmitPayment = Boolean(resolvedAccount) && !accountLoading && !submitting;

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
              <form onSubmit={submitPayment} className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-bold">{t('branchCashier.acceptPayment')}</h3>

                <label className="block">
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
                  <div className="rounded-2xl bg-green-50 p-4">
                    <p className="text-xs font-semibold uppercase text-green-700">{t('sales.changeAmount')}</p>
                    <p className="font-bold text-green-900">{formatKgs(changePreview.changeAmount)}</p>
                  </div>
                ) : null}

                <label className="block">
                  <span className="text-sm font-semibold">{t('distribution.paymentMethod')}</span>
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value as BranchPaymentMethod)}
                    className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                  >
                    {BRANCH_CASHIER_INSTALLMENT_PAYMENT_METHODS.map((item) => (
                      <option key={item} value={item}>
                        {t(branchCashierPaymentMethodLabelKey(item))}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="block">
                  <span className="text-sm font-semibold">{t('branchCashier.depositAccount')}</span>
                  <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                    {accountLoading ? (
                      <span className="text-slate-500">{t('common.loading')}</span>
                    ) : resolvedAccount ? (
                      <span className="break-words">{formatAccountLabel(resolvedAccount)}</span>
                    ) : (
                      <span>—</span>
                    )}
                  </div>
                </div>

                <div className="block">
                  <span className="text-sm font-semibold">{t('branchCashier.accountBalance')}</span>
                  <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-950">
                    {accountLoading ? (
                      <span className="font-normal text-slate-500">{t('common.loading')}</span>
                    ) : resolvedAccount ? (
                      formatKgs(resolvedAccount.currentBalance)
                    ) : (
                      '—'
                    )}
                  </div>
                </div>

                {accountError ? (
                  <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{accountError}</p>
                ) : null}

                <label className="block">
                  <span className="text-sm font-semibold">{t('crm.notes')}</span>
                  <input value={note} onChange={(e) => setNote(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" />
                </label>

                <button
                  type="submit"
                  disabled={!canSubmitPayment}
                  className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-60"
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

function formatAccountLabel(account: {
  name: string;
  accountNumber: string;
  typeCode: string;
}) {
  return `${account.name} (${account.typeCode})`;
}

function formatKgs(value: number | string | null | undefined) {
  return `${Number(value ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} сом`;
}
