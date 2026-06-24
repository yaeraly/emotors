'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { RoleBadges } from '@/components/RoleSelector';
import { apiFetch } from '@/lib/api';
import { canResetUserPassword } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

export default function UsersPage() {
  const { t } = useTranslation();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');

  useEffect(() => {
    Promise.all([apiFetch<User>('/auth/me'), apiFetch<User[]>('/users')])
      .then(([me, result]) => {
        setCurrentUser(me);
        setUsers(result);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  async function resetPassword(user: User) {
    setError('');
    setTemporaryPassword('');
    try {
      const result = await apiFetch<User & { temporaryPassword?: string }>(`/users/${user.id}/reset-password`, { method: 'POST' });
      if (result.temporaryPassword) setTemporaryPassword(`${user.fullName}: ${result.temporaryPassword}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.error');
      setError(message.includes('own branch') ? t('users.resetOwnBranchOnly') : message);
    }
  }

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div className="flex justify-between gap-4">
          <div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('users.title')}</p><h2 className="text-3xl font-bold">{t('users.title')}</h2></div>
          <Link href="/users/new" className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white">{t('users.create')}</Link>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {temporaryPassword ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{t('users.temporaryPassword')}: {temporaryPassword}</p> : null}
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">{t('crm.fullName')}</th><th className="px-4 py-3">{t('users.username')}</th><th className="px-4 py-3">{t('users.phone')}</th><th className="px-4 py-3">{t('users.role')}</th><th className="px-4 py-3">{t('crm.branch')}</th><th className="px-4 py-3">{t('users.status')}</th><th className="px-4 py-3">{t('common.actions')}</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{users.map((user) => <tr key={user.id}><td className="px-4 py-3 font-bold">{user.fullName}</td><td className="px-4 py-3">{user.username}</td><td className="px-4 py-3">{user.phone}</td><td className="px-4 py-3"><RoleBadges roles={user.roles?.length ? user.roles : [user.role]} /></td><td className="px-4 py-3">{user.branch?.name}</td><td className="px-4 py-3">{user.status}</td><td className="px-4 py-3"><div className="flex flex-wrap gap-2"><Link href={`/users/${user.id}`} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">{t('common.open')}</Link>{canResetUserPassword(currentUser, user) ? <button onClick={() => void resetPassword(user)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold" type="button">{t('users.resetPassword')}</button> : null}</div></td></tr>)}</tbody>
          </table>
        </div>
      </section>
    </ProtectedShell>
  );
}
