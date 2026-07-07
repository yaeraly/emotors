'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { ModuleSectionNav } from '@/components/ModuleSectionNav';
import { distributionHubSections } from '@/lib/scm-hub-sections';
import { apiFetch } from '@/lib/api';
import { canCreateBranchHqOrder, canManageBranchPurchaseRequests, canViewBranchPurchaseRequests } from '@/lib/rbac';
import type { Branch, Product, ProductListResponse, User, Warehouse } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';
import { translateStatus } from '@/lib/translate-status';

type BranchPurchaseRequest = {
  id: string;
  requestNumber: string;
  branchId: string;
  status: string;
  note?: string | null;
  convertedOrderId?: string | null;
  items: Array<{ id: string; productId: string; sku: string; productName: string; quantity: number }>;
  createdAt: string;
};

export default function BranchPurchaseRequestsPage() {
  const { t } = useTranslation();
  const [requests, setRequests] = useState<BranchPurchaseRequest[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [hqWarehouses, setHqWarehouses] = useState<Warehouse[]>([]);
  const [branchWarehouses, setBranchWarehouses] = useState<Warehouse[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [convertId, setConvertId] = useState<string | null>(null);
  const [form, setForm] = useState({ branchId: '', note: '', productId: '', quantity: '1' });
  const [convertForm, setConvertForm] = useState({ sourceWarehouseId: '', destinationWarehouseId: '' });

  async function load() {
    const [list, me, branchList, productResult, hqList, bwList] = await Promise.all([
      apiFetch<BranchPurchaseRequest[]>('/branch-purchase-requests'),
      apiFetch<User>('/auth/me'),
      apiFetch<Branch[]>('/branches'),
      apiFetch<ProductListResponse>('/inventory/products?pageSize=200'),
      apiFetch<Warehouse[]>('/inventory/warehouses?warehouseType=HQ&status=ACTIVE'),
      apiFetch<Warehouse[]>('/inventory/warehouses?warehouseType=BRANCH&status=ACTIVE'),
    ]);
    setRequests(list);
    setUser(me);
    setBranches(branchList);
    setProducts(productResult.items);
    setHqWarehouses(hqList);
    setBranchWarehouses(bwList);
    setForm((current) => ({
      ...current,
      branchId: current.branchId || me.branchId || branchList[0]?.id || '',
      productId: current.productId || productResult.items[0]?.id || '',
    }));
    setConvertForm({
      sourceWarehouseId: hqList[0]?.id ?? '',
      destinationWarehouseId: bwList.find((w) => w.branchId === (me.branchId || branchList[0]?.id))?.id ?? bwList[0]?.id ?? '',
    });
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  async function submitRequest(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await apiFetch('/branch-purchase-requests', {
        method: 'POST',
        body: JSON.stringify({
          branchId: form.branchId,
          note: form.note,
          status: 'SUBMITTED',
          items: [{ productId: form.productId, quantity: Number(form.quantity) }],
        }),
      });
      setSuccess(t('distribution.branchOrderSubmitted'));
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function review(id: string, action: 'approve' | 'reject') {
    setError('');
    try {
      await apiFetch(`/branch-purchase-requests/${id}/${action}`, { method: 'POST' });
      setSuccess(action === 'approve' ? t('distribution.orderApproved') : t('distribution.orderRejected'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function convert(id: string) {
    setError('');
    try {
      const order = await apiFetch<{ id: string }>(`/branch-purchase-requests/${id}/convert`, {
        method: 'POST',
        body: JSON.stringify(convertForm),
      });
      setConvertId(null);
      setSuccess(t('distribution.convertedToOrder'));
      window.location.href = `/distribution/orders/${order.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  const canManage = canManageBranchPurchaseRequests(user);
  const canCreate = canCreateBranchHqOrder(user);
  const canView = canViewBranchPurchaseRequests(user);

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
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('distribution.title')}</p>
            <h2 className="text-3xl font-bold text-slate-950">{t('operations.branchPurchaseRequests')}</h2>
          </div>
          {canCreate ? (
            <button type="button" onClick={() => setShowForm(true)} className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white">
              {t('distribution.newBranchOrder')}
            </button>
          ) : null}
        </div>

        <ModuleSectionNav sections={distributionHubSections} />

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}

        {showForm ? (
          <form onSubmit={submitRequest} className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">{t('distribution.branch')}</span>
              <select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2">
                {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">{t('sales.product')}</span>
              <select value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2">
                {products.map((product) => <option key={product.id} value={product.id}>{product.sku} · {product.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">{t('distribution.quantity')}</span>
              <input type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" />
            </label>
            <label className="block md:col-span-2">
              <span className="text-sm font-semibold text-slate-700">{t('crm.notes')}</span>
              <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" rows={2} />
            </label>
            <div className="flex gap-2 md:col-span-2">
              <button type="submit" className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white">{t('distribution.submitOrder')}</button>
              <button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-slate-300 px-4 py-2 font-semibold">{t('common.cancel')}</button>
            </div>
          </form>
        ) : null}

        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">{t('distribution.branch')}</th>
                <th className="px-4 py-3">{t('distribution.status')}</th>
                <th className="px-4 py-3">{t('distribution.items')}</th>
                <th className="px-4 py-3">{t('common.createdDate')}</th>
                <th className="px-4 py-3">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {requests.map((request) => (
                <tr key={request.id}>
                  <td className="px-4 py-3 font-bold">{request.requestNumber}</td>
                  <td className="px-4 py-3">{branches.find((b) => b.id === request.branchId)?.name ?? request.branchId}</td>
                  <td className="px-4 py-3">{translateStatus(t, request.status)}</td>
                  <td className="px-4 py-3">{request.items.map((item) => `${item.sku} × ${item.quantity}`).join(', ')}</td>
                  <td className="px-4 py-3">{new Date(request.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {canManage && request.status === 'SUBMITTED' ? (
                        <>
                          <button type="button" onClick={() => void review(request.id, 'approve')} className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white">{t('distribution.approve')}</button>
                          <button type="button" onClick={() => void review(request.id, 'reject')} className="rounded-lg border border-red-200 px-3 py-1 text-xs font-semibold text-red-600">{t('distribution.reject')}</button>
                        </>
                      ) : null}
                      {canManage && request.status === 'APPROVED' ? (
                        <button type="button" onClick={() => setConvertId(request.id)} className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold">{t('distribution.convertToOrder')}</button>
                      ) : null}
                      {request.convertedOrderId ? (
                        <Link href={`/distribution/orders/${request.convertedOrderId}`} className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold">{t('common.open')}</Link>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {convertId ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold">{t('distribution.convertToOrder')}</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-semibold">{t('distribution.sourceWarehouse')}</span>
                <select value={convertForm.sourceWarehouseId} onChange={(e) => setConvertForm({ ...convertForm, sourceWarehouseId: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2">
                  {hqWarehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-semibold">{t('distribution.destinationWarehouse')}</span>
                <select value={convertForm.destinationWarehouseId} onChange={(e) => setConvertForm({ ...convertForm, destinationWarehouseId: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2">
                  {branchWarehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => void convert(convertId)} className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white">{t('distribution.convertToOrder')}</button>
              <button type="button" onClick={() => setConvertId(null)} className="rounded-xl border border-slate-300 px-4 py-2 font-semibold">{t('common.cancel')}</button>
            </div>
          </div>
        ) : null}
      </section>
    </ProtectedShell>
  );
}
