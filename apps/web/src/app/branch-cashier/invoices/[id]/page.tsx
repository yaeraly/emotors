'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ProtectedShell } from '@/components/ProtectedShell';
import { useTranslation } from '@/i18n/useTranslation';
import { apiFetch } from '@/lib/api';
import { computeFullPaymentChange } from '@/lib/sale-full-payment';
import { translateStatus } from '@/lib/translate-status';
import type { BranchAccountantInvoice, BranchPaymentMethod, FinanceAccount } from '@/lib/types';

const methods: BranchPaymentMethod[] = ['CASH', 'QR', 'BANK', 'TRANSFER'];

export default function BranchCashierInvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [invoice, setInvoice] = useState<BranchAccountantInvoice | null>(null);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<BranchPaymentMethod>('CASH');
  const [financeAccountId, setFinanceAccountId] = useState('');
  const [receiptReference, setReceiptReference] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const idempotencyKeyRef = useRef<string | null>(null);

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === financeAccountId) ?? null,
    [accounts, financeAccountId],
  );

  async function load() {
    try {
      const [invoiceData, accountData] = await Promise.all([
        apiFetch<BranchAccountantInvoice>(`/branch-cashier/invoices/${id}`),
        apiFetch<FinanceAccount[]>('/branch-cashier/accounts'),
      ]);
      setInvoice(invoiceData);
      setAccounts(accountData);
      const initialAmount =
        invoiceData.receivedAmountEnteredBySales != null
          ? invoiceData.receivedAmountEnteredBySales
          : invoiceData.requiredPaymentAmount ?? invoiceData.remainingAmount;
      setAmount(String(initialAmount));
      if (accountData.length === 1) {
        setFinanceAccountId(accountData[0].id);
      } else if (!financeAccountId && accountData[0]) {
        setFinanceAccountId(accountData[0].id);
      }
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
      const remaining = Number(invoice?.remainingAmount ?? 0);
      const received = Number(amount || 0);
      const change = isRetailFullPayment
        ? computeFullPaymentChange(remaining, received).changeAmount
        : 0;

      const updated = await apiFetch<BranchAccountantInvoice>(`/branch-cashier/invoices/${id}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          amount: isRetailFullPayment ? remaining : received,
          receivedAmount: received,
          changeAmount: change > 0.009 ? change : undefined,
          method,
          financeAccountId,
          note,
          receiptReference: receiptReference || undefined,
          idempotencyKey: idempotencyKeyRef.current,
        }),
      });
      setInvoice(updated);
      idempotencyKeyRef.current = null;
      const refreshedAccounts = await apiFetch<FinanceAccount[]>('/branch-cashier/accounts');
      setAccounts(refreshedAccounts);
      setSuccess(
        updated.workflowStatus === 'PAID'
          ? t('branchCashier.paymentAcceptedClosed')
          : t('branchCashier.paymentAcceptedPartial'),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSubmitting(false);
    }
  }

  const early = invoice?.activeEarlyPaymentRequest ?? null;
  const amountLocked = Boolean(early);
  const isRetailFullPayment =
    invoice?.invoiceCategory === 'RETAIL_SALE' && invoice.paymentType === 'FULL_PAYMENT';
  const remainingAmount = Number(invoice?.remainingAmount ?? 0);
  const cashierChange = invoice
    ? computeFullPaymentChange(remainingAmount, Number(amount || 0))
    : null;

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
              <Info label={t('branchCashier.invoicesToPay')} value={invoice.invoiceNumber} />
              <Info label={t('distribution.totalAmount')} value={formatKgs(invoice.totalAmount)} />
              <Info label={t('branchCashier.paidPreviously')} value={formatKgs(invoice.paidAmount)} />
              <Info label={t('branchCashier.remainingDebt')} value={formatKgs(invoice.remainingAmount)} />
              <Info label={t('branchCashier.requiredPayment')} value={formatKgs(invoice.requiredPaymentAmount)} />
              {isRetailFullPayment && invoice.receivedAmountEnteredBySales != null ? (
                <>
                  <Info
                    label={t('sales.paidAmount')}
                    value={formatKgs(invoice.receivedAmountEnteredBySales)}
                  />
                  {invoice.expectedChangeAmount != null && Number(invoice.expectedChangeAmount) > 0 ? (
                    <Info
                      label={t('sales.changeAmount')}
                      value={formatKgs(invoice.expectedChangeAmount)}
                    />
                  ) : null}
                </>
              ) : null}
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
                  <span className="text-sm font-semibold">{t('branchCashier.receivedAmount')}</span>
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
                {cashierChange && cashierChange.changeAmount > 0.009 ? (
                  <div className="rounded-2xl bg-green-50 p-4">
                    <p className="text-xs font-semibold uppercase text-green-700">{t('sales.changeAmount')}</p>
                    <p className="font-bold text-green-900">{formatKgs(cashierChange.changeAmount)}</p>
                  </div>
                ) : (
                  <div />
                )}
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
                  <span className="text-sm font-semibold">{t('distribution.receiptReference')}</span>
                  <input value={receiptReference} onChange={(e) => setReceiptReference(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" />
                </label>
                <label className="block md:col-span-2">
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
