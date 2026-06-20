'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import type { Customer, PaymentMethod, Sale } from '@/lib/types';

type SaleItemForm = {
  productName: string;
  productSku: string;
  quantity: string;
  unitPrice: string;
  unitCost: string;
};

const paymentMethods: PaymentMethod[] = [
  'CASH',
  'CARD',
  'TRANSFER',
  'MBANK',
  'ELCART',
  'BALANCE',
];

const emptyItem: SaleItemForm = {
  productName: '',
  productSku: '',
  quantity: '1',
  unitPrice: '0',
  unitCost: '0',
};

export default function NewSalePage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [items, setItems] = useState<SaleItemForm[]>([{ ...emptyItem }]);
  const [paidAmount, setPaidAmount] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [installmentDays, setInstallmentDays] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<Customer[]>('/customers')
      .then(setCustomers)
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Could not load customers'),
      );
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
    const paid = Math.min(Number(paidAmount || 0), totalAmount);
    const debt = Math.max(totalAmount - paid, 0);

    return { totalAmount, totalCost, profit, paid, debt };
  }, [items, paidAmount]);

  function updateItem(index: number, updates: Partial<SaleItemForm>) {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...updates } : item,
      ),
    );
  }

  function addItem() {
    setItems((current) => [...current, { ...emptyItem }]);
  }

  function removeItem(index: number) {
    setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function saveSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!customerId) {
      setError('Customer is required');
      return;
    }

    const validItems = items.map((item) => ({
      productName: item.productName.trim(),
      productSku: item.productSku.trim() || undefined,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      unitCost: Number(item.unitCost),
    }));

    if (
      validItems.length === 0 ||
      validItems.some(
        (item) =>
          !item.productName ||
          item.quantity <= 0 ||
          item.unitPrice < 0 ||
          item.unitCost < 0,
      )
    ) {
      setError('Every item needs a product name, quantity > 0, and valid prices');
      return;
    }

    setSaving(true);

    try {
      const sale = await apiFetch<Sale>('/sales', {
        method: 'POST',
        body: JSON.stringify({
          customerId,
          items: validItems,
          paidAmount: Number(paidAmount || 0),
          paymentMethod,
          installmentDays: installmentDays
            ? Number(installmentDays)
            : undefined,
          dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
          notes: notes.trim() || undefined,
        }),
      });

      router.push(`/sales/${sale.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save sale');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedShell>
      <form onSubmit={saveSale} className="space-y-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">
              New Sale
            </p>
            <h2 className="text-3xl font-bold text-slate-950">
              Register product sale
            </h2>
            <p className="mt-2 text-slate-500">
              Select a CRM customer, add products, payment, and installment
              details.
            </p>
          </div>
          <button
            disabled={saving}
            className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
            type="submit"
          >
            {saving ? 'Saving sale...' : 'Save sale'}
          </button>
        </div>

        {error ? (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-950">Customer</h3>
          <select
            value={customerId}
            onChange={(event) => setCustomerId(event.target.value)}
            className="mt-4 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none ring-blue-500 focus:ring-2"
            required
          >
            <option value="">Select customer</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.fullName} · {customer.phone}
              </option>
            ))}
          </select>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-950">Sale items</h3>
            <button
              onClick={addItem}
              className="rounded-xl border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
              type="button"
            >
              Add item
            </button>
          </div>

          <div className="mt-4 space-y-4">
            {items.map((item, index) => {
              const itemTotal =
                Number(item.quantity || 0) * Number(item.unitPrice || 0);
              const itemProfit =
                itemTotal -
                Number(item.quantity || 0) * Number(item.unitCost || 0);

              return (
                <div
                  key={index}
                  className="grid gap-3 rounded-2xl border border-slate-200 p-4 lg:grid-cols-7"
                >
                  <SaleInput
                    label="Product"
                    value={item.productName}
                    onChange={(value) => updateItem(index, { productName: value })}
                    required
                  />
                  <SaleInput
                    label="SKU"
                    value={item.productSku}
                    onChange={(value) => updateItem(index, { productSku: value })}
                  />
                  <SaleInput
                    label="Qty"
                    type="number"
                    value={item.quantity}
                    onChange={(value) => updateItem(index, { quantity: value })}
                    required
                  />
                  <SaleInput
                    label="Unit price"
                    type="number"
                    value={item.unitPrice}
                    onChange={(value) => updateItem(index, { unitPrice: value })}
                    required
                  />
                  <SaleInput
                    label="Unit cost"
                    type="number"
                    value={item.unitCost}
                    onChange={(value) => updateItem(index, { unitCost: value })}
                    required
                  />
                  <div className="rounded-xl bg-slate-50 p-3 text-sm">
                    <p className="text-xs font-semibold uppercase text-slate-400">
                      Total / Profit
                    </p>
                    <p className="font-bold text-slate-900">
                      {formatKgs(itemTotal)}
                    </p>
                    <p className="text-emerald-700">{formatKgs(itemProfit)}</p>
                  </div>
                  <button
                    onClick={() => removeItem(index)}
                    disabled={items.length === 1}
                    className="rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-2">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">Payment</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <SaleInput
                label="Paid amount"
                type="number"
                value={paidAmount}
                onChange={setPaidAmount}
              />
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">
                  Payment method
                </span>
                <select
                  value={paymentMethod}
                  onChange={(event) =>
                    setPaymentMethod(event.target.value as PaymentMethod)
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
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">Installment</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <SaleInput
                label="Installment days"
                type="number"
                value={installmentDays}
                onChange={setInstallmentDays}
              />
              <SaleInput
                label="Due date"
                type="date"
                value={dueDate}
                onChange={setDueDate}
              />
            </div>
            <label className="mt-4 block">
              <span className="text-sm font-semibold text-slate-700">Notes</span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className="mt-2 min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring-2"
              />
            </label>
          </section>
        </div>

        <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-4">
          <Summary label="Sale total" value={formatKgs(totals.totalAmount)} />
          <Summary label="Profit" value={formatKgs(totals.profit)} />
          <Summary label="Paid" value={formatKgs(totals.paid)} />
          <Summary label="Debt" value={formatKgs(totals.debt)} />
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        type={type}
        min={type === 'number' ? 0 : undefined}
        step={type === 'number' ? '0.01' : undefined}
        className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring-2"
      />
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
