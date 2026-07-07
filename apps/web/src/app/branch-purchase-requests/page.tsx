'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { ModuleSectionNav } from '@/components/ModuleSectionNav';
import { BranchProductSearch, type BranchProductOption } from '@/components/BranchProductSearch';
import { distributionHubSections } from '@/lib/scm-hub-sections';
import { apiFetch } from '@/lib/api';
import {
  canManageBranchPurchaseRequests,
  canManageOwnBranchProductRequest,
  canViewBranchPurchaseRequests,
  isBranchSalesManagerUser,
  isBranchWarehouseOperator,
  isHqSalesManagerUser,
} from '@/lib/rbac';
import type { Branch, User, Warehouse } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';
import { translateStatus } from '@/lib/translate-status';

type RequestItem = {
  id: string;
  productId: string;
  sku: string;
  productName: string;
  quantity: number;
  unit: string;
  currentBranchStock: number;
  hqAvailableStock?: number | null;
  wholesalePriceKgs: number;
  transportExpenseAllocation: number;
  estimatedUnitCost: number;
  totalAmount: number;
  weightKg: number;
  note?: string | null;
};

type BranchPurchaseRequest = {
  id: string;
  requestNumber: string;
  branchId: string;
  branchWarehouseId?: string | null;
  status: string;
  note?: string | null;
  transportCompany?: string | null;
  transportCostKgs?: number;
  driverName?: string | null;
  vehicleNumber?: string | null;
  dispatchDate?: string | null;
  transportNotes?: string | null;
  totalQuantity?: number;
  totalEstimatedAmount?: number;
  convertedOrderId?: string | null;
  items: RequestItem[];
  createdAt: string;
  createdBy?: { id: string; fullName: string };
};

type DraftLine = {
  key: string;
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  weightKg: number;
  wholesalePriceKgs: number;
  branchStock: number;
  hqStock: number | null;
  quantity: string;
  note: string;
};

function emptyLine(): DraftLine {
  return {
    key: `${Date.now()}-${Math.random()}`,
    productId: '',
    productName: '',
    sku: '',
    unit: 'pcs',
    weightKg: 0,
    wholesalePriceKgs: 0,
    branchStock: 0,
    hqStock: null,
    quantity: '1',
    note: '',
  };
}

function isSubmittedStatus(status: string) {
  return status === 'SUBMITTED' || status === 'SUBMITTED_TO_HQ';
}

