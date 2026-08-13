'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { HqSalesBranchOrdersSection } from '@/components/HqSalesBranchOrdersSection';
import {
  HqSalesBranchOrdersTabContent,
  HqSalesListEmptyState,
  HqSalesListLoadingState,
  HqSalesListTableCard,
  hqSalesListTableClass,
  hqSalesListTableHeadClass,
  hqSalesListTableTdClass,
  hqSalesListTableThClass,
} from '@/components/HqSalesListLayout';
import { apiFetch } from '@/lib/api';
import { isBranchWarehouseOperator, isHqSalesManagerUser, shouldShowBranchColumnForBranchScopedTables } from '@/lib/rbac';
import type { ShortageReport, User } from '@/lib/types';
import { distributionModuleTitleKey } from '@/lib/distribution-labels';
import { useTranslation } from '@/i18n/useTranslation';
import { getStatusLabel } from '@/lib/translate-status';

export default function ShortageReportsPage() {
  const { t } = useTranslation();
  const [reports, setReports] = useState<ShortageReport[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const showBranchColumn = shouldShowBranchColumnForBranchScopedTables(user);
  const hqSalesView = isHqSalesManagerUser(user);
  const operatorView = isBranchWarehouseOperator(user);

  useEffect(() => {
    setLoading(true);
    setError('');
    void apiFetch<User>('/auth/me').then(setUser).catch(() => setUser(null));
    apiFetch<ShortageReport[]>('/distribution/shortage-reports')
      .then(setReports)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false));
  }, [t]);

  const table = (
    <HqSalesListTableCard>
      {loading ? (
        <HqSalesListLoadingState />
      ) : reports.length === 0 ? (
        <HqSalesListEmptyState message={t('operations.branchPurchaseRequestsEmpty')} />
      ) : (
      <table className={hqSalesListTableClass}>
        <thead className={hqSalesListTableHeadClass}>
          <tr>
            <th className={hqSalesListTableThClass}>{t('distribution.shortageReport')}</th>
            <th className={hqSalesListTableThClass}>{t('distribution.orderNumber')}</th>
            {showBranchColumn ? <th className={hqSalesListTableThClass}>{t('distribution.branch')}</th> : null}
            <th className={hqSalesListTableThClass}>{t('distribution.status')}</th>
            <th className={hqSalesListTableThClass}>{t('distribution.difference')}</th>
            <th className={hqSalesListTableThClass}>{t('common.createdDate')}</th>
            <th className={hqSalesListTableThClass}>{t('common.actions')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {reports.map((report) => (
            <tr key={report.id} className="hover:bg-slate-50">
              <td className={`${hqSalesListTableTdClass} font-bold`}>{report.reportNumber}</td>
              <td className={hqSalesListTableTdClass}>{report.distributionOrder?.orderNumber}</td>
              {showBranchColumn ? <td className={hqSalesListTableTdClass}>{report.branch?.name}</td> : null}
              <td className={hqSalesListTableTdClass}>
                {getStatusLabel({ module: 'shortageReport', status: report.status, t })}
              </td>
              <td className={hqSalesListTableTdClass}>{report.items?.length ?? 0}</td>
              <td className={hqSalesListTableTdClass}>{new Date(report.createdAt).toLocaleDateString()}</td>
              <td className={hqSalesListTableTdClass}>
                <Link
                  href={`/distribution/shortage-reports/${report.id}`}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold"
                >
                  {t('common.open')}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      )}
    </HqSalesListTableCard>
  );

  const hqSalesContent = (
    <HqSalesBranchOrdersTabContent error={error}>
      {table}
    </HqSalesBranchOrdersTabContent>
  );

  const content = hqSalesView ? (
    hqSalesContent
  ) : (
    <>
      <div>
        {!operatorView ? (
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t(distributionModuleTitleKey(user))}</p>
        ) : null}
        <h2 className="text-3xl font-bold text-slate-950">{t('distribution.shortageReports')}</h2>
      </div>
      <HqSalesBranchOrdersTabContent error={error}>{table}</HqSalesBranchOrdersTabContent>
    </>
  );

  return (
    <ProtectedShell>
      {hqSalesView ? (
        <HqSalesBranchOrdersSection>{content}</HqSalesBranchOrdersSection>
      ) : (
        <section className="space-y-6">{content}</section>
      )}
    </ProtectedShell>
  );
}
