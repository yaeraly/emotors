'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { ProtectedShell } from '../../components/protected-shell';
import { Card, PageHeader } from '../../components/ui';
import { apiFetch } from '../../lib/api';

type Customer = {
  id: string;
  fullName: string;
  phone: string;
  whatsappPhone?: string;
  status: string;
  totalPurchaseAmount: string;
  totalDebtAmount: string;
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    whatsappPhone: '',
    notes: '',
  });
  const [error, setError] = useState('');

  const load = async (term = search) => {
    const query = term ? `?search=${encodeURIComponent(term)}` : '';
    setCustomers(await apiFetch<Customer[]>(`/customers${query}`));
  };

  useEffect(() => {
    load('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    try {
      await apiFetch('/customers', {
        method: 'POST',
        body: JSON.stringify({
          fullName: form.fullName,
          phone: form.phone,
          whatsappPhone: form.whatsappPhone || undefined,
          notes: form.notes || undefined,
        }),
      });
      setForm({ fullName: '', phone: '', whatsappPhone: '', notes: '' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create customer');
    }
  };

  return (
    <ProtectedShell>
      <PageHeader
        title="Customers"
        description="Create, search, and manage CRM customers without layout stretch."
      />
      <div className="grid h-[calc(100vh-11rem)] min-h-[640px] gap-6 xl:grid-cols-[380px_1fr]">
        <Card className="h-[560px] p-5">
          <h3 className="text-lg font-black text-slate-950">Create Customer</h3>
          <form onSubmit={submit} className="mt-4 flex h-[480px] flex-col gap-3">
            <input
              className="rounded-xl border border-slate-300 px-4 py-3"
              placeholder="Full name"
              value={form.fullName}
              onChange={(event) =>
                setForm({ ...form, fullName: event.target.value })
              }
              required
            />
            <input
              className="rounded-xl border border-slate-300 px-4 py-3"
              placeholder="Phone"
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
              required
            />
            <input
              className="rounded-xl border border-slate-300 px-4 py-3"
              placeholder="WhatsApp phone"
              value={form.whatsappPhone}
              onChange={(event) =>
                setForm({ ...form, whatsappPhone: event.target.value })
              }
            />
            <textarea
              className="min-h-28 flex-1 resize-none rounded-xl border border-slate-300 px-4 py-3"
              placeholder="Notes"
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
            />
            {error ? (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}
            <button className="rounded-xl bg-brand-600 px-4 py-3 font-bold text-white">
              Add Customer
            </button>
          </form>
        </Card>
        <Card className="flex min-h-0 flex-col overflow-hidden">
          <div className="border-b border-slate-200 p-5">
            <input
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
              placeholder="Search by name, phone, or WhatsApp"
              value={search}
              onChange={async (event) => {
                setSearch(event.target.value);
                await load(event.target.value);
              }}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {customers.map((customer) => (
              <Link
                key={customer.id}
                href={`/customers/${customer.id}`}
                className="grid gap-2 border-b border-slate-100 p-5 transition hover:bg-slate-50 md:grid-cols-[1fr_auto]"
              >
                <div>
                  <p className="font-bold text-slate-950">{customer.fullName}</p>
                  <p className="text-sm text-slate-500">
                    {customer.phone}
                    {customer.whatsappPhone ? ` / WA ${customer.whatsappPhone}` : ''}
                  </p>
                </div>
                <div className="text-left md:text-right">
                  <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">
                    {customer.status}
                  </span>
                  <p className="mt-2 text-sm text-slate-500">
                    Debt: {customer.totalDebtAmount} KGS
                  </p>
                </div>
              </Link>
            ))}
            {customers.length === 0 ? (
              <p className="p-8 text-center text-slate-500">No customers found.</p>
            ) : null}
          </div>
        </Card>
      </div>
    </ProtectedShell>
  );
}
