'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { HqSalesBranchOrdersSection } from '@/components/HqSalesBranchOrdersSection';
import {
  HqSalesBranchOrdersTabContent,
  HqSalesListEmptyState,
  HqSalesListFilterGrid,
  HqSalesListLoadingState,
  HqSalesListTableCard,
  hqSalesListFilterControlClass,
  hqSalesListTableClass,
  hqSalesListTableHeadClass,
  hqSalesListTableTdClass,
  hqSalesListTableThClass,
} from '@/components/HqSalesListLayout';
import { apiFetch } from '@/lib/api';
import {
  canManageDistributionOrders,
  canViewProductCost,
  isBranchWarehouseOperator,
  isHqSalesManagerUser,
  isHqWarehouseLogisticsOnlyUser,
} from '@/lib/rbac';
import type { Branch, BranchDistributionOrder, BranchDistributionOrderStatus, User } from '@/lib/types';
import { distributionModuleTitleKey } from '@/lib/distribution-labels';
import { useTranslation } from '@/i18n/useTranslation';
import { translateStatus } from '@/lib/translate-status';

import { toast } from '@/lib/toast';

const statuses: BranchDistributionOrderStatus[] = [
  'DRAFT',
  'INVOICED',
  'PAYMENT_PENDING',
  'PAID',
  'SENT_TO_WAREHOUSE',
  'PICKING',
  'PACKED',
  'SHIPPED',
  'RECEIVED_BY_BRANCH',
  'RECEIVED_WITH_DIFFERENCE',
  'COMPLETED',
  'CANCELLED',
];

