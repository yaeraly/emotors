'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { ProcurementHubNav } from '@/components/procurement/ProcurementHubNav';
import { apiFetch } from '@/lib/api';
import {
  canArchiveDifferenceAct,
  canViewChinaReceivingActs,
  isSupplyChainManagerUser,
} from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';
import { translateStatus } from '@/lib/translate-status';

import { toast } from '@/lib/toast';

type DifferenceAct = {
  id: string;
  actNumber: string;
  orderNumber: string;
  procurementOrderId: string;
  supplier?: { id: string; name: string } | null;
  factory?: { id: string; name: string } | null;
  hqWarehouse?: { id: string; name: string; code?: string } | null;
  productName: string;
  sku: string;
  type: string;
  expectedQuantity: number;
  actualQuantity: number;
  damagedQuantity: number;
  differenceQuantity: number;
  status: string;
  createdAt: string;
};

type FilterOption = { id: string; name: string; orderNumber?: string };

function buildQuery(filters: {
  orderId: string;
  supplierId: string;
  factoryId: string;
  type: string;
  status: string;
  dateFrom: string;
  dateTo: string;
}) {
  const params = new URLSearchParams();
  if (filters.orderId) params.set('orderId', filters.orderId);
  if (filters.supplierId) params.set('supplierId', filters.supplierId);
  if (filters.factoryId) params.set('factoryId', filters.factoryId);
  if (filters.type) params.set('type', filters.type);
  if (filters.status) params.set('status', filters.status);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  const query = params.toString();
  return query ? `?${query}` : '';
}

export default function ProcurementDifferenceActsPage() {
  return (
    <Suspense
      fallback={
        <ProtectedShell>
          <p className="p-6">...</p>
        </ProtectedShell>
      }
    >
      <ProcurementDifferenceActsContent />
    </Suspense>
  );
}

