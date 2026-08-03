'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ProtectedShell } from '@/components/ProtectedShell';
import { useTranslation } from '@/i18n/useTranslation';
import { apiFetch } from '@/lib/api';
import {
  addPaymentMethodRow,
  availablePaymentMethods,
  buildPaymentAllocationsPayload,
  canAddPaymentMethod,
  computePaymentRemaining,
  createInitialPaymentRows,
  parsePaymentAmount,
  previewMultiMethodCashierPayment,
  removePaymentMethodRow,
  type PaymentMethodRow,
} from '@/lib/branch-cashier-multi-method-payment';
import {
  branchCashierPaymentMethodLabelKey,
  buildReceivingAccountResolveQuery,
  type BranchCashierReceivingAccountResolution,
} from '@/lib/branch-cashier-receiving-account';
import { translateStatus } from '@/lib/translate-status';
import type { BranchAccountantInvoice, BranchPaymentMethod } from '@/lib/types';

type RowAccountState = {
  resolution: BranchCashierReceivingAccountResolution | null;
  loading: boolean;
};

export default function BranchCashierInvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [invoice, setInvoice] = useState<BranchAccountantInvoice | null>(null);
  const [rows, setRows] = useState<PaymentMethodRow[]>(createInitialPaymentRows);
  const [accountState, setAccountState] = useState<Record<string, RowAccountState>>({});
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const idempotencyKeyRef = useRef<string | null>(null);

  const early = invoice?.activeEarlyPaymentRequest ?? null;
  const isRetailFullPayment =
    invoice?.invoiceCategory === 'RETAIL_SALE' && invoice.paymentType === 'FULL_PAYMENT';
  const remainingAmount = Number(invoice?.remainingAmount ?? 0);
  const payableAmount = early
    ? Number(early.approvedAmount ?? early.requestedAmount ?? remainingAmount)
    : isRetailFullPayment
      ? remainingAmount
      : Number(invoice?.requiredPaymentAmount ?? remainingAmount);
  const isFullPayment = isRetailFullPayment;

  const totalEntered = useMemo(
    () => roundMoney(rows.reduce((sum, row) => sum + parsePaymentAmount(row.amount), 0)),
    [rows],
  );
  const paymentPreview = previewMultiMethodCashierPayment({
    payableAmount: remainingAmount,
    isFullPayment,
    rows,
  });
  const preview = 'error' in paymentPreview ? null : paymentPreview;
  const remainingPreview = isFullPayment
    ? computePaymentRemaining(remainingAmount, totalEntered)
    : preview?.remainingAfterPayment ?? computePaymentRemaining(remainingAmount, totalEntered);

  const accountIds = useMemo(() => {
    const map: Partial<Record<BranchPaymentMethod, string>> = {};
    for (const row of rows) {
      const resolution = accountState[row.id]?.resolution;
      if (resolution?.status === 'resolved') {
        map[row.method] = resolution.account.id;
      }
    }
    return map;
  }, [accountState, rows]);

  const rowsNeedingAccounts = rows.filter((row) => parsePaymentAmount(row.amount) > 0);
  const allAccountsResolved = rowsNeedingAccounts.every((row) => {
    const resolution = accountState[row.id]?.resolution;
    return resolution?.status === 'resolved';
  });
  const anyAccountLoading = rowsNeedingAccounts.some((row) => accountState[row.id]?.loading);

  const canSubmit = !submitting && !anyAccountLoading && allAccountsResolved;

  async function resolveRowAccount(row: PaymentMethodRow) {
    const amount = parsePaymentAmount(row.amount);
    if (amount <= 0) {
      setAccountState((current) => ({
        ...current,
        [row.id]: { resolution: null, loading: false },
      }));
      return;
    }

    setAccountState((current) => ({
      ...current,
      [row.id]: { resolution: current[row.id]?.resolution ?? null, loading: true },
    }));

    try {
      const resolution = await apiFetch<BranchCashierReceivingAccountResolution>(
        `/branch-cashier/accounts/resolve${buildReceivingAccountResolveQuery(row.method, id, { invoiceId: id })}`,
      );
      setAccountState((current) => ({
        ...current,
        [row.id]: { resolution, loading: false },
      }));
    } catch (err) {
      setAccountState((current) => ({
        ...current,
        [row.id]: { resolution: null, loading: false },
      }));
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function load() {
    try {
      const invoiceData = await apiFetch<BranchAccountantInvoice>(`/branch-cashier/invoices/${id}`);
      setInvoice(invoiceData);
      setRows(createInitialPaymentRows());
      setAccountState({});
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    for (const row of rows) {
      void resolveRowAccount(row);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.map((row) => `${row.id}:${row.method}:${row.amount}`).join('|'), id]);

  function updateRow(rowId: string, patch: Partial<Pick<PaymentMethodRow, 'method' | 'amount'>>) {
    setRows((current) =>
      current.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
    );
  }

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || submitting) return;
    setError('');
    setSuccess('');

    if ('error' in paymentPreview) {
      setError(paymentPreview.error);
      return;
    }

    if (early) {
      const approved = Number(early.approvedAmount ?? early.requestedAmount ?? 0);
      if (Math.abs(paymentPreview.totalNetAmount - approved) > 0.009) {
        setError(t('branchCashier.splitEarlyAmountMismatch'));
        return;
      }
    }

    for (const row of rowsNeedingAccounts) {
      const resolution = accountState[row.id]?.resolution;
      if (!resolution || resolution.status !== 'resolved') {
        setError(
          resolution && 'message' in resolution
            ? resolution.message
            : t('branchCashier.splitMissingAccount'),
        );
        return;
      }
    }

    try {
      setSubmitting(true);
      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = crypto.randomUUID();
      }

      const updated = await apiFetch<BranchAccountantInvoice>(`/branch-cashier/invoices/${id}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          allocations: buildPaymentAllocationsPayload(rows, accountIds),
          note: note || undefined,
          idempotencyKey: idempotencyKeyRef.current,
        }),
      });
      setInvoice(updated);
      setRows(createInitialPaymentRows());
      setAccountState({});
      idempotencyKeyRef.current = null;

      if (updated.workflowStatus === 'PAID' || Number(updated.remainingAmount) <= 0.009) {
        setSuccess(t('branchCashier.paymentAcceptedInvoicePaid'));
      } else {
        setSuccess(t('branchCashier.paymentAcceptedInstallmentPartial'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSubmitting(false);
    }
  }

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
                  <Info label={t('sales.paidAmount')} value={formatKgs(invoice.receivedAmountEnteredBySales)} />
                  {invoice.expectedChangeAmount != null && Number(invoice.expectedChangeAmount) > 0 ? (
                    <Info label={t('sales.changeAmount')} value={formatKgs(invoice.expectedChangeAmount)} />
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
                <Info label={t('branchCashier.paymentPurpose')} value={t(`branchAccountant.earlyPaymentType.${early.paymentType}`)} />
                <Info label={t('branchCashier.cashbox')} value={early.financeAccount?.name ?? '—'} />
                <Info label={t('branchCashier.branchCeoApprovedBy')} value={early.branchCeoApprovedBy?.fullName ?? '—'} />
                <Info label={t('branchCashier.branchCeoApprovedAt')} value={early.branchCeoApprovedAt ? new Date(early.branchCeoApprovedAt).toLocaleString() : '—'} />
                <Info label={t('branchCashier.sentByAccountant')} value={early.sentToCashierBy?.fullName ?? '—'} />
                <Info label={t('branchCashier.sentAt')} value={early.sentToCashierAt ? new Date(early.sentToCashierAt).toLocaleString() : '—'} />
                <Info label={t('branchCashier.expectedDebtAfter')} value={formatKgs(early.expectedRemainingDebtAfterPayment ?? Math.max(invoice.remainingAmount - invoice.requiredPaymentAmount, 0))} />
              </section>
            ) : null}

            {invoice.workflowStatus !== 'PAID' ? (
              <form onSubmit={submitPayment} className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-bold">{t('distribution.cashierPayment')}</h3>

                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase text-slate-400">{t('branchCashier.splitPayableAmount')}</p>
                  <p className="text-xl font-bold text-slate-950">{formatKgs(payableAmount)}</p>
                </div>

                <div className="space-y-4">
                  <p className="text-sm font-semibold">{t('branchCashier.paymentMethodsSection')}</p>
                  {rows.map((row) => {
                    const amount = parsePaymentAmount(row.amount);
                    const state = accountState[row.id];
                    const resolution = state?.resolution;
                    const resolvedAccount = resolution?.status === 'resolved' ? resolution.account : null;
                    const accountError =
                      amount > 0 && resolution && resolution.status !== 'resolved'
                        ? resolution.message
                        : '';
                    const methodOptions = [
                      row.method,
                      ...availablePaymentMethods(rows, row.method),
                    ];

                    return (
                      <div key={row.id} className="space-y-3 rounded-2xl border border-slate-200 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <label className="block flex-1">
                            <span className="text-sm font-semibold">{t('distribution.paymentMethod')}</span>
                            <select
                              value={row.method}
                              onChange={(e) => updateRow(row.id, { method: e.target.value as BranchPaymentMethod })}
                              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                            >
                              {methodOptions.map((method) => (
                                <option key={method} value={method}>
                                  {t(branchCashierPaymentMethodLabelKey(method))}
                                </option>
                              ))}
                            </select>
                          </label>
                          {rows.length > 1 ? (
                            <button
                              type="button"
                              onClick={() => setRows((current) => removePaymentMethodRow(current, row.id))}
                              className="mt-7 rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              {t('common.delete')}
                            </button>
                          ) : null}
                        </div>

                        <label className="block">
                          <span className="text-sm font-semibold">{t('branchCashier.paymentRowAmount')}</span>
                          <input
                            value={row.amount}
                            onChange={(e) => updateRow(row.id, { amount: e.target.value })}
                            type="number"
                            min="0"
                            step="0.01"
                            className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                          />
                        </label>

                        {amount > 0 ? (
                          <>
                            <div className="block">
                              <span className="text-sm font-semibold">{t('branchCashier.depositAccount')}</span>
                              <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                                {state?.loading ? (
                                  <span className="text-slate-500">{t('common.loading')}</span>
                                ) : resolvedAccount ? (
                                  <span>{formatAccountLabel(resolvedAccount)}</span>
                                ) : (
                                  <span className="text-red-700">
                                    {accountError || t('branchCashier.splitMissingAccount')}
                                  </span>
                                )}
                              </div>
                            </div>
                            {resolvedAccount ? (
                              <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm">
                                <span className="font-semibold text-slate-500">{t('branchCashier.accountBalance')}: </span>
                                <span className="font-bold text-slate-900">{formatKgs(resolvedAccount.currentBalance)}</span>
                              </div>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                {canAddPaymentMethod(rows) ? (
                  <button
                    type="button"
                    onClick={() => setRows((current) => addPaymentMethodRow(current))}
                    className="rounded-xl border border-dashed border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {t('branchCashier.addPaymentMethod')}
                  </button>
                ) : null}

                <div className="grid gap-4 md:grid-cols-2">
                  <Summary label={t('branchCashier.splitTotalEntered')} value={formatKgs(totalEntered)} />
                  <Summary label={t('branchCashier.splitRemaining')} value={formatKgs(remainingPreview)} />
                </div>

                {preview && preview.cashChangeAmount > 0.009 ? (
                  <div className="rounded-2xl bg-green-50 p-4">
                    <p className="text-xs font-semibold uppercase text-green-700">{t('branchCashier.splitChange')}</p>
                    <p className="font-bold text-green-900">{formatKgs(preview.cashChangeAmount)}</p>
                  </div>
                ) : null}

                <label className="block">
                  <span className="text-sm font-semibold">{t('crm.notes')}</span>
                  <input value={note} onChange={(e) => setNote(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" />
                </label>

                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-60"
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

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase text-slate-400">{label}</p>
      <p className="font-bold text-slate-950">{value}</p>
    </div>
  );
}

function formatAccountLabel(account: { name: string; accountNumber: string; currentBalance: number }) {
  return `${account.name} (${account.accountNumber})`;
}

function formatKgs(value: number | string | null | undefined) {
  return `${Number(value ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} сом`;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
