'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { HqSalesBranchOrdersNav } from '@/components/HqSalesBranchOrdersNav';
import { apiFetch } from '@/lib/api';
import { canManageDistributionOrders, isBranchWarehouseOperator, isHqWarehouseLogisticsOnlyUser } from '@/lib/rbac';
import type { Branch, BranchDistributionOrder, BranchDistributionOrderStatus, User } from '@/lib/types';
import { distributionModuleTitleKey } from '@/lib/distribution-labels';
import { useTranslation } from '@/i18n/useTranslation';
import { translateStatus } from '@/lib/translate-status';

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
  const [error, setError] = useState('');

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
        setError(err instanceof Error ? err.message : t('common.error'));
      }
    }
    void load();
  }, [query, t]);

  const operatorView = isBranchWarehouseOperator(currentUser);
  const logisticsOnlyView = isHqWarehouseLogisticsOnlyUser(currentUser);
  const showFinancialColumns = !operatorView && !logisticsOnlyView;

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <HqSalesBranchOrdersNav />
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t(distributionModuleTitleKey(currentUser))}</p>
            <h2 className="text-3xl font-bold text-slate-950">
              {operatorView ? t('distribution.receiveGoods') : t('distribution.orders')}
            </h2>
          </div>
          {canManageDistributionOrders(currentUser) ? (
            <Link href="/distribution/orders/new" className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white">
              {t('distribution.newOrder')}
            </Link>
          ) : null}
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        <div className={`grid gap-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm ${operatorView ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>
          <input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder={t('distribution.orderNumber')} className="rounded-xl border border-slate-300 px-4 py-3" />
          {!operatorView ? (
            <select value={filters.branchId} onChange={(event) => setFilters({ ...filters, branchId: event.target.value })} className="rounded-xl border border-slate-300 px-4 py-3">
              <option value="">{t('common.all')} {t('distribution.branch')}</option>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          ) : null}
          <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })} className="rounded-xl border border-slate-300 px-4 py-3">
            <option value="">{t('common.all')} {t('distribution.status')}</option>
            {(operatorView ? ['SHIPPED', 'SENT', 'RECEIVED_BY_BRANCH', 'RECEIVED_WITH_DIFFERENCE'] as BranchDistributionOrderStatus[] : statuses).map((status) => <option key={status} value={status}>{translateStatus(t, status, 'distribution')}</option>)}
          </select>
        </div>
        <div className="h-[calc(100vh-300px)] min-h-96 overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">{t('distribution.orderNumber')}</th>
                {!operatorView ? <th className="px-4 py-3">{t('distribution.branch')}</th> : null}
                <th className="px-4 py-3">{t('distribution.sourceWarehouse')}</th>
                <th className="px-4 py-3">{t('distribution.destinationWarehouse')}</th>
                <th className="px-4 py-3">{t('distribution.status')}</th>
                {!showFinancialColumns ? null : <th className="px-4 py-3">{t('distribution.totalAmount')}</th>}
                {!showFinancialColumns ? null : <th className="px-4 py-3">{t('distribution.totalProfit')}</th>}
                <th className="px-4 py-3">{t('common.createdDate')}</th>
                <th className="px-4 py-3">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((order) => (
                <tr key={order.id}>
                  <td className="px-4 py-3 font-bold">{order.orderNumber}</td>
                  {!operatorView ? <td className="px-4 py-3">{order.branch?.name}</td> : null}
                  <td className="px-4 py-3">{order.sourceWarehouse?.name}</td>
                  <td className="px-4 py-3">{order.destinationWarehouse?.name}</td>
                  <td className="px-4 py-3">{translateStatus(t, order.status, 'distribution')}</td>
                  {!showFinancialColumns ? null : <td className="px-4 py-3">{formatKgs(order.totalAmount)}</td>}
                  {!showFinancialColumns ? null : <td className="px-4 py-3">{formatKgs(order.totalProfit)}</td>}
                  <td className="px-4 py-3">{new Date(order.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3"><Link href={`/distribution/orders/${order.id}`} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">{t('common.open')}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </ProtectedShell>
  );
}

function formatKgs(value: number | string | null | undefined) {
  return `${Number(value ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} сом`;
}
