'use client';

import { useParams } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { hqAssignableRoles, RoleBadges, RoleSelector } from '@/components/RoleSelector';
import { HqWarehouseMultiSelect } from '@/components/users/HqWarehouseMultiSelect';
import { LifecycleDeleteConfirmModal } from '@/components/LifecycleDeleteConfirmModal';
import { apiFetch } from '@/lib/api';
import { canAssignHqWarehouseManager, canDeleteEmployee, canResetUserPassword } from '@/lib/rbac';
import { canGrantCashierCapability } from '@/lib/cashier-capability';
import type { Branch, Role, User, Warehouse } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';
import { getStatusLabel } from '@/lib/translate-status';

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
  const [showCreateLogin, setShowCreateLogin] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState('');
  const [loginForm, setLoginForm] = useState({ username: '', email: '', password: '' });
  const [cashierEnabled, setCashierEnabled] = useState(false);
  const [cashierSaving, setCashierSaving] = useState(false);
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
    department: '',
    notes: '',
    salary: '',
    startDate: '',
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
      setCashierEnabled(Boolean(userResult.cashierCapability || userResult.additionalPermissions?.includes('cashier')));
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
        department: userResult.department ?? '',
        notes: userResult.notes ?? '',
        salary: userResult.salary != null ? String(userResult.salary) : '',
        startDate: userResult.startDate ? userResult.startDate.slice(0, 10) : '',
      });
      setLoginForm({
        username: userResult.username ?? '',
        email: userResult.email ?? '',
        password: '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function toggleCashierPermission(enabled: boolean) {
    if (!user) return;
    setCashierSaving(true);
    setError('');
    try {
      await apiFetch(`/users/${user.id}/permissions/cashier/${enabled ? 'grant' : 'revoke'}`, { method: 'POST' });
      setCashierEnabled(enabled);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setCashierSaving(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try {
      setUser(await apiFetch<User>(`/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...form,
          salary: form.salary ? Number(form.salary) : null,
          startDate: form.startDate || null,
        }),
      }));
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

  async function createLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setTemporaryPassword('');
    try {
      const result = await apiFetch<User & { temporaryPassword?: string }>(`/users/${id}/create-login`, {
        method: 'POST',
        body: JSON.stringify({
          ...loginForm,
          password: loginForm.password || undefined,
        }),
      });
      if (result.temporaryPassword) setTemporaryPassword(result.temporaryPassword);
      setShowCreateLogin(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function deleteEmployee(reason?: string) {
    setError('');
    setDeleteLoading(true);
    try {
      const result = await apiFetch<{ success: boolean; archived?: boolean; message?: string }>(
        `/users/${id}`,
        {
          method: 'DELETE',
          body: JSON.stringify({ reason }),
        },
      );
      setShowDeleteModal(false);
      if (result.archived) {
        setDeleteSuccess(t('lifecycle.userDeactivatedSuccess'));
        await load();
        window.setTimeout(() => {
          window.location.href = '/users';
        }, 1200);
      } else {
        window.location.href = '/users';
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setDeleteLoading(false);
    }
  }

  function setField(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function setRoles(roles: Role[]) {
    setForm((current) => ({
      ...current,
      roles,
      hqWarehouseIds:
        roles.includes('WAREHOUSE_MANAGER') || roles.includes('HQ_SALES_MANAGER')
          ? current.hqWarehouseIds
          : [],
    }));
  }

  const canResetPassword = canResetUserPassword(currentUser, user) && user?.hasLogin !== false;
  const isHqEmployee = user?.branchId === null;
  const isWarehouseManagerRole = form.roles.includes('WAREHOUSE_MANAGER');
  const isHqSalesManagerRole = form.roles.includes('HQ_SALES_MANAGER');
  const canAssignWarehousesRole = isWarehouseManagerRole || isHqSalesManagerRole;
  const canEditAssignments = canAssignHqWarehouseManager(currentUser) && isHqEmployee && canAssignWarehousesRole;
  const canDelete = canDeleteEmployee(currentUser) && currentUser?.id !== user?.id;
  const canManageCashierPermission =
    canGrantCashierCapability(currentUser) &&
    !isHqEmployee &&
    user &&
    currentUser?.id !== user.id &&
    !user.roles?.includes('CASHIER') &&
    user.role !== 'CASHIER';

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('users.title')}</p>
          <h2 className="text-3xl font-bold">{user?.fullName ?? '-'}</h2>
          {user ? <RoleBadges roles={user.roles?.length ? user.roles : [user.role]} /> : null}
          {user?.hasLogin === false ? (
            <p className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">{t('users.noLoginBadge')}</p>
          ) : null}
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {deleteSuccess ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{deleteSuccess}</p> : null}
        {temporaryPassword ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{t('users.temporaryPassword')}: {temporaryPassword}</p> : null}
        <form onSubmit={save} className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
          <Input label={t('crm.fullName')} value={form.fullName} onChange={(value) => setField('fullName', value)} />
          <Input label={t('users.employeeId')} value={form.employeeId} onChange={(value) => setField('employeeId', value)} />
          <Input label={t('users.phone')} value={form.phone} onChange={(value) => setField('phone', value)} />
          {isHqEmployee ? (
            <>
              <Input label={t('users.department')} value={form.department} onChange={(value) => setField('department', value)} />
              <Input label={t('users.salary')} value={form.salary} onChange={(value) => setField('salary', value)} type="number" />
              <Input label={t('users.startDate')} value={form.startDate} onChange={(value) => setField('startDate', value)} type="date" />
              <label className="block md:col-span-2">
                <span className="text-sm font-semibold text-slate-700">{t('users.notes')}</span>
                <textarea value={form.notes} onChange={(event) => setField('notes', event.target.value)} className="mt-2 min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2" />
              </label>
            </>
          ) : null}
          {user?.hasLogin !== false ? (
            <>
              <Input label={t('auth.email')} value={form.email} onChange={(value) => setField('email', value)} />
              <Input label={t('users.username')} value={form.username} onChange={(value) => setField('username', value)} />
            </>
          ) : (
            <Input label={t('auth.email')} value={form.email} onChange={(value) => setField('email', value)} />
          )}
          <RoleSelector label={isHqEmployee ? t('users.hqRoles') : t('users.role')} selectedRoles={form.roles} onChange={setRoles} roles={isHqEmployee ? hqAssignableRoles : undefined} />
          {isHqEmployee ? (
            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              <p className="font-semibold text-slate-800">{t('users.hqEmployee')}</p>
              <p>{t('users.hqEmployeeNoBranch')}</p>
            </div>
          ) : (
            <label className="block"><span className="text-sm font-semibold text-slate-700">{t('crm.branch')}</span><select value={form.branchId} onChange={(event) => setField('branchId', event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2">{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
          )}
          <label className="block"><span className="text-sm font-semibold text-slate-700">{t('users.status')}</span><select value={form.status} onChange={(event) => setField('status', event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"><option value="ACTIVE">{getStatusLabel({ module: 'user', status: 'ACTIVE', t })}</option><option value="INACTIVE">{getStatusLabel({ module: 'user', status: 'INACTIVE', t })}</option><option value="SUSPENDED">{getStatusLabel({ module: 'user', status: 'SUSPENDED', t })}</option></select></label>
          {canEditAssignments ? (
            <HqWarehouseMultiSelect
              warehouses={hqWarehouses}
              selectedIds={form.hqWarehouseIds}
              onChange={(hqWarehouseIds) => setForm((current) => ({ ...current, hqWarehouseIds }))}
            />
          ) : null}
          {!canEditAssignments && canAssignWarehousesRole && user?.assignedHqWarehouses?.length ? (
            <div className="rounded-2xl border border-slate-200 p-4 md:col-span-2">
              <p className="text-sm font-semibold text-slate-700">{t('users.assignedHqWarehouses')}</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {user.assignedHqWarehouses.map((warehouse) => (
                  <li key={warehouse.id}>{warehouse.name} ({warehouse.code})</li>
                ))}
              </ul>
            </div>
          ) : null}
          {canManageCashierPermission ? (
            <div className="rounded-2xl border border-slate-200 p-4 md:col-span-2">
              <p className="text-sm font-semibold text-slate-800">{t('users.additionalPermissions')}</p>
              <label className="mt-3 flex items-center gap-3 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={cashierEnabled}
                  disabled={cashierSaving}
                  onChange={(event) => void toggleCashierPermission(event.target.checked)}
                />
                {t('users.cashierPermission')}
              </label>
              <p className="mt-2 text-sm text-slate-500">{t('users.cashierPermissionHint')}</p>
            </div>
          ) : null}
          <button className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white md:col-span-2" type="submit">{t('common.save')}</button>
        </form>
        <div className="flex flex-wrap gap-2">
          {canResetPassword ? (
            <button onClick={() => void action('reset-password')} className="rounded-xl border border-slate-300 px-4 py-2 font-semibold" type="button">{t('users.resetPassword')}</button>
          ) : null}
          {user?.hasLogin === false && canDeleteEmployee(currentUser) ? (
            <button onClick={() => setShowCreateLogin(true)} className="rounded-xl border border-blue-200 px-4 py-2 font-semibold text-blue-700" type="button">{t('users.createLogin')}</button>
          ) : null}
          <button onClick={() => void action('activate')} className="rounded-xl border border-green-200 px-4 py-2 font-semibold text-green-700" type="button">{t('users.activate')}</button>
          <button onClick={() => void action('suspend')} className="rounded-xl border border-red-200 px-4 py-2 font-semibold text-red-600" type="button">{t('users.suspend')}</button>
          {canDelete ? (
            <button onClick={() => setShowDeleteModal(true)} className="rounded-xl border border-red-300 bg-red-50 px-4 py-2 font-semibold text-red-700" type="button">{t('users.deleteEmployee')}</button>
          ) : null}
        </div>
        {showCreateLogin ? (
          <form onSubmit={createLogin} className="grid gap-4 rounded-3xl border border-blue-200 bg-blue-50/40 p-6 md:grid-cols-2">
            <h3 className="text-lg font-bold text-slate-900 md:col-span-2">{t('users.createLogin')}</h3>
            <Input label={t('users.username')} value={loginForm.username} onChange={(value) => setLoginForm((current) => ({ ...current, username: value }))} required />
            <Input label={t('auth.email')} value={loginForm.email} onChange={(value) => setLoginForm((current) => ({ ...current, email: value }))} />
            <Input label={t('auth.password')} value={loginForm.password} onChange={(value) => setLoginForm((current) => ({ ...current, password: value }))} />
            <div className="flex gap-2 md:col-span-2">
              <button className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white" type="submit">{t('users.createLogin')}</button>
              <button onClick={() => setShowCreateLogin(false)} className="rounded-xl border border-slate-300 px-4 py-3 font-semibold" type="button">{t('common.cancel')}</button>
            </div>
          </form>
        ) : null}
        {showDeleteModal ? (
          <LifecycleDeleteConfirmModal
            open={showDeleteModal}
            entityType="user"
            entityName={user?.fullName ?? ''}
            userFullName={user?.fullName}
            employeeId={user?.employeeId ?? undefined}
            requireReason
            loading={deleteLoading}
            onClose={() => setShowDeleteModal(false)}
            onConfirm={(reason) => void deleteEmployee(reason)}
          />
        ) : null}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold">{t('users.loginHistory')}</h3>
          <pre className="mt-4 max-h-96 overflow-auto rounded-2xl bg-slate-50 p-4 text-xs">{JSON.stringify(history, null, 2)}</pre>
        </section>
      </section>
    </ProtectedShell>
  );
}

function Input({
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
        className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
      />
    </label>
  );
}
