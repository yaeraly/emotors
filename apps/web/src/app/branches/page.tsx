'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { LifecycleDeleteConfirmModal } from '@/components/LifecycleDeleteConfirmModal';
import { apiFetch } from '@/lib/api';
import { canDeleteBranch, hasFullAccess } from '@/lib/rbac';
import type { Branch, User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';
import { translateStatus } from '@/lib/translate-status';

import { toast } from '@/lib/toast';

export default function BranchesPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [allBranches, setAllBranches] = useState<Branch[]>([]);
  const [filters, setFilters] = useState({
    search: '',
    city: '',
    status: '',
    branchType: '',
    ownerName: '',
  });
  const [error, setError] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Branch | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.search.trim()) params.set('search', filters.search.trim());
    if (filters.city) params.set('city', filters.city);
    if (filters.status) params.set('status', filters.status);
    if (filters.branchType) params.set('branchType', filters.branchType);
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
      toast.success(t('branches.created'));
      void loadBranches();
      router.refresh();
    }
    const deletedMessage = window.localStorage.getItem('emotors-branch-deleted');
    if (deletedMessage) {
      window.localStorage.removeItem('emotors-branch-deleted');
      toast.success(deletedMessage);
      void loadBranches();
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
      toast.error(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function clearFilters() {
    setFilters({ search: '', city: '', status: '', branchType: '', ownerName: '' });
  }

  function branchTypeLabel(branchType?: string) {
    switch (branchType) {
      case 'HQ_BRANCH':
        return t('branches.branchTypeHq');
      case 'FRANCHISE':
        return t('branches.branchTypeFranchise');
      case 'DEALER':
        return t('branches.branchTypeDealer');
      case 'DISTRIBUTOR':
        return t('branches.branchTypeDistributor');
      default:
        return '—';
    }
  }

  const ceoView = hasFullAccess(user);
  const canDelete = canDeleteBranch(user);

  async function confirmDeleteBranch(reason?: string) {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setError('');
    try {
      const result = await apiFetch<{ success: boolean; permanentlyDeleted?: boolean; message?: string }>(
        `/branches/${deleteTarget.id}`,
        { method: 'DELETE', body: JSON.stringify({ reason }) },
      );
      if (!result.success) throw new Error(t('branches.deleteFailed'));
      setDeleteTarget(null);
      toast.success(t('branches.deletedSuccess'));
      await loadBranches();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('branches.deleteFailed'));
    } finally {
      setDeleteLoading(false);
    }
  }

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
          {hasFullAccess(user) ? (
            <Link href="/branches/new" className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white">
              {t('branches.new')}
            </Link>
          ) : null}
        </div>

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

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
            <select
              value={filters.branchType}
              onChange={(event) => setFilters({ ...filters, branchType: event.target.value })}
              className="rounded-xl border border-slate-300 px-4 py-3 outline-none ring-blue-500 focus:ring-2"
            >
              <option value="">{t('branches.allBranchTypes')}</option>
              <option value="HQ_BRANCH">{t('branches.branchTypeHq')}</option>
              <option value="FRANCHISE">{t('branches.branchTypeFranchise')}</option>
              <option value="DEALER">{t('branches.branchTypeDealer')}</option>
              <option value="DISTRIBUTOR">{t('branches.branchTypeDistributor')}</option>
            </select>
            <input
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

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full divide-y divide-slate-200 text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">{ceoView ? t('branches.name') : 'Name'}</th>
                  {ceoView ? <th className="hidden px-3 py-2 sm:table-cell">{t('branches.code')}</th> : null}
                  <th className="px-3 py-2">{t('branches.branchType')}</th>
                  {!ceoView ? <th className="hidden px-3 py-2 lg:table-cell">{t('branches.pricingProfile')}</th> : null}
                  {!ceoView ? <th className="hidden px-3 py-2 md:table-cell">{t('branches.city')}</th> : null}
                  {!ceoView ? <th className="hidden px-3 py-2 lg:table-cell">{t('branches.phone')}</th> : null}
                  <th className="px-3 py-2">{t('branches.ownerName')}</th>
                  {!ceoView ? <th className="hidden px-3 py-2 xl:table-cell">{t('branchHqRouting.assignedHqWarehouse')}</th> : null}
                  {ceoView ? <th className="hidden px-3 py-2 md:table-cell">{t('branches.city')}</th> : null}
                  <th className="px-3 py-2">{t('common.status')}</th>
                  <th className="px-3 py-2 text-right">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {branches.length === 0 ? (
                  <tr>
                    <td colSpan={ceoView ? 7 : 9} className="px-3 py-8 text-center text-slate-500">
                      {t('branches.noBranchesFound')}
                    </td>
                  </tr>
                ) : branches.map((branch) => (
                  <tr key={branch.id} className="hover:bg-slate-50/80">
                    <td className="max-w-[10rem] truncate px-3 py-2 font-semibold text-slate-900" title={branch.name}>
                      {branch.name}
                    </td>
                    {ceoView ? <td className="hidden px-3 py-2 text-slate-600 sm:table-cell">{branch.code}</td> : null}
                    <td className="px-3 py-2">{branchTypeLabel(branch.branchType)}</td>
                    {!ceoView ? <td className="hidden px-3 py-2 lg:table-cell">{branch.priceProfile?.name ?? '—'}</td> : null}
                    {!ceoView ? <td className="hidden px-3 py-2 md:table-cell">{branch.city ?? '-'}</td> : null}
                    {!ceoView ? <td className="hidden px-3 py-2 lg:table-cell">{branch.phone ?? '-'}</td> : null}
                    <td className="max-w-[8rem] truncate px-3 py-2 text-slate-700" title={branch.ownerName ?? undefined}>
                      {branch.ownerName ?? '-'}
                    </td>
                    {!ceoView ? <td className="hidden px-3 py-2 xl:table-cell">{branch.assignedHqWarehouse?.name ?? '—'}</td> : null}
                    {ceoView ? <td className="hidden px-3 py-2 md:table-cell">{branch.city ?? '—'}</td> : null}
                    <td className="px-3 py-2">{translateStatus(t, branch.status ?? 'ACTIVE', 'branch')}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <Link href={`/branches/${branch.id}`} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold">
                          {t('common.open')}
                        </Link>
                        {canDelete ? (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(branch)}
                            className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-700"
                          >
                            {t('common.delete')}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      <LifecycleDeleteConfirmModal
        open={Boolean(deleteTarget)}
        entityType="branch"
        entityName={deleteTarget?.name ?? ''}
        entityCode={deleteTarget?.code}
        requireReason={false}
        loading={deleteLoading}
        onClose={() => setDeleteTarget(null)}
        onConfirm={(reason) => void confirmDeleteBranch(reason)}
      />
    </ProtectedShell>
  );
}
