'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { HqSalesBranchOrdersSection } from '@/components/HqSalesBranchOrdersSection';
import {
  HqSalesBranchOrdersTabContent,
  HqSalesListTableCard,
  hqSalesListTableClass,
  hqSalesListTableHeadClass,
  hqSalesListTableTdClass,
  hqSalesListTableThClass,
} from '@/components/HqSalesListLayout';
import { apiFetch } from '@/lib/api';
import { isHqSalesManagerUser, shouldShowBranchColumnForBranchScopedTables } from '@/lib/rbac';
import type { GoodsReceiving, User } from '@/lib/types';
import { distributionModuleTitleKey } from '@/lib/distribution-labels';
import { useTranslation } from '@/i18n/useTranslation';
import { getStatusLabel } from '@/lib/translate-status';

export default function ReceivingsPage() {
  const { t } = useTranslation();
  const [receivings, setReceivings] = useState<GoodsReceiving[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState('');
  const showBranchColumn = shouldShowBranchColumnForBranchScopedTables(user);
  const hqSalesView = isHqSalesManagerUser(user);

  useEffect(() => {
    void apiFetch<User>('/auth/me').then(setUser).catch(() => setUser(null));
    apiFetch<GoodsReceiving[]>('/distribution/receivings')
      .then(setReceivings)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  const table = (
    <HqSalesListTableCard>
      <table className={hqSalesListTableClass}>
        <thead className={hqSalesListTableHeadClass}>
          <tr>
            <th className={hqSalesListTableThClass}>{t('distribution.receivingNumber')}</th>
            <th className={hqSalesListTableThClass}>{t('distribution.orderNumber')}</th>
            {showBranchColumn ? <th className={hqSalesListTableThClass}>{t('distribution.branch')}</th> : null}
            <th className={hqSalesListTableThClass}>{t('inventory.warehouse')}</th>
            <th className={hqSalesListTableThClass}>{t('distribution.status')}</th>
            <th className={hqSalesListTableThClass}>{t('distribution.receivedBy')}</th>
            <th className={hqSalesListTableThClass}>{t('distribution.receivedAt')}</th>
            <th className={hqSalesListTableThClass}>{t('common.actions')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {receivings.map((receiving) => (
            <tr key={receiving.id} className="hover:bg-slate-50">
              <td className={`${hqSalesListTableTdClass} font-bold`}>{receiving.receivingNumber}</td>
              <td className={hqSalesListTableTdClass}>{receiving.distributionOrder?.orderNumber}</td>
              {showBranchColumn ? <td className={hqSalesListTableTdClass}>{receiving.branch?.name}</td> : null}
              <td className={hqSalesListTableTdClass}>{receiving.warehouse?.name}</td>
              <td className={hqSalesListTableTdClass}>
                {getStatusLabel({ module: 'goodsReceiving', status: receiving.status, t })}
              </td>
              <td className={hqSalesListTableTdClass}>{receiving.receivedBy?.fullName}</td>
              <td className={hqSalesListTableTdClass}>{new Date(receiving.receivedAt).toLocaleString()}</td>
              <td className={hqSalesListTableTdClass}>
                <Link
                  href={`/distribution/receivings/${receiving.id}`}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold"
                >
                  {t('common.open')}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t(distributionModuleTitleKey(null))}</p>
        <h2 className="text-3xl font-bold text-slate-950">{t('distribution.receiveGoods')}</h2>
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
