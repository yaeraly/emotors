'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { SaleCustomerSearch, type SaleCustomerOption } from '@/components/SaleCustomerSearch';
import { SaleProductSearch, type SaleProductOption } from '@/components/SaleProductSearch';
import { apiFetch } from '@/lib/api';
import { isBranchSalesManagerUser } from '@/lib/rbac';
import type {
  PaymentMethod,
  Sale,
  User,
  WhatsAppDraftResponse,
} from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type SaleItemForm = {
  productId: string;
  productName: string;
  productSku: string;
  unit: string;
  quantity: string;
  listPrice: number;
  discountPercent: string;
  unitPrice: string;
  unitCost: string;
  availableQty: number;
  maxDiscountPercent: number;
};

const paymentMethods: PaymentMethod[] = [
  'CASH',
  'QR',
  'CARD',
  'BANK_TRANSFER',
  'MBANK',
  'ELCART',
  'BALANCE',
];

type PaymentRow = {
  amount: string;
  method: PaymentMethod;
  note: string;
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function priceFromDiscount(listPrice: number, discountPercent: number) {
  return roundMoney(listPrice * (1 - discountPercent / 100));
}

export default function NewSalePage() {
  const router = useRouter();
  const { t } = useTranslation();
  const productSearchRef = useRef<HTMLInputElement>(null);
  const [user, setUser] = useState<User | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<SaleCustomerOption | null>(null);
  const [includeArchivedCustomers, setIncludeArchivedCustomers] = useState(false);
  const [items, setItems] = useState<SaleItemForm[]>([]);
  const [paymentRows, setPaymentRows] = useState<PaymentRow[]>([
    { amount: '0', method: 'CASH', note: '' },
  ]);
  const [draftSale, setDraftSale] = useState<Sale | null>(null);
  const [paymentsSynced, setPaymentsSynced] = useState(false);
  const [installmentDays, setInstallmentDays] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const branchSalesManagerView = isBranchSalesManagerUser(user);

  useEffect(() => {
    apiFetch<User>('/auth/me')
      .then(setUser)
      .catch(() => null);
  }, []);

  const totals = useMemo(() => {
    const totalAmount = items.reduce(
      (sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0),
      0,
    );
    const totalCost = items.reduce(
      (sum, item) => sum + Number(item.quantity || 0) * Number(item.unitCost || 0),
      0,
    );
    const profit = totalAmount - totalCost;
    const paid = Math.min(
      paymentRows.reduce((sum, row) => sum + Number(row.amount || 0), 0),
      totalAmount,
    );
    const debt = Math.max(totalAmount - paid, 0);

    return { totalAmount, totalCost, profit, paid, debt };
  }, [items, paymentRows]);

  function handleCustomerSelect(customer: SaleCustomerOption) {
    setSelectedCustomer(customer);
    setError('');
  }

  function handleProductSelect(product: SaleProductOption) {
    if (items.some((item) => item.productId === product.id)) {
      setError(t('sales.productSearch.alreadyAdded'));
      return;
    }

    setItems((current) => [
      ...current,
      {
        productId: product.id,
        productName: product.name,
        productSku: product.sku,
        unit: product.unit,
        quantity: '1',
        listPrice: product.sellingPriceKgs,
        discountPercent: '0',
        unitPrice: String(product.sellingPriceKgs),
        unitCost: '0',
        availableQty: product.availableQty,
        maxDiscountPercent: product.maximumDiscountPercent,
      },
    ]);
    setError('');
  }

  function updateItem(index: number, updates: Partial<SaleItemForm>) {
    setItems((current) =>
      current.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        const next = { ...item, ...updates };

        if ('discountPercent' in updates || 'quantity' in updates) {
          const discount = Number(next.discountPercent || 0);
          if (discount > next.maxDiscountPercent + 0.01) {
            setError(t('pricing.discountExceeded'));
          } else {
            setError('');
          }
          next.unitPrice = String(priceFromDiscount(next.listPrice, discount));
        }

        if ('unitPrice' in updates && !branchSalesManagerView) {
          next.unitPrice = updates.unitPrice ?? next.unitPrice;
        }

        const quantity = Number(next.quantity || 0);
        if (quantity > next.availableQty) {
          setError(`${t('sales.productSearch.insufficientStock')} ${next.availableQty}`);
        }

        return next;
      }),
    );
  }

  function removeItem(index: number) {
    setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setError('');
  }

  function updatePayment(index: number, updates: Partial<PaymentRow>) {
    setPaymentsSynced(false);
    setPaymentRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...updates } : row,
      ),
    );
  }

  function addPaymentRow() {
    setPaymentsSynced(false);
    setPaymentRows((current) => [
      ...current,
      { amount: '0', method: 'CASH', note: '' },
    ]);
  }

  function removePaymentRow(index: number) {
    setPaymentsSynced(false);
    setPaymentRows((current) => current.filter((_, rowIndex) => rowIndex !== index));
  }

  function buildSalePayload() {
    setError('');

    if (!selectedCustomer) {
      setError(t('sales.selectCustomer'));
      return null;
    }

    const validItems = items.map((item) => ({
      productId: item.productId,
      productName: item.productName.trim(),
      productSku: item.productSku.trim() || undefined,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      unitCost: Number(item.unitCost || 0),
    }));

    if (
      validItems.length === 0 ||
      validItems.some(
        (item) =>
          !item.productId ||
          !item.productName ||
          item.quantity <= 0 ||
          item.unitPrice < 0,
      )
    ) {
      setError(t('sales.validationItems'));
      return null;
    }

    for (const [index, item] of items.entries()) {
      const quantity = Number(item.quantity || 0);
      if (quantity > item.availableQty) {
        setError(`${t('sales.productSearch.insufficientStock')} ${item.availableQty}`);
        return null;
      }
      const discount = Number(item.discountPercent || 0);
      if (discount > item.maxDiscountPercent + 0.01) {
        setError(t('pricing.discountExceeded'));
        return null;
      }
      if (!validItems[index]?.productId) {
        setError(t('sales.validationItems'));
        return null;
      }
    }

    return {
      customerId: selectedCustomer.id,
      items: validItems,
      installmentDays: installmentDays ? Number(installmentDays) : undefined,
      dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
      notes: notes.trim() || undefined,
    };
  }

  async function saveDraft() {
    const payload = buildSalePayload();
    if (!payload) {
      return null;
    }
    setSaving(true);

    try {
      let sale = await apiFetch<Sale>(
        draftSale ? `/sales/${draftSale.id}` : '/sales/draft',
        {
          method: draftSale ? 'PUT' : 'POST',
          body: JSON.stringify(payload),
        },
      );

      if (!paymentsSynced) {
        for (const row of paymentRows) {
          const amount = Number(row.amount || 0);
          if (amount > 0) {
            sale = await apiFetch<Sale>(`/sales/${sale.id}/payments`, {
              method: 'POST',
              body: JSON.stringify({
                amount,
                method: row.method,
                note: row.note.trim() || undefined,
              }),
            });
          }
        }
        setPaymentsSynced(true);
      }

      setDraftSale(sale);
      return sale;
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function saveSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sale = await saveDraft();
    if (sale) {
      setError('');
    }
  }

  async function sendWhatsApp() {
    const sale = await saveDraft();
    if (!sale) return;

    try {
      const response = await apiFetch<WhatsAppDraftResponse>(
        `/sales/${sale.id}/send-whatsapp`,
        { method: 'POST' },
      );
      setDraftSale(response.sale);
      window.open(response.whatsappLink, '_blank', 'noopener,noreferrer');
      setError(t('sales.whatsappSent'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function approveSale() {
    const sale = await saveDraft();
    if (!sale) return;

    try {
      const approved = await apiFetch<Sale>(`/sales/${sale.id}/approve`, {
        method: 'POST',
      });
      setDraftSale(approved);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function finalizeSale() {
    if (!draftSale) {
      setError(t('sales.finalizeBeforeApproval'));
      return;
    }

    if (
      draftSale.status !== 'APPROVED_BY_CUSTOMER' &&
      draftSale.status !== 'SENT_TO_CUSTOMER'
    ) {
      setError(t('sales.finalizeBeforeApproval'));
      return;
    }

    try {
      const finalized = await apiFetch<Sale>(`/sales/${draftSale.id}/finalize`, {
        method: 'POST',
      });
      router.push(`/sales/${finalized.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function cancelSale() {
    if (!draftSale) return;

    try {
      const cancelled = await apiFetch<Sale>(`/sales/${draftSale.id}/cancel`, {
        method: 'POST',
      });
      setDraftSale(cancelled);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  return (
    <ProtectedShell>
      <form onSubmit={saveSale} className="space-y-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">
              {t('sales.newSale')}
            </p>
            <h2 className="text-3xl font-bold text-slate-950">
              {t('sales.registerSale')}
            </h2>
            <p className="mt-2 text-slate-500">
              {t('sales.registerSaleHint')}
            </p>
          </div>
          <button
            disabled={saving}
            className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
            type="submit"
          >
            {saving ? t('common.loading') : t('sales.saveDraft')}
          </button>
        </div>

        {error ? (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex-1">
              <h3 className="text-lg font-bold text-slate-950">{t('sales.customer')}</h3>
              <div className="mt-4">
                <SaleCustomerSearch
                  disabled={!!selectedCustomer}
                  includeArchived={includeArchivedCustomers}
                  onSelect={handleCustomerSelect}
                />
              </div>
              <label className="mt-4 flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={includeArchivedCustomers}
                  onChange={(event) => setIncludeArchivedCustomers(event.target.checked)}
                  className="rounded border-slate-300"
                />
                {t('sales.customerSearch.showArchived')}
              </label>
            </div>

            {selectedCustomer ? (
              <div className="min-w-72 rounded-2xl border border-blue-100 bg-blue-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
                      {t('sales.customerSelected')}
                    </p>
                    <p className="mt-2 text-lg font-bold text-slate-950">{selectedCustomer.fullName}</p>
                    <p className="mt-1 text-sm text-slate-700">{selectedCustomer.phone}</p>
                    <p className="mt-2 text-sm text-slate-600">
                      {t(`status.${selectedCustomer.status}`)}
                    </p>
                    {selectedCustomer.totalDebtAmount > 0 ? (
                      <p className="mt-2 text-sm font-medium text-amber-700">
                        {t('sales.debtAmount')}: {selectedCustomer.totalDebtAmount.toLocaleString('ru-RU')} KGS
                      </p>
                    ) : null}
                    {selectedCustomer.hasOverdueInstallment ? (
                      <p className="mt-2 text-sm font-semibold text-red-700">
                        {t('sales.customerSearch.overdue')}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedCustomer(null)}
                    className="rounded-lg border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-white"
                  >
                    {t('common.change')}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-950">{t('sales.saleItems')}</h3>

          <div className="mt-4">
            <SaleProductSearch
              disabled={!selectedCustomer}
              inputRef={productSearchRef}
              onSelect={handleProductSelect}
            />
          </div>

          {items.length === 0 ? (
            <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
              {t('sales.productSearch.empty')}
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              {items.map((item, index) => {
                const itemTotal =
                  Number(item.quantity || 0) * Number(item.unitPrice || 0);
                const quantityError = Number(item.quantity || 0) > item.availableQty;

                return (
                  <div
                    key={`${item.productId}-${index}`}
                    className="grid gap-3 rounded-2xl border border-slate-200 p-4 lg:grid-cols-8"
                  >
                    <div className="lg:col-span-2">
                      <p className="text-xs font-semibold uppercase text-slate-400">{t('sales.product')}</p>
                      <p className="mt-1 font-semibold text-slate-950">{item.productName}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {t('sales.sku')}: {item.productSku} • {item.unit}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {t('sales.productSearch.available')}: {item.availableQty}
                      </p>
                    </div>
                    <SaleInput
                      label={t('sales.quantity')}
                      type="number"
                      value={item.quantity}
                      onChange={(value) => updateItem(index, { quantity: value })}
                      required
                      error={quantityError ? `${t('sales.productSearch.insufficientStock')} ${item.availableQty}` : undefined}
                    />
                    {item.maxDiscountPercent > 0 ? (
                      <SaleInput
                        label={t('sales.discountPercent')}
                        type="number"
                        value={item.discountPercent}
                        onChange={(value) => updateItem(index, { discountPercent: value })}
                      />
                    ) : null}
                    <SaleInput
                      label={t('sales.unitPrice')}
                      type="number"
                      value={item.unitPrice}
                      onChange={(value) => updateItem(index, { unitPrice: value })}
                      required
                      readOnly={branchSalesManagerView}
                    />
                    <div className="rounded-xl bg-slate-50 p-3 text-sm">
                      <p className="text-xs font-semibold uppercase text-slate-400">
                        {t('sales.totalAmount')}
                      </p>
                      <p className="font-bold text-slate-900">{formatKgs(itemTotal)}</p>
                    </div>
                    <button
                      onClick={() => removeItem(index)}
                      className="rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                      type="button"
                    >
                      {t('common.delete')}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <div className="grid gap-6 xl:grid-cols-2">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">{t('sales.payments')}</h3>
            <div className="mt-4 space-y-3">
              {paymentRows.map((row, index) => (
                <div key={index} className="grid gap-3 rounded-2xl bg-slate-50 p-3 md:grid-cols-4">
                  <SaleInput
                    label={t('sales.paidAmount')}
                    type="number"
                    value={row.amount}
                    onChange={(value) => updatePayment(index, { amount: value })}
                  />
                  <label className="block">
                    <span className="text-sm font-semibold text-slate-700">
                      {t('sales.paymentMethod')}
                    </span>
                    <select
                      value={row.method}
                      onChange={(event) =>
                        updatePayment(index, {
                          method: event.target.value as PaymentMethod,
                        })
                      }
                      className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring-2"
                    >
                      {paymentMethods.map((method) => (
                        <option key={method} value={method}>
                          {method}
                        </option>
                      ))}
                    </select>
                  </label>
                  <SaleInput
                    label={t('crm.notes')}
                    value={row.note}
                    onChange={(value) => updatePayment(index, { note: value })}
                  />
                  <button
                    onClick={() => removePaymentRow(index)}
                    disabled={paymentRows.length === 1}
                    type="button"
                    className="self-end rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 disabled:opacity-50"
                  >
                    {t('common.delete')}
                  </button>
                </div>
              ))}
              <button
                onClick={addPaymentRow}
                type="button"
                className="rounded-xl border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
              >
                {t('sales.addPayment')}
              </button>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">{t('sales.installment')}</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <SaleInput
                label={t('sales.installment')}
                type="number"
                value={installmentDays}
                onChange={setInstallmentDays}
              />
              <SaleInput
                label={t('common.date')}
                type="date"
                value={dueDate}
                onChange={setDueDate}
              />
            </div>
            <label className="mt-4 block">
              <span className="text-sm font-semibold text-slate-700">{t('crm.notes')}</span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className="mt-2 min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring-2"
              />
            </label>
          </section>
        </div>

        <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-4">
          <Summary label={t('sales.totalAmount')} value={formatKgs(totals.totalAmount)} />
          {!branchSalesManagerView ? (
            <Summary label={t('sales.profitAmount')} value={formatKgs(totals.profit)} />
          ) : null}
          <Summary label={t('sales.paidAmount')} value={formatKgs(totals.paid)} />
          <Summary label={t('sales.debtAmount')} value={formatKgs(totals.debt)} />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
            <div>
              <h3 className="text-lg font-bold text-slate-950">{t('sales.draftReceipt')}</h3>
              <pre className="mt-3 whitespace-pre-wrap rounded-2xl bg-slate-100 p-4 text-sm text-slate-700">
                {draftSale?.draftReceiptText ??
                  `EMOTORS DRAFT RECEIPT\n${t('sales.totalAmount')}: ${formatKgs(totals.totalAmount)}\n${t('sales.paidAmount')}: ${formatKgs(totals.paid)}\n${t('sales.debtAmount')}: ${formatKgs(totals.debt)}`}
              </pre>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:min-w-80">
              <button
                onClick={() => void saveDraft()}
                type="button"
                className="rounded-xl border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
              >
                {t('sales.saveDraft')}
              </button>
              <button
                onClick={() => void sendWhatsApp()}
                type="button"
                className="rounded-xl border border-green-200 px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-50"
              >
                {t('sales.sendWhatsApp')}
              </button>
              <button
                onClick={() => void approveSale()}
                type="button"
                className="rounded-xl border border-amber-200 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50"
              >
                {t('sales.markApproved')}
              </button>
              <button
                onClick={() => void finalizeSale()}
                type="button"
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                {t('sales.finalizeSale')}
              </button>
              <button
                onClick={() => void cancelSale()}
                disabled={!draftSale || draftSale.status === 'CANCELLED'}
                type="button"
                className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                {t('sales.cancelSale')}
              </button>
              {draftSale ? (
                <p className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">
                  {draftSale.status}
                </p>
              ) : null}
            </div>
          </div>
        </section>
      </form>
    </ProtectedShell>
  );
}

function SaleInput({
  label,
  value,
  onChange,
  required,
  type = 'text',
  readOnly,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  readOnly?: boolean;
  error?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        readOnly={readOnly}
        type={type}
        min={type === 'number' ? 0 : undefined}
        step={type === 'number' ? '0.01' : undefined}
        className={`mt-2 w-full rounded-xl border px-3 py-2 outline-none ring-blue-500 focus:ring-2 ${
          readOnly ? 'border-slate-200 bg-slate-100 text-slate-700' : 'border-slate-300'
        } ${error ? 'border-red-300' : ''}`}
      />
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </label>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold text-slate-950">{value}</p>
    </div>
  );
}

function formatKgs(value: number | string | null | undefined) {
  return `${Number(value ?? 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} KGS`;
}