export default function BranchPurchaseRequestsPage() {
  const { t } = useTranslation();
  const productSearchRef = useRef<HTMLInputElement>(null);
  const [requests, setRequests] = useState<BranchPurchaseRequest[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [hqWarehouses, setHqWarehouses] = useState<Warehouse[]>([]);
  const [branchWarehouses, setBranchWarehouses] = useState<Warehouse[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [convertId, setConvertId] = useState<string | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [form, setForm] = useState({
    branchId: '',
    branchWarehouseId: '',
    note: '',
    transportCompany: '',
    transportCostKgs: '0',
    driverName: '',
    vehicleNumber: '',
    dispatchDate: '',
    transportNotes: '',
  });
  const [convertForm, setConvertForm] = useState({ sourceWarehouseId: '', destinationWarehouseId: '' });

  async function load() {
    const [list, me, branchList, hqList, bwList] = await Promise.all([
      apiFetch<BranchPurchaseRequest[]>('/branch-purchase-requests'),
      apiFetch<User>('/auth/me'),
      apiFetch<Branch[]>('/branches'),
      apiFetch<Warehouse[]>('/inventory/warehouses?warehouseType=HQ&status=ACTIVE'),
      apiFetch<Warehouse[]>('/inventory/warehouses?warehouseType=BRANCH&status=ACTIVE'),
    ]);
    setRequests(list);
    setUser(me);
    setBranches(branchList);
    setHqWarehouses(hqList);
    setBranchWarehouses(bwList);
    const branchId = me.branchId || branchList[0]?.id || '';
    const branchWarehouseId =
      bwList.find((warehouse) => warehouse.branchId === branchId)?.id ?? bwList[0]?.id ?? '';
    setForm((current) => ({
      ...current,
      branchId: current.branchId || branchId,
      branchWarehouseId: current.branchWarehouseId || branchWarehouseId,
    }));
    setConvertForm({
      sourceWarehouseId: hqList[0]?.id ?? '',
      destinationWarehouseId: branchWarehouseId,
    });
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  function addProductFromSearch(product: BranchProductOption) {
    setLines((current) => {
      const existing = current.find((line) => line.productId === product.id && line.productId);
      if (existing) {
        return current.map((line) =>
          line.productId === product.id
            ? { ...line, quantity: String(Number(line.quantity) + 1) }
            : line,
        );
      }
      const emptyIndex = current.findIndex((line) => !line.productId);
      const nextLine: DraftLine = {
        key: `${Date.now()}-${product.id}`,
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        unit: product.unit,
        weightKg: product.weightKg,
        wholesalePriceKgs: product.wholesalePriceKgs,
        branchStock: product.branchStock,
        hqStock: product.hqStock,
        quantity: '1',
        note: '',
      };
      if (emptyIndex >= 0) {
        return current.map((line, index) => (index === emptyIndex ? nextLine : line));
      }
      return [...current, nextLine];
    });
  }

  function removeLine(key: string) {
    setLines((current) => (current.length <= 1 ? current : current.filter((line) => line.key !== key)));
  }

  function buildPayload(asDraft: boolean) {
    const validLines = lines.filter((line) => line.productId && Number(line.quantity) > 0);
    if (!validLines.length) {
      throw new Error(t('branchProductRequest.validation.productsRequired'));
    }
    return {
      branchId: form.branchId,
      branchWarehouseId: form.branchWarehouseId,
      note: form.note,
      status: asDraft ? 'DRAFT' : 'SUBMITTED_TO_HQ',
      transportCompany: form.transportCompany || undefined,
      transportCostKgs: Number(form.transportCostKgs || 0),
      driverName: form.driverName || undefined,
      vehicleNumber: form.vehicleNumber || undefined,
      dispatchDate: form.dispatchDate || undefined,
      transportNotes: form.transportNotes || undefined,
      items: validLines.map((line) => ({
        productId: line.productId,
        quantity: Number(line.quantity),
        note: line.note || undefined,
      })),
    };
  }

  async function submitRequest(event: FormEvent, asDraft = false) {
    event.preventDefault();
    setError('');
    try {
      const payload = buildPayload(asDraft);
      await apiFetch('/branch-purchase-requests', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setSuccess(asDraft ? t('distribution.saveDraft') : t('distribution.branchOrderSubmitted'));
      setShowForm(false);
      setLines([emptyLine()]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function submitDraft(id: string) {
    setError('');
    try {
      await apiFetch(`/branch-purchase-requests/${id}/submit`, { method: 'POST' });
      setSuccess(t('distribution.branchOrderSubmitted'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function cancelRequest(id: string) {
    setError('');
    try {
      await apiFetch(`/branch-purchase-requests/${id}/cancel`, { method: 'POST' });
      setSuccess(t('common.success'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function review(id: string, action: 'approve' | 'reject') {
    setError('');
    try {
      await apiFetch(`/branch-purchase-requests/${id}/${action}`, { method: 'POST', body: JSON.stringify({}) });
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
  const canCreate = canManageOwnBranchProductRequest(user);
  const canView = canViewBranchPurchaseRequests(user);
  const branchSalesManagerView = isBranchSalesManagerUser(user);
  const branchWarehouseView = isBranchWarehouseOperator(user);
  const hqSalesView = isHqSalesManagerUser(user);

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
            <h2 className="text-3xl font-bold text-slate-950">
              {hqSalesView ? t('operations.hqBranchRequests') : t('operations.branchPurchaseRequests')}
            </h2>
          </div>
          {canCreate ? (
            <button type="button" onClick={() => setShowForm(true)} className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white">
              {t('branchProductRequest.newRequest')}
            </button>
          ) : null}
        </div>

        {!branchSalesManagerView && !branchWarehouseView ? <ModuleSectionNav sections={distributionHubSections} /> : null}

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}

        {showForm ? (
          <form onSubmit={(event) => void submitRequest(event, false)} className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">{t('distribution.branch')}</span>
                <select
                  value={form.branchId}
                  disabled={!!user?.branchId && !canManage}
                  onChange={(e) => {
                    const branchId = e.target.value;
                    const branchWarehouseId =
                      branchWarehouses.find((warehouse) => warehouse.branchId === branchId)?.id ?? '';
                    setForm({ ...form, branchId, branchWarehouseId });
                  }}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                >
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">{t('branchProductRequest.branchWarehouse')}</span>
                <select
                  value={form.branchWarehouseId}
                  onChange={(e) => setForm({ ...form, branchWarehouseId: e.target.value })}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                >
                  {branchWarehouses
                    .filter((warehouse) => warehouse.branchId === form.branchId)
                    .map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
                    ))}
                </select>
              </label>
            </div>

            <BranchProductSearch
              inputRef={productSearchRef}
              branchWarehouseId={form.branchWarehouseId}
              onSelect={addProductFromSearch}
            />

            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">{t('sales.product')}</th>
                    <th className="px-3 py-2">{t('distribution.quantity')}</th>
                    <th className="px-3 py-2">{t('branchProductRequest.unit')}</th>
                    <th className="px-3 py-2">{t('branchProductRequest.branchStock')}</th>
                    <th className="px-3 py-2">{t('branchProductRequest.wholesalePrice')}</th>
                    <th className="px-3 py-2">{t('crm.notes')}</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((line) => (
                    <tr key={line.key}>
                      <td className="px-3 py-2">
                        {line.productId ? (
                          <div>
                            <p className="font-semibold text-slate-900">{line.productName}</p>
                            <p className="text-xs text-slate-500">{line.sku}</p>
                          </div>
                        ) : (
                          <span className="text-slate-400">{t('branchProductRequest.selectProductHint')}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="1"
                          value={line.quantity}
                          disabled={!line.productId}
                          onChange={(e) =>
                            setLines((current) =>
                              current.map((row) => (row.key === line.key ? { ...row, quantity: e.target.value } : row)),
                            )
                          }
                          className="w-24 rounded-lg border border-slate-300 px-2 py-1"
                        />
                      </td>
                      <td className="px-3 py-2">{line.unit}</td>
                      <td className="px-3 py-2">{line.branchStock}</td>
                      <td className="px-3 py-2">{line.wholesalePriceKgs.toFixed(2)}</td>
                      <td className="px-3 py-2">
                        <input
                          value={line.note}
                          disabled={!line.productId}
                          onChange={(e) =>
                            setLines((current) =>
                              current.map((row) => (row.key === line.key ? { ...row, note: e.target.value } : row)),
                            )
                          }
                          className="w-full min-w-[8rem] rounded-lg border border-slate-300 px-2 py-1"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <button type="button" onClick={() => removeLine(line.key)} className="text-xs font-semibold text-red-600">
                          {t('common.delete')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              type="button"
              onClick={() => setLines((current) => [...current, emptyLine()])}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold"
            >
              {t('branchProductRequest.addRow')}
            </button>

            <div className="grid gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 md:grid-cols-2">
              <p className="md:col-span-2 text-sm font-bold text-slate-800">{t('branchProductRequest.transportSection')}</p>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">{t('branchProductRequest.transportCompany')}</span>
                <input value={form.transportCompany} onChange={(e) => setForm({ ...form, transportCompany: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">{t('branchProductRequest.transportCostKgs')}</span>
                <input type="number" min="0" step="0.01" value={form.transportCostKgs} onChange={(e) => setForm({ ...form, transportCostKgs: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">{t('branchProductRequest.driverName')}</span>
                <input value={form.driverName} onChange={(e) => setForm({ ...form, driverName: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">{t('branchProductRequest.vehicleNumber')}</span>
                <input value={form.vehicleNumber} onChange={(e) => setForm({ ...form, vehicleNumber: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">{t('branchProductRequest.dispatchDate')}</span>
                <input type="date" value={form.dispatchDate} onChange={(e) => setForm({ ...form, dispatchDate: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" />
              </label>
              <label className="block md:col-span-2">
                <span className="text-sm font-semibold text-slate-700">{t('crm.notes')}</span>
                <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" rows={2} />
              </label>
              <label className="block md:col-span-2">
                <span className="text-sm font-semibold text-slate-700">{t('branchProductRequest.transportNotes')}</span>
                <textarea value={form.transportNotes} onChange={(e) => setForm({ ...form, transportNotes: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" rows={2} />
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="submit" className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white">{t('distribution.submitOrder')}</button>
              <button type="button" onClick={(event) => void submitRequest(event, true)} className="rounded-xl border border-slate-300 px-4 py-2 font-semibold">{t('distribution.saveDraft')}</button>
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
                {hqSalesView ? <th className="px-4 py-3">{t('branchProductRequest.requestedBy')}</th> : null}
                <th className="px-4 py-3">{t('distribution.status')}</th>
                <th className="px-4 py-3">{t('distribution.items')}</th>
                {hqSalesView ? (
                  <>
                    <th className="px-4 py-3">{t('branchProductRequest.totalQuantity')}</th>
                    <th className="px-4 py-3">{t('branchProductRequest.estimatedAmount')}</th>
                  </>
                ) : null}
                <th className="px-4 py-3">{t('common.createdDate')}</th>
                <th className="px-4 py-3">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {requests.map((request) => (
                <tr key={request.id}>
                  <td className="px-4 py-3 font-bold">{request.requestNumber}</td>
                  <td className="px-4 py-3">{branches.find((branch) => branch.id === request.branchId)?.name ?? request.branchId}</td>
                  {hqSalesView ? <td className="px-4 py-3">{request.createdBy?.fullName ?? '-'}</td> : null}
                  <td className="px-4 py-3">{translateStatus(t, request.status)}</td>
                  <td className="px-4 py-3">{request.items.length}</td>
                  {hqSalesView ? (
                    <>
                      <td className="px-4 py-3">{request.totalQuantity ?? request.items.reduce((sum, item) => sum + item.quantity, 0)}</td>
                      <td className="px-4 py-3">{Number(request.totalEstimatedAmount ?? 0).toFixed(2)}</td>
                    </>
                  ) : null}
                  <td className="px-4 py-3">{new Date(request.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/branch-purchase-requests/${request.id}`} className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold">
                        {t('common.open')}
                      </Link>
                      {canCreate && request.status === 'DRAFT' ? (
                        <>
                          <button type="button" onClick={() => void submitDraft(request.id)} className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white">{t('distribution.submitOrder')}</button>
                          <button type="button" onClick={() => void cancelRequest(request.id)} className="rounded-lg border border-red-200 px-3 py-1 text-xs font-semibold text-red-600">{t('common.cancel')}</button>
                        </>
                      ) : null}
                      {canCreate && isSubmittedStatus(request.status) ? (
                        <button type="button" onClick={() => void cancelRequest(request.id)} className="rounded-lg border border-red-200 px-3 py-1 text-xs font-semibold text-red-600">{t('common.cancel')}</button>
                      ) : null}
                      {canManage && isSubmittedStatus(request.status) ? (
                        <>
                          <button type="button" onClick={() => void review(request.id, 'approve')} className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white">{t('distribution.approve')}</button>
                          <button type="button" onClick={() => void review(request.id, 'reject')} className="rounded-lg border border-red-200 px-3 py-1 text-xs font-semibold text-red-600">{t('distribution.reject')}</button>
                        </>
                      ) : null}
                      {canManage && request.status === 'APPROVED' ? (
                        <button type="button" onClick={() => setConvertId(request.id)} className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold">{t('distribution.convertToOrder')}</button>
                      ) : null}
                      {request.convertedOrderId && !branchSalesManagerView ? (
                        <Link href={`/distribution/orders/${request.convertedOrderId}`} className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold">{t('distribution.title')}</Link>
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
                  {hqWarehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-semibold">{t('distribution.destinationWarehouse')}</span>
                <select value={convertForm.destinationWarehouseId} onChange={(e) => setConvertForm({ ...convertForm, destinationWarehouseId: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2">
                  {branchWarehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
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
