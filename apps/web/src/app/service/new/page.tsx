'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedShell } from '@/components/ProtectedShell';
import { ServiceCustomerSearch } from '@/components/ServiceCustomerSearch';
import { ServiceProductSearch } from '@/components/ServiceProductSearch';
import { apiFetch } from '@/lib/api';
import type { ServiceCustomerOption, ServiceOrder, ServiceProductOption, User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

const WARRANTY_OPTIONS = [
  { value: 0, label: 'Без гарантии' },
  { value: 7, label: '7 дн.' },
  { value: 14, label: '14 дн.' },
  { value: 30, label: '30 дн.' },
  { value: 90, label: '90 дн.' },
];

type WorkItemRow = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
};

type ProductItemRow = {
  id: string;
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  availableQty: number;
};

function formatKgs(amount: number) {
  return `${amount.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} KGS`;
}

function lineTotal(quantity: number, unitPrice: number) {
  return Math.round((quantity * unitPrice + Number.EPSILON) * 100) / 100;
}

export default function NewServiceOrderPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [masters, setMasters] = useState<User[]>([]);
  const [customer, setCustomer] = useState<ServiceCustomerOption | null>(null);
  const [masterId, setMasterId] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [mileage, setMileage] = useState('');
  const [complaint, setComplaint] = useState('');
  const [workItems, setWorkItems] = useState<WorkItemRow[]>([]);
  const [workDraft, setWorkDraft] = useState({ description: '', quantity: '1', unitPrice: '0' });
  const [productItems, setProductItems] = useState<ProductItemRow[]>([]);
  const [productQtyDraft, setProductQtyDraft] = useState('1');
  const [warrantyDays, setWarrantyDays] = useState('0');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiFetch<User[]>('/service-orders/masters')
      .then((result) => {
        setMasters(result);
        setMasterId(result[0]?.id ?? '');
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  const workTotal = useMemo(
    () => workItems.reduce((sum, item) => sum + lineTotal(item.quantity, item.unitPrice), 0),
    [workItems],
  );
  const productTotal = useMemo(
    () => productItems.reduce((sum, item) => sum + lineTotal(item.quantity, item.unitPrice), 0),
    [productItems],
  );
  const grandTotal = useMemo(() => Math.round((workTotal + productTotal) * 100) / 100, [productTotal, workTotal]);

  function addWorkItem() {
    const description = workDraft.description.trim();
    const quantity = Number(workDraft.quantity);
    const unitPrice = Number(workDraft.unitPrice);
    if (!description) {
      setError('Укажите описание работы');
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError('Количество работы должно быть больше 0');
      return;
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      setError('Цена работы не может быть отрицательной');
      return;
    }
    setError('');
    setWorkItems((items) => [
      ...items,
      { id: crypto.randomUUID(), description, quantity, unitPrice },
    ]);
    setWorkDraft({ description: '', quantity: '1', unitPrice: '0' });
  }

  function addProductItem(product: ServiceProductOption) {
    const quantity = Number(productQtyDraft);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError('Количество товара должно быть больше 0');
      return;
    }
    if (quantity > product.availableQty) {
      setError(`Доступно только ${product.availableQty}`);
      return;
    }
    setError('');
    setProductItems((items) => {
      const existing = items.find((item) => item.productId === product.id);
      if (existing) {
        const nextQty = existing.quantity + quantity;
        if (nextQty > product.availableQty) {
          setError(`Доступно только ${product.availableQty}`);
          return items;
        }
        return items.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: nextQty, unitPrice: product.unitPrice }
            : item,
        );
      }
      return [
        ...items,
        {
          id: crypto.randomUUID(),
          productId: product.id,
          name: product.name,
          sku: product.sku,
          quantity,
          unitPrice: product.unitPrice,
          availableQty: product.availableQty,
        },
      ];
    });
    setProductQtyDraft('1');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customer) {
      setError(t('sales.customerSearch.noResults'));
      return;
    }
    if (!complaint.trim()) {
      setError(t('service.problem'));
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const order = await apiFetch<ServiceOrder>('/service-orders', {
        method: 'POST',
        body: JSON.stringify({
          customerId: customer.id,
          masterId,
          problemDescription: complaint,
          vehicle: vehicle || undefined,
          licensePlate: licensePlate || undefined,
          mileage: mileage ? Number(mileage) : undefined,
          complaint,
          warrantyDays: Number(warrantyDays),
          notes: notes || undefined,
          workItems: workItems.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
          productItems: productItems.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
        }),
      });
      router.push(`/service/${order.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ProtectedShell>
      <form onSubmit={submit} className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('service.title')}</p>
          <h2 className="text-3xl font-bold text-slate-950">{t('service.newOrder')}</h2>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-950">{t('service.customer')}</h3>
          <ServiceCustomerSearch onSelect={setCustomer} />
          {customer ? (
            <p className="text-sm text-green-700">Выбран: {customer.fullName} · {customer.phone}</p>
          ) : null}
        </section>

        <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
          <h3 className="text-lg font-bold text-slate-950 md:col-span-2">Информация о технике</h3>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">{t('service.master')}</span>
            <select value={masterId} onChange={(e) => setMasterId(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2">
              {masters.map((m) => <option key={m.id} value={m.id}>{m.fullName}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Транспорт</span>
            <input value={vehicle} onChange={(e) => setVehicle(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Гос. номер</span>
            <input value={licensePlate} onChange={(e) => setLicensePlate(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Пробег</span>
            <input type="number" value={mileage} onChange={(e) => setMileage(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" />
          </label>
          <label className="block md:col-span-2">
            <span className="text-sm font-semibold text-slate-700">{t('service.problem')}</span>
            <textarea value={complaint} onChange={(e) => setComplaint(e.target.value)} required className="mt-2 min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2" />
          </label>
        </section>

        <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-bold text-slate-950">Работы</h3>
            <button type="button" onClick={addWorkItem} className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700">
              Добавить работу
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <input value={workDraft.description} onChange={(e) => setWorkDraft({ ...workDraft, description: e.target.value })} placeholder="Работа" className="rounded-xl border border-slate-300 px-3 py-2 md:col-span-2" />
            <input type="number" min="1" value={workDraft.quantity} onChange={(e) => setWorkDraft({ ...workDraft, quantity: e.target.value })} placeholder="Количество" className="rounded-xl border border-slate-300 px-3 py-2" />
            <input type="number" min="0" value={workDraft.unitPrice} onChange={(e) => setWorkDraft({ ...workDraft, unitPrice: e.target.value })} placeholder="Цена" className="rounded-xl border border-slate-300 px-3 py-2" />
          </div>
          {workItems.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Работа</th>
                    <th className="px-3 py-2">Количество</th>
                    <th className="px-3 py-2">Цена</th>
                    <th className="px-3 py-2">Сумма</th>
                    <th className="px-3 py-2 text-right">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {workItems.map((item) => (
                    <tr key={item.id} className="border-t border-slate-100">
                      <td className="px-3 py-2">{item.description}</td>
                      <td className="px-3 py-2">{item.quantity}</td>
                      <td className="px-3 py-2">{formatKgs(item.unitPrice)}</td>
                      <td className="px-3 py-2">{formatKgs(lineTotal(item.quantity, item.unitPrice))}</td>
                      <td className="px-3 py-2 text-right">
                        <button type="button" onClick={() => setWorkItems((rows) => rows.filter((row) => row.id !== item.id))} className="font-semibold text-red-600">
                          Удалить
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-bold text-slate-950">Товары</h3>
            {customer ? (
              <button type="button" onClick={() => document.getElementById('service-product-search')?.focus()} className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700">
                Добавить товар
              </button>
            ) : null}
          </div>
          {customer ? (
            <div className="grid gap-3 md:grid-cols-[1fr_160px]">
              <ServiceProductSearch customerId={customer.id} onSelect={addProductItem} />
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">{t('inventory.quantity')}</span>
                <input type="number" min="1" value={productQtyDraft} onChange={(e) => setProductQtyDraft(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" />
              </label>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Сначала выберите клиента, чтобы добавить товар.</p>
          )}
          {productItems.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Товар</th>
                    <th className="px-3 py-2">Код</th>
                    <th className="px-3 py-2">Количество</th>
                    <th className="px-3 py-2">Цена</th>
                    <th className="px-3 py-2">Сумма</th>
                    <th className="px-3 py-2 text-right">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {productItems.map((item) => (
                    <tr key={item.id} className="border-t border-slate-100">
                      <td className="px-3 py-2">{item.name}</td>
                      <td className="px-3 py-2">{item.sku}</td>
                      <td className="px-3 py-2">{item.quantity}</td>
                      <td className="px-3 py-2">{formatKgs(item.unitPrice)}</td>
                      <td className="px-3 py-2">{formatKgs(lineTotal(item.quantity, item.unitPrice))}</td>
                      <td className="px-3 py-2 text-right">
                        <button type="button" onClick={() => setProductItems((rows) => rows.filter((row) => row.id !== item.id))} className="font-semibold text-red-600">
                          Удалить
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">{t('service.warranty')}</span>
            <select value={warrantyDays} onChange={(e) => setWarrantyDays(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2">
              {WARRANTY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="block md:col-span-2">
            <span className="text-sm font-semibold text-slate-700">{t('common.notes')}</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-2 min-h-16 w-full rounded-xl border border-slate-300 px-3 py-2" />
          </label>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-950">Итоги</h3>
          <div className="mt-4 space-y-2 text-sm text-slate-700">
            <p>Работы: <span className="font-semibold">{formatKgs(workTotal)}</span></p>
            <p>Товары: <span className="font-semibold">{formatKgs(productTotal)}</span></p>
            <p className="text-base font-bold text-slate-950">Общая сумма: {formatKgs(grandTotal)}</p>
          </div>
        </section>

        <div className="flex flex-wrap gap-3">
          <button disabled={submitting} className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white disabled:opacity-60" type="submit">
            {submitting ? t('common.loading') : t('common.create')}
          </button>
        </div>
      </form>
    </ProtectedShell>
  );
}
