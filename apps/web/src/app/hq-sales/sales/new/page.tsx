'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';

type CustomerOption = {
  id: string;
  fullName: string;
  phone: string;
  companyName?: string | null;
};

type ProductOption = {
  id: string;
  sku: string;
  name: string;
  categoryName: string;
  availableQuantity: number;
  finalSellingPrice: number | null;
  priceConfigured: boolean;
};

type LineRow = {
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
};

export default function HqSalesNewPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [customerType, setCustomerType] = useState<'DEALER' | 'DISTRIBUTOR'>('DEALER');
  const [paymentType, setPaymentType] = useState<'FULL_PAYMENT' | 'INSTALLMENT'>('FULL_PAYMENT');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [lines, setLines] = useState<LineRow[]>([]);
  const [downPayment, setDownPayment] = useState('');
  const [installmentStart, setInstallmentStart] = useState('');
  const [numberOfPayments, setNumberOfPayments] = useState('3');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!customerSearch.trim()) {
      setCustomers([]);
      return;
    }
    const timer = setTimeout(() => {
      void apiFetch<CustomerOption[]>(
        `/hq-b2b-sales/customers/search?customerType=${customerType}&search=${encodeURIComponent(customerSearch)}`,
      ).then(setCustomers).catch(() => setCustomers([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [customerSearch, customerType]);

  useEffect(() => {
    if (!productSearch.trim()) {
      setProducts([]);
      return;
    }
    const timer = setTimeout(() => {
      void apiFetch<ProductOption[]>(
        `/hq-b2b-sales/products/search?customerType=${customerType}&search=${encodeURIComponent(productSearch)}`,
      ).then(setProducts).catch(() => setProducts([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [productSearch, customerType]);

  const total = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);

  function addProduct(product: ProductOption) {
    if (!product.priceConfigured || !product.finalSellingPrice) return;
    setLines((current) => {
      const existing = current.find((line) => line.productId === product.id);
      if (existing) {
        return current.map((line) =>
          line.productId === product.id ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [
        ...current,
        {
          productId: product.id,
          name: product.name,
          sku: product.sku,
          quantity: 1,
          unitPrice: product.finalSellingPrice!,
        },
      ];
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedCustomerId || lines.length === 0) {
      setError('Выберите клиента и добавьте товары');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const sale = await apiFetch<{ id: string }>('/hq-b2b-sales', {
        method: 'POST',
        body: JSON.stringify({
          customerType,
          expectedCustomerType: customerType,
          customerId: selectedCustomerId,
          paymentType,
          items: lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
          installment:
            paymentType === 'INSTALLMENT'
              ? {
                  downPayment: Number(downPayment),
                  installmentStartDate: installmentStart,
                  paymentFrequency: 'MONTHLY',
                  numberOfPayments: Number(numberOfPayments),
                }
              : undefined,
        }),
      });
      router.push(`/hq-sales/sales/${sale.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedShell>
      <form onSubmit={onSubmit} className="mx-auto max-w-4xl space-y-6 p-6">
        <h1 className="text-2xl font-bold text-slate-900">Создать продажу (Дилер / Дистрибьютер)</h1>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
          <h2 className="font-semibold">Тип клиента</h2>
          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input type="radio" checked={customerType === 'DEALER'} onChange={() => setCustomerType('DEALER')} />
              Дилер
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={customerType === 'DISTRIBUTOR'} onChange={() => setCustomerType('DISTRIBUTOR')} />
              Дистрибьютер
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
          <h2 className="font-semibold">Клиент</h2>
          <input
            value={customerSearch}
            onChange={(e) => setCustomerSearch(e.target.value)}
            placeholder="Поиск клиента"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            value={selectedCustomerId}
            onChange={(e) => setSelectedCustomerId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Выберите клиента</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.fullName} — {c.phone}
              </option>
            ))}
          </select>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
          <h2 className="font-semibold">Товары</h2>
          <input
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            placeholder="Поиск товара"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          {products.length > 0 ? (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {products.map((product) => (
                <li key={product.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span>
                    {product.sku} — {product.name} (остаток: {product.availableQuantity})
                  </span>
                  <button
                    type="button"
                    disabled={!product.priceConfigured}
                    onClick={() => addProduct(product)}
                    className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-50"
                  >
                    {product.finalSellingPrice != null
                      ? `${product.finalSellingPrice.toLocaleString('ru-RU')} сом`
                      : 'Цена не настроена'}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="py-1">SKU</th>
                <th>Товар</th>
                <th>Цена</th>
                <th>Кол-во</th>
                <th>Сумма</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.productId}>
                  <td className="py-1 font-mono text-xs">{line.sku}</td>
                  <td>{line.name}</td>
                  <td>{line.unitPrice.toLocaleString('ru-RU')}</td>
                  <td>{line.quantity}</td>
                  <td>{(line.unitPrice * line.quantity).toLocaleString('ru-RU')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="font-semibold">Итого: {total.toLocaleString('ru-RU')} сом</p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
          <h2 className="font-semibold">Тип оплаты</h2>
          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input type="radio" checked={paymentType === 'FULL_PAYMENT'} onChange={() => setPaymentType('FULL_PAYMENT')} />
              Полная оплата
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={paymentType === 'INSTALLMENT'} onChange={() => setPaymentType('INSTALLMENT')} />
              Рассрочка
            </label>
          </div>
          {paymentType === 'INSTALLMENT' ? (
            <div className="grid gap-3 md:grid-cols-3">
              <input
                type="number"
                min={0}
                value={downPayment}
                onChange={(e) => setDownPayment(e.target.value)}
                placeholder="Предоплата"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                type="date"
                value={installmentStart}
                onChange={(e) => setInstallmentStart(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                type="number"
                min={1}
                value={numberOfPayments}
                onChange={(e) => setNumberOfPayments(e.target.value)}
                placeholder="Кол-во платежей"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          ) : null}
        </section>

        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? t('common.saving') : 'Отправить продажу'}
        </button>
      </form>
    </ProtectedShell>
  );
}
