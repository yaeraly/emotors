'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { RoleBadges } from '@/components/RoleSelector';
import { apiFetch } from '@/lib/api';
import { canCreateBranchOwner, canResetUserPassword, isBranchPanelUser } from '@/lib/rbac';
import type { Branch, Role, User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';
import { translateStatus } from '@/lib/translate-status';

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

const ceoUsersFilterRoles: Role[] = [...branchRoles];
const pageSizeOptions = [10, 25, 50];

export default function UsersPage() {
  const { t } = useTranslation();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [error, setError] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [userTypeFilter, setUserTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [multiRoleFilter, setMultiRoleFilter] = useState<Role[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [successMessage, setSuccessMessage] = useState('');
  const [openMenuUserId, setOpenMenuUserId] = useState<string | null>(null);

  const isBranchOwnerPanel = isBranchPanelUser(currentUser);

  useEffect(() => {
    if (sessionStorage.getItem('users.createSuccess') === '1') {
      sessionStorage.removeItem('users.createSuccess');
      setSuccessMessage(t('users.employeeCreatedSuccess'));
      window.setTimeout(() => setSuccessMessage(''), 5000);
      return;
    }
    if (sessionStorage.getItem('users.branchOwnerCreatedSuccess') === '1') {
      sessionStorage.removeItem('users.branchOwnerCreatedSuccess');
      setSuccessMessage(t('users.branchOwnerCreatedSuccess'));
      window.setTimeout(() => setSuccessMessage(''), 5000);
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
  }, [branchFilter, multiRoleFilter, pageSize, roleFilter, search, statusFilter, userTypeFilter]);

  const stats = useMemo(() => {
    const hq = users.filter(isHqUser).length;
    return {
      total: users.length,
      hq,
      branch: users.length - hq,
    };
  }, [users]);

  const roleFilterOptions = isBranchOwnerPanel ? branchRoles : ceoUsersFilterRoles;

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
      const matchesRole = isBranchOwnerPanel || !roleFilter || roles.includes(roleFilter as Role);
      const matchesMultiRole =
        multiRoleFilter.length === 0 || multiRoleFilter.every((role) => roles.includes(role));
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
      return matchesSearch && matchesRole && matchesMultiRole && matchesBranch && matchesType && matchesStatus;
    });
  }, [branchFilter, isBranchOwnerPanel, multiRoleFilter, roleFilter, search, statusFilter, userTypeFilter, users]);

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
      setError(message.includes('own branch') ? t('users.resetOwnBranchOnly') : message);
    }
  }

  function resetFilters() {
    setSearch('');
    setRoleFilter('');
    setBranchFilter('');
    setUserTypeFilter('');
    setStatusFilter('');
    setMultiRoleFilter([]);
    setPage(1);
  }

  function toggleMultiRole(role: Role) {
    setMultiRoleFilter((current) =>
      current.includes(role)
        ? current.filter((item) => item !== role)
        : [...current, role],
    );
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
      <section className="space-y-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('users.title')}</p>
            <h2 className="text-3xl font-bold">{t('users.title')}</h2>
            <p className="mt-2 text-sm text-slate-500">
              {isHqUser(currentUser) ? t('users.hqPanelDescription') : t('users.branchPanelDescription')}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {canCreateBranchOwner(currentUser) ? (
              <Link href="/users/branch-owners/new" className="rounded-xl border border-blue-200 px-5 py-3 font-semibold text-blue-700">
                {t('users.createBranchOwner')}
              </Link>
            ) : null}
            <Link href="/users/new" className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white">
              {t('users.create')}
            </Link>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <StatCard label={t('users.totalUsers')} value={stats.total} />
          <StatCard label={t('users.hqUsers')} value={stats.hq} />
          <StatCard label={t('users.branchUsers')} value={stats.branch} />
          <StatCard label={t('users.filteredUsers')} value={filteredUsers.length} />
        </div>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
            <div>
              <h3 className="text-lg font-bold text-slate-950">{t('users.filters')}</h3>
              <p className="text-sm text-slate-500">{t('users.filtersDescription')}</p>
            </div>
            <button onClick={resetFilters} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" type="button">
              {t('users.resetFilters')}
            </button>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">{t('common.search')}</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('users.searchPlaceholder')}
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </label>
            <Select label={t('users.roleFilter')} value={roleFilter} onChange={setRoleFilter} options={[{ value: '', label: t('common.all') }, ...roleFilterOptions.map((role) => ({ value: role, label: roleLabel(role, t) }))]} />
            <Select
              label={t('users.branchFilter')}
              value={branchFilter}
              onChange={setBranchFilter}
              options={[
                { value: '', label: t('users.allBranches') },
                { value: 'HQ', label: t('users.hqEmployees') },
                ...branches.map((branch) => ({ value: branch.id, label: branch.name })),
              ]}
            />
            <Select
              label={t('users.userType')}
              value={userTypeFilter}
              onChange={setUserTypeFilter}
              options={[
                { value: '', label: t('users.allUsers') },
                { value: 'HQ', label: t('users.hqEmployees') },
                { value: 'BRANCH', label: t('users.branchEmployees') },
              ]}
            />
            <Select
              label={t('users.status')}
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: '', label: t('common.all') },
                { value: 'ACTIVE', label: translateStatus(t, 'ACTIVE') },
                { value: 'INACTIVE', label: translateStatus(t, 'INACTIVE') },
                { value: 'SUSPENDED', label: translateStatus(t, 'SUSPENDED') },
              ]}
            />
            <Select
              label={t('users.pageSize')}
              value={String(pageSize)}
              onChange={(value) => setPageSize(Number(value))}
              options={pageSizeOptions.map((option) => ({ value: String(option), label: String(option) }))}
            />
          </div>
          <div className="mt-5">
            <p className="text-sm font-semibold text-slate-700">{t('users.multiRoleFilter')}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {roleFilterOptions.map((role) => (
                <label key={role} className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">
                  <input
                    checked={multiRoleFilter.includes(role)}
                    onChange={() => toggleMultiRole(role)}
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-slate-300"
                  />
                  {roleLabel(role, t)}
                </label>
              ))}
            </div>
          </div>
        </section>

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {successMessage ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">{successMessage}</p> : null}
        {temporaryPassword ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{t('users.temporaryPassword')}: {temporaryPassword}</p> : null}

        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">{t('crm.fullName')}</th>
                  <th className="px-4 py-3">{t('users.username')}</th>
                  <th className="px-4 py-3">{t('users.phone')}</th>
                  <th className="px-4 py-3">{t('crm.branch')}</th>
                  <th className="px-4 py-3">{t('users.userType')}</th>
                  <th className="px-4 py-3">{t('users.assignedRoles')}</th>
                  <th className="px-4 py-3">{t('users.status')}</th>
                  <th className="px-4 py-3">{t('users.lastLogin')}</th>
                  <th className="px-4 py-3">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-blue-50/40">
                    <td className="px-4 py-3 font-bold">{user.fullName}</td>
                    <td className="px-4 py-3">{user.username || (user.hasLogin === false ? t('users.noLoginBadge') : '-')}</td>
                    <td className="px-4 py-3">{user.phone || '-'}</td>
                    <td className="px-4 py-3">{isHqUser(user) ? t('users.hqEmployees') : user.branch?.name ?? user.branchId}</td>
                    <td className="px-4 py-3">{isHqUser(user) ? t('users.hqEmployees') : t('users.branchEmployees')}</td>
                    <td className="px-4 py-3"><RoleBadges roles={rolesForUser(user)} /></td>
                    <td className="px-4 py-3">{translateStatus(t, user.status)}</td>
                    <td className="px-4 py-3">{formatDate(user.lastLoginAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link href={`/users/${user.id}`} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">{t('common.open')}</Link>
                        {canResetUserPassword(currentUser, user) ? <button onClick={() => void resetPassword(user)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold" type="button">{t('users.resetPassword')}</button> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col justify-between gap-3 border-t border-slate-200 p-4 text-sm text-slate-600 md:flex-row md:items-center">
            <p>{t('users.filteredUsers')}: <span className="font-bold text-slate-900">{filteredUsers.length}</span></p>
            <div className="flex items-center gap-2">
              <button disabled={page <= 1} onClick={() => setPage((current) => Math.max(current - 1, 1))} className="rounded-lg border border-slate-300 px-3 py-2 font-semibold disabled:opacity-50" type="button">{t('common.previous')}</button>
              <span>{t('common.page')} {page} {t('common.of')} {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(current + 1, totalPages))} className="rounded-lg border border-slate-300 px-3 py-2 font-semibold disabled:opacity-50" type="button">{t('common.next')}</button>
            </div>
          </div>
        </div>
      </section>
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

function roleLabel(role: Role, t: (key: string) => string) {
  const key = `roles.${role}`;
  const translated = t(key);
  return translated === key ? role.replaceAll('_', ' ') : translated;
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2">
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}
