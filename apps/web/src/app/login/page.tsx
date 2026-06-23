'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, login, setToken } from '@/lib/api';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useTranslation } from '@/i18n/useTranslation';

export default function LoginPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [email, setEmail] = useState('owner@emotors.kg');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (getToken()) {
      router.replace('/customers');
    }
  }, [router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await login(email, password);
      setToken(response.accessToken);
      router.replace(response.user.mustChangePassword ? '/change-password' : '/customers');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.invalidCredentials'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-600">
            {t('app.name')}
          </p>
          <LanguageSwitcher />
        </div>
        <h1 className="mt-3 text-3xl font-bold text-slate-950">
          {t('auth.login')}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          {t('auth.welcome')}
        </p>

        <label className="mt-8 block">
          <span className="text-sm font-semibold text-slate-700">
            {t('auth.email')} / Username / Phone
          </span>
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none ring-blue-500 focus:ring-2"
            type="email"
            autoComplete="email"
            required
          />
        </label>

        <label className="mt-4 block">
          <span className="text-sm font-semibold text-slate-700">
            {t('auth.password')}
          </span>
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none ring-blue-500 focus:ring-2"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>

        {error ? (
          <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <button
          disabled={loading}
          className="mt-6 w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
          type="submit"
        >
          {loading ? t('auth.signingIn') : t('auth.signIn')}
        </button>

        <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
          <p className="font-semibold text-slate-800">{t('auth.defaultLogin')}</p>
          <p>owner@emotors.kg</p>
          <p>password123</p>
        </div>
      </form>
    </main>
  );
}
