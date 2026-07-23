'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { useTranslation } from '@/i18n/useTranslation';

const LINKS = [
  { href: '/franchise-director', key: 'franchiseDirector.dashboard' },
  { href: '/franchise-director/branches', key: 'franchiseDirector.branches' },
  { href: '/franchise-director/performance', key: 'franchiseDirector.performance' },
  { href: '/franchise-director/monitoring', key: 'franchiseDirector.monitoring' },
  { href: '/franchise-director/expansion', key: 'franchiseDirector.expansion' },
  { href: '/franchise-director/support', key: 'franchiseDirector.support' },
  { href: '/franchise-director/academy', key: 'franchiseDirector.academy' },
  { href: '/franchise-director/marketing', key: 'franchiseDirector.marketing' },
  { href: '/franchise-director/supply', key: 'franchiseDirector.supply' },
  { href: '/franchise-director/finance', key: 'franchiseDirector.finance' },
  { href: '/franchise-director/reports', key: 'franchiseDirector.reports' },
  { href: '/franchise-director/notifications', key: 'franchiseDirector.notifications' },
] as const;

export function FranchiseDirectorShell({
  titleKey,
  children,
}: {
  titleKey: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const pathname = usePathname();

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">
            {t('franchiseDirector.title')}
          </p>
          <h1 className="mt-2 text-3xl font-bold text-slate-950">{t(titleKey)}</h1>
          <p className="mt-2 text-sm text-slate-500">{t('franchiseDirector.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {LINKS.map((link) => {
            const active = pathname === link.href || (link.href !== '/franchise-director' && pathname.startsWith(link.href));
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  active ? 'bg-blue-600 text-white' : 'border border-slate-300 bg-white text-slate-700'
                }`}
              >
                {t(link.key)}
              </Link>
            );
          })}
        </div>
        {children}
      </section>
    </ProtectedShell>
  );
}

export function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
    </div>
  );
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'KGS',
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export function downloadJsonAsCsv(filename: string, rows: Array<Record<string, unknown>>) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => {
    const text = value == null ? '' : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  };
  const csv = [headers.join(','), ...rows.map((row) => headers.map((key) => escape(row[key])).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