function ProcurementDifferenceActsContent() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [acts, setActs] = useState<DifferenceAct[]>([]);
  const [orders, setOrders] = useState<FilterOption[]>([]);
  const [suppliers, setSuppliers] = useState<FilterOption[]>([]);
  const [factories, setFactories] = useState<FilterOption[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loadingId, setLoadingId] = useState('');
  const [selectedAct, setSelectedAct] = useState<DifferenceAct | null>(null);
  const [filters, setFilters] = useState({
    orderId: searchParams.get('orderId') ?? '',
    supplierId: '',
    factoryId: '',
    type: '',
    status: '',
    dateFrom: '',
    dateTo: '',
  });

  const readOnly = isSupplyChainManagerUser(user);
  const canArchive = canArchiveDifferenceAct(user);

  useEffect(() => {
    void loadFilters();
  }, []);

  useEffect(() => {
    void loadActs();
  }, [filters]);

  async function loadFilters() {
    try {
      const [me, orderList, supplierList, factoryList] = await Promise.all([
        apiFetch<User>('/auth/me'),
        apiFetch<Array<{ id: string; orderNumber: string }>>('/procurement/orders'),
        apiFetch<Array<{ id: string; name: string }>>('/procurement/suppliers'),
        apiFetch<Array<{ id: string; name: string }>>('/procurement/factories'),
      ]);
      setUser(me);
      setOrders(orderList.map((row) => ({ id: row.id, name: row.orderNumber, orderNumber: row.orderNumber })));
      setSuppliers(supplierList.map((row) => ({ id: row.id, name: row.name })));
      setFactories(factoryList.map((row) => ({ id: row.id, name: row.name })));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function loadActs() {
    try {
      const list = await apiFetch<DifferenceAct[]>(`/procurement/difference-acts${buildQuery(filters)}`);
      setActs(list);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    }
  }

  const sortedActs = useMemo(
    () => [...acts].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [acts],
  );

  async function archiveAct(act: DifferenceAct) {
    if (!canArchive) return;
    setLoadingId(act.id);
    setError('');
    try {
      await apiFetch(`/procurement/difference-acts/${act.id}/archive`, { method: 'POST' });
      setActs((current) => current.filter((row) => row.id !== act.id));
      setSelectedAct(null);
      toast.success(t('chinaReceiving.actArchived'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoadingId('');
    }
  }

  function printAct(act: DifferenceAct) {
    setSelectedAct(act);
    window.setTimeout(() => window.print(), 100);
  }

  if (user && !canViewChinaReceivingActs(user)) {
    return (
      <ProtectedShell>
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{t('common.forbiddenMessage')}</p>
      </ProtectedShell>
    );
  }

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('procurement.title')}</p>
          <h2 className="text-3xl font-bold text-slate-950">{t('chinaReceiving.differenceActs')}</h2>
          {readOnly ? (
            <p className="mt-2 text-sm text-slate-500">{t('productMaster.readOnlyNotice')}</p>
          ) : null}
        </div>

        <ProcurementHubNav activeTab="difference-acts" />

        {success ? <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</p> : null}
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        <div className="flex min-w-0 flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:gap-3 sm:p-4 lg:flex-nowrap">
          <FilterSelect
            label={t('chinaReceiving.orderNumber')}
            value={filters.orderId}
            onChange={(value) => setFilters({ ...filters, orderId: value })}
            options={orders}
            className="min-w-0 w-full flex-1 sm:min-w-[8rem] lg:max-w-[11rem]"
          />
          <FilterSelect
            label={t('procurement.orders.supplier')}
            value={filters.supplierId}
            onChange={(value) => setFilters({ ...filters, supplierId: value })}
            options={suppliers}
            className="min-w-0 w-[calc(50%-0.25rem)] flex-1 sm:w-auto sm:min-w-[7rem] lg:max-w-[10rem]"
          />
          <FilterSelect
            label={t('procurement.orders.factory')}
            value={filters.factoryId}
            onChange={(value) => setFilters({ ...filters, factoryId: value })}
            options={factories}
            className="min-w-0 w-[calc(50%-0.25rem)] flex-1 sm:w-auto sm:min-w-[7rem] lg:max-w-[10rem]"
          />
          <FilterSelect
            label={t('chinaReceiving.differenceType')}
            value={filters.type}
            onChange={(value) => setFilters({ ...filters, type: value })}
            options={[
              { id: 'SHORTAGE', name: translateStatus(t, 'SHORTAGE', 'procurement') },
              { id: 'OVERAGE', name: translateStatus(t, 'OVERAGE', 'procurement') },
              { id: 'DAMAGED', name: translateStatus(t, 'DAMAGED', 'procurement') },
            ]}
            className="min-w-0 w-[calc(50%-0.25rem)] flex-1 sm:w-auto sm:min-w-[7rem] lg:max-w-[9rem]"
          />
          <FilterSelect
            label={t('common.status')}
            value={filters.status}
            onChange={(value) => setFilters({ ...filters, status: value })}
            options={['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'CLOSED'].map((status) => ({
              id: status,
              name: translateStatus(t, status, 'procurement'),
            }))}
            className="min-w-0 w-[calc(50%-0.25rem)] flex-1 sm:w-auto sm:min-w-[6.5rem] lg:max-w-[9rem]"
          />
          <PeriodFilter
            dateFrom={filters.dateFrom}
            dateTo={filters.dateTo}
            onDateFromChange={(value) => setFilters({ ...filters, dateFrom: value })}
            onDateToChange={(value) => setFilters({ ...filters, dateTo: value })}
          />
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full table-fixed divide-y divide-slate-200 text-xs">
            <thead className="bg-slate-50 text-left font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-[7%] px-2 py-2">{t('chinaReceiving.actNumber')}</th>
                <th className="w-[8%] px-2 py-2">{t('chinaReceiving.col.order')}</th>
                <th className="w-[18%] px-2 py-2">{t('chinaReceiving.col.product')}</th>
                <th className="w-[9%] px-2 py-2">{t('chinaReceiving.col.type')}</th>
                <th className="w-[6%] px-2 py-2">{t('chinaReceiving.col.expected')}</th>
                <th className="w-[6%] px-2 py-2">{t('chinaReceiving.col.actual')}</th>
                <th className="w-[6%] px-2 py-2">{t('chinaReceiving.col.diff')}</th>
                <th className="w-[12%] px-2 py-2">{t('chinaReceiving.col.warehouse')}</th>
                <th className="w-[9%] px-2 py-2">{t('common.status')}</th>
                <th className="w-[8%] px-2 py-2">{t('common.date')}</th>
                <th className="w-[15%] px-2 py-2">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedActs.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-2 py-6 text-center text-slate-500">
                    {t('chinaReceiving.noActsForType')}
                  </td>
                </tr>
              ) : (
                sortedActs.map((act) => (
                  <tr key={act.id} className="align-middle">
                    <td className="truncate px-2 py-2 font-semibold" title={act.actNumber}>
                      {act.actNumber}
                    </td>
                    <td className="truncate px-2 py-2" title={act.orderNumber}>
                      {act.orderNumber}
                    </td>
                    <td className="truncate px-2 py-2" title={act.productName}>
                      {act.productName}
                    </td>
                    <td className="px-2 py-2">
                      <DifferenceTypeBadge type={act.type} />
                    </td>
                    <td className="px-2 py-2 text-center">{act.expectedQuantity}</td>
                    <td className="px-2 py-2 text-center">{act.actualQuantity}</td>
                    <td className="px-2 py-2 text-center font-semibold">{act.differenceQuantity}</td>
                    <td className="truncate px-2 py-2" title={act.hqWarehouse?.name ?? '—'}>
                      {act.hqWarehouse?.name ?? '—'}
                    </td>
                    <td className="truncate px-2 py-2">
                      {translateStatus(t, act.status, 'procurement')}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">
                      {new Date(act.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-1">
                        <Link
                          href={`/procurement/difference-acts/${act.id}`}
                          className="rounded border border-slate-300 px-2 py-1 text-[11px] font-semibold"
                        >
                          {t('common.open')}
                        </Link>
                        <button
                          type="button"
                          onClick={() => printAct(act)}
                          className="rounded border border-slate-300 px-2 py-1 text-[11px] font-semibold"
                        >
                          {t('chinaReceiving.printAct')}
                        </button>
                        {canArchive ? (
                          <button
                            type="button"
                            disabled={loadingId === act.id}
                            onClick={() => void archiveAct(act)}
                            className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700 disabled:opacity-50"
                          >
                            {t('chinaReceiving.archiveAct')}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {selectedAct ? (
          <div id="difference-act-print" className="hidden rounded-3xl border border-slate-200 bg-white p-6 print:block">
            <h3 className="text-xl font-bold">{t('chinaReceiving.differenceActs')}</h3>
            <dl className="mt-4 grid gap-2 text-sm md:grid-cols-2">
              <div><dt className="font-semibold">{t('chinaReceiving.actNumber')}</dt><dd>{selectedAct.actNumber}</dd></div>
              <div><dt className="font-semibold">{t('chinaReceiving.orderNumber')}</dt><dd>{selectedAct.orderNumber}</dd></div>
              <div><dt className="font-semibold">{t('procurement.orders.supplier')}</dt><dd>{selectedAct.supplier?.name ?? '-'}</dd></div>
              <div><dt className="font-semibold">{t('procurement.orders.factory')}</dt><dd>{selectedAct.factory?.name ?? '-'}</dd></div>
              <div><dt className="font-semibold">{t('chinaReceiving.targetWarehouse')}</dt><dd>{selectedAct.hqWarehouse?.name ?? '-'}</dd></div>
              <div><dt className="font-semibold">{t('procurement.orders.product')}</dt><dd>{selectedAct.productName}</dd></div>
              <div><dt className="font-semibold">SKU</dt><dd>{selectedAct.sku}</dd></div>
              <div><dt className="font-semibold">{t('chinaReceiving.expectedQty')}</dt><dd>{selectedAct.expectedQuantity}</dd></div>
              <div><dt className="font-semibold">{t('chinaReceiving.actualQty')}</dt><dd>{selectedAct.actualQuantity}</dd></div>
              <div><dt className="font-semibold">{t('chinaReceiving.damagedQty')}</dt><dd>{selectedAct.damagedQuantity}</dd></div>
              <div><dt className="font-semibold">{t('procurement.orders.difference')}</dt><dd>{selectedAct.differenceQuantity}</dd></div>
              <div><dt className="font-semibold">{t('chinaReceiving.differenceType')}</dt><dd>{translateStatus(t, selectedAct.type)}</dd></div>
              <div><dt className="font-semibold">{t('chinaReceiving.actDate')}</dt><dd>{new Date(selectedAct.createdAt).toLocaleString()}</dd></div>
            </dl>
          </div>
        ) : null}
      </section>
    </ProtectedShell>
  );
}

function DifferenceTypeBadge({ type }: { type: string }) {
  const { t } = useTranslation();
  const label = translateStatus(t, type, 'procurement');
  const styles =
    type === 'SHORTAGE'
      ? 'bg-amber-50 text-amber-800 border-amber-200'
      : type === 'OVERAGE'
        ? 'bg-sky-50 text-sky-800 border-sky-200'
        : type === 'DAMAGED'
          ? 'bg-rose-50 text-rose-800 border-rose-200'
          : 'bg-slate-50 text-slate-700 border-slate-200';

  return (
    <span className={`inline-block max-w-full truncate rounded border px-1.5 py-0.5 text-[10px] font-semibold ${styles}`}>
      {label}
    </span>
  );
}

function PeriodFilter({
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
}: {
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="min-w-0 w-full flex-[1.5_1_14rem] lg:max-w-[15rem]">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {t('chinaReceiving.filterPeriod')}
      </span>
      <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => onDateFromChange(e.target.value)}
          aria-label={t('chinaReceiving.dateFrom')}
          className="min-w-0 flex-1 rounded-xl border border-slate-300 px-1.5 py-2 text-sm"
        />
        <span className="shrink-0 text-xs text-slate-400">—</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => onDateToChange(e.target.value)}
          aria-label={t('chinaReceiving.dateTo')}
          className="min-w-0 flex-1 rounded-xl border border-slate-300 px-1.5 py-2 text-sm"
        />
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  className = '',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full min-w-0 rounded-xl border border-slate-300 px-2 py-2 text-sm"
      >
        <option value="">{t('common.all')}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}
