'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { LifecycleDeleteConfirmModal } from '@/components/LifecycleDeleteConfirmModal';
import { RoleBadges } from '@/components/RoleSelector';
import { apiFetch } from '@/lib/api';
import { canCreateBranchOwner, canDeleteEmployee, canResetUserPassword, isBranchPanelUser } from '@/lib/rbac';
import type { Branch, Role, User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';
import { translateStatus } from '@/lib/translate-status';

import { toast } from '@/lib/toast';

const hqRoles: Role[] = [
  'CEO',
  'FRANCHISE_DIRECTOR',
  'SUPPLY_CHAIN_MANAGER',
  'HQ_SALES_MANAGER',
  'HQ_CASHIER',
  'WAREHOUSE_MANAGER',
  'FINANCE_MANAGER',
  'HQ_ACCOUNTANT',
  'MARKETING_MANAGER',
  'CONTENT_CREATOR',
  'ACADEMY_DIRECTOR',
  'SYSTEM_ADMINISTRATOR',
];

const branchRoles: Role[] = [
  'FRANCHISE_OWNER',
  'MANAGER',
  'MASTER',
  'WAREHOUSE_OPERATOR',
  'CASHIER',
  'ACCOUNTANT',
];

const pageSizeOptions = [10, 25, 50];

export default function UsersPage() {
  const { t } = useTranslation();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [error, setError] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [userTypeFilter, setUserTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [successMessage, setSuccessMessage] = useState('');
  const [openMenuUserId, setOpenMenuUserId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const isBranchOwnerPanel = isBranchPanelUser(currentUser);

  useEffect(() => {
    if (sessionStorage.getItem('users.createSuccess') === '1') {
      sessionStorage.removeItem('users.createSuccess');
      toast.success(t('users.employeeCreatedSuccess'));
      
      return;
    }
    if (sessionStorage.getItem('users.branchOwnerCreatedSuccess') === '1') {
      sessionStorage.removeItem('users.branchOwnerCreatedSuccess');
      toast.success(t('users.branchOwnerCreatedSuccess'));
      
    }
  }, [t]);

  useEffect(() => {
    Promise.all([apiFetch<User>('/auth/me'), apiFetch<User[]>('/users'), apiFetch<Branch[]>('/branches')])
      .then(([me, result, branchResult]) => {
        setCurrentUser(me);
        setUsers(result);
        setBranches(branchResult);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  useEffect(() => {
    setPage(1);
  }, [branchFilter, pageSize, search, statusFilter, userTypeFilter]);

  const filteredUsers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return users.filter((user) => {
      const roles = rolesForUser(user);
      const isHq = isHqUser(user);
      const matchesSearch =
        !normalizedSearch ||
        [user.fullName, user.username, user.phone, user.email, user.employeeId]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedSearch));
      const matchesBranch =
        isBranchOwnerPanel ||
        !branchFilter ||
        (branchFilter === 'HQ'
          ? isHq
          : user.branchId === branchFilter);
      const matchesType =
        isBranchOwnerPanel ||
        !userTypeFilter ||
        (userTypeFilter === 'HQ' ? isHq : !isHq);
      const matchesStatus = !statusFilter || user.status === statusFilter;
      return matchesSearch && matchesBranch && matchesType && matchesStatus;
    });
  }, [branchFilter, isBranchOwnerPanel, search, statusFilter, userTypeFilter, users]);

  const totalPages = Math.max(Math.ceil(filteredUsers.length / pageSize), 1);
  const visibleUsers = filteredUsers.slice((page - 1) * pageSize, page * pageSize);

  async function resetPassword(user: User) {
    setError('');
    setTemporaryPassword('');
    setOpenMenuUserId(null);
    try {
      const result = await apiFetch<User & { temporaryPassword?: string }>(`/users/${user.id}/reset-password`, { method: 'POST' });
      if (result.temporaryPassword) setTemporaryPassword(`${user.fullName}: ${result.temporaryPassword}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.error');
      toast.error(message.includes('own branch') ? t('users.resetOwnBranchOnly') : message);
    }
  }

  function resetFilters() {
    setSearch('');
    setBranchFilter('');
    setUserTypeFilter('');
    setStatusFilter('');
    setPage(1);
  }

  async function confirmDeleteUser(reason?: string) {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setError('');
    try {
      const result = await apiFetch<{
        success: boolean;
        permanentlyDeleted?: boolean;
        deactivated?: boolean;
        message?: string;
      }>(`/users/${deleteTarget.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason }),
      });
      const targetId = deleteTarget.id;
      setDeleteTarget(null);
      setUsers((current) => current.filter((row) => row.id !== targetId));
      toast.success(result.permanentlyDeleted
          ? t('lifecycle.userDeletedSuccess')
          : (result.message ?? t('lifecycle.userDeactivatedSuccess')),);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setDeleteLoading(false);
    }
  }

  if (isBranchOwnerPanel) {
    return (
      <ProtectedShell>
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-slate-950">{t('users.title')}</h2>
              <p className="text-xs text-slate-500">{t('users.branchPanelDescription')}</p>
            </div>
            <Link href="/users/new" className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white">
              {t('users.createEmployee')}
            </Link>
          </div>

          <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <label className="min-w-[12rem] flex-1">
              <span className="text-xs font-semibold text-slate-600">{t('common.search')}</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('users.searchPlaceholder')}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
              />
            </label>
            <label className="min-w-[8rem]">
              <span className="text-xs font-semibold text-slate-600">{t('users.status')}</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
              >
                <option value="">{t('common.all')}</option>
                <option value="ACTIVE">{translateStatus(t, 'ACTIVE')}</option>
                <option value="INACTIVE">{translateStatus(t, 'INACTIVE')}</option>
                <option value="SUSPENDED">{translateStatus(t, 'SUSPENDED')}</option>
              </select>
            </label>
          </div>

          {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          {successMessage ? <p className="rounded-lg bg-green-50 px-3 py-2 text-sm font-semibold text-green-700">{successMessage}</p> : null}
          {temporaryPassword ? <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{t('users.temporaryPassword')}: {temporaryPassword}</p> : null}

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">{t('crm.fullName')}</th>
                    <th className="hidden px-3 py-2 sm:table-cell">{t('users.employeeId')}</th>
                    <th className="px-3 py-2">{t('users.assignedRoles')}</th>
                    <th className="hidden px-3 py-2 md:table-cell">{t('users.phone')}</th>
                    <th className="px-3 py-2">{t('users.status')}</th>
                    <th className="px-3 py-2 text-right">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50/80">
                      <td className="max-w-[10rem] truncate px-3 py-2 font-semibold text-slate-900" title={user.fullName}>
                        {user.fullName}
                      </td>
                      <td className="hidden px-3 py-2 text-slate-600 sm:table-cell">{user.employeeId || '—'}</td>
                      <td className="px-3 py-2"><RoleBadges roles={rolesForUser(user)} /></td>
                      <td className="hidden px-3 py-2 text-slate-600 md:table-cell">{user.phone || '—'}</td>
                      <td className="px-3 py-2">{translateStatus(t, user.status)}</td>
                      <td className="relative px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => setOpenMenuUserId((current) => (current === user.id ? null : user.id))}
                          className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700"
                        >
                          ···
                        </button>
                        {openMenuUserId === user.id ? (
                          <div className="absolute right-3 z-10 mt-1 min-w-[9rem] rounded-lg border border-slate-200 bg-white py-1 text-left shadow-lg">
                            <Link href={`/users/${user.id}`} className="block px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50" onClick={() => setOpenMenuUserId(null)}>
                              {t('common.open')}
                            </Link>
                            <Link href={`/users/${user.id}`} className="block px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50" onClick={() => setOpenMenuUserId(null)}>
                              {t('common.edit')}
                            </Link>
                            {canResetUserPassword(currentUser, user) ? (
                              <button type="button" onClick={() => void resetPassword(user)} className="block w-full px-3 py-1.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50">
                                {t('users.resetPassword')}
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-3 py-2 text-xs text-slate-600">
              <span>{filteredUsers.length}</span>
              <div className="flex items-center gap-2">
                <button disabled={page <= 1} onClick={() => setPage((current) => Math.max(current - 1, 1))} className="rounded border border-slate-300 px-2 py-1 font-semibold disabled:opacity-50" type="button">{t('common.previous')}</button>
                <span>{page} / {totalPages}</span>
                <button disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(current + 1, totalPages))} className="rounded border border-slate-300 px-2 py-1 font-semibold disabled:opacity-50" type="button">{t('common.next')}</button>
              </div>
            </div>
          </div>
        </section>
      </ProtectedShell>
    );
  }

  return (
    <ProtectedShell>
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-950">{t('users.title')}</h2>
            <p className="text-xs text-slate-500">
              {isHqUser(currentUser) ? t('users.hqPanelDescription') : t('users.branchPanelDescription')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canCreateBranchOwner(currentUser) ? (
              <Link href="/users/branch-owners/new" className="rounded-lg border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700">
                {t('users.createBranchOwner')}
              </Link>
            ) : null}
            <Link href="/users/new" className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white">
              {t('users.create')}
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <label className="min-w-[12rem] flex-1">
            <span className="text-xs font-semibold text-slate-600">{t('common.search')}</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('users.searchPlaceholder')}
              className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
            />
          </label>
          <label className="min-w-[8rem]">
            <span className="text-xs font-semibold text-slate-600">{t('users.branchFilter')}</span>
            <select
              value={branchFilter}
              onChange={(event) => setBranchFilter(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
            >
              <option value="">{t('users.allBranches')}</option>
              <option value="HQ">{t('users.hqEmployees')}</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </label>
          <label className="min-w-[8rem]">
            <span className="text-xs font-semibold text-slate-600">{t('users.userType')}</span>
            <select
              value={userTypeFilter}
              onChange={(event) => setUserTypeFilter(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
            >
              <option value="">{t('users.allUsers')}</option>
              <option value="HQ">{t('users.hqEmployees')}</option>
              <option value="BRANCH">{t('users.branchEmployees')}</option>
            </select>
          </label>
          <label className="min-w-[8rem]">
            <span className="text-xs font-semibold text-slate-600">{t('users.status')}</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
            >
              <option value="">{t('common.all')}</option>
              <option value="ACTIVE">{translateStatus(t, 'ACTIVE')}</option>
              <option value="INACTIVE">{translateStatus(t, 'INACTIVE')}</option>
              <option value="SUSPENDED">{translateStatus(t, 'SUSPENDED')}</option>
            </select>
          </label>
          <label className="min-w-[5rem]">
            <span className="text-xs font-semibold text-slate-600">{t('users.pageSize')}</span>
            <select
              value={String(pageSize)}
              onChange={(event) => setPageSize(Number(event.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
            >
              {pageSizeOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <button onClick={resetFilters} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50" type="button">
            {t('users.resetFilters')}
          </button>
        </div>

        {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        {successMessage ? <p className="rounded-lg bg-green-50 px-3 py-2 text-sm font-semibold text-green-700">{successMessage}</p> : null}
        {temporaryPassword ? <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{t('users.temporaryPassword')}: {temporaryPassword}</p> : null}

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">{t('crm.fullName')}</th>
                  <th className="hidden px-3 py-2 sm:table-cell">{t('users.employeeId')}</th>
                  <th className="px-3 py-2">{t('users.assignedRoles')}</th>
                  <th className="hidden px-3 py-2 md:table-cell">{t('users.phone')}</th>
                  <th className="px-3 py-2">{t('users.status')}</th>
                  <th className="px-3 py-2 text-right">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/80">
                    <td className="max-w-[10rem] truncate px-3 py-2 font-semibold text-slate-900" title={user.fullName}>
                      {user.fullName}
                    </td>
                    <td className="hidden px-3 py-2 text-slate-600 sm:table-cell">{user.employeeId || '—'}</td>
                    <td className="px-3 py-2"><RoleBadges roles={rolesForUser(user)} /></td>
                    <td className="hidden px-3 py-2 text-slate-600 md:table-cell">{user.phone || '—'}</td>
                    <td className="px-3 py-2">{translateStatus(t, user.status)}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <Link href={`/users/${user.id}`} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold">
                          {t('common.open')}
                        </Link>
                        {canDeleteEmployee(currentUser) && currentUser?.id !== user.id ? (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(user)}
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
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-3 py-2 text-xs text-slate-600">
            <span>{filteredUsers.length}</span>
            <div className="flex items-center gap-2">
              <button disabled={page <= 1} onClick={() => setPage((current) => Math.max(current - 1, 1))} className="rounded border border-slate-300 px-2 py-1 font-semibold disabled:opacity-50" type="button">{t('common.previous')}</button>
              <span>{page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(current + 1, totalPages))} className="rounded border border-slate-300 px-2 py-1 font-semibold disabled:opacity-50" type="button">{t('common.next')}</button>
            </div>
          </div>
        </div>
      </section>
      <LifecycleDeleteConfirmModal
        open={Boolean(deleteTarget)}
        entityType="user"
        entityName={deleteTarget?.fullName ?? ''}
        userFullName={deleteTarget?.fullName}
        employeeId={deleteTarget?.employeeId ?? undefined}
        requireReason
        loading={deleteLoading}
        onClose={() => setDeleteTarget(null)}
        onConfirm={(reason) => void confirmDeleteUser(reason)}
      />
    </ProtectedShell>
  );
}

function rolesForUser(user: Pick<User, 'role' | 'roles'>) {
  return user.roles?.length ? user.roles : [user.role];
}

function isHqUser(user: Pick<User, 'role' | 'roles'> | null | undefined) {
  if (!user) return false;
  return rolesForUser(user).some((role) => hqRoles.includes(role));
}
