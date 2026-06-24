'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { apiFetch, clearToken } from '@/lib/api';
import { canArchiveCustomer } from '@/lib/rbac';
import type { Branch, Customer, CustomerStatus, User } from '@/lib/types';
import { ProtectedShell } from '@/components/ProtectedShell';
import { useTranslation } from '@/i18n/useTranslation';

const TOKEN_KEY = 'emotors_access_token';
const businessStatuses: CustomerStatus[] = ['ACTIVE', 'VIP', 'RISK', 'INACTIVE', 'ARCHIVED'];
const allStatuses: CustomerStatus[] = [
  'ACTIVE',
  'VIP',
  'RISK',
  'INACTIVE',
  'NEW',
  'SLEEPING',
  'ARCHIVED',
];

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

type SortKey =
  | 'fullName'
  | 'phone'
  | 'whatsappPhone'
  | 'branch'
  | 'status'
  | 'totalPurchases'
  | 'totalProfit'
  | 'totalDebt'
  | 'purchaseCount'
  | 'lastPurchaseDate'
  | 'createdAt';

type SortDirection = 'asc' | 'desc';

const initialCustomerFormFields: CustomerFormFields = {
  fullName: '',
  phone: '',
  whatsappPhone: '',
  status: 'ACTIVE',
  notes: '',
};

const initialCreateState: CreateCustomerState = {
  ...initialCustomerFormFields,
  branchId: '',
  totalPurchaseAmount: '0',
  totalProfitAmount: '0',
  totalDebtAmount: '0',
};

const pageSizeOptions = [10, 25, 50];

