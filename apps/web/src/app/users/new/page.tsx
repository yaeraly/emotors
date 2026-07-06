'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedShell } from '@/components/ProtectedShell';
import { hqAssignableRoles, RoleSelector } from '@/components/RoleSelector';
import { HqWarehouseMultiSelect } from '@/components/users/HqWarehouseMultiSelect';
import { apiFetch } from '@/lib/api';
import type { Branch, Role, User, Warehouse } from '@/lib/types';
import { canAssignHqWarehouseManager, canCreateHqEmployee } from '@/lib/rbac';
import { useTranslation } from '@/i18n/useTranslation';

export default function NewUserPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
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
    password: '',
    hqWarehouseIds: [] as string[],
    hasLogin: true,
    department: '',
    notes: '',
    salary: '',
    startDate: '',
    status: 'ACTIVE',
  });

  useEffect(() => {
    Promise.all([apiFetch<User>('/auth/me'), apiFetch<Branch[]>('/branches')])
      .then(async ([me, result]) => {
        const hqCreator = canCreateHqEmployee(me);
        const warehouseList = canAssignHqWarehouseManager(me)
          ? await apiFetch<Warehouse[]>('/hq-warehouses').catch(() => [])
          : [];
        setCurrentUser(me);
        setBranches(result);
        setHqWarehouses(warehouseList);
        setForm((current) => ({
          ...current,
          roles: hqCreator ? ['SUPPLY_CHAIN_MANAGER'] : current.roles,
          branchId: hqCreator ? '' : result[0]?.id ?? '',
        }));
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  const isHqCreator = canCreateHqEmployee(currentUser);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setTemporaryPassword('');
    try {
      const created = await apiFetch<User & { temporaryPassword?: string }>('/users', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          userType: isHqCreator ? 'HQ' : 'BRANCH',
          branchId: isHqCreator ? null : form.branchId,
          password: form.hasLogin ? form.password || undefined : undefined,
          salary: form.salary ? Number(form.salary) : undefined,
          startDate: form.startDate || undefined,
          hqWarehouseIds: form.roles.includes('WAREHOUSE_MANAGER') ? form.hqWarehouseIds : undefined,
        }),
      });
      if (created.temporaryPassword) setTemporaryPassword(created.temporaryPassword);
      else router.push(`/users/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function setField(key: keyof typeof form, value: string | boolean) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function setRoles(roles: Role[]) {
    setForm((current) => ({
      ...current,
      roles,
      hqWarehouseIds: roles.includes('WAREHOUSE_MANAGER') ? current.hqWarehouseIds : [],
    }));
  }

  const canEditAssignments =
    canAssignHqWarehouseManager(currentUser) &&
    isHqCreator &&
    form.roles.includes('WAREHOUSE_MANAGER');

  return (
    <ProtectedShell>
      <form onSubmit={submit} className="space-y-6">
        <div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('users.title')}</p><h2 className="text-3xl font-bold">{isHqCreator ? t('users.createHqEmployee') : t('users.create')}</h2></div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {temporaryPassword ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{t('users.temporaryPassword')}: {temporaryPassword}</p> : null}
        <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
          <Input label={t('crm.fullName')} value={form.fullName} onChange={(value) => setField('fullName', value)} required />
          <Input label={t('users.employeeId')} value={form.employeeId} onChange={(value) => setField('employeeId', value)} />
          <Input label={t('users.phone')} value={form.phone} onChange={(value) => setField('phone', value)} required />
          {isHqCreator ? (
            <>
              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4 md:col-span-2">
                <input
                  checked={form.hasLogin}
                  onChange={(event) => setField('hasLogin', event.target.checked)}
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                />
                <span className="text-sm font-semibold text-slate-700">{t('users.createWithLogin')}</span>
              </label>
              <Input label={t('users.department')} value={form.department} onChange={(value) => setField('department', value)} />
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">{t('users.status')}</span>
                <select value={form.status} onChange={(event) => setField('status', event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2">
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                  <option value="SUSPENDED">SUSPENDED</option>
                </select>
              </label>
              <Input label={t('users.salary')} value={form.salary} onChange={(value) => setField('salary', value)} type="number" />
              <Input label={t('users.startDate')} value={form.startDate} onChange={(value) => setField('startDate', value)} type="date" />
              <label className="block md:col-span-2">
                <span className="text-sm font-semibold text-slate-700">{t('users.notes')}</span>
                <textarea value={form.notes} onChange={(event) => setField('notes', event.target.value)} className="mt-2 min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2" />
              </label>
            </>
          ) : null}
          {form.hasLogin || !isHqCreator ? (
            <>
              <Input label={t('auth.email')} value={form.email} onChange={(value) => setField('email', value)} />
              <Input label={t('users.username')} value={form.username} onChange={(value) => setField('username', value)} required={form.hasLogin || !isHqCreator} />
              <Input label={t('auth.password')} value={form.password} onChange={(value) => setField('password', value)} />
            </>
          ) : (
            <Input label={t('auth.email')} value={form.email} onChange={(value) => setField('email', value)} />
          )}
          <RoleSelector label={isHqCreator ? t('users.hqRoles') : t('users.role')} selectedRoles={form.roles} onChange={setRoles} roles={isHqCreator ? hqAssignableRoles : undefined} />
          {isHqCreator ? (
            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              <p className="font-semibold text-slate-800">{t('users.hqEmployee')}</p>
              <p>{form.hasLogin ? t('users.hqEmployeeNoBranch') : t('users.hqEmployeeNoLoginHint')}</p>
            </div>
          ) : (
            <label className="block"><span className="text-sm font-semibold text-slate-700">{t('crm.branch')}</span><select value={form.branchId} onChange={(event) => setField('branchId', event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2">{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
          )}
          {canEditAssignments ? (
            <HqWarehouseMultiSelect
              warehouses={hqWarehouses}
              selectedIds={form.hqWarehouseIds}
              onChange={(hqWarehouseIds) => setForm((current) => ({ ...current, hqWarehouseIds }))}
            />
          ) : null}
          <button className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white md:col-span-2" type="submit">{t('common.create')}</button>
        </section>
      </form>
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
