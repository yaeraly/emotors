'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  FinanceEmptyState,
  FinanceErrorState,
  FinanceLayout,
  FinanceMoney,
} from '@/components/finance/FinanceLayout';
import { visibleFinanceReportLinks } from '@/lib/finance-nav';
import { ModuleSectionNav } from '@/components/ModuleSectionNav';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';
import { fetchCurrentUser, getCachedUser } from '@/lib/current-user';
import type { FinanceLedgerEntry, FinanceSummaryReport, User } from '@/lib/types';

export default function FinanceReportsPage() {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(() => getCachedUser());
  const [report, setReport] = useState<FinanceSummaryReport | null>(null);
  const [investments, setInvestments] = useState<FinanceLedgerEntry[]>([]);
  const [error, setError] = useState('');
  const reportLinks = visibleFinanceReportLinks(user);
  const showCashFlowLink = reportLinks.some((link) => link.href === '/finance/cash-flow');

  useEffect(() => {
    void fetchCurrentUser().then(setUser).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    Promise.all([
      apiFetch<FinanceSummaryReport>('/finance/reports/summary'),
      apiFetch<FinanceLedgerEntry[]>('/finance/investments'),
    ])
      .then(([summary, investmentRows]) => {
        setReport(summary);
        setInvestments(investmentRows);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  return (
    <FinanceLayout titleKey="finance.reports" breadcrumbs={[{ labelKey: 'finance.reports' }]}>
      {error ? <FinanceErrorState message={error} /> : null}
      <ModuleSectionNav sections={reportLinks} variant="cards" />
      {report ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">{t('finance.totalBalance')}</p><p className="mt-2 text-2xl font-bold"><FinanceMoney amount={report.totals.balance} /></p></div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">{t('finance.income')}</p><p className="mt-2 text-2xl font-bold"><FinanceMoney amount={report.totals.income} /></p></div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">{t('finance.expenses')}</p><p className="mt-2 text-2xl font-bold"><FinanceMoney amount={report.totals.expenses} /></p></div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">{t('finance.profit')}</p><p className="mt-2 text-2xl font-bold"><FinanceMoney amount={report.totals.profit} /></p></div>
        </div>
      ) : null}
      {investments.length > 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-5">
          <h3 className="font-bold">{t('finance.reportInvestments')}</h3>
          <p className="mt-2 text-sm text-slate-600">{investments.length} {t('finance.investments')}</p>
        </div>
      ) : <FinanceEmptyState messageKey="finance.noReports" />}
      {showCashFlowLink ? (
        <Link href="/finance/cash-flow" className="inline-flex rounded-xl border border-slate-300 px-4 py-2 font-semibold text-slate-700">{t('finance.reportCashFlow')}</Link>
      ) : null}
    </FinanceLayout>
  );
}
