'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { canCancelSale, canManageSaleWorkflow, canVoidPayment, isBranchSalesManagerUser } from '@/lib/rbac';
import type { PaymentMethod, Sale, User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

const paymentMethods: PaymentMethod[] = [
  'CASH',
  'QR',
  'CARD',
  'BANK_TRANSFER',
  'MBANK',
  'ELCART',
  'BALANCE',
];

export default function SaleDetailPage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const saleId = params.id;
  const [sale, setSale] = useState<Sale | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingPayment, setSavingPayment] = useState(false);
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
      setSuccess('Payment added successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSavingPayment(false);
    }
  }

  async function runSaleAction(
    path: 'send-whatsapp' | 'approve' | 'finalize' | 'cancel',
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

  const branchSalesView = isBranchSalesManagerUser(currentUser);

  return (
    <ProtectedShell>
      <section className="space-y-6">
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
            <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
              <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col justify-between gap-4 md:flex-row">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">
                      {t('sales.title')}
                    </p>
                    <h2 className="mt-2 text-3xl font-bold text-slate-950">
                      {sale.receiptNumber}
                    </h2>
                    <p className="mt-2 text-slate-500">
                      {new Date(sale.saleDate).toLocaleString()}
                    </p>
                  </div>
                  <span className="h-fit rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700">
                    {sale.status} · {t(`paymentStatus.${sale.paymentStatus}`)}
                  </span>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <Info label={t('sales.customer')} value={sale.customer?.fullName ?? ''} />
                  <Info label={t('crm.phone')} value={sale.customer?.phone ?? ''} />
                  <Info label={t('sales.seller')} value={sale.seller?.fullName ?? ''} />
                  <Info label={t('crm.branch')} value={sale.branch?.name ?? ''} />
                </div>

                <div className={`mt-6 grid gap-4 ${branchSalesView ? 'md:grid-cols-3' : 'md:grid-cols-4'}`}>
                  <Metric label={t('sales.totalAmount')} value={formatKgs(sale.totalAmount)} />
                  <Metric label={t('sales.paidAmount')} value={formatKgs(sale.paidAmount)} />
                  <Metric label={t('sales.debtAmount')} value={formatKgs(sale.debtAmount)} />
                  {!branchSalesView ? (
                    <Metric label={t('sales.profitAmount')} value={formatKgs(sale.profitAmount)} />
                  ) : null}
                </div>
                <div className="mt-6 flex flex-wrap gap-2 print:hidden">
                  {canManageSaleWorkflow(currentUser) ? (
                    <>
                  <button
                    onClick={() => void runSaleAction('send-whatsapp')}
                    disabled={sale.status === 'FINALIZED' || sale.status === 'CANCELLED'}
                    className="rounded-xl border border-green-200 px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-50 disabled:opacity-50"
                    type="button"
                  >
                    Send WhatsApp
                  </button>
                  <button
                    onClick={() => void runSaleAction('approve')}
                    disabled={sale.status === 'FINALIZED' || sale.status === 'CANCELLED'}
                    className="rounded-xl border border-amber-200 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                    type="button"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => void runSaleAction('finalize')}
                    disabled={sale.status === 'FINALIZED' || sale.status === 'CANCELLED'}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                    type="button"
                  >
                    Finalize
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
                  className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
                >
                  <h3 className="text-lg font-bold text-slate-950">{t('sales.addPayment')}</h3>
                  <div className="mt-4 space-y-3">
                    <label className="block">
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
                        className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring-2"
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm font-semibold text-slate-700">
                        {t('sales.paymentMethod')}
                      </span>
                      <select
                        value={method}
                        onChange={(event) =>
                          setMethod(event.target.value as PaymentMethod)
                        }
                        className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring-2"
                      >
                        {paymentMethods.map((paymentMethod) => (
                          <option key={paymentMethod} value={paymentMethod}>
                            {paymentMethod}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-sm font-semibold text-slate-700">
                        {t('crm.notes')}
                      </span>
                      <textarea
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        className="mt-2 min-h-20 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring-2"
                      />
                    </label>
                  </div>
                  <button
                    disabled={savingPayment || sale.debtAmount <= 0}
                    className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                    type="submit"
                  >
                    {savingPayment ? t('common.loading') : t('sales.addPayment')}
                  </button>
                </form>
              ) : null}
            </div>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-bold text-slate-950">{t('sales.saleItems')}</h3>
              <div className="mt-4 overflow-x-auto">
                <table className={`divide-y divide-slate-200 text-sm ${branchSalesView ? 'min-w-[720px]' : 'min-w-[860px]'}`}>
                  <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">{t('sales.product')}</th>
                      <th className="px-4 py-3">{t('sales.sku')}</th>
                      <th className="px-4 py-3">{t('sales.quantity')}</th>
                      <th className="px-4 py-3">{t('sales.unitPrice')}</th>
                      {!branchSalesView ? <th className="px-4 py-3">{t('sales.unitCost')}</th> : null}
                      <th className="px-4 py-3">{t('sales.totalAmount')}</th>
                      {!branchSalesView ? <th className="px-4 py-3">{t('sales.profitAmount')}</th> : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sale.items?.map((item) => (
                      <tr key={item.id}>
                        <td className="px-4 py-3 font-semibold">
                          {item.productName}
                        </td>
                        <td className="px-4 py-3">{item.productSku ?? '-'}</td>
                        <td className="px-4 py-3">{item.quantity}</td>
                        <td className="px-4 py-3">{formatKgs(item.unitPrice)}</td>
                        {!branchSalesView ? <td className="px-4 py-3">{formatKgs(item.unitCost)}</td> : null}
                        <td className="px-4 py-3">{formatKgs(item.totalPrice)}</td>
                        {!branchSalesView ? <td className="px-4 py-3">{formatKgs(item.profitAmount)}</td> : null}
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
                              {payment.status === 'VOID' ? 'VOID' : payment.method}
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
                        <p className="mt-1 text-sm text-slate-500">
                          {new Date(payment.paidAt).toLocaleString()}
                        </p>
                        {payment.note ? (
                          <p className="mt-2 text-sm text-slate-700">
                            {payment.note}
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
                            {installment.status}
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

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm print:shadow-none">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-950">{t('sales.receipt')}</h3>
                <button
                  onClick={() => window.print()}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 print:hidden"
                  type="button"
                >
                  {t('sales.printReceipt')}
                </button>
              </div>
              <div className="mt-4 rounded-2xl border border-dashed border-slate-300 p-5">
                <p className="text-2xl font-black text-slate-950">EMOTORS</p>
                <p className="mt-2 font-bold">{sale.receiptNumber}</p>
                <p>Date: {new Date(sale.saleDate).toLocaleString()}</p>
                <p>{t('sales.seller')}: {sale.seller?.fullName}</p>
                <p>{t('sales.customer')}: {sale.customer?.fullName}</p>
                <p>{t('crm.phone')}: {sale.customer?.phone}</p>
                <div className="my-4 border-t border-slate-200 pt-4">
                  {sale.items?.map((item) => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <span>
                        {item.productName} x {item.quantity}
                      </span>
                      <span>{formatKgs(item.totalPrice)}</span>
                    </div>
                  ))}
                </div>
                <p>{t('sales.totalAmount')}: {formatKgs(sale.totalAmount)}</p>
                <p>{t('sales.paidAmount')}: {formatKgs(sale.paidAmount)}</p>
                <p>{t('sales.debtAmount')}: {formatKgs(sale.debtAmount)}</p>
                <p>{t('common.status')}: {t(`paymentStatus.${sale.paymentStatus}`)}</p>
                <pre className="mt-4 whitespace-pre-wrap rounded-xl bg-slate-100 p-4 text-xs">
                  {sale.receipt?.qrCodeData ?? 'QR placeholder'}
                </pre>
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
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 font-bold text-slate-900">{value}</p>
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