export default function DistributionOrdersPage() {
  const { t } = useTranslation();
  const [orders, setOrders] = useState<BranchDistributionOrder[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [filters, setFilters] = useState({ search: '', branchId: '', status: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const emptyFilters = { search: '', branchId: '', status: '' };

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.search.trim()) params.set('search', filters.search.trim());
    if (filters.branchId) params.set('branchId', filters.branchId);
    if (filters.status) params.set('status', filters.status);
    const value = params.toString();
    return value ? `?${value}` : '';
  }, [filters]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');
      try {
        const me = await apiFetch<User>('/auth/me');
        setCurrentUser(me);
        const operatorView = isBranchWarehouseOperator(me);
        const [orderResult, branchResult] = await Promise.all([
          apiFetch<BranchDistributionOrder[]>(`/distribution/orders${query}`),
          operatorView ? Promise.resolve([] as Branch[]) : apiFetch<Branch[]>('/branches'),
        ]);
        setOrders(orderResult);
        setBranches(branchResult);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('common.error'));
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [query, t]);

  const operatorView = isBranchWarehouseOperator(currentUser);
  const logisticsOnlyView = isHqWarehouseLogisticsOnlyUser(currentUser);
  const showOrderTotalColumn = !operatorView && !logisticsOnlyView;
  const showProfitColumn = showOrderTotalColumn && canViewProductCost(currentUser);
  const hqSalesView = isHqSalesManagerUser(currentUser);

  const newOrderAction =
    canManageDistributionOrders(currentUser) ? (
      <Link href="/distribution/orders/new" className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white">
        {t('distribution.newOrder')}
      </Link>
    ) : null;

  const content = (
    <>
      {!hqSalesView ? (
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            {!operatorView ? (
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">
                {t(distributionModuleTitleKey(currentUser))}
              </p>
            ) : null}
            <h2 className="text-3xl font-bold text-slate-950">
              {operatorView ? t('distribution.receiveGoods') : t('distribution.orders')}
            </h2>
          </div>
          {newOrderAction}
        </div>
      ) : null}
      <HqSalesBranchOrdersTabContent error={error} filters={
        <HqSalesListFilterGrid columns={operatorView ? 2 : 3} onClear={() => setFilters(emptyFilters)}>
          <input
            value={filters.search}
            onChange={(event) => setFilters({ ...filters, search: event.target.value })}
            placeholder={t('distribution.orderNumber')}
            className={hqSalesListFilterControlClass}
          />
          {!operatorView ? (
            <select
              value={filters.branchId}
              onChange={(event) => setFilters({ ...filters, branchId: event.target.value })}
              className={hqSalesListFilterControlClass}
            >
              <option value="">{t('common.all')} {t('distribution.branch')}</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          ) : null}
          <select
            value={filters.status}
            onChange={(event) => setFilters({ ...filters, status: event.target.value })}
            className={hqSalesListFilterControlClass}
          >
            <option value="">{t('common.all')} {t('distribution.status')}</option>
            {(operatorView
              ? (['SHIPPED', 'SENT', 'RECEIVED_BY_BRANCH', 'RECEIVED_WITH_DIFFERENCE'] as BranchDistributionOrderStatus[])
              : statuses).map((status) => (
              <option key={status} value={status}>{translateStatus(t, status, 'distribution')}</option>
            ))}
          </select>
        </HqSalesListFilterGrid>
      }>
      <HqSalesListTableCard>
        {loading ? (
          <HqSalesListLoadingState />
        ) : orders.length === 0 ? (
          <HqSalesListEmptyState message={t('operations.branchPurchaseRequestsEmpty')} />
        ) : (
        <table className={hqSalesListTableClass}>
          <thead className={hqSalesListTableHeadClass}>
            <tr>
              <th className={hqSalesListTableThClass}>{t('distribution.orderNumber')}</th>
              {!operatorView ? <th className={hqSalesListTableThClass}>{t('distribution.branch')}</th> : null}
              <th className={hqSalesListTableThClass}>{t('distribution.sourceWarehouse')}</th>
              <th className={hqSalesListTableThClass}>{t('distribution.destinationWarehouse')}</th>
              <th className={hqSalesListTableThClass}>{t('distribution.status')}</th>
              {!showOrderTotalColumn ? null : <th className={hqSalesListTableThClass}>{t('distribution.totalAmount')}</th>}
              {!showProfitColumn ? null : <th className={hqSalesListTableThClass}>{t('distribution.totalProfit')}</th>}
              <th className={hqSalesListTableThClass}>{t('common.createdDate')}</th>
              <th className={hqSalesListTableThClass}>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orders.map((order) => (
              <tr key={order.id} className="hover:bg-slate-50">
                <td className={`${hqSalesListTableTdClass} font-bold`}>{order.orderNumber}</td>
                {!operatorView ? <td className={hqSalesListTableTdClass}>{order.branch?.name}</td> : null}
                <td className={hqSalesListTableTdClass}>{order.sourceWarehouse?.name}</td>
                <td className={hqSalesListTableTdClass}>{order.destinationWarehouse?.name}</td>
                <td className={hqSalesListTableTdClass}>{translateStatus(t, order.status, 'distribution')}</td>
                {!showOrderTotalColumn ? null : <td className={hqSalesListTableTdClass}>{formatKgs(order.totalAmount)}</td>}
                {!showProfitColumn ? null : <td className={hqSalesListTableTdClass}>{formatKgs(order.totalProfit)}</td>}
                <td className={hqSalesListTableTdClass}>{new Date(order.createdAt).toLocaleDateString()}</td>
                <td className={hqSalesListTableTdClass}>
                  <Link
                    href={`/distribution/orders/${order.id}`}
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
      </HqSalesBranchOrdersTabContent>
    </>
  );

  return (
    <ProtectedShell>
      {hqSalesView ? (
        <HqSalesBranchOrdersSection actions={newOrderAction}>{content}</HqSalesBranchOrdersSection>
      ) : (
        <section className="space-y-6">{content}</section>
      )}
    </ProtectedShell>
  );
}

function formatKgs(value: number | string | null | undefined) {
  return `${Number(value ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} сом`;
}
