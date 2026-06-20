'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import type { Branch, Customer, CustomerStatus } from '@/lib/types';
import { ProtectedShell } from '@/components/ProtectedShell';

const statuses: CustomerStatus[] = ['NEW', 'ACTIVE', 'VIP', 'SLEEPING', 'RISK'];

type CreateCustomerState = {
  fullName: string;
  phone: string;
  whatsappPhone: string;
  branchId: string;
  status: CustomerStatus;
  notes: string;
  totalPurchaseAmount: string;
  totalProfitAmount: string;
  totalDebtAmount: string;
};

const initialCreateState: CreateCustomerState = {
  fullName: '',
  phone: '',
  whatsappPhone: '',
  branchId: '',
  status: 'NEW',
  notes: '',
  totalPurchaseAmount: '0',
  totalProfitAmount: '0',
  totalDebtAmount: '0',
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [form, setForm] = useState<CreateCustomerState>(initialCreateState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (search.trim()) {
      params.set('search', search.trim());
    }
    if (status) {
      params.set('status', status);
    }

    const value = params.toString();
    return value ? `?${value}` : '';
  }, [search, status]);

  useEffect(() => {
    void loadCustomers();
    void apiFetch<Branch[]>('/branches').then(setBranches).catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function loadCustomers() {
    setLoading(true);
    setError('');

    try {
      const result = await apiFetch<Customer[]>(`/customers${query}`);
      setCustomers(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load customers');
    } finally {
      setLoading(false);
    }
  }

  async function createCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');

    try {
      await apiFetch<Customer>('/customers', {
        method: 'POST',
        body: JSON.stringify({
          fullName: form.fullName,
          phone: form.phone,
          whatsappPhone: form.whatsappPhone || undefined,
          branchId: form.branchId || undefined,
          status: form.status,
          notes: form.notes || undefined,
          totalPurchaseAmount: Number(form.totalPurchaseAmount || 0),
          totalProfitAmount: Number(form.totalProfitAmount || 0),
          totalDebtAmount: Number(form.totalDebtAmount || 0),
        }),
      });
      setForm(initialCreateState);
      await loadCustomers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create customer');
    } finally {
      setSaving(false);
    }
  }

  async function deleteCustomer(customerId: string) {
    if (!window.confirm('Soft delete this customer?')) {
      return;
    }

    await apiFetch(`/customers/${customerId}`, { method: 'DELETE' });
    await loadCustomers();
  }

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">
              CRM
            </p>
            <h2 className="text-3xl font-bold text-slate-950">Customers</h2>
            <p className="mt-2 text-slate-500">
              Manage customer profiles, WhatsApp history, and follow-ups.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, phone, WhatsApp"
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none ring-blue-500 focus:ring-2"
            />
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none ring-blue-500 focus:ring-2"
            >
              <option value="">All statuses</option>
              {statuses.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error ? (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[380px_1fr]">
          <form
            onSubmit={createCustomer}
            className="h-fit max-h-[calc(100vh-180px)] shrink-0 self-start overflow-y-auto rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:w-[380px]"
          >
            <h3 className="text-lg font-bold text-slate-950">
              Create Customer
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              This card keeps a fixed width and does not stretch with the list.
            </p>

            <div className="mt-5 space-y-4">
              <CustomerInput
                label="Full name"
                value={form.fullName}
                onChange={(value) => setForm({ ...form, fullName: value })}
                required
              />
              <CustomerInput
                label="Phone"
                value={form.phone}
                onChange={(value) => setForm({ ...form, phone: value })}
                required
              />
              <CustomerInput
                label="WhatsApp phone"
                value={form.whatsappPhone}
                onChange={(value) => setForm({ ...form, whatsappPhone: value })}
              />

              <label className="block">
                <span className="text-sm font-semibold text-slate-700">
                  Status
                </span>
                <select
                  value={form.status}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      status: event.target.value as CustomerStatus,
                    })
                  }
                  className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring-2"
                >
                  {statuses.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>

              {branches.length > 1 ? (
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">
                    Branch
                  </span>
                  <select
                    value={form.branchId}
                    onChange={(event) =>
                      setForm({ ...form, branchId: event.target.value })
                    }
                    className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring-2"
                  >
                    <option value="">My branch</option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <div className="grid grid-cols-1 gap-3">
                <CustomerInput
                  label="Purchase amount"
                  type="number"
                  value={form.totalPurchaseAmount}
                  onChange={(value) =>
                    setForm({ ...form, totalPurchaseAmount: value })
                  }
                />
                <CustomerInput
                  label="Profit amount"
                  type="number"
                  value={form.totalProfitAmount}
                  onChange={(value) =>
                    setForm({ ...form, totalProfitAmount: value })
                  }
                />
                <CustomerInput
                  label="Debt amount"
                  type="number"
                  value={form.totalDebtAmount}
                  onChange={(value) =>
                    setForm({ ...form, totalDebtAmount: value })
                  }
                />
              </div>

              <label className="block">
                <span className="text-sm font-semibold text-slate-700">
                  Notes
                </span>
                <textarea
                  value={form.notes}
                  onChange={(event) =>
                    setForm({ ...form, notes: event.target.value })
                  }
                  className="mt-2 min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring-2"
                />
              </label>
            </div>

            <button
              disabled={saving}
              className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
              type="submit"
            >
              {saving ? 'Creating...' : 'Create customer'}
            </button>
          </form>

          <div className="h-[calc(100vh-180px)] max-h-[calc(100vh-180px)] overflow-y-auto rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-950">
                Customer list
              </h3>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-600">
                {customers.length}
              </span>
            </div>

            {loading ? (
              <p className="text-slate-500">Loading customers...</p>
            ) : customers.length === 0 ? (
              <p className="rounded-2xl bg-slate-50 p-6 text-center text-slate-500">
                No customers found.
              </p>
            ) : (
              <div className="space-y-3">
                {customers.map((customer) => (
                  <div
                    key={customer.id}
                    className="rounded-2xl border border-slate-200 p-4 hover:border-blue-200 hover:bg-blue-50/40"
                  >
                    <div className="flex flex-col justify-between gap-3 md:flex-row">
                      <Link href={`/customers/${customer.id}`}>
                        <p className="text-lg font-bold text-slate-950">
                          {customer.fullName}
                        </p>
                        <p className="text-sm text-slate-500">
                          {customer.phone}
                          {customer.whatsappPhone
                            ? ` · WhatsApp ${customer.whatsappPhone}`
                            : ''}
                        </p>
                      </Link>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">
                          {customer.status}
                        </span>
                        <button
                          onClick={() => void deleteCustomer(customer.id)}
                          className="rounded-lg border border-red-200 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                          type="button"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-3">
                      <Amount label="Purchase" value={customer.totalPurchaseAmount} />
                      <Amount label="Profit" value={customer.totalProfitAmount} />
                      <Amount label="Debt" value={customer.totalDebtAmount} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </ProtectedShell>
  );
}

function CustomerInput({
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

function Amount({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="font-bold text-slate-900">{Number(value).toFixed(2)}</p>
    </div>
  );
}
