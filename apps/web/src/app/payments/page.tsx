'use client';

import Link from 'next/link';
import { ProtectedShell } from '@/components/ProtectedShell';
import { useTranslation } from '@/i18n/useTranslation';

export default function PaymentsPage() {
  const { t } = useTranslation();

  return (
    <ProtectedShell>
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('nav.finance')}</p>
        <h2 className="mt-2 text-3xl font-bold text-slate-950">{t('distribution.invoices')}</h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link href="/sales" className="rounded-2xl border border-slate-200 p-4 font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700">{t('nav.sales')}</Link>
          <Link href="/distribution/invoices" className="rounded-2xl border border-slate-200 p-4 font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700">{t('distribution.invoices')}</Link>
        </div>
      </section>
    </ProtectedShell>
  );
}
