'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { API_URL, clearToken, getToken } from '@/lib/api';
import { apiFetch } from '@/lib/api';
import type { Branch, User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';
import { translateStatus } from '@/lib/translate-status';
import { canAssignBranchHqWarehouse, canManageBranches } from '@/lib/rbac';

type BranchForm = {
  name: string;
  code: string;
  city: string;
  address: string;
  phone: string;
  ownerName: string;
  status: 'ACTIVE' | 'INACTIVE' | 'PENDING' | 'SUSPENDED';
};

const emptyForm: BranchForm = {
  name: '',
  code: '',
  city: '',
  address: '',
  phone: '',
  ownerName: '',
  status: 'ACTIVE',
};

export default function BranchesPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [allBranches, setAllBranches] = useState<Branch[]>([]);
  const [filters, setFilters] = useState({
    search: '',
    city: '',
    status: '',
    ownerName: '',
  });
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [form, setForm] = useState<BranchForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deletingBranchId, setDeletingBranchId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.search.trim()) params.set('search', filters.search.trim());
    if (filters.city) params.set('city', filters.city);
    if (filters.status) params.set('status', filters.status);
    if (filters.ownerName.trim()) params.set('ownerName', filters.ownerName.trim());
    const value = params.toString();
    return value ? `?${value}` : '';
  }, [filters]);
  const cityOptions = useMemo(
    () =>
      Array.from(
        new Set(allBranches.map((branch) => branch.city).filter(Boolean) as string[]),
      ).sort(),
    [allBranches],
  );

  useEffect(() => {
    void loadBranches();
    if (window.localStorage.getItem('emotors-branch-created')) {
      window.localStorage.removeItem('emotors-branch-created');
      setSuccess(t('branches.created'));
      void loadBranches();
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, t, query]);

  async function loadBranches() {
    try {
      const [filtered, all, me] = await Promise.all([
        apiFetch<Branch[]>(`/branches${query}`),
        apiFetch<Branch[]>('/branches'),
        apiFetch<User>('/auth/me'),
      ]);
      setBranches(filtered);
      setAllBranches(all);
      setUser(me);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function clearFilters() {
    setFilters({ search: '', city: '', status: '', ownerName: '' });
  }

  function openEdit(branch: Branch) {
    setEditingBranch(branch);
    setError('');
    setForm({
      name: branch.name,
      code: branch.code,
      city: branch.city ?? '',
      address: branch.address ?? '',
      phone: branch.phone ?? '',
      ownerName: branch.ownerName ?? '',
      status: branch.status ?? 'ACTIVE',
    });
  }

  async function saveBranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingBranch) return;
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      await apiFetch(`/branches/${editingBranch.id}`, {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      setEditingBranch(null);
      setSuccess(t('branches.updated'));
      await loadBranches();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.error');
      setError(localizeBranchError(message, t));
    } finally {
      setSaving(false);
    }
  }

  async function deleteBranch(branch: Branch) {
    if (!window.confirm(t('branches.confirmDelete'))) return;

    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }

    const url = `${API_URL}/branches/${branch.id}`;
    setDeletingBranchId(branch.id);
    setError('');
    setSuccess('');

    try {
      let response: Response;
      try {
        response = await fetch(url, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (fetchError) {
        console.error('Branch delete network error', fetchError);
        throw new Error('API server is not reachable. Check backend on port 3001.');
      }

      if (response.status === 401) {
        clearToken();
        router.replace('/login');
        return;
      }

      if (!response.ok) {
        const responseBody = await response.text();
        console.error('Branch delete failed', { status: response.status, url, responseBody });
        if (response.status === 403) throw new Error(t('branches.noPermission'));
        if (response.status === 404) throw new Error(t('branches.notFound'));
        throw new Error(t('branches.deleteFailed'));
      }

      const result = (await response.json()) as { deactivated?: boolean };
      setSuccess(result.deactivated ? t('branches.deactivated') : t('branches.deleted'));
      await loadBranches();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('branches.deleteFailed'));
    } finally {
      setDeletingBranchId(null);
    }
  }

  const canManage = canManageBranches(user);
  const canAssignHq = canAssignBranchHqWarehouse(user);

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">
              {t('phase2.title')}
            </p>
            <h2 className="text-3xl font-bold text-slate-950">{t('branches.title')}</h2>
          </div>
          {canManage ? (
            <Link href="/branches/new" className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white">
              {t('branches.new')}
            </Link>
          ) : null}
        </div>

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-bold text-slate-950">{t('branches.filter')}</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <input
              value={filters.search}
              onChange={(event) => setFilters({ ...filters, search: event.target.value })}
              placeholder={t('branches.search')}
              className="rounded-xl border border-slate-300 px-4 py-3 outline-none ring-blue-500 focus:ring-2"
            />
            <select
              value={filters.city}
              onChange={(event) => setFilters({ ...filters, city: event.target.value })}
              className="rounded-xl border border-slate-300 px-4 py-3 outline-none ring-blue-500 focus:ring-2"
            >
              <option value="">{t('branches.allCities')}</option>
              {cityOptions.map((city) => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>
            <select
              value={filters.status}
              onChange={(event) => setFilters({ ...filters, status: event.target.value })}
              className="rounded-xl border border-slate-300 px-4 py-3 outline-none ring-blue-500 focus:ring-2"
            >
              <option value="">{t('branches.allStatuses')}</option>
              {['ACTIVE', 'INACTIVE', 'PENDING', 'SUSPENDED'].map((status) => (
                <option key={status} value={status}>{translateStatus(t, status, 'branch')}</option>
              ))}
            </select>
            <input
              value={filters.ownerName}
              onChange={(event) => setFilters({ ...filters, ownerName: event.target.value })}
              placeholder={t('branches.ownerName')}
              className="rounded-xl border border-slate-300 px-4 py-3 outline-none ring-blue-500 focus:ring-2"
            />
            <button
              onClick={clearFilters}
              className="rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700 hover:bg-slate-50"
              type="button"
            >
              {t('branches.clearFilters')}
            </button>
          </div>
        </section>

        <div className="h-[calc(100vh-240px)] min-h-96 overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-[960px] divide-y divide-slate-200 text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">City</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-4 py-3">{t('branchHqRouting.assignedHqWarehouse')}</th>
                  <th className="px-4 py-3">{t('common.status')}</th>
                  <th className="px-4 py-3">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {branches.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                      {t('branches.noBranchesFound')}
                    </td>
                  </tr>
                ) : branches.map((branch) => (
                  <tr key={branch.id}>
                    <td className="px-4 py-3 font-bold">{branch.name}</td>
                    <td className="px-4 py-3">{branch.code}</td>
                    <td className="px-4 py-3">{branch.city ?? '-'}</td>
                    <td className="px-4 py-3">{branch.phone ?? '-'}</td>
                    <td className="px-4 py-3">{branch.ownerName ?? '-'}</td>
                    <td className="px-4 py-3">{branch.assignedHqWarehouse?.name ?? '—'}</td>
                    <td className="px-4 py-3">{branch.status ?? 'ACTIVE'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Link href={`/branches/${branch.id}`} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">
                          {canAssignHq && !canManage ? t('branchHqRouting.assignHqWarehouse') : t('common.open')}
                        </Link>
                        {canManage ? (
                          <>
                            <button onClick={() => openEdit(branch)} type="button" className="rounded-lg border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-700">
                              {t('common.edit')}
                            </button>
                            <button onClick={() => void deleteBranch(branch)} disabled={deletingBranchId === branch.id} type="button" className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 disabled:opacity-50">
                              {deletingBranchId === branch.id ? t('common.loading') : t('common.delete')}
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {editingBranch ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6">
            <form onSubmit={saveBranch} className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('branches.edit')}</p>
                  <h3 className="mt-1 text-2xl font-bold text-slate-950">{editingBranch.name}</h3>
                </div>
                <button onClick={() => setEditingBranch(null)} type="button" className="rounded-full border border-slate-200 px-3 py-1 font-bold text-slate-500">x</button>
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <BranchInput label="name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} required />
                <BranchInput label="code" value={form.code} onChange={(value) => setForm({ ...form, code: value })} required />
                <BranchInput label="city" value={form.city} onChange={(value) => setForm({ ...form, city: value })} />
                <BranchInput label="address" value={form.address} onChange={(value) => setForm({ ...form, address: value })} />
                <BranchInput label="phone" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
                <BranchInput label="ownerName" value={form.ownerName} onChange={(value) => setForm({ ...form, ownerName: value })} />
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">status</span>
                  <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as BranchForm['status'] })} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2">
                    {['ACTIVE', 'INACTIVE', 'PENDING', 'SUSPENDED'].map((status) => <option key={status} value={status}>{translateStatus(t, status, 'branch')}</option>)}
                  </select>
                </label>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button onClick={() => setEditingBranch(null)} type="button" className="rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700">{t('common.cancel')}</button>
                <button disabled={saving} type="submit" className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:bg-blue-300">{saving ? t('common.loading') : t('common.save')}</button>
              </div>
            </form>
          </div>
        ) : null}
      </section>
    </ProtectedShell>
  );
}

function BranchInput({ label, value, onChange, required }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return <label className="block"><span className="text-sm font-semibold text-slate-700">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} required={required} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>;
}

function localizeBranchError(message: string, t: (key: string) => string) {
  if (message.includes('already exists')) return t('branches.duplicateCode');
  if (message.includes('Forbidden') || message.includes('permission')) return t('branches.noPermission');
  if (message.includes('not found')) return t('branches.notFound');
  return message;
}
