'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { SaleSelectedCustomerCard } from '@/components/sales/SaleSelectedCustomerCard';
import {
  SaleFormSection,
  SaleFormSummary,
  SaleInput,
  formatMoneyKgs,
} from '@/components/sales/SaleFormPrimitives';
import { SALE_PAYMENT_METHODS, formatPaymentMethodLabel } from '@/lib/sale-payment-methods';
import { apiFetch } from '@/lib/api';
import { usesUnifiedNavPageTitle } from '@/lib/unified-nav-page-title';
import type { PaymentMethod, Sale, SaleItem, User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';
import type { SaleCustomerOption } from '@/components/SaleCustomerSearch';

import { toast } from '@/lib/toast';

type ReturnReason =
  | 'DEFECTIVE'
  | 'WRONG_PRODUCT'
  | 'WRONG_MODEL'
  | 'CUSTOMER_CHANGED_MIND'
  | 'WARRANTY_RETURN'
  | 'SHIPPING_DAMAGE'
  | 'OTHER';

type ReturnOrderListItem = {
  id: string;
  saleId?: string | null;
  status: string;
  items: Array<{ productId: string; quantity: number }>;
};

type ReturnItemRow = {
  saleItemId: string;
  productId: string;
  productName: string;
  productSku: string;
  purchasedQty: number;
  alreadyReturnedQty: number;
  quantity: string;
  unitPrice: string;
};

const RETURN_REASONS: ReturnReason[] = [
  'DEFECTIVE',
  'WRONG_PRODUCT',
  'WRONG_MODEL',
  'CUSTOMER_CHANGED_MIND',
  'WARRANTY_RETURN',
  'SHIPPING_DAMAGE',
  'OTHER',
];

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export default function NewReturnPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [saleSearch, setSaleSearch] = useState('');
  const [saleResults, setSaleResults] = useState<Sale[]>([]);
  const [searchingSales, setSearchingSales] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [existingReturns, setExistingReturns] = useState<ReturnOrderListItem[]>([]);
  const [items, setItems] = useState<ReturnItemRow[]>([]);
  const [reason, setReason] = useState<ReturnReason>('DEFECTIVE');
  const [reasonNote, setReasonNote] = useState('');
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>('CASH');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const showPageTitle = !usesUnifiedNavPageTitle(user);

  useEffect(() => {
    void apiFetch<User>('/auth/me').then(setUser).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    apiFetch<ReturnOrderListItem[]>('/returns')
      .then(setExistingReturns)
      .catch(() => setExistingReturns([]));
  }, []);

  useEffect(() => {
    if (!saleSearch.trim()) {
      setSaleResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      setSearchingSales(true);
      void apiFetch<Sale[]>(`/sales?search=${encodeURIComponent(saleSearch.trim())}`)
        .then((sales) => setSaleResults(sales.filter((sale) => sale.status === 'FINALIZED').slice(0, 10)))
        .catch(() => setSaleResults([]))
        .finally(() => setSearchingSales(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [saleSearch]);

  const customerCard = useMemo((): SaleCustomerOption | null => {
    if (!selectedSale?.customer) return null;
    return {
      id: selectedSale.customer.id,
      fullName: selectedSale.customer.fullName,
      phone: selectedSale.customer.phone,
      whatsappPhone: selectedSale.customer.whatsappPhone,
      status: selectedSale.customer.status,
      totalDebtAmount: Number(selectedSale.customer.totalDebtAmount ?? 0),
      hasOverdueInstallment: false,
    };
  }, [selectedSale]);

  function returnedQtyForProduct(saleId: string, productId: string) {
    return existingReturns
      .filter((ret) => ret.saleId === saleId && ret.status !== 'CANCELLED')
      .flatMap((ret) => ret.items)
      .filter((item) => item.productId === productId)
      .reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
  }

  async function selectSale(sale: Sale) {
    setError('');
    setSaleSearch('');
    setSaleResults([]);
    try {
      const fullSale = await apiFetch<Sale>(`/sales/${sale.id}`);
      const saleItems = fullSale.items ?? [];
      const rows: ReturnItemRow[] = saleItems
        .filter((item): item is SaleItem & { productId: string } => Boolean(item.productId))
        .map((item) => {
          const purchasedQty = Number(item.quantity);
          const alreadyReturnedQty = returnedQtyForProduct(fullSale.id, item.productId);
          const available = Math.max(purchasedQty - alreadyReturnedQty, 0);
          return {
            saleItemId: item.id,
            productId: item.productId,
            productName: item.productName,
            productSku: item.productSku ?? '',
            purchasedQty,
            alreadyReturnedQty,
            quantity: available > 0 ? '0' : '0',
            unitPrice: String(item.unitPrice),
          };
        })
        .filter((row) => row.purchasedQty - row.alreadyReturnedQty > 0);
      setSelectedSale(fullSale);
      setItems(rows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function clearSale() {
    setSelectedSale(null);
    setItems([]);
    setSaleSearch('');
  }

  function updateItem(productId: string, patch: Partial<ReturnItemRow>) {
    setItems((current) =>
      current.map((item) => (item.productId === productId ? { ...item, ...patch } : item)),
    );
  }

  const totals = useMemo(() => {
    const activeItems = items.filter((item) => Number(item.quantity || 0) > 0);
    const totalQuantity = activeItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const refundAmount = roundMoney(
      activeItems.reduce(
        (sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0),
        0,
      ),
    );
    return { positions: activeItems.length, totalQuantity, refundAmount };
  }, [items]);

  async function submitReturn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSale || !customerCard) {
      setError(t('operations.returnSaleRequired'));
      return;
    }
    const returnItems = items
      .map((item) => ({
        ...item,
        qty: Number(item.quantity || 0),
        max: item.purchasedQty - item.alreadyReturnedQty,
      }))
      .filter((item) => item.qty > 0);

    if (returnItems.length === 0) {
      setError(t('operations.returnItemsRequired'));
      return;
    }

    for (const item of returnItems) {
      if (item.qty > item.max) {
        setError(t('operations.returnQtyExceeded'));
        return;
      }
    }

    if (reason === 'OTHER' && !reasonNote.trim()) {
      setError(t('operations.returnReasonNoteRequired'));
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const noteParts = [
        `${t('operations.refundMethod')}: ${formatPaymentMethodLabel(refundMethod, t)}`,
        reasonNote.trim() || undefined,
      ].filter(Boolean);

      const created = await apiFetch<{ id: string }>('/returns', {
        method: 'POST',
        body: JSON.stringify({
          customerId: customerCard.id,
          saleId: selectedSale.id,
          reason,
          note: noteParts.join('\n'),
          items: returnItems.map((item) => ({
            productId: item.productId,
            quantity: item.qty,
            unitPrice: Number(item.unitPrice),
            defective: reason === 'DEFECTIVE',
          })),
        }),
      });
      router.push('/returns');
      void created;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ProtectedShell>
      <form onSubmit={submitReturn} className="space-y-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            {showPageTitle ? (
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">
                {t('operations.returns')}
              </p>
            ) : null}
            <h2 className="text-3xl font-bold text-slate-950">{t('operations.createReturn')}</h2>
          </div>
          <Link
            href="/returns"
            className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            {t('common.cancel')}
          </Link>
        </div>

        {error ? (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        ) : null}

        <SaleFormSection title={t('operations.returnSourceSale')}>
          {!selectedSale ? (
            <div className="space-y-3">
              <SaleInput
                label={t('operations.returnSaleSearch')}
                value={saleSearch}
                onChange={setSaleSearch}
              />
              {searchingSales ? (
                <p className="text-sm text-slate-500">{t('common.loading')}</p>
              ) : null}
              {saleResults.length > 0 ? (
                <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
                  {saleResults.map((sale) => (
                    <li key={sale.id}>
                      <button
                        type="button"
                        onClick={() => void selectSale(sale)}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
                      >
                        <div>
                          <p className="font-semibold text-slate-900">{sale.receiptNumber}</p>
                          <p className="text-sm text-slate-500">
                            {sale.customer?.fullName} · {formatMoneyKgs(sale.totalAmount)}
                          </p>
                        </div>
                        <span className="text-xs text-slate-400">
                          {new Date(sale.saleDate).toLocaleDateString('ru-RU')}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : saleSearch.trim() && !searchingSales ? (
                <p className="text-sm text-slate-500">{t('sales.customerSearch.noResults')}</p>
              ) : null}
            </div>
          ) : (
            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
                    {t('operations.returnSelectedSale')}
                  </p>
                  <p className="mt-2 text-lg font-bold text-slate-950">{selectedSale.receiptNumber}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {new Date(selectedSale.saleDate).toLocaleString('ru-RU')} ·{' '}
                    {formatMoneyKgs(selectedSale.totalAmount)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={clearSale}
                  className="rounded-lg border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-white"
                >
                  {t('common.change')}
                </button>
              </div>
            </div>
          )}
        </SaleFormSection>

        {customerCard ? (
          <SaleFormSection title={t('sales.customer')}>
            <SaleSelectedCustomerCard customer={customerCard} readOnly />
          </SaleFormSection>
        ) : null}

        {selectedSale && items.length > 0 ? (
          <SaleFormSection title={t('operations.returnProducts')}>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">{t('sales.product')}</th>
                    <th className="px-3 py-2">{t('sales.sku')}</th>
                    <th className="px-3 py-2">{t('operations.returnPurchased')}</th>
                    <th className="px-3 py-2">{t('operations.returnAlreadyReturned')}</th>
                    <th className="px-3 py-2">{t('operations.returnAvailable')}</th>
                    <th className="px-3 py-2">{t('operations.returnQty')}</th>
                    <th className="px-3 py-2">{t('sales.unitPrice')}</th>
                    <th className="px-3 py-2">{t('sales.totalAmount')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item) => {
                    const available = item.purchasedQty - item.alreadyReturnedQty;
                    const qty = Number(item.quantity || 0);
                    const qtyError = qty > available;
                    const lineTotal = qty * Number(item.unitPrice || 0);
                    return (
                      <tr key={item.productId}>
                        <td className="px-3 py-2 font-medium">{item.productName}</td>
                        <td className="px-3 py-2">{item.productSku}</td>
                        <td className="px-3 py-2">{item.purchasedQty}</td>
                        <td className="px-3 py-2">{item.alreadyReturnedQty}</td>
                        <td className="px-3 py-2">{available}</td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            max={available}
                            value={item.quantity}
                            onChange={(e) => updateItem(item.productId, { quantity: e.target.value })}
                            className={`w-20 rounded-lg border px-2 py-1 ${qtyError ? 'border-red-300' : 'border-slate-300'}`}
                          />
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">{formatMoneyKgs(item.unitPrice)}</td>
                        <td className="whitespace-nowrap px-3 py-2 font-semibold">
                          {formatMoneyKgs(lineTotal)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SaleFormSection>
        ) : selectedSale ? (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {t('operations.returnNoReturnableItems')}
          </p>
        ) : null}

        {selectedSale ? (
          <SaleFormSection title={t('operations.returnRefundSection')}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">{t('operations.returnReason')}</span>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value as ReturnReason)}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                >
                  {RETURN_REASONS.map((value) => (
                    <option key={value} value={value}>
                      {t(`operations.returnReason.${value}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">{t('operations.refundMethod')}</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {SALE_PAYMENT_METHODS.map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setRefundMethod(method)}
                      className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                        refundMethod === method
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {formatPaymentMethodLabel(method, t)}
                    </button>
                  ))}
                </div>
              </label>
              {reason === 'OTHER' ? (
                <div className="md:col-span-2">
                  <SaleInput
                    label={t('operations.returnReasonNote')}
                    value={reasonNote}
                    onChange={setReasonNote}
                    required
                  />
                </div>
              ) : (
                <div className="md:col-span-2">
                  <SaleInput label={t('crm.notes')} value={reasonNote} onChange={setReasonNote} />
                </div>
              )}
            </div>
          </SaleFormSection>
        ) : null}

        {selectedSale ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <h3 className="text-lg font-bold text-slate-950">{t('sales.summary')}</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SaleFormSummary label={t('operations.returnPositions')} value={String(totals.positions)} />
              <SaleFormSummary label={t('sales.totalQuantity')} value={String(totals.totalQuantity)} />
              <SaleFormSummary label={t('operations.refundAmount')} value={formatMoneyKgs(totals.refundAmount)} />
              <SaleFormSummary
                label={t('operations.refundMethod')}
                value={formatPaymentMethodLabel(refundMethod, t)}
              />
            </div>
          </section>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="submit"
            disabled={submitting || !selectedSale || totals.positions === 0}
            className="rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {submitting ? t('common.loading') : t('operations.createReturn')}
          </button>
        </div>
      </form>
    </ProtectedShell>
  );
}
