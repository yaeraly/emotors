'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ProtectedShell } from '@/components/ProtectedShell';
import { useTranslation } from '@/i18n/useTranslation';
import { apiFetch } from '@/lib/api';
import {
  buildReceivingAccountResolveQuery,
  type BranchCashierReceivingAccountResolution,
} from '@/lib/branch-cashier-receiving-account';
import {
  computeSplitRemaining,
  parseSplitAmount,
  previewSplitCashierPayment,
} from '@/lib/branch-cashier-split-payment';
import { translateStatus } from '@/lib/translate-status';
import type { BranchAccountantInvoice } from '@/lib/types';

export default function BranchCashierInvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [invoice, setInvoice] = useState<BranchAccountantInvoice | null>(null);
  const [cashAmount, setCashAmount] = useState('0');
  const [qrAmount, setQrAmount] = useState('0');
  const [cashAccountResolution, setCashAccountResolution] =
    useState<BranchCashierReceivingAccountResolution | null>(null);
  const [qrAccountResolution, setQrAccountResolution] =
    useState<BranchCashierReceivingAccountResolution | null>(null);
  const [cashAccountLoading, setCashAccountLoading] = useState(false);
  const [qrAccountLoading, setQrAccountLoading] = useState(false);
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

  const cashGross = parseSplitAmount(cashAmount);
  const qrGross = parseSplitAmount(qrAmount);
  const totalEntered = useMemo(
    () => Math.round((cashGross + qrGross + Number.EPSILON) * 100) / 100,
    [cashGross, qrGross],
  );
  const remainingPreview = computeSplitRemaining(
    isFullPayment ? remainingAmount : remainingAmount,
    totalEntered,
  );
  const splitPreview = previewSplitCashierPayment({
    payableAmount: remainingAmount,
    isFullPayment,
    cashAmount,
    qrAmount,
  });
  const preview = 'error' in splitPreview ? null : splitPreview;

  const resolvedCashAccount =
    cashAccountResolution?.status === 'resolved' ? cashAccountResolution.account : null;
  const resolvedQrAccount =
    qrAccountResolution?.status === 'resolved' ? qrAccountResolution.account : null;
  const cashAccountError =
    cashGross > 0 && cashAccountResolution && cashAccountResolution.status !== 'resolved'
      ? cashAccountResolution.message
      : '';
  const qrAccountError =
    qrGross > 0 && qrAccountResolution && qrAccountResolution.status !== 'resolved'
      ? qrAccountResolution.message
      : '';

  async function resolveCashAccount() {
    if (cashGross <= 0) {
      setCashAccountResolution(null);
      return;
    }
    setCashAccountLoading(true);
    try {
      const resolution = await apiFetch<BranchCashierReceivingAccountResolution>(
        `/branch-cashier/accounts/resolve${buildReceivingAccountResolveQuery('CASH', id, { invoiceId: id })}`,
      );
      setCashAccountResolution(resolution);
    } catch (err) {
      setCashAccountResolution(null);
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setCashAccountLoading(false);
    }
  }

  async function resolveQrAccount() {
    if (qrGross <= 0) {
      setQrAccountResolution(null);
      return;
    }
    setQrAccountLoading(true);
    try {
      const resolution = await apiFetch<BranchCashierReceivingAccountResolution>(
        `/branch-cashier/accounts/resolve${buildReceivingAccountResolveQuery('QR', id, { invoiceId: id })}`,
      );
      setQrAccountResolution(resolution);
    } catch (err) {
      setQrAccountResolution(null);
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setQrAccountLoading(false);
    }
  }

  async function load() {
    try {
      const invoiceData = await apiFetch<BranchAccountantInvoice>(`/branch-cashier/invoices/${id}`);
      setInvoice(invoiceData);
      setCashAmount('0');
      setQrAmount('0');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    void resolveCashAccount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cashGross > 0, id]);

  useEffect(() => {
    void resolveQrAccount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrGross > 0, id]);

  const canSubmit =
    !submitting &&
    (cashGross <= 0 || Boolean(resolvedCashAccount)) &&
    (qrGross <= 0 || Boolean(resolvedQrAccount)) &&
    !cashAccountLoading &&
    !qrAccountLoading;

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || submitting) return;
    setError('');
    setSuccess('');

    if ('error' in splitPreview) {
      setError(splitPreview.error);
      return;
    }

    if (early) {
      const approved = Number(early.approvedAmount ?? early.requestedAmount ?? 0);
      if (Math.abs(splitPreview.totalNetAmount - approved) > 0.009) {
        setError(t('branchCashier.splitEarlyAmountMismatch'));
        return;
      }
    }

    if (cashGross > 0 && !resolvedCashAccount) {
      setError(cashAccountError || t('branchCashier.splitMissingCashAccount'));
      return;
    }
    if (qrGross > 0 && !resolvedQrAccount) {
      setError(qrAccountError || t('branchCashier.splitMissingQrAccount'));
      return;
    }

    try {
      setSubmitting(true);
      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = crypto.randomUUID();
      }

      const updated = await apiFetch<BranchAccountantInvoice>(`/branch-cashier/invoices/${id}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          cashAmount: cashGross > 0 ? cashGross : undefined,
          qrAmount: qrGross > 0 ? qrGross : undefined,
          cashAccountId: resolvedCashAccount?.id,
          qrAccountId: resolvedQrAccount?.id,
          note: note || undefined,
          idempotencyKey: idempotencyKeyRef.current,
        }),
      });
      setInvoice(updated);
      setCashAmount('0');
      setQrAmount('0');
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
              <form onSubmit={submitPayment} className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-bold">{t('distribution.cashierPayment')}</h3>

                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase text-slate-400">{t('branchCashier.splitPayableAmount')}</p>
                  <p className="text-xl font-bold text-slate-950">{formatKgs(payableAmount)}</p>
                </div>

                <label className="block">
                  <span className="text-sm font-semibold">{t('branchCashier.splitCashAmount')}</span>
                  <input
                    value={cashAmount}
                    onChange={(e) => setCashAmount(e.target.value)}
                    type="number"
                    min="0"
                    step="0.01"
                    className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                  />
                </label>

                {cashGross > 0 ? (
                  <div className="block">
                    <span className="text-sm font-semibold">{t('branchCashier.splitCashAccount')}</span>
                    <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                      {cashAccountLoading ? (
                        <span className="text-slate-500">{t('common.loading')}</span>
                      ) : resolvedCashAccount ? (
                        <span>{formatAccountLabel(resolvedCashAccount)}</span>
                      ) : (
                        <span className="text-red-700">{cashAccountError || t('branchCashier.splitMissingCashAccount')}</span>
                      )}
                    </div>
                  </div>
                ) : null}

                <label className="block">
                  <span className="text-sm font-semibold">{t('branchCashier.splitQrAmount')}</span>
                  <input
                    value={qrAmount}
                    onChange={(e) => setQrAmount(e.target.value)}
                    type="number"
                    min="0"
                    step="0.01"
                    className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                  />
                </label>

                {qrGross > 0 ? (
                  <div className="block">
                    <span className="text-sm font-semibold">{t('branchCashier.splitQrAccount')}</span>
                    <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                      {qrAccountLoading ? (
                        <span className="text-slate-500">{t('common.loading')}</span>
                      ) : resolvedQrAccount ? (
                        <span>{formatAccountLabel(resolvedQrAccount)}</span>
                      ) : (
                        <span className="text-red-700">{qrAccountError || t('branchCashier.splitMissingQrAccount')}</span>
                      )}
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-4 md:grid-cols-2">
                  <Summary label={t('branchCashier.splitTotalEntered')} value={formatKgs(totalEntered)} />
                  <Summary
                    label={t('branchCashier.splitRemaining')}
                    value={formatKgs(isFullPayment ? remainingPreview : preview?.remainingAfterPayment ?? remainingPreview)}
                  />
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
  return `${account.name} (${account.accountNumber}) — ${formatKgs(account.currentBalance)}`;
}

function formatKgs(value: number | string | null | undefined) {
  return `${Number(value ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} сом`;
}
