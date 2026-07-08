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
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function loadActs() {
    try {
      const list = await apiFetch<DifferenceAct[]>(`/procurement/difference-acts${buildQuery(filters)}`);
      setActs(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
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
      setSuccess(t('chinaReceiving.actArchived'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
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

        <div className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-3 xl:grid-cols-6">
          <FilterSelect
            label={t('chinaReceiving.orderNumber')}
            value={filters.orderId}
            onChange={(value) => setFilters({ ...filters, orderId: value })}
            options={orders}
          />
          <FilterSelect
            label={t('procurement.orders.supplier')}
            value={filters.supplierId}
            onChange={(value) => setFilters({ ...filters, supplierId: value })}
            options={suppliers}
          />
          <FilterSelect
            label={t('procurement.orders.factory')}
            value={filters.factoryId}
            onChange={(value) => setFilters({ ...filters, factoryId: value })}
            options={factories}
          />
          <FilterSelect
            label={t('chinaReceiving.differenceType')}
            value={filters.type}
            onChange={(value) => setFilters({ ...filters, type: value })}
            options={[
              { id: 'SHORTAGE', name: translateStatus(t, 'SHORTAGE') },
              { id: 'OVERAGE', name: translateStatus(t, 'OVERAGE') },
              { id: 'DAMAGED', name: translateStatus(t, 'DAMAGED') },
            ]}
          />
          <FilterSelect
            label={t('common.status')}
            value={filters.status}
            onChange={(value) => setFilters({ ...filters, status: value })}
            options={['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'CLOSED'].map((status) => ({
              id: status,
              name: translateStatus(t, status),
            }))}
          />
          <label className="block">
            <span className="text-xs font-semibold uppercase text-slate-500">{t('common.date')}</span>
            <div className="mt-2 flex gap-2">
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-2 py-2 text-sm"
              />
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-2 py-2 text-sm"
              />
            </div>
          </label>
        </div>

        <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">{t('chinaReceiving.actNumber')}</th>
                <th className="px-4 py-3">{t('chinaReceiving.orderNumber')}</th>
                <th className="px-4 py-3">{t('procurement.orders.supplier')}</th>
                <th className="px-4 py-3">{t('procurement.orders.factory')}</th>
                <th className="px-4 py-3">{t('procurement.orders.product')}</th>
                <th className="px-4 py-3">{t('chinaReceiving.expectedQty')}</th>
                <th className="px-4 py-3">{t('chinaReceiving.actualQty')}</th>
                <th className="px-4 py-3">{t('procurement.orders.difference')}</th>
                <th className="px-4 py-3">{t('chinaReceiving.differenceType')}</th>
                <th className="px-4 py-3">{t('chinaReceiving.targetWarehouse')}</th>
                <th className="px-4 py-3">{t('common.status')}</th>
                <th className="px-4 py-3">{t('chinaReceiving.actDate')}</th>
                <th className="px-4 py-3">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedActs.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-4 py-8 text-center text-slate-500">
                    {t('chinaReceiving.noActsForType')}
                  </td>
                </tr>
              ) : (
                sortedActs.map((act) => (
                  <tr key={act.id}>
                    <td className="px-4 py-3 font-bold">{act.actNumber}</td>
                    <td className="px-4 py-3">{act.orderNumber}</td>
                    <td className="px-4 py-3">{act.supplier?.name ?? '—'}</td>
                    <td className="px-4 py-3">{act.factory?.name ?? '—'}</td>
                    <td className="px-4 py-3">{act.productName}</td>
                    <td className="px-4 py-3">{act.expectedQuantity}</td>
                    <td className="px-4 py-3">{act.actualQuantity}</td>
                    <td className="px-4 py-3">{act.differenceQuantity}</td>
                    <td className="px-4 py-3">{translateStatus(t, act.type)}</td>
                    <td className="px-4 py-3">{act.hqWarehouse?.name ?? '—'}</td>
                    <td className="px-4 py-3">{translateStatus(t, act.status)}</td>
                    <td className="px-4 py-3">{new Date(act.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/procurement/difference-acts/${act.id}`}
                          className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold"
                        >
                          {t('common.open')}
                        </Link>
                        <button
                          type="button"
                          onClick={() => printAct(act)}
                          className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold"
                        >
                          {t('chinaReceiving.printAct')}
                        </button>
                        {canArchive ? (
                          <button
                            type="button"
                            disabled={loadingId === act.id}
                            onClick={() => void archiveAct(act)}
                            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50"
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

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
}) {
  const { t } = useTranslation();
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
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
