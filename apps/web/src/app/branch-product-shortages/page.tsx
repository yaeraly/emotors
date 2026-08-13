'use client';

import { useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { canViewBranchProductShortages } from '@/lib/rbac';
import type { Branch, User, Warehouse } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';
import { translateStatus } from '@/lib/translate-status';

import { toast } from '@/lib/toast';

type ShortageRecord = {
  id: string;
  branchId: string;
  productId: string;
  requestedQty: number;
  availableQty: number;
  approvedQty: number;
  missingQty: number;
  assignedHqWarehouseId: string;
  status: string;
  procurementOrderId?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
  branch: { id: string; name: string; code?: string };
  product: { id: string; name: string; sku: string; unit: string };
  assignedHqWarehouse: { id: string; name: string; code?: string; city?: string };
  branchRequest: { id: string; requestNumber: string; createdAt: string };
};

export default function BranchProductShortagesPage() {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [shortages, setShortages] = useState<ShortageRecord[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    branchId: '',
    productId: '',
    assignedHqWarehouseId: '',
    status: '',
  });
  const [procurementOrderId, setProcurementOrderId] = useState<Record<string, string>>({});

  const canView = canViewBranchProductShortages(user);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.branchId) params.set('branchId', filters.branchId);
    if (filters.productId) params.set('productId', filters.productId);
    if (filters.assignedHqWarehouseId) params.set('assignedHqWarehouseId', filters.assignedHqWarehouseId);
    if (filters.status) params.set('status', filters.status);
    return params.toString();
  }, [filters]);

  async function load() {
    const [me, branchList, warehouseList, rows] = await Promise.all([
      apiFetch<User>('/auth/me'),
      apiFetch<Branch[]>('/branches'),
      apiFetch<Warehouse[]>('/inventory/warehouses?warehouseType=HQ&status=ACTIVE'),
      apiFetch<ShortageRecord[]>(`/branch-product-shortages${queryString ? `?${queryString}` : ''}`),
    ]);
    setUser(me);
    setBranches(branchList);
    setWarehouses(warehouseList);
    setShortages(rows);
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [queryString, t]);

  async function markReviewed(id: string) {
    setError('');
    try {
      await apiFetch(`/branch-product-shortages/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ status: 'WAITING_STOCK' }),
      });
      toast.success(t('productShortages.reviewed'));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function linkProcurement(id: string) {
    const orderId = procurementOrderId[id]?.trim();
    if (!orderId) {
      setError(t('productShortages.procurementRequired'));
      return;
    }
    setError('');
    try {
      await apiFetch(`/branch-product-shortages/${id}/link-procurement`, {
        method: 'POST',
        body: JSON.stringify({ procurementOrderId: orderId }),
      });
      toast.success(t('productShortages.linked'));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    }
  }

  if (user && !canView) {
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
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('productShortages.subtitle')}</p>
          <h2 className="text-3xl font-bold text-slate-950">{t('productShortages.title')}</h2>
        </div>

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        <div className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-4">
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">{t('distribution.branch')}</span>
            <select
              value={filters.branchId}
              onChange={(event) => setFilters((current) => ({ ...current, branchId: event.target.value }))}
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
            >
              <option value="">{t('common.all')}</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">{t('sales.product')}</span>
            <input
              value={filters.productId}
              onChange={(event) => setFilters((current) => ({ ...current, productId: event.target.value }))}
              placeholder={t('productShortages.productFilterPlaceholder')}
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">{t('branchHqRouting.assignedHqWarehouse')}</span>
            <select
              value={filters.assignedHqWarehouseId}
              onChange={(event) => setFilters((current) => ({ ...current, assignedHqWarehouseId: event.target.value }))}
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
            >
              <option value="">{t('common.all')}</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">{t('distribution.status')}</span>
            <select
              value={filters.status}
              onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
            >
              <option value="">{t('common.all')}</option>
              {['OPEN', 'WAITING_STOCK', 'PARTIALLY_FULFILLED', 'FULFILLED', 'CANCELLED'].map((status) => (
                <option key={status} value={status}>{translateStatus(t, status, 'branchShortage')}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">{t('distribution.branch')}</th>
                <th className="px-4 py-3">{t('sales.product')}</th>
                <th className="px-4 py-3">{t('branchProductRequest.requestedQuantity')}</th>
                <th className="px-4 py-3">{t('branchProductRequest.availableQuantity')}</th>
                <th className="px-4 py-3">{t('branchProductRequest.approvedQuantity')}</th>
                <th className="px-4 py-3">{t('branchProductRequest.missingQuantity')}</th>
                <th className="px-4 py-3">{t('branchHqRouting.assignedHqWarehouse')}</th>
                <th className="px-4 py-3">{t('branchProductRequest.requestDate')}</th>
                <th className="px-4 py-3">{t('distribution.status')}</th>
                <th className="px-4 py-3">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shortages.map((shortage) => (
                <tr key={shortage.id}>
                  <td className="px-4 py-3">{shortage.branch.name}</td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{shortage.product.name}</p>
                    <p className="text-xs text-slate-500">{shortage.product.sku}</p>
                  </td>
                  <td className="px-4 py-3">{shortage.requestedQty}</td>
                  <td className="px-4 py-3">{shortage.availableQty}</td>
                  <td className="px-4 py-3">{shortage.approvedQty}</td>
                  <td className="px-4 py-3">{shortage.missingQty}</td>
                  <td className="px-4 py-3">{shortage.assignedHqWarehouse.name}</td>
                  <td className="px-4 py-3">{new Date(shortage.branchRequest.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">{translateStatus(t, shortage.status, 'branchShortage')}</td>
                  <td className="px-4 py-3">
                    <div className="flex min-w-[14rem] flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => void markReviewed(shortage.id)}
                        className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold"
                      >
                        {t('productShortages.markReviewed')}
                      </button>
                      <input
                        value={procurementOrderId[shortage.id] ?? ''}
                        onChange={(event) =>
                          setProcurementOrderId((current) => ({ ...current, [shortage.id]: event.target.value }))
                        }
                        placeholder={t('productShortages.procurementOrderId')}
                        className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => void linkProcurement(shortage.id)}
                        className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white"
                      >
                        {t('productShortages.linkProcurement')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </ProtectedShell>
  );
}
