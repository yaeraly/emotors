'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { SaleCustomerSearch, type SaleCustomerOption } from '@/components/SaleCustomerSearch';
import { SaleProductSearch, type SaleProductOption } from '@/components/SaleProductSearch';
import {
  SaleFormSection,
  SaleFormSummary,
  SaleInput,
  formatMoneyKgs,
  formatCompactDate,
} from '@/components/sales/SaleFormPrimitives';
import { SaleSelectedCustomerCard } from '@/components/sales/SaleSelectedCustomerCard';
import { apiFetch } from '@/lib/api';
import { usesUnifiedNavPageTitle } from '@/lib/unified-nav-page-title';
import { canCreateCustomer } from '@/lib/rbac';
import type { Customer, User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type ReservationItemRow = {
  productId: string;
  productName: string;
  productSku: string;
  unit: string;
  availableQty: number;
  quantity: string;
  unitPrice: string;
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export default function NewReservationPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const productSearchRef = useRef<HTMLInputElement>(null);
  const [user, setUser] = useState<User | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<SaleCustomerOption | null>(null);
  const [items, setItems] = useState<ReservationItemRow[]>([]);
  const [expiresAt, setExpiresAt] = useState(() => {
    const date = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    return date.toISOString().slice(0, 16);
  });
  const [depositAmount, setDepositAmount] = useState('0');
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  const [createCustomerForm, setCreateCustomerForm] = useState({ fullName: '', phone: '', whatsappPhone: '' });
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const canCreateCustomerAction = canCreateCustomer(user);
  const showPageTitle = !usesUnifiedNavPageTitle(user);

  useEffect(() => {
    apiFetch<User>('/auth/me').then(setUser).catch(() => null);
  }, []);

  const totals = useMemo(() => {
    const totalQuantity = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const totalAmount = roundMoney(
      items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0),
    );
    const prepayment = roundMoney(Number(depositAmount || 0));
    return {
      positions: items.length,
      totalQuantity,
      totalAmount,
      prepayment,
      remaining: roundMoney(Math.max(totalAmount - prepayment, 0)),
    };
  }, [items, depositAmount]);

  function handleProductSelect(product: SaleProductOption) {
    setItems((current) => {
      const existing = current.find((item) => item.productId === product.id);
      if (existing) {
        return current.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: String(Number(item.quantity || 0) + 1) }
            : item,
        );
      }
      return [
        ...current,
        {
          productId: product.id,
          productName: product.name,
          productSku: product.sku,
          unit: product.unit,
          availableQty: product.availableQty,
          quantity: '1',
          unitPrice: String(product.sellingPriceKgs),
        },
      ];
    });
    productSearchRef.current?.focus();
  }

  function updateItem(productId: string, patch: Partial<ReservationItemRow>) {
    setItems((current) =>
      current.map((item) => (item.productId === productId ? { ...item, ...patch } : item)),
    );
  }

  function removeItem(productId: string) {
    setItems((current) => current.filter((item) => item.productId !== productId));
  }

  async function createCustomer() {
    setCreatingCustomer(true);
    setError('');
    try {
      const customer = await apiFetch<Customer>('/customers', {
        method: 'POST',
        body: JSON.stringify({
          fullName: createCustomerForm.fullName.trim(),
          phone: createCustomerForm.phone.trim(),
          whatsappPhone: createCustomerForm.whatsappPhone.trim() || undefined,
          status: 'ACTIVE',
        }),
      });
      setSelectedCustomer({
        id: customer.id,
        fullName: customer.fullName,
        phone: customer.phone,
        whatsappPhone: customer.whatsappPhone,
        status: customer.status,
        totalDebtAmount: Number(customer.totalDebtAmount ?? 0),
        hasOverdueInstallment: false,
      });
      setShowCreateCustomer(false);
      setCreateCustomerForm({ fullName: '', phone: '', whatsappPhone: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setCreatingCustomer(false);
    }
  }

  async function submitReservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCustomer) {
      setError(t('sales.customerRequired'));
      return;
    }
    if (items.length === 0) {
      setError(t('sales.productSearch.empty'));
      return;
    }
    for (const item of items) {
      const qty = Number(item.quantity || 0);
      if (qty <= 0 || qty > item.availableQty) {
        setError(t('operations.reservationStockExceeded'));
        return;
      }
    }

    setSubmitting(true);
    setError('');
    try {
      const created = await apiFetch<{ id: string }>('/reservations', {
        method: 'POST',
        body: JSON.stringify({
          customerId: selectedCustomer.id,
          depositAmount: Number(depositAmount || 0),
          expiresAt: new Date(expiresAt).toISOString(),
          items: items.map((item) => ({
            productId: item.productId,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
          })),
        }),
      });
      router.push('/reservations');
      void created;
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ProtectedShell>
      <form onSubmit={submitReservation} className="space-y-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            {showPageTitle ? (
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">
                {t('operations.reservations')}
              </p>
            ) : null}
            <h2 className="text-3xl font-bold text-slate-950">{t('operations.createReservation')}</h2>
          </div>
          <Link
            href="/reservations"
            className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            {t('common.cancel')}
          </Link>
        </div>

        {error ? (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        ) : null}

        <SaleFormSection
          title={t('sales.customer')}
          action={
            canCreateCustomerAction && !selectedCustomer ? (
              <button
                type="button"
                onClick={() => setShowCreateCustomer(true)}
                className="rounded-xl border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
              >
                {t('sales.createCustomer')}
              </button>
            ) : null
          }
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              {!selectedCustomer ? (
                <SaleCustomerSearch onSelect={setSelectedCustomer} />
              ) : (
                <SaleSelectedCustomerCard
                  customer={selectedCustomer}
                  onRemove={() => setSelectedCustomer(null)}
                />
              )}
            </div>
          </div>
          {showCreateCustomer ? (
            <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-4">
              <h4 className="font-bold text-slate-900">{t('sales.createCustomer')}</h4>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <SaleInput
                  label={t('crm.fullName')}
                  value={createCustomerForm.fullName}
                  onChange={(value) => setCreateCustomerForm((c) => ({ ...c, fullName: value }))}
                  required
                />
                <SaleInput
                  label={t('crm.phone')}
                  value={createCustomerForm.phone}
                  onChange={(value) => setCreateCustomerForm((c) => ({ ...c, phone: value }))}
                  required
                />
                <SaleInput
                  label={t('crm.whatsappPhone')}
                  value={createCustomerForm.whatsappPhone}
                  onChange={(value) => setCreateCustomerForm((c) => ({ ...c, whatsappPhone: value }))}
                />
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={creatingCustomer}
                  onClick={() => void createCustomer()}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {creatingCustomer ? t('common.loading') : t('common.save')}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateCustomer(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          ) : null}
        </SaleFormSection>

        <SaleFormSection title={t('operations.reservationProducts')}>
          <SaleProductSearch
            disabled={!selectedCustomer}
            inputRef={productSearchRef}
            onSelect={handleProductSelect}
          />
          {items.length === 0 ? (
            <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
              {t('sales.productSearch.empty')}
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">{t('sales.product')}</th>
                    <th className="px-3 py-2">{t('sales.sku')}</th>
                    <th className="px-3 py-2">{t('sales.availableQty')}</th>
                    <th className="px-3 py-2">{t('sales.quantity')}</th>
                    <th className="px-3 py-2">{t('sales.unitPrice')}</th>
                    <th className="px-3 py-2">{t('sales.totalAmount')}</th>
                    <th className="px-3 py-2">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item) => {
                    const lineTotal = Number(item.quantity || 0) * Number(item.unitPrice || 0);
                    const qtyError = Number(item.quantity || 0) > item.availableQty;
                    return (
                      <tr key={item.productId}>
                        <td className="px-3 py-2 font-medium">{item.productName}</td>
                        <td className="px-3 py-2">{item.productSku}</td>
                        <td className="px-3 py-2">{item.availableQty}</td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={1}
                            max={item.availableQty}
                            value={item.quantity}
                            onChange={(e) => updateItem(item.productId, { quantity: e.target.value })}
                            className={`w-20 rounded-lg border px-2 py-1 ${qtyError ? 'border-red-300' : 'border-slate-300'}`}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={item.unitPrice}
                            onChange={(e) => updateItem(item.productId, { unitPrice: e.target.value })}
                            className="w-28 rounded-lg border border-slate-300 px-2 py-1"
                          />
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 font-semibold">
                          {formatMoneyKgs(lineTotal)}
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => removeItem(item.productId)}
                            className="text-xs font-semibold text-red-600 hover:text-red-700"
                          >
                            {t('common.delete')}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SaleFormSection>

        <SaleFormSection title={t('operations.reservationConditions')}>
          <div className="grid gap-4 md:grid-cols-2">
            <SaleInput
              label={t('operations.reservationExpiresAt')}
              type="datetime-local"
              value={expiresAt}
              onChange={setExpiresAt}
              required
            />
            <SaleInput
              label={t('operations.reservationDeposit')}
              type="number"
              min={0}
              step="0.01"
              value={depositAmount}
              onChange={setDepositAmount}
            />
          </div>
        </SaleFormSection>

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <h3 className="text-lg font-bold text-slate-950">{t('sales.summary')}</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <SaleFormSummary label={t('operations.reservationPositions')} value={String(totals.positions)} />
            <SaleFormSummary label={t('sales.totalQuantity')} value={String(totals.totalQuantity)} />
            <SaleFormSummary label={t('operations.reservationTotal')} value={formatMoneyKgs(totals.totalAmount)} />
            <SaleFormSummary label={t('operations.reservationDeposit')} value={formatMoneyKgs(totals.prepayment)} />
            <SaleFormSummary label={t('operations.reservationRemaining')} value={formatMoneyKgs(totals.remaining)} />
          </div>
          <p className="mt-3 text-sm text-slate-500">
            {t('operations.reservationExpiresAt')}: {formatCompactDate(expiresAt)}
          </p>
        </section>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="submit"
            disabled={submitting || !selectedCustomer || items.length === 0}
            className="rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {submitting ? t('common.loading') : t('operations.createReservation')}
          </button>
        </div>
      </form>
    </ProtectedShell>
  );
}
