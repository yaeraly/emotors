'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { canCreateBranchOwner } from '@/lib/rbac';
import type { Branch, User, Warehouse } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

import { toast } from '@/lib/toast';

type CreateBranchOwnerResponse = User & {
  branch?: Branch;
  warehouse?: Warehouse;
};

export default function NewBranchOwnerPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    email: '',
    username: '',
    password: '',
    branchName: '',
    city: '',
    address: '',
    branchPhone: '',
    branchStatus: 'ACTIVE',
    status: 'ACTIVE',
  });

  function setField(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  useEffect(() => {
    apiFetch<User>('/auth/me')
      .then((me) => {
        if (!canCreateBranchOwner(me)) {
          router.replace('/users');
          return;
        }
        setAllowed(true);
      })
      .catch(() => router.replace('/users'));
  }, [router]);

  if (allowed === null) {
    return (
      <ProtectedShell>
        <p className="text-sm text-slate-500">{t('common.loading')}</p>
      </ProtectedShell>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await apiFetch<CreateBranchOwnerResponse>('/users/branch-owners', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      sessionStorage.setItem('users.branchOwnerCreatedSuccess', '1');
      router.replace('/users');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
      setSubmitting(false);
    }
  }

  return (
    <ProtectedShell>
      <form onSubmit={submit} className="space-y-6">
        <div>
          <Link href="/users" className="text-sm font-semibold text-blue-600">← {t('users.title')}</Link>
          <p className="mt-2 text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('users.title')}</p>
          <h2 className="text-3xl font-bold">{t('users.createBranchOwner')}</h2>
          <p className="mt-2 text-sm text-slate-500">{t('users.createBranchOwnerDescription')}</p>
        </div>

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-bold">{t('users.branchOwnerDetails')}</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <Input label={t('crm.fullName')} value={form.fullName} onChange={(value) => setField('fullName', value)} required />
            <Input label={t('users.phone')} value={form.phone} onChange={(value) => setField('phone', value)} required />
            <Input label={t('auth.email')} value={form.email} onChange={(value) => setField('email', value)} />
            <Input label={t('users.username')} value={form.username} onChange={(value) => setField('username', value)} required />
            <Input label={t('auth.password')} value={form.password} onChange={(value) => setField('password', value)} required />
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-bold">{t('users.branchDetails')}</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <Input label={t('branches.name')} value={form.branchName} onChange={(value) => setField('branchName', value)} required />
            <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600 md:col-span-2">{t('branches.autoCodeHint')}</p>
            <Input label={t('branches.city')} value={form.city} onChange={(value) => setField('city', value)} />
            <Input label={t('branches.phone')} value={form.branchPhone} onChange={(value) => setField('branchPhone', value)} />
            <label className="block md:col-span-2">
              <span className="text-sm font-semibold text-slate-700">{t('branches.address')}</span>
              <textarea
                value={form.address}
                onChange={(event) => setField('address', event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                rows={2}
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">{t('branches.status')}</span>
              <select
                value={form.branchStatus}
                onChange={(event) => setField('branchStatus', event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
              >
                <option value="ACTIVE">{t('branches.statusActive')}</option>
                <option value="PENDING">{t('branches.statusPending')}</option>
                <option value="SUSPENDED">{t('branches.statusSuspended')}</option>
                <option value="INACTIVE">{t('branches.statusInactive')}</option>
              </select>
            </label>
          </div>
          <p className="mt-4 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-800">{t('users.autoWarehouseHint')}</p>
        </section>

        <button
          disabled={submitting}
          className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:bg-blue-300"
          type="submit"
        >
          {submitting ? t('common.saving') : t('users.createBranchOwner')}
        </button>
      </form>
    </ProtectedShell>
  );
}

function Input({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
      />
    </label>
  );
}
