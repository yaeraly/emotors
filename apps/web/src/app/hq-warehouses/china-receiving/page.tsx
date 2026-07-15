'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';
import { translateStatus } from '@/lib/translate-status';

type ChinaReceivingTask = {
  id: string;
  orderNumber: string;
  purchaseDate?: string | null;
  supplyManager?: { id: string; fullName: string } | null;
  supplyManagerName?: string | null;
  hqWarehouse?: { id: string; name: string; code: string } | null;
  status: string;
  expectedQuantity: number;
  receivedQuantity: number;
};

type Filters = {
  search: string;
  purchaseDate: string;
  orderNumber: string;
  status: string;
};

const EMPTY_FILTERS: Filters = {
  search: '',
  purchaseDate: '',
  orderNumber: '',
  status: '',
};

const RECEIVING_STATUSES = [
  'READY_FOR_RECEIVING',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'RECEIVED_WITH_DIFFERENCE',
] as const;

function formatOrderDate(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('ru-RU');
}

function isEmptyFilters(filters: Filters) {
  return !filters.search.trim()
    && !filters.purchaseDate
    && !filters.orderNumber.trim()
    && !filters.status;
}

function buildQuery(filters: Filters) {
  const params = new URLSearchParams();
  if (filters.search.trim()) params.set('search', filters.search.trim());
  if (filters.purchaseDate) params.set('purchaseDate', filters.purchaseDate);
  if (filters.orderNumber.trim()) params.set('orderNumber', filters.orderNumber.trim());
  if (filters.status) params.set('status', filters.status);
  const query = params.toString();
  return query ? `?${query}` : '';
}

export default function ChinaReceivingListPage() {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState<ChinaReceivingTask[]>([]);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const loadTasks = useCallback(async (nextFilters: Filters) => {
    setLoading(true);
    setError('');
    try {
      const list = await apiFetch<ChinaReceivingTask[]>(
        `/procurement/china-receiving${buildQuery(nextFilters)}`,
      );
      setTasks(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const successMessage = window.localStorage.getItem('emotors_china_receiving_success');
    if (successMessage) {
      setSuccess(successMessage);
      window.localStorage.removeItem('emotors_china_receiving_success');
    }
    void loadTasks(EMPTY_FILTERS);
  }, [loadTasks]);

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function applyFilters() {
    void loadTasks(filters);
  }

  function resetFilters() {
    setFilters(EMPTY_FILTERS);
    void loadTasks(EMPTY_FILTERS);
  }

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('hqWarehouse.title')}</p>
          <h2 className="text-3xl font-bold text-slate-950">{t('chinaReceiving.title')}</h2>
          <p className="mt-2 text-sm text-slate-500">{t('chinaReceiving.listDescription')}</p>
        </div>

        {success ? <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</p> : null}
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-[12rem] flex-1">
              <span className="text-xs font-semibold uppercase text-slate-500">{t('common.search')}</span>
              <input
                value={filters.search}
                onChange={(e) => updateFilter('search', e.target.value)}
                placeholder={t('common.search')}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="min-w-[10rem]">
              <span className="text-xs font-semibold uppercase text-slate-500">{t('chinaReceiving.purchaseDate')}</span>
              <input
                type="date"
                value={filters.purchaseDate}
                onChange={(e) => updateFilter('purchaseDate', e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="min-w-[10rem]">
              <span className="text-xs font-semibold uppercase text-slate-500">{t('chinaReceiving.orderNumber')}</span>
              <input
                value={filters.orderNumber}
                onChange={(e) => updateFilter('orderNumber', e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="min-w-[10rem]">
              <span className="text-xs font-semibold uppercase text-slate-500">{t('chinaReceiving.filterStatus')}</span>
              <select
                value={filters.status}
                onChange={(e) => updateFilter('status', e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">{t('common.all')}</option>
                {RECEIVING_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {translateStatus(t, status, 'procurement')}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={applyFilters}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
              >
                {t('common.apply')}
              </button>
              <button
                type="button"
                onClick={resetFilters}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold"
              >
                {t('common.reset')}
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">{t('chinaReceiving.purchaseDate')}</th>
                  <th className="px-4 py-3">{t('chinaReceiving.orderNumber')}</th>
                  <th className="px-4 py-3">{t('chinaReceiving.supplyManager')}</th>
                  <th className="px-4 py-3">{t('chinaReceiving.targetWarehouse')}</th>
                  <th className="px-4 py-3">{t('common.status')}</th>
                  <th className="px-4 py-3">{t('chinaReceiving.expectedQty')}</th>
                  <th className="px-4 py-3">{t('chinaReceiving.actualQty')}</th>
                  <th className="px-4 py-3">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tasks.map((task) => (
                  <tr key={task.id}>
                    <td className="px-4 py-3 whitespace-nowrap">{formatOrderDate(task.purchaseDate)}</td>
                    <td className="px-4 py-3">
                      <div className="font-bold">{task.orderNumber}</div>
                    </td>
                    <td className="px-4 py-3">
                      {task.supplyManager?.fullName ?? task.supplyManagerName ?? t('chinaReceiving.supplyManagerNotAssigned')}
                    </td>
                    <td className="px-4 py-3">{task.hqWarehouse?.name ?? '-'}</td>
                    <td className="px-4 py-3">{translateStatus(t, task.status, 'procurement')}</td>
                    <td className="px-4 py-3">{task.expectedQuantity}</td>
                    <td className="px-4 py-3">{task.receivedQuantity}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/hq-warehouses/china-receiving/${task.id}`}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold"
                      >
                        {t('common.open')}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {loading ? (
            <p className="p-6 text-sm text-slate-500">{t('common.loading')}</p>
          ) : null}
          {!loading && tasks.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">{t('chinaReceiving.empty')}</p>
          ) : null}
        </div>
      </section>
    </ProtectedShell>
  );
}
