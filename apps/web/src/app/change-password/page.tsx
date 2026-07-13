'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch, clearAuthState, setToken } from '@/lib/api';
import { getDefaultRouteForUser } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type ChangePasswordResponse = {
  success: boolean;
  accessToken: string;
  user: User;
};

export default function ChangePasswordPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      const response = await apiFetch<ChangePasswordResponse>('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      clearAuthState();
      setToken(response.accessToken);
      router.replace(getDefaultRouteForUser(response.user));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedShell>
      <form onSubmit={submit} className="mx-auto max-w-xl space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('users.changePassword')}</p>
          <h2 className="text-3xl font-bold text-slate-950">{t('users.changePassword')}</h2>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        <label className="block"><span className="text-sm font-semibold text-slate-700">{t('auth.password')}</span><input value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} type="password" required className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
        <label className="block"><span className="text-sm font-semibold text-slate-700">{t('users.newPassword')}</span><input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} type="password" required minLength={8} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
        <button disabled={saving} className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:bg-blue-300" type="submit">{saving ? t('common.loading') : t('common.save')}</button>
      </form>
    </ProtectedShell>
  );
}