export default function CustomersPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [branchId, setBranchId] = useState('');
  const [form, setForm] = useState<CreateCustomerState>(initialCreateState);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
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
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (search.trim()) {
      params.set('search', search.trim());
    }
    if (status) {
      params.set('status', status);
    }
    if (branchId) {
      params.set('branchId', branchId);
    }

    const value = params.toString();
    return value ? `?${value}` : '';
  }, [branchId, search, status]);

  const sortedCustomers = useMemo(() => {
    return [...customers].sort((a, b) => {
      const first = getSortValue(a, sortKey);
      const second = getSortValue(b, sortKey);
      const direction = sortDirection === 'asc' ? 1 : -1;

      if (typeof first === 'number' && typeof second === 'number') {
        return (first - second) * direction;
      }

      return String(first).localeCompare(String(second)) * direction;
    });
  }, [customers, sortDirection, sortKey]);

  const totalPages = Math.max(Math.ceil(sortedCustomers.length / pageSize), 1);
  const visibleCustomers = sortedCustomers.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );

  useEffect(() => {
    setPage(1);
  }, [branchId, pageSize, search, status]);

  useEffect(() => {
    void loadCustomers();
    void apiFetch<User>('/auth/me').then(setCurrentUser).catch(() => null);
    void apiFetch<Branch[]>('/branches').then(setBranches).catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function loadCustomers() {
    setLoading(true);
    setError('');

    try {
      const result = await apiFetch<Customer[]>(`/customers${query}`);
      setCustomers(result);
      setSelectedCustomer((current) =>
        current ? result.find((customer) => customer.id === current.id) ?? null : null,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
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
      showSuccess(t('crm.customerCreated'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
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
      showSuccess(t('crm.customerUpdated'));
    } catch (err) {
      console.error('Customer update failed', err);
      setEditError(
        err instanceof Error ? err.message : t('common.error'),
      );
    } finally {
      setEditSaving(false);
    }
  }

  async function archiveCustomer(customer: Customer) {
    if (!window.confirm(t('crm.confirmDelete'))) {
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
      console.log('Archiving customer URL:', url);

      let response: Response;

      try {
        response = await fetch(url, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      } catch (fetchError) {
        console.error('Customer archive network error', fetchError);
        throw new Error(
          'API server is not reachable. Check backend on port 3001.',
        );
      }

      if (!response.ok) {
        const responseBody = await response.text();
        console.error('Customer archive failed', {
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
          responseBody || t('common.error'),
        );
      }

      await loadCustomers();
      showSuccess(t('crm.customerDeleted'));
    } catch (err) {
      console.error('Customer archive failed', err);
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setDeletingCustomerId(null);
    }
  }

  function changeSort(nextKey: SortKey) {
    if (nextKey === sortKey) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
      return;
    }

    setSortKey(nextKey);
    setSortDirection('asc');
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
              {t('crm.intelligenceTitle')}
            </p>
            <h2 className="text-3xl font-bold text-slate-950">{t('crm.title')}</h2>
            <p className="mt-2 text-slate-500">
              {t('crm.customerHistory')}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('crm.searchPlaceholder')}
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none ring-blue-500 focus:ring-2"
            />
            <select
              value={branchId}
              onChange={(event) => setBranchId(event.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none ring-blue-500 focus:ring-2"
            >
              <option value="">{t('common.all')} {t('crm.branch')}</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none ring-blue-500 focus:ring-2"
            >
              <option value="">{t('common.all')} {t('common.status')}</option>
              {businessStatuses.map((item) => (
                <option key={item} value={item}>
                  {t(`status.${item}`)}
                </option>
              ))}
            </select>
            <select
              value={pageSize}
              onChange={(event) => setPageSize(Number(event.target.value))}
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none ring-blue-500 focus:ring-2"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size} per page
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
              {t('crm.createCustomer')}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              This card keeps a fixed width while the customer table scrolls.
            </p>

            <div className="mt-5 space-y-4">
              <CustomerForm
                form={form}
                onChange={(updates) => setForm({ ...form, ...updates })}
              />
              {branches.length > 1 ? (
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">
                    {t('crm.branch')}
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
              {saving ? t('common.loading') : t('crm.addCustomer')}
            </button>
          </form>

          <div className="h-[calc(100vh-180px)] max-h-[calc(100vh-180px)] overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white p-5">
              <div>
                <h3 className="text-lg font-bold text-slate-950">
                  {t('crm.customerList')}
                </h3>
                <p className="text-sm text-slate-500">
                  {visibleCustomers.length} / {sortedCustomers.length}
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-600">
                {t('common.page')} {page} / {totalPages}
              </span>
            </div>

            {loading ? (
              <p className="p-5 text-slate-500">{t('common.loading')}</p>
            ) : sortedCustomers.length === 0 ? (
              <p className="m-5 rounded-2xl bg-slate-50 p-6 text-center text-slate-500">
                {t('crm.noCustomers')}
              </p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-[1320px] divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      <tr>
                        <SortableHeader
                          label={t('crm.fullName')}
                          sortKey="fullName"
                          activeKey={sortKey}
                          direction={sortDirection}
                          onSort={changeSort}
                        />
                        <SortableHeader
                          label={t('crm.phone')}
                          sortKey="phone"
                          activeKey={sortKey}
                          direction={sortDirection}
                          onSort={changeSort}
                        />
                        <SortableHeader
                          label={t('crm.whatsappPhone')}
                          sortKey="whatsappPhone"
                          activeKey={sortKey}
                          direction={sortDirection}
                          onSort={changeSort}
                        />
                        <SortableHeader
                          label={t('crm.branch')}
                          sortKey="branch"
                          activeKey={sortKey}
                          direction={sortDirection}
                          onSort={changeSort}
                        />
                        <SortableHeader
                          label={t('crm.status')}
                          sortKey="status"
                          activeKey={sortKey}
                          direction={sortDirection}
                          onSort={changeSort}
                        />
                        <SortableHeader
                          label={t('crm.totalPurchaseAmount')}
                          sortKey="totalPurchases"
                          activeKey={sortKey}
                          direction={sortDirection}
                          onSort={changeSort}
                        />
                        <SortableHeader
                          label={t('crm.totalProfitAmount')}
                          sortKey="totalProfit"
                          activeKey={sortKey}
                          direction={sortDirection}
                          onSort={changeSort}
                        />
                        <SortableHeader
                          label={t('crm.totalDebtAmount')}
                          sortKey="totalDebt"
                          activeKey={sortKey}
                          direction={sortDirection}
                          onSort={changeSort}
                        />
                        <SortableHeader
                          label={t('crm.purchaseHistory')}
                          sortKey="purchaseCount"
                          activeKey={sortKey}
                          direction={sortDirection}
                          onSort={changeSort}
                        />
                        <SortableHeader
                          label={t('crm.previousPurchasedProducts')}
                          sortKey="lastPurchaseDate"
                          activeKey={sortKey}
                          direction={sortDirection}
                          onSort={changeSort}
                        />
                        <SortableHeader
                          label={t('common.createdDate')}
                          sortKey="createdAt"
                          activeKey={sortKey}
                          direction={sortDirection}
                          onSort={changeSort}
                        />
                        <th className="px-4 py-3">{t('common.actions')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {visibleCustomers.map((customer) => (
                        <tr key={customer.id} className="hover:bg-blue-50/40">
                          <td className="px-4 py-3">
                            <button
                              onClick={() => setSelectedCustomer(customer)}
                              className="font-bold text-blue-700 hover:text-blue-900"
                              type="button"
                            >
                              {customer.fullName}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {customer.phone}
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {customer.whatsappPhone || '-'}
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {customer.branch?.name ?? customer.branchId}
                          </td>
                          <td className="px-4 py-3">
                            <StatusPill status={customer.status} />
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-900">
                            {formatKgs(customer.totalPurchases)}
                          </td>
                          <td className="px-4 py-3 font-semibold text-emerald-700">
                            {formatKgs(customer.totalProfit)}
                          </td>
                          <td className="px-4 py-3 font-semibold text-red-700">
                            {formatKgs(customer.totalDebt)}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => setSelectedCustomer(customer)}
                              className="rounded-lg bg-slate-100 px-3 py-1 font-semibold text-slate-700 hover:bg-slate-200"
                              type="button"
                            >
                              {customer.purchaseCount} {t('crm.purchaseHistory')}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {formatDate(customer.lastPurchaseDate)}
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {formatDate(customer.createdAt)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Link
                                href={`/customers/${customer.id}`}
                                className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                              >
                                {t('common.open')}
                              </Link>
                              <button
                                onClick={() => openEditCustomer(customer)}
                                className="inline-flex items-center gap-1 rounded-lg border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                                type="button"
                              >
                                <PencilIcon />
                                {t('common.edit')}
                              </button>
                              {canArchiveCustomer(currentUser) ? (
                                <button
                                  onClick={() => void archiveCustomer(customer)}
                                  disabled={deletingCustomerId === customer.id}
                                  className="rounded-lg border border-red-200 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:bg-red-50"
                                  type="button"
                                >
                                  {deletingCustomerId === customer.id
                                    ? t('common.loading')
                                    : t('common.delete')}
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between border-t border-slate-200 p-4">
                  <button
                    onClick={() => setPage((value) => Math.max(value - 1, 1))}
                    disabled={page === 1}
                    className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    type="button"
                  >
                    {t('common.previous')}
                  </button>
                  <p className="text-sm text-slate-500">
                    {t('common.page')} {page} {t('common.of')} {totalPages}
                  </p>
                  <button
                    onClick={() =>
                      setPage((value) => Math.min(value + 1, totalPages))
                    }
                    disabled={page === totalPages}
                    className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    type="button"
                  >
                    {t('common.next')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {selectedCustomer ? (
          <CustomerProfileDrawer
            customer={selectedCustomer}
            onClose={() => setSelectedCustomer(null)}
          />
        ) : null}

        {editingCustomer ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6">
            <form
              onSubmit={updateCustomer}
              className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">
                    {t('crm.editCustomer')}
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
                  {t('common.cancel')}
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
                  {editSaving ? t('common.loading') : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        ) : null}
      </section>
    </ProtectedShell>
  );
}

function CustomerProfileDrawer({
  customer,
  onClose,
}: {
  customer: Customer;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const totalPayments = customer.totalPayments ?? Math.max(customer.totalPurchases - customer.totalDebt, 0);
  const averageOrderValue =
    customer.averageOrderValue ??
    (customer.purchaseCount > 0
      ? customer.totalPurchases / customer.purchaseCount
      : 0);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/40">
      <aside className="h-full w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">
              {t('crm.customerProfile')}
            </p>
            <h3 className="mt-1 text-3xl font-bold text-slate-950">
              {customer.fullName}
            </h3>
            <p className="mt-2 text-slate-500">
              {t('crm.customerHistory')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-slate-200 px-3 py-1 text-sm font-bold text-slate-500 hover:bg-slate-50"
            type="button"
          >
            x
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Info label={t('crm.fullName')} value={customer.fullName} />
          <Info label={t('crm.phone')} value={customer.phone} />
          <Info label={t('crm.whatsappPhone')} value={customer.whatsappPhone ?? '-'} />
          <Info label={t('crm.branch')} value={customer.branch?.name ?? customer.branchId} />
          <Info label={t('crm.status')} value={t(`status.${customer.status}`)} />
          <Info label={t('common.createdDate')} value={formatDate(customer.createdAt)} />
        </div>

        <Panel title={t('crm.financialSummary')}>
          <div className="grid gap-3 md:grid-cols-2">
            <Metric label={t('crm.totalPurchaseAmount')} value={formatKgs(customer.totalPurchases)} />
            <Metric label={t('crm.totalProfitAmount')} value={formatKgs(customer.totalProfit)} />
            <Metric label={t('crm.totalDebtAmount')} value={formatKgs(customer.totalDebt)} />
            <Metric label={t('sales.paidAmount')} value={formatKgs(totalPayments)} />
            <Metric label="Average Order Value" value={formatKgs(averageOrderValue)} />
          </div>
        </Panel>

        <Panel title={t('crm.purchaseHistory')}>
          <p className="text-sm text-slate-500">
            {customer.purchaseCount} purchase records found. Full invoice rows
            will appear here when the Sales module is connected.
          </p>
          <Link
            href={`/customers/${customer.id}`}
            className="mt-3 inline-flex rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            {t('common.open')}
          </Link>
        </Panel>

        <Panel title={t('crm.serviceHistory')}>
          <p className="text-sm text-slate-500">
            Diagnostics, repairs, and warranty records will appear here when the
            Service module is connected. CRM service events are available on the
            full profile timeline.
          </p>
        </Panel>
      </aside>
    </div>
  );
}

function CustomerForm({
  form,
  onChange,
}: {
  form: CustomerFormFields;
  onChange: (updates: Partial<CustomerFormFields>) => void;
}) {
  const { t } = useTranslation();

  return (
    <>
      <CustomerInput
        label={t('crm.fullName')}
        value={form.fullName}
        onChange={(value) => onChange({ fullName: value })}
        required
      />
      <CustomerInput
        label={t('crm.phone')}
        value={form.phone}
        onChange={(value) => onChange({ phone: value })}
        required
      />
      <CustomerInput
        label={t('crm.whatsappPhone')}
        value={form.whatsappPhone}
        onChange={(value) => onChange({ whatsappPhone: value })}
      />

      <label className="block">
        <span className="text-sm font-semibold text-slate-700">{t('crm.status')}</span>
        <select
          value={form.status}
          onChange={(event) =>
            onChange({ status: event.target.value as CustomerStatus })
          }
          className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring-2"
        >
          {allStatuses.map((item) => (
            <option key={item} value={item}>
              {t(`status.${item}`)}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-sm font-semibold text-slate-700">{t('crm.notes')}</span>
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

function SortableHeader({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  direction: SortDirection;
  onSort: (key: SortKey) => void;
}) {
  const active = sortKey === activeKey;

  return (
    <th className="px-4 py-3">
      <button
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 hover:text-blue-700"
        type="button"
      >
        {label}
        <span>{active ? (direction === 'asc' ? '↑' : '↓') : '↕'}</span>
      </button>
    </th>
  );
}

function StatusPill({ status }: { status: CustomerStatus }) {
  const { t } = useTranslation();
  const tone =
    status === 'VIP'
      ? 'bg-amber-100 text-amber-800'
      : status === 'RISK'
        ? 'bg-red-100 text-red-700'
        : status === 'INACTIVE' || status === 'SLEEPING'
          ? 'bg-slate-100 text-slate-600'
          : 'bg-blue-100 text-blue-700';

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-bold ${tone}`}>
      {t(`status.${status}`)}
    </span>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <h4 className="text-lg font-bold text-slate-950">{title}</h4>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold text-slate-950">{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 font-bold text-slate-900">{value}</p>
    </div>
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

function getSortValue(customer: Customer, key: SortKey) {
  switch (key) {
    case 'branch':
      return customer.branch?.name ?? '';
    case 'lastPurchaseDate':
      return customer.lastPurchaseDate
        ? new Date(customer.lastPurchaseDate).getTime()
        : 0;
    case 'createdAt':
      return new Date(customer.createdAt).getTime();
    case 'totalPurchases':
    case 'totalProfit':
    case 'totalDebt':
    case 'purchaseCount':
      return customer[key] ?? 0;
    default:
      return customer[key] ?? '';
  }
}

function formatKgs(value: number | string | null | undefined) {
  return `${Number(value ?? 0).toLocaleString('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })} KGS`;
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleDateString();
}
