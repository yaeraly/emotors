'use client';

import { useParams } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { hqAssignableRoles, RoleBadges, RoleSelector } from '@/components/RoleSelector';
import { HqWarehouseMultiSelect } from '@/components/users/HqWarehouseMultiSelect';
import { apiFetch } from '@/lib/api';
import { canAssignHqWarehouseManager, canResetUserPassword } from '@/lib/rbac';
import type { Branch, Role, User, Warehouse } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [hqWarehouses, setHqWarehouses] = useState<Warehouse[]>([]);
  const [error, setError] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [form, setForm] = useState({
    fullName: '',
    employeeId: '',
    phone: '',
    email: '',
    username: '',
    roles: ['MANAGER'] as Role[],
    branchId: '',
    status: 'ACTIVE',
    hqWarehouseIds: [] as string[],
  });

  async function load() {
    try {
      const [currentUserResult, userResult, branchResult, historyResult] = await Promise.all([
        apiFetch<User>('/auth/me'),
        apiFetch<User>(`/users/${id}`),
        apiFetch<Branch[]>('/branches'),
        apiFetch<any[]>(`/users/${id}/login-history`),
      ]);
      const warehouseList = canAssignHqWarehouseManager(currentUserResult)
        ? await apiFetch<Warehouse[]>('/hq-warehouses').catch(() => [])
        : [];
      setCurrentUser(currentUserResult);
      setUser(userResult);
      setBranches(branchResult);
      setHistory(historyResult);
      setHqWarehouses(warehouseList);
      setForm({
        fullName: userResult.fullName,
        employeeId: userResult.employeeId ?? '',
        phone: userResult.phone ?? '',
        email: userResult.email ?? '',
        username: userResult.username ?? '',
        roles: userResult.roles?.length ? userResult.roles : [userResult.role],
        branchId: userResult.branchId ?? '',
        status: userResult.status ?? 'ACTIVE',
        hqWarehouseIds: userResult.assignedHqWarehouseIds ?? [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try {
      setUser(await apiFetch<User>(`/users/${id}`, { method: 'PUT', body: JSON.stringify(form) }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function action(path: 'reset-password' | 'activate' | 'suspend') {
    setError('');
    setTemporaryPassword('');
    try {
      const result = await apiFetch<User & { temporaryPassword?: string }>(`/users/${id}/${path}`, { method: 'POST' });
      if (result.temporaryPassword) setTemporaryPassword(result.temporaryPassword);
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.error');
      setError(path === 'reset-password' && message.includes('own branch') ? t('users.resetOwnBranchOnly') : message);
    }
  }

  function setField(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function setRoles(roles: Role[]) {
    setForm((current) => ({ ...current, roles }));
  }

  const canResetPassword = canResetUserPassword(currentUser, user);
  const isHqEmployee = user?.branchId === null;
  const isWarehouseManagerRole = form.roles.includes('WAREHOUSE_MANAGER');
  const canEditAssignments = canAssignHqWarehouseManager(currentUser) && isHqEmployee && isWarehouseManagerRole;

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('users.title')}</p>
          <h2 className="text-3xl font-bold">{user?.fullName ?? '-'}</h2>
          {user ? <RoleBadges roles={user.roles?.length ? user.roles : [user.role]} /> : null}
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {temporaryPassword ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{t('users.temporaryPassword')}: {temporaryPassword}</p> : null}
        <form onSubmit={save} className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
          <Input label={t('crm.fullName')} value={form.fullName} onChange={(value) => setField('fullName', value)} />
          <Input label={t('users.employeeId')} value={form.employeeId} onChange={(value) => setField('employeeId', value)} />
          <Input label={t('users.phone')} value={form.phone} onChange={(value) => setField('phone', value)} />
          <Input label={t('auth.email')} value={form.email} onChange={(value) => setField('email', value)} />
          <Input label={t('users.username')} value={form.username} onChange={(value) => setField('username', value)} />
          <RoleSelector label={isHqEmployee ? t('users.hqRoles') : t('users.role')} selectedRoles={form.roles} onChange={setRoles} roles={isHqEmployee ? hqAssignableRoles : undefined} />
          {isHqEmployee ? (
            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              <p className="font-semibold text-slate-800">{t('users.hqEmployee')}</p>
              <p>{t('users.hqEmployeeNoBranch')}</p>
            </div>
          ) : (
            <label className="block"><span className="text-sm font-semibold text-slate-700">{t('crm.branch')}</span><select value={form.branchId} onChange={(event) => setField('branchId', event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2">{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
          )}
          <label className="block"><span className="text-sm font-semibold text-slate-700">{t('users.status')}</span><select value={form.status} onChange={(event) => setField('status', event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"><option value="ACTIVE">ACTIVE</option><option value="INACTIVE">INACTIVE</option><option value="SUSPENDED">SUSPENDED</option></select></label>
          {canEditAssignments ? (
            <HqWarehouseMultiSelect
              warehouses={hqWarehouses}
              selectedIds={form.hqWarehouseIds}
              onChange={(hqWarehouseIds) => setForm((current) => ({ ...current, hqWarehouseIds }))}
            />
          ) : null}
          {!canEditAssignments && isWarehouseManagerRole && user?.assignedHqWarehouses?.length ? (
            <div className="rounded-2xl border border-slate-200 p-4 md:col-span-2">
              <p className="text-sm font-semibold text-slate-700">{t('users.assignedHqWarehouses')}</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {user.assignedHqWarehouses.map((warehouse) => (
                  <li key={warehouse.id}>{warehouse.name} ({warehouse.code})</li>
                ))}
              </ul>
            </div>
          ) : null}
          <button className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white md:col-span-2" type="submit">{t('common.save')}</button>
        </form>
        <div className="flex flex-wrap gap-2">
          {canResetPassword ? (
            <button onClick={() => void action('reset-password')} className="rounded-xl border border-slate-300 px-4 py-2 font-semibold" type="button">{t('users.resetPassword')}</button>
          ) : null}
          <button onClick={() => void action('activate')} className="rounded-xl border border-green-200 px-4 py-2 font-semibold text-green-700" type="button">{t('users.activate')}</button>
          <button onClick={() => void action('suspend')} className="rounded-xl border border-red-200 px-4 py-2 font-semibold text-red-600" type="button">{t('users.suspend')}</button>
        </div>
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold">{t('users.loginHistory')}</h3>
          <pre className="mt-4 max-h-96 overflow-auto rounded-2xl bg-slate-50 p-4 text-xs">{JSON.stringify(history, null, 2)}</pre>
        </section>
      </section>
    </ProtectedShell>
  );
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block"><span className="text-sm font-semibold text-slate-700">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>;
}
