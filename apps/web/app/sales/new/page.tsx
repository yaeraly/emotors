'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedShell } from '../../../components/protected-shell';
import { Card, PageHeader } from '../../../components/ui';
import { apiFetch } from '../../../lib/api';

type SaleResponse = { id: string };

export default function NewSalePage() {
  const router = useRouter();
  const [customerId, setCustomerId] = useState('');
  const [description, setDescription] = useState('Spare parts sale');
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);
  const [unitCost, setUnitCost] = useState(0);
  const [paidAmount, setPaidAmount] = useState(0);
  const [installmentAmount, setInstallmentAmount] = useState(0);
  const [installmentDueDate, setInstallmentDueDate] = useState('');
  const [error, setError] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    try {
      const sale = await apiFetch<SaleResponse>('/sales', {
        method: 'POST',
        body: JSON.stringify({
          customerId: customerId || undefined,
          items: [{ description, quantity, unitPrice, unitCost }],
          payments:
            paidAmount > 0 ? [{ amount: paidAmount, method: 'CASH' }] : [],
          installments:
            installmentAmount > 0 && installmentDueDate
              ? [{ amount: installmentAmount, dueDate: installmentDueDate }]
              : [],
        }),
      });
      router.replace(`/sales/${sale.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create sale');
    }
  };

  return (
    <ProtectedShell>
      <PageHeader
        title="New Sale"
        description="Record sale items, optional initial payment, and installment plan."
      />
      <Card className="max-w-3xl p-6">
        <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
          <label className="md:col-span-2">
            <span className="text-sm font-semibold text-slate-700">
              Customer ID (optional)
            </span>
            <input
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
              placeholder="Paste customer ID for debt tracking"
            />
          </label>
          <label className="md:col-span-2">
            <span className="text-sm font-semibold text-slate-700">
              Item description
            </span>
            <input
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              required
            />
          </label>
          <label>
            <span className="text-sm font-semibold text-slate-700">Quantity</span>
            <input
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
              type="number"
              min={1}
              value={quantity}
              onChange={(event) => setQuantity(Number(event.target.value))}
            />
          </label>
          <label>
            <span className="text-sm font-semibold text-slate-700">
              Unit price KGS
            </span>
            <input
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
              type="number"
              min={0}
              value={unitPrice}
              onChange={(event) => setUnitPrice(Number(event.target.value))}
            />
          </label>
          <label>
            <span className="text-sm font-semibold text-slate-700">
              Unit cost KGS
            </span>
            <input
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
              type="number"
              min={0}
              value={unitCost}
              onChange={(event) => setUnitCost(Number(event.target.value))}
            />
          </label>
          <label>
            <span className="text-sm font-semibold text-slate-700">
              Initial payment
            </span>
            <input
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
              type="number"
              min={0}
              value={paidAmount}
              onChange={(event) => setPaidAmount(Number(event.target.value))}
            />
          </label>
          <label>
            <span className="text-sm font-semibold text-slate-700">
              Installment amount
            </span>
            <input
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
              type="number"
              min={0}
              value={installmentAmount}
              onChange={(event) =>
                setInstallmentAmount(Number(event.target.value))
              }
            />
          </label>
          <label>
            <span className="text-sm font-semibold text-slate-700">
              Installment due date
            </span>
            <input
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
              type="date"
              value={installmentDueDate}
              onChange={(event) => setInstallmentDueDate(event.target.value)}
            />
          </label>
          {error ? (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 md:col-span-2">
              {error}
            </p>
          ) : null}
          <button className="rounded-xl bg-brand-600 px-5 py-3 font-bold text-white md:col-span-2">
            Create Sale
          </button>
        </form>
      </Card>
    </ProtectedShell>
  );
}
