'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { apiFetch, clearToken } from '@/lib/api';
import type { Branch, Customer, CustomerStatus } from '@/lib/types';
import { ProtectedShell } from '@/components/ProtectedShell';

const TOKEN_KEY = 'emotors_access_token';
const statuses: CustomerStatus[] = ['NEW', 'ACTIVE', 'VIP', 'SLEEPING', 'RISK'];

type CustomerFormFields = {
  fullName: string;
  phone: string;
  whatsappPhone: string;
  status: CustomerStatus;
  notes: string;
};

type CreateCustomerState = CustomerFormFields & {
  branchId: string;
  totalPurchaseAmount: string;
  totalProfitAmount: string;
  totalDebtAmount: string;
};

const initialCustomerFormFields: CustomerFormFields = {
  fullName: '',
  phone: '',
  whatsappPhone: '',
  status: 'NEW',
  notes: '',
};

const initialCreateState: CreateCustomerState = {
  ...initialCustomerFormFields,
  branchId: '',
  totalPurchaseAmount: '0',
  totalProfitAmount: '0',
  totalDebtAmount: '0',
};

export default function CustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [form, setForm] = useState<CreateCustomerState>(initialCreateState);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [editForm, setEditForm] = useState<CustomerFormFields>(
    initialCustomerFormFields,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [deletingCustomerId, setDeletingCustomerId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState('');
  const [editError, setEditError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

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
    if (!form.fullName.trim() || !form.phone.trim()) {
      setError('Full name and phone are required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await apiFetch<Customer>('/customers', {
        method: 'POST',
        body: JSON.stringify({
          fullName: form.fullName.trim(),
          phone: form.phone.trim(),
          whatsappPhone: form.whatsappPhone.trim() || undefined,
          branchId: form.branchId || undefined,
          status: form.status,
          notes: form.notes.trim() || undefined,
          totalPurchaseAmount: Number(form.totalPurchaseAmount || 0),
          totalProfitAmount: Number(form.totalProfitAmount || 0),
          totalDebtAmount: Number(form.totalDebtAmount || 0),
        }),
      });
      setForm(initialCreateState);
      await loadCustomers();
      showSuccess('Customer created successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create customer');
    } finally {
      setSaving(false);
    }
  }

  function openEditCustomer(customer: Customer) {
    setEditingCustomer(customer);
    setEditError('');
    setEditForm({
      fullName: customer.fullName,
      phone: customer.phone,
      whatsappPhone: customer.whatsappPhone ?? '',
      status: customer.status,
      notes: customer.notes ?? '',
    });
  }

  function closeEditCustomer() {
    setEditingCustomer(null);
    setEditError('');
    setEditForm(initialCustomerFormFields);
  }

  async function updateCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingCustomer) {
      return;
    }

    if (!editForm.fullName.trim() || !editForm.phone.trim()) {
      setEditError('Full name and phone are required');
      return;
    }

    setEditSaving(true);
    setEditError('');

    try {
      const token = window.localStorage.getItem(TOKEN_KEY);

      if (!token) {
        router.replace('/login');
        return;
      }

      if (!process.env.NEXT_PUBLIC_API_URL) {
        throw new Error(
          'NEXT_PUBLIC_API_URL is not configured. Set it to http://localhost:3001 in apps/web/.env.local.',
        );
      }

      const updateUrl = `${process.env.NEXT_PUBLIC_API_URL}/customers/${editingCustomer.id}`;
      console.log('Customer update URL:', updateUrl);

      let response: Response;

      try {
        response = await fetch(updateUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            fullName: editForm.fullName.trim(),
            phone: editForm.phone.trim(),
            whatsappPhone: editForm.whatsappPhone.trim(),
            status: editForm.status,
            notes: editForm.notes.trim(),
          }),
        });
      } catch (fetchError) {
        console.error('Customer update network error', fetchError);
        throw new Error(
          `API server is not reachable at ${process.env.NEXT_PUBLIC_API_URL}. Confirm the API is running on http://localhost:3001.`,
        );
      }

      if (response.status === 401) {
        clearToken();
        router.replace('/login');
        return;
      }

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        const message =
          errorBody?.message ??
          `Update failed with status ${response.status}`;
        throw new Error(Array.isArray(message) ? message.join(', ') : message);
      }

      await loadCustomers();
      closeEditCustomer();
      showSuccess('Customer updated successfully');
    } catch (err) {
      console.error('Customer update failed', err);
      setEditError(
        err instanceof Error ? err.message : 'Could not update customer',
      );
    } finally {
      setEditSaving(false);
    }
  }

  async function deleteCustomer(customer: Customer) {
    if (!window.confirm('Soft delete this customer?')) {
      return;
    }

    setDeletingCustomerId(customer.id);
    setError('');

    try {
      const token = window.localStorage.getItem(TOKEN_KEY);

      if (!token) {
        clearToken();
        router.replace('/login');
        return;
      }

      if (!process.env.NEXT_PUBLIC_API_URL) {
        throw new Error(
          'API server is not reachable. Check backend on port 3001.',
        );
      }

      const url = `${process.env.NEXT_PUBLIC_API_URL}/customers/${customer.id}`;
      console.log('Deleting customer URL:', url);

      let response: Response;

      try {
        response = await fetch(url, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      } catch (fetchError) {
        console.error('Customer delete network error', fetchError);
        throw new Error(
          'API server is not reachable. Check backend on port 3001.',
        );
      }

      if (!response.ok) {
        const responseBody = await response.text();
        console.error('Customer delete failed', {
          status: response.status,
          url,
          responseBody,
        });

        if (response.status === 401) {
          clearToken();
          router.replace('/login');
          return;
        }

        throw new Error(
          responseBody || `Could not delete customer. Status ${response.status}.`,
        );
      }

      await loadCustomers();
      showSuccess('Customer deleted successfully');
    } catch (err) {
      console.error('Customer delete failed', err);
      setError(err instanceof Error ? err.message : 'Could not delete customer');
    } finally {
      setDeletingCustomerId(null);
    }
  }

  function showSuccess(message: string) {
    setSuccessMessage(message);
    window.setTimeout(() => setSuccessMessage(''), 3000);
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

        {successMessage ? (
          <p className="rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
            {successMessage}
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
              <CustomerForm
                form={form}
                onChange={(updates) => setForm({ ...form, ...updates })}
              />
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
                          onClick={() => openEditCustomer(customer)}
                          className="inline-flex items-center gap-1 rounded-lg border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                          type="button"
                        >
                          <PencilIcon />
                          Edit
                        </button>
                        <button
                          onClick={() => void deleteCustomer(customer)}
                          disabled={deletingCustomerId === customer.id}
                          className="rounded-lg border border-red-200 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                          type="button"
                        >
                          {deletingCustomerId === customer.id
                            ? 'Deleting...'
                            : 'Delete'}
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

        {editingCustomer ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6">
            <form
              onSubmit={updateCustomer}
              className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">
                    Edit Customer
                  </p>
                  <h3 className="mt-1 text-2xl font-bold text-slate-950">
                    {editingCustomer.fullName}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Update profile details using the existing CRM endpoint.
                  </p>
                </div>
                <button
                  onClick={closeEditCustomer}
                  className="rounded-full border border-slate-200 px-3 py-1 text-sm font-bold text-slate-500 hover:bg-slate-50"
                  type="button"
                  aria-label="Close edit form"
                >
                  x
                </button>
              </div>

              <div className="mt-5 space-y-4">
                <CustomerForm
                  form={editForm}
                  onChange={(updates) =>
                    setEditForm({ ...editForm, ...updates })
                  }
                />
              </div>

              {editError ? (
                <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                  {editError}
                </p>
              ) : null}

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={closeEditCustomer}
                  className="rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700 hover:bg-slate-50"
                  type="button"
                  disabled={editSaving}
                >
                  Cancel
                </button>
                <button
                  disabled={
                    editSaving ||
                    !editForm.fullName.trim() ||
                    !editForm.phone.trim()
                  }
                  className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                  type="submit"
                >
                  {editSaving ? 'Saving...' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        ) : null}
      </section>
    </ProtectedShell>
  );
}

function CustomerForm({
  form,
  onChange,
}: {
  form: CustomerFormFields;
  onChange: (updates: Partial<CustomerFormFields>) => void;
}) {
  return (
    <>
      <CustomerInput
        label="Full name"
        value={form.fullName}
        onChange={(value) => onChange({ fullName: value })}
        required
      />
      <CustomerInput
        label="Phone"
        value={form.phone}
        onChange={(value) => onChange({ phone: value })}
        required
      />
      <CustomerInput
        label="WhatsApp phone"
        value={form.whatsappPhone}
        onChange={(value) => onChange({ whatsappPhone: value })}
      />

      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Status</span>
        <select
          value={form.status}
          onChange={(event) =>
            onChange({ status: event.target.value as CustomerStatus })
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

      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Notes</span>
        <textarea
          value={form.notes}
          onChange={(event) => onChange({ notes: event.target.value })}
          className="mt-2 min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring-2"
        />
      </label>
    </>
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

function PencilIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L9.38 17.273 5.75 18.25l.977-3.63L16.862 4.487Z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 7.125 16.875 4.5"
      />
    </svg>
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
