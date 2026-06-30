'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/i18n/useTranslation';

export default function ForbiddenPage() {
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-red-600">403</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">Access Denied</h1>
        <p className="mt-3 text-sm text-slate-600">
          You do not have permission to access this module.
        </p>
        <button
          type="button"
          onClick={() => router.push('/dashboard')}
          className="mt-6 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          {t('common.goHome')}
        </button>
        <div className="mt-4">
          <Link href="/login" className="text-sm font-semibold text-blue-600 hover:underline">
            {t('common.logout')}
          </Link>
        </div>
      </div>
    </main>
  );
}
