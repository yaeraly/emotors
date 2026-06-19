'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ProtectedShell } from '../../components/protected-shell';
import { Card, PageHeader, StatCard } from '../../components/ui';
import { apiFetch } from '../../lib/api';

type Summary = {
  cashboxBalance: number;
  income: number;
  expense: number;
  debt: number;
};

type Cashbox = { id: string; name: string; balance: string };

export default function FinancePage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [cashboxes, setCashboxes] = useState<Cashbox[]>([]);
  const [entry, setEntry] = useState({ title: '', amount: 0, cashboxId: '' });

  const load = async () => {
    const [summaryData, cashboxData] = await Promise.all([
      apiFetch<Summary>('/finance/summary'),
      apiFetch<Cashbox[]>('/finance/cashboxes'),
    ]);
    setSummary(summaryData);
    setCashboxes(cashboxData);
  };

  useEffect(() => {
    load();
  }, []);

  const saveEntry = async (type: 'incomes' | 'expenses') => {
    await apiFetch(`/finance/${type}`, {
      method: 'POST',
      body: JSON.stringify({
        title: entry.title,
        amount: entry.amount,
        cashboxId: entry.cashboxId || undefined,
      }),
    });
    setEntry({ title: '', amount: 0, cashboxId: '' });
    await load();
  };

  const submitIncome = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await saveEntry('incomes');
  };

  return (
    <ProtectedShell>
      <PageHeader
        title="Finance"
        description="Income, expense, cashbox, profit, debt, cashflow, ABC/XYZ, and margins."
      />
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Cashbox" value={`${summary?.cashboxBalance ?? 0} KGS`} />
        <StatCard label="Income" value={`${summary?.income ?? 0} KGS`} />
        <StatCard label="Expense" value={`${summary?.expense ?? 0} KGS`} />
        <StatCard label="Debt" value={`${summary?.debt ?? 0} KGS`} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[380px_1fr]">
        <Card className="p-5">
          <h3 className="font-black text-slate-950">Income / Expense</h3>
          <form onSubmit={submitIncome} className="mt-4 space-y-3">
            <input
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
              placeholder="Title"
              value={entry.title}
              onChange={(event) => setEntry({ ...entry, title: event.target.value })}
              required
            />
            <input
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
              type="number"
              min={0}
              value={entry.amount}
              onChange={(event) => setEntry({ ...entry, amount: Number(event.target.value) })}
              required
            />
            <select
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
              value={entry.cashboxId}
              onChange={(event) => setEntry({ ...entry, cashboxId: event.target.value })}
            >
              <option value="">No cashbox</option>
              {cashboxes.map((cashbox) => (
                <option key={cashbox.id} value={cashbox.id}>
                  {cashbox.name}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <button className="rounded-xl bg-brand-600 px-4 py-3 font-bold text-white">
                Add Income
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  saveEntry('expenses');
                }}
                className="rounded-xl bg-slate-950 px-4 py-3 font-bold text-white"
              >
                Add Expense
              </button>
            </div>
          </form>
        </Card>
        <Card className="overflow-hidden">
          <div className="border-b border-slate-200 p-5">
            <h3 className="font-black text-slate-950">Cashboxes</h3>
          </div>
          {cashboxes.map((cashbox) => (
            <div key={cashbox.id} className="border-b border-slate-100 p-5">
              <p className="font-bold">{cashbox.name}</p>
              <p className="text-sm text-slate-500">{cashbox.balance} KGS</p>
            </div>
          ))}
        </Card>
      </div>
    </ProtectedShell>
  );
}
