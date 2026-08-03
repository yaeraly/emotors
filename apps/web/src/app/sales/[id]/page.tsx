'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import {
  canApproveSaleInstallmentRequest,
  canCancelSale,
  canCancelSaleInstallmentRequest,
  canManageSaleWorkflow,
  canSubmitSaleInstallmentRequest,
  canUpdateBusinessDate,
  canVoidPayment,
  shouldHideSaleProfitColumn,
} from '@/lib/rbac';
import { canEditDraftSale, draftSaleEditHref } from '@/lib/sale-draft-edit';
import {
  canBranchCeoCancelInstallmentRequest,
  canReturnRejectedSaleToDraft,
  installmentBlocksCompletion,
  installmentStatusLabelKey,
  isPendingBranchCeoInstallmentDecision,
  saleIsInstallment,
} from '@/lib/sale-installment';
import { SaleReceipt } from '@/components/sales/SaleReceipt';
import {
  SALE_PAYMENT_METHODS,
  formatPaymentMethodLabel,
} from '@/lib/sale-payment-methods';
import type { PaymentMethod, Sale, User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';
import { getStatusLabel } from '@/lib/translate-status';
import { BusinessDateField } from '@/components/BusinessDateField';

export default function SaleDetailPage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const saleId = params.id;
  const [sale, setSale] = useState<Sale | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod | ''>('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingPayment, setSavingPayment] = useState(false);
  const [submittingInstallment, setSubmittingInstallment] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [cancellationReason, setCancellationReason] = useState('');
  const [approvalComment, setApprovalComment] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    void loadSale();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saleId]);

  async function loadSale() {
    setLoading(true);
    setError('');

    try {
      const [result, currentUserResult] = await Promise.all([
        apiFetch<Sale>(`/sales/${saleId}`),
        apiFetch<User>('/auth/me'),
      ]);
      setSale(result);
      setCurrentUser(currentUserResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }

  async function addPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!method) {
      setError(t('sales.paymentMethodRequired'));
      return;
    }
    setSavingPayment(true);
    setError('');
    setSuccess('');

    try {
      const result = await apiFetch<Sale>(`/sales/${saleId}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(amount),
          method,
          note: note.trim() || undefined,
        }),
      });
      setSale(result);
      setAmount('');
      setNote('');
      setMethod('');
      setSuccess('Payment added successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSavingPayment(false);
    }
  }

  async function runSaleAction(
    path: 'send-whatsapp' | 'finalize' | 'cancel',
  ) {
    setError('');
    setSuccess('');

    try {
      const response = await apiFetch<any>(`/sales/${saleId}/${path}`, {
        method: 'POST',
      });
      const nextSale = response.sale ?? response;
      setSale(nextSale);

      if (response.whatsappLink) {
        window.open(response.whatsappLink, '_blank', 'noopener,noreferrer');
      }

      setSuccess('Sale updated successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function voidPayment(paymentId: string) {
    setError('');
    setSuccess('');
    try {
      const result = await apiFetch<Sale>(`/sales/${saleId}/payments/${paymentId}/void`, {
        method: 'POST',
      });
      setSale(result);
      setSuccess('Payment voided successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function submitInstallmentRequest() {
    setSubmittingInstallment(true);
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/sales/${saleId}/installment-request/submit`, { method: 'POST' });
      await loadSale();
      setSuccess(t('sales.installmentRequestSubmitted'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSubmittingInstallment(false);
    }
  }

  async function approveInstallmentRequest() {
    setSubmittingInstallment(true);
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/sales/${saleId}/installment-request/approve`, {
        method: 'POST',
        body: JSON.stringify({
          approvalComment: approvalComment.trim() || undefined,
        }),
      });
      await loadSale();
      setApprovalComment('');
      setSuccess(t('sales.installmentRequestApproved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSubmittingInstallment(false);
    }
  }

  async function cancelInstallmentRequest() {
    if (!cancellationReason.trim()) {
      setError(t('sales.installmentCancellationReasonRequired'));
      return;
    }
    setSubmittingInstallment(true);
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/sales/${saleId}/installment-request/cancel`, {
        method: 'POST',
        body: JSON.stringify({ cancellationReason: cancellationReason.trim() }),
      });
      setShowCancelForm(false);
      setCancellationReason('');
      await loadSale();
      setSuccess(t('sales.installmentRequestCancelled'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSubmittingInstallment(false);
    }
  }

  async function returnRejectedSaleToDraft() {
    setSubmittingInstallment(true);
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/sales/${saleId}/return-to-draft`, { method: 'POST' });
      await loadSale();
      setSuccess(t('sales.returnedToDraft'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSubmittingInstallment(false);
    }
  }

  async function rejectInstallmentRequest() {
    if (!rejectionReason.trim()) {
      setError(t('sales.installmentRejectionReasonRequired'));
      return;
    }
    setSubmittingInstallment(true);
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/sales/${saleId}/installment-request/reject`, {
        method: 'POST',
        body: JSON.stringify({ rejectionReason: rejectionReason.trim() }),
      });
      setShowRejectForm(false);
      setRejectionReason('');
      await loadSale();
      setSuccess(t('sales.installmentRequestRejected'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSubmittingInstallment(false);
    }
  }

  const hideCostAndProfit = shouldHideSaleProfitColumn(currentUser);
  const isInstallment = saleIsInstallment(sale);
  const installmentApproval = sale?.installmentApproval;
  const installmentStatusKey = installmentStatusLabelKey(installmentApproval?.status);
  const installmentPending = isPendingBranchCeoInstallmentDecision(installmentApproval?.status);
  const installmentApproved = installmentApproval?.status === 'APPROVED';
  const installmentRejected = installmentApproval?.status === 'REJECTED';
  const installmentCancelled = installmentApproval?.status === 'CANCELLED';
  const canCancelInstallment =
    canCancelSaleInstallmentRequest(currentUser) &&
    canBranchCeoCancelInstallmentRequest(installmentApproval, sale);
  const canReturnToDraft =
    canSubmitSaleInstallmentRequest(currentUser) &&
    canReturnRejectedSaleToDraft(installmentApproval);
  const canFinalize =
    Boolean(sale) &&
    sale?.status !== 'FINALIZED' &&
    sale?.status !== 'CANCELLED' &&
    !installmentBlocksCompletion(sale) &&
    !installmentRejected &&
    !installmentCancelled;

  return (
    <ProtectedShell>
      <section className="sale-details-page w-full min-w-0 space-y-6 print:hidden">
        <Link
          href="/sales"
          className="inline-flex text-sm font-semibold text-blue-700 hover:text-blue-800"
        >
          {t('nav.sales')}
        </Link>

        {error ? (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
            {success}
          </p>
        ) : null}

        {loading ? (
          <p className="rounded-3xl border border-slate-200 bg-white p-8 text-slate-500 shadow-sm">
            {t('common.loading')}
          </p>
        ) : sale ? (
          <>
            <article className="w-full min-w-0 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col justify-between gap-4 md:flex-row">
                <div className="min-w-0">
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">
                    {t('sales.title')}
                  </p>
                  <h2 className="mt-2 text-3xl font-bold text-slate-950">
                    {sale.receiptNumber}
                  </h2>
                  <p className="mt-2">
                    <BusinessDateField
                      entityType="Sale"
                      entityId={sale.id}
                      fieldName="saleDate"
                      value={sale.saleDate}
                      canEdit={canUpdateBusinessDate(currentUser)}
                      onUpdated={loadSale}
                    />
                  </p>
                </div>
                <span className="h-fit rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700">
                  {getStatusLabel({ module: 'sale', status: sale.status, t })} ·{' '}
                  {t(`paymentStatus.${sale.paymentStatus}`)}
                </span>
              </div>

              <div className="mt-6 grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
                <Info label={t('sales.customer')} value={sale.customer?.fullName ?? ''} />
                <Info label={t('crm.phone')} value={sale.customer?.phone ?? ''} />
                <Info label={t('sales.seller')} value={sale.seller?.fullName ?? ''} />
                <Info label={t('crm.branch')} value={sale.branch?.name ?? ''} />
                <Info
                  label={t('sales.paymentType')}
                  value={
                    isInstallment ? t('sales.installment') : t('sales.fullPayment')
                  }
                />
              </div>

              <div className={`mt-6 grid min-w-0 gap-4 sm:grid-cols-2 ${hideCostAndProfit ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}>
                <Metric label={t('sales.totalAmount')} value={formatKgs(sale.totalAmount)} />
                <Metric label={t('sales.paidAmount')} value={formatKgs(sale.paidAmount)} />
                <Metric label={t('sales.debtAmount')} value={formatKgs(sale.debtAmount)} />
                {!hideCostAndProfit ? (
                  <Metric label={t('sales.profitAmount')} value={formatKgs(sale.profitAmount)} />
                ) : null}
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                  {canEditDraftSale(currentUser, sale) ? (
                    <Link
                      href={draftSaleEditHref(sale.id)}
                      className="rounded-xl border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
                    >
                      {t('common.edit')}
                    </Link>
                  ) : null}
                  {canManageSaleWorkflow(currentUser) ? (
                    <>
                  <button
                    onClick={() => void runSaleAction('send-whatsapp')}
                    disabled={sale.status === 'FINALIZED' || sale.status === 'CANCELLED'}
                    className="rounded-xl border border-green-200 px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-50 disabled:opacity-50"
                    type="button"
                  >
                    {t('sales.sendWhatsApp')}
                  </button>
                  {canSubmitSaleInstallmentRequest(currentUser) && isInstallment ? (
                    <button
                      onClick={() => void submitInstallmentRequest()}
                      disabled={
                        submittingInstallment ||
                        installmentPending ||
                        installmentApproved ||
                        installmentRejected ||
                        installmentCancelled ||
                        sale.status === 'FINALIZED' ||
                        sale.status === 'CANCELLED'
                      }
                      type="button"
                      className="rounded-xl border border-violet-200 px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50"
                    >
                      {submittingInstallment
                        ? t('common.loading')
                        : t('sales.submitInstallmentRequest')}
                    </button>
                  ) : null}
                  {canApproveSaleInstallmentRequest(currentUser) &&
                  isInstallment &&
                  installmentPending ? (
                    <>
                      <input
                        value={approvalComment}
                        onChange={(event) => setApprovalComment(event.target.value)}
                        placeholder={t('sales.installmentApprovalComment')}
                        className="min-w-[220px] rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      />
                      <button
                        onClick={() => void approveInstallmentRequest()}
                        disabled={submittingInstallment}
                        type="button"
                        className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        {t('sales.approveInstallment')}
                      </button>
                      <button
                        onClick={() => setShowRejectForm((value) => !value)}
                        disabled={submittingInstallment}
                        type="button"
                        className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        {t('sales.rejectInstallment')}
                      </button>
                    </>
                  ) : null}
                  {canCancelInstallment ? (
                    <button
                      onClick={() => setShowCancelForm((value) => !value)}
                      disabled={submittingInstallment}
                      type="button"
                      className="rounded-xl border border-amber-200 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-50"
                    >
                      {t('sales.cancelInstallment')}
                    </button>
                  ) : null}
                  {canReturnToDraft ? (
                    <button
                      onClick={() => void returnRejectedSaleToDraft()}
                      disabled={submittingInstallment}
                      type="button"
                      className="rounded-xl border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                    >
                      {t('sales.returnToDraft')}
                    </button>
                  ) : null}
                  <button
                    onClick={() => void runSaleAction('finalize')}
                    disabled={!canFinalize}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                    type="button"
                  >
                    {t('sales.finalizeSale')}
                  </button>
                  {canCancelSale(currentUser) ? (
                    <button
                      onClick={() => void runSaleAction('cancel')}
                      disabled={sale.status === 'CANCELLED'}
                      className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                      type="button"
                    >
                      Cancel
                    </button>
                  ) : null}
                    </>
                  ) : null}
              </div>
            </article>

            {canVoidPayment(currentUser) ? (
              <form
                onSubmit={addPayment}
                className="w-full min-w-0 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <h3 className="text-lg font-bold text-slate-950">{t('sales.addPayment')}</h3>
                <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="block min-w-0">
                    <span className="text-sm font-semibold text-slate-700">
                      {t('sales.paidAmount')}
                    </span>
                    <input
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      type="number"
                      min="0.01"
                      step="0.01"
                      max={sale.debtAmount}
                      required
                      className="mt-2 w-full min-w-0 rounded-xl border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring-2"
                    />
                  </label>
                  <label className="block min-w-0">
                    <span className="text-sm font-semibold text-slate-700">
                      {t('sales.paymentMethod')}
                    </span>
                    <select
                      value={method}
                      onChange={(event) =>
                        setMethod(event.target.value as PaymentMethod)
                      }
                      required
                      className="mt-2 w-full min-w-0 rounded-xl border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring-2"
                    >
                      <option value="">{t('sales.paymentMethodRequired')}</option>
                      {SALE_PAYMENT_METHODS.map((paymentMethod) => (
                        <option key={paymentMethod} value={paymentMethod}>
                          {formatPaymentMethodLabel(paymentMethod, t)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block min-w-0 sm:col-span-2">
                    <span className="text-sm font-semibold text-slate-700">
                      {t('crm.notes')}
                    </span>
                    <textarea
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      className="mt-2 min-h-20 w-full min-w-0 rounded-xl border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring-2"
                    />
                  </label>
                </div>
                <button
                  disabled={savingPayment || sale.debtAmount <= 0}
                  className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300 sm:w-auto"
                  type="submit"
                >
                  {savingPayment ? t('common.loading') : t('sales.addPayment')}
                </button>
              </form>
            ) : null}

            <section className="w-full min-w-0 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-bold text-slate-950">{t('sales.saleItems')}</h3>
              <div className="mt-4 w-full min-w-0 overflow-x-auto">
                <table className="w-full min-w-full table-auto divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">{t('sales.product')}</th>
                      <th className="px-4 py-3">{t('sales.sku')}</th>
                      <th className="px-4 py-3">{t('sales.quantity')}</th>
                      <th className="px-4 py-3">{t('sales.unitPrice')}</th>
                      {!hideCostAndProfit ? <th className="px-4 py-3">{t('sales.unitCost')}</th> : null}
                      <th className="px-4 py-3">{t('sales.totalAmount')}</th>
                      {!hideCostAndProfit ? <th className="px-4 py-3">{t('sales.profitAmount')}</th> : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sale.items?.map((item) => (
                      <tr key={item.id}>
                        <td className="min-w-0 px-4 py-3 font-semibold break-words">
                          {item.productName}
                        </td>
                        <td className="px-4 py-3">{item.productSku ?? '-'}</td>
                        <td className="px-4 py-3">{item.quantity}</td>
                        <td className="px-4 py-3">{formatKgs(item.unitPrice)}</td>
                        {!hideCostAndProfit ? <td className="px-4 py-3">{formatKgs(item.unitCost)}</td> : null}
                        <td className="px-4 py-3">{formatKgs(item.totalPrice)}</td>
                        {!hideCostAndProfit ? <td className="px-4 py-3">{formatKgs(item.profitAmount)}</td> : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-2">
              <Panel title={t('sales.paymentHistory')}>
                {sale.payments?.length ? (
                  <div className="space-y-3">
                    {sale.payments.map((payment) => (
                      <div
                        key={payment.id}
                        className="rounded-2xl border border-slate-200 p-4"
                      >
                        <div className="flex justify-between gap-4">
                          <p className="font-bold text-slate-950">
                            {formatKgs(payment.amount)}
                          </p>
                          <div className="flex items-center gap-2">
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                              {payment.status === 'VOID'
                                ? 'VOID'
                                : formatPaymentMethodLabel(payment.method, t)}
                            </span>
                            {payment.status !== 'VOID' && canVoidPayment(currentUser) ? (
                              <button
                                onClick={() => void voidPayment(payment.id)}
                                className="rounded-full border border-red-200 px-3 py-1 text-xs font-bold text-red-600 hover:bg-red-50"
                                type="button"
                              >
                                Void
                              </button>
                            ) : null}
                          </div>
                        </div>
                        <div className="mt-1">
                          <BusinessDateField
                            entityType="Payment"
                            entityId={payment.id}
                            fieldName="paidAt"
                            value={payment.paidAt}
                            canEdit={canUpdateBusinessDate(currentUser) && payment.status !== 'VOID'}
                            onUpdated={loadSale}
                          />
                        </div>
                        {payment.note ? (
                          <p className="mt-2 text-sm text-slate-700">
                            {payment.note}
                          </p>
                        ) : null}
                        {payment.method === 'CASH' && payment.cashReceived != null ? (
                          <p className="mt-2 text-sm text-slate-600">
                            {t('sales.cashReceived')}: {formatKgs(payment.cashReceived)}
                          </p>
                        ) : null}
                        {payment.method === 'CASH' &&
                        payment.changeAmount != null &&
                        Number(payment.changeAmount) > 0 ? (
                          <p className="mt-1 text-sm text-slate-600">
                            {t('sales.changeAmount')}: {formatKgs(payment.changeAmount)}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">{t('sales.noPayments')}</p>
                )}
              </Panel>

              <Panel title={t('sales.installment')}>
                {isInstallment && installmentStatusKey ? (
                  <p
                    className={`mb-4 rounded-xl px-4 py-3 text-sm font-semibold ${
                      installmentApproved
                        ? 'bg-green-50 text-green-800'
                        : installmentRejected || installmentCancelled
                          ? 'bg-red-50 text-red-700'
                          : 'bg-amber-50 text-amber-800'
                    }`}
                  >
                    {t(installmentStatusKey)}
                    {installmentRejected && installmentApproval?.rejectionReason
                      ? `: ${installmentApproval.rejectionReason}`
                      : ''}
                    {installmentCancelled && installmentApproval?.rejectionReason
                      ? `: ${installmentApproval.rejectionReason}`
                      : ''}
                    {installmentApproved && installmentApproval?.approvalComment
                      ? `: ${installmentApproval.approvalComment}`
                      : ''}
                  </p>
                ) : null}
                {showCancelForm ? (
                  <div className="mb-4 space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <label className="block text-sm font-semibold text-amber-900">
                      {t('sales.installmentCancellationReason')}
                      <textarea
                        value={cancellationReason}
                        onChange={(event) => setCancellationReason(event.target.value)}
                        className="mt-2 w-full rounded-xl border border-amber-200 px-3 py-2 text-sm text-slate-900"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={submittingInstallment}
                      onClick={() => void cancelInstallmentRequest()}
                      className="rounded-xl bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
                    >
                      {t('sales.confirmCancelInstallment')}
                    </button>
                  </div>
                ) : null}
                {showRejectForm ? (
                  <div className="mb-4 space-y-2 rounded-xl border border-red-200 bg-red-50 p-4">
                    <label className="block text-sm font-semibold text-red-800">
                      {t('sales.installmentRejectionReason')}
                      <textarea
                        value={rejectionReason}
                        onChange={(event) => setRejectionReason(event.target.value)}
                        className="mt-2 w-full rounded-xl border border-red-200 px-3 py-2 text-sm text-slate-900"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={submittingInstallment}
                      onClick={() => void rejectInstallmentRequest()}
                      className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {t('sales.confirmRejectInstallment')}
                    </button>
                  </div>
                ) : null}
                {installmentApproval ? (
                  <div className="mb-4 grid gap-2 text-sm text-slate-700 md:grid-cols-2">
                    <p>
                      <span className="font-semibold">{t('sales.installmentRequestNumber')}:</span>{' '}
                      {installmentApproval.requestNumber}
                    </p>
                    <p>
                      <span className="font-semibold">{t('sales.downPayment')}:</span>{' '}
                      {formatKgs(installmentApproval.downPayment ?? installmentApproval.initialPayment)}
                    </p>
                    <p>
                      <span className="font-semibold">{t('sales.installmentFinancedAmount')}:</span>{' '}
                      {formatKgs(installmentApproval.remainingDebt ?? installmentApproval.financedAmount)}
                    </p>
                    {installmentApproval.dueDate ? (
                      <p>
                        <span className="font-semibold">{t('sales.finalPaymentDate')}:</span>{' '}
                        {new Date(installmentApproval.dueDate).toLocaleDateString()}
                      </p>
                    ) : null}
                    {installmentApproval.notes ? (
                      <p className="md:col-span-2">
                        <span className="font-semibold">{t('sales.installmentComment')}:</span>{' '}
                        {installmentApproval.notes}
                      </p>
                    ) : null}
                    {installmentApproval.submittedAt ? (
                      <p>
                        <span className="font-semibold">{t('sales.sentForApprovalAt')}:</span>{' '}
                        {new Date(installmentApproval.submittedAt).toLocaleString()}
                      </p>
                    ) : null}
                    {installmentRejected && installmentApproval.rejectedBy ? (
                      <p>
                        <span className="font-semibold">{t('sales.rejectedBy')}:</span>{' '}
                        {installmentApproval.rejectedBy.fullName}
                      </p>
                    ) : null}
                    {installmentRejected && installmentApproval.rejectedAt ? (
                      <p>
                        <span className="font-semibold">{t('sales.rejectedAt')}:</span>{' '}
                        {new Date(installmentApproval.rejectedAt).toLocaleString()}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {sale.installments?.length ? (
                  <div className="space-y-3">
                    {sale.installments.map((installment) => (
                      <div
                        key={installment.id}
                        className="rounded-2xl border border-slate-200 p-4"
                      >
                        <div className="flex justify-between gap-4">
                          <p className="font-bold text-slate-950">
                            {formatKgs(installment.amount)}
                          </p>
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                            {getStatusLabel({ module: 'installment', status: installment.status, t })}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-slate-500">
                          {t('common.date')} {new Date(installment.dueDate).toLocaleDateString()}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {t('sales.paidAmount')} {formatKgs(installment.paidAmount)}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">
                    {t('sales.noInstallments')}
                  </p>
                )}
              </Panel>
            </div>

            <SaleReceipt sale={sale} />
          </>
        ) : null}
      </section>
    </ProtectedShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 break-words font-bold text-slate-900">{value}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold text-slate-950">{value}</p>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-bold text-slate-950">{title}</h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function formatKgs(value: number | string | null | undefined) {
  return `${Number(value ?? 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} KGS`;
}
