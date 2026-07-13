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
  canSeeHqStockInBranchRequests,
  canViewBranchPurchaseRequests,
  isBranchOwnerUser,
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
  assignedHqWarehouseId?: string | null;
  assignedHqWarehouse?: { id: string; name: string; code?: string } | null;
  branch?: {
    id: string;
    name: string;
    assignedHqWarehouse?: { id: string; name: string; code?: string } | null;
  };
  status: string;
  branchDisplayStatus?: string;
  partialFulfillmentMessage?: string | null;
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
  branchPurchasePriceKgs: number | null;
  wholesalePriceKgs: number | null;
  pricingPending: boolean;
  branchStock: number | null;
  hqStock: number | null;
  quantity: string;
  note: string;
};

function lineTotal(line: DraftLine) {
  const quantity = Number(line.quantity) || 0;
  if (line.pricingPending || line.branchPurchasePriceKgs == null) return 0;
  return Math.round((line.branchPurchasePriceKgs * quantity + Number.EPSILON) * 100) / 100;
}

function formatBranchPrice(line: DraftLine, t: (key: string) => string) {
  if (!line.productId) return '—';
  if (line.pricingPending || line.branchPurchasePriceKgs == null) {
    return t('branchProductRequest.pricingPending');
  }
  return line.branchPurchasePriceKgs.toFixed(2);
}

function emptyLine(): DraftLine {
  return {
    key: `${Date.now()}-${Math.random()}`,
    productId: '',
    productName: '',
    sku: '',
    unit: 'pcs',
    weightKg: 0,
    branchPurchasePriceKgs: null,
    wholesalePriceKgs: null,
    pricingPending: false,
    branchStock: 0,
    hqStock: null,
    quantity: '1',
    note: '',
  };
}

function isSubmittedStatus(status: string) {
  return status === 'SUBMITTED' || status === 'SUBMITTED_TO_HQ';
}

function resolveRequestStatusLabel(
  t: (key: string) => string,
  request: Pick<BranchPurchaseRequest, 'status' | 'branchDisplayStatus'>,
  branchOnly: boolean,
) {
  if (branchOnly && request.branchDisplayStatus) {
    return translateStatus(t, request.branchDisplayStatus, 'branchRequest');
  }
  return translateStatus(t, request.status);
}

export default function BranchPurchaseRequestsPage() {
  const { t } = useTranslation();
  const productSearchRef = useRef<HTMLInputElement>(null);
  const [requests, setRequests] = useState<BranchPurchaseRequest[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchWarehouses, setBranchWarehouses] = useState<Warehouse[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [form, setForm] = useState({
    branchId: '',
    branchWarehouseId: '',
    note: '',
  });
  async function load() {
    const [list, me, branchList, bwList] = await Promise.all([
      apiFetch<BranchPurchaseRequest[]>('/branch-purchase-requests'),
      apiFetch<User>('/auth/me'),
      apiFetch<Branch[]>('/branches'),
      apiFetch<Warehouse[]>('/inventory/warehouses?warehouseType=BRANCH&status=ACTIVE'),
    ]);
    setRequests(list);
    setUser(me);
    setBranches(branchList);
    setBranchWarehouses(bwList);
    const branchId = me.branchId || branchList[0]?.id || '';
    const branchWarehouseId =
      bwList.find((warehouse) => warehouse.branchId === branchId)?.id ?? bwList[0]?.id ?? '';
    setForm((current) => ({
      ...current,
      branchId: current.branchId || branchId,
      branchWarehouseId: current.branchWarehouseId || branchWarehouseId,
    }));
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
            ? {
                ...line,
                quantity: String(Number(line.quantity) + 1),
                branchPurchasePriceKgs: product.branchPurchasePriceKgs ?? line.branchPurchasePriceKgs,
                wholesalePriceKgs: product.branchPurchasePriceKgs ?? line.branchPurchasePriceKgs,
                pricingPending: product.pricingPending ?? product.branchPurchasePriceKgs == null,
              }
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
        weightKg: 0,
        branchPurchasePriceKgs: product.branchPurchasePriceKgs ?? null,
        wholesalePriceKgs: product.branchPurchasePriceKgs ?? null,
        pricingPending: product.pricingPending ?? product.branchPurchasePriceKgs == null,
        branchStock: 0,
        hqStock: null,
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
      const message = err instanceof Error ? err.message : t('common.error');
      setError(localizeBranchRequestError(message));
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

  async function review(id: string, action: 'reject') {
    setError('');
    try {
      await apiFetch(`/branch-purchase-requests/${id}/${action}`, { method: 'POST', body: JSON.stringify({}) });
      setSuccess(t('distribution.orderRejected'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function localizeBranchRequestError(message: string) {
    if (message.includes('NO_HQ_WAREHOUSE_ASSIGNED_TO_BRANCH')) return t('branchHqRouting.noWarehouseAssigned');
    if (message.includes('INACTIVE_HQ_WAREHOUSE')) return t('branchHqRouting.inactiveWarehouse');
    if (message.includes('NO_HQ_WAREHOUSE_MANAGER_ASSIGNED')) return t('branchHqRouting.noWarehouseManager');
    return message;
  }

  async function sendToHqWarehouse(id: string) {
    setError('');
    try {
      const order = await apiFetch<{ id: string }>(`/branch-purchase-requests/${id}/send-to-hq-warehouse`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setSuccess(t('branchHqRouting.sentToWarehouse'));
      window.location.href = `/distribution/orders/${order.id}`;
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.error');
      setError(localizeBranchRequestError(message));
    }
  }

  const canManage = canManageBranchPurchaseRequests(user);
  const canCreate = canManageOwnBranchProductRequest(user);
  const canView = canViewBranchPurchaseRequests(user);
  const canSeeHqStock = canSeeHqStockInBranchRequests(user);
  const branchOnlyView = !canSeeHqStock;
  const branchSalesManagerView = isBranchSalesManagerUser(user);
  const branchWarehouseView = isBranchWarehouseOperator(user);
  const branchOwnerView = isBranchOwnerUser(user);
  const hqSalesView = isHqSalesManagerUser(user);
  const draftProductIds = lines
    .map((line) => line.productId)
    .filter(Boolean)
    .join(',');

  useEffect(() => {
    if (!showForm || !branchOnlyView || !form.branchId || !draftProductIds) return;

    const params = new URLSearchParams({ branchId: form.branchId, productIds: draftProductIds });
    void apiFetch<Record<string, number | null>>(`/branch-purchase-requests/product-prices?${params.toString()}`)
      .then((prices) => {
        setLines((current) =>
          current.map((line) =>
            line.productId && prices[line.productId] !== undefined
              ? {
                  ...line,
                  branchPurchasePriceKgs: prices[line.productId],
                  wholesalePriceKgs: prices[line.productId],
                  pricingPending: prices[line.productId] == null,
                }
              : line,
          ),
        );
      })
      .catch(() => null);
  }, [branchOnlyView, draftProductIds, form.branchId, showForm]);

  const draftTotalAmount = lines.reduce((sum, line) => sum + lineTotal(line), 0);

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

        {!branchSalesManagerView && !branchWarehouseView && !branchOwnerView ? <ModuleSectionNav sections={distributionHubSections} /> : null}

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

            <BranchProductSearch inputRef={productSearchRef} branchId={form.branchId} onSelect={addProductFromSearch} />

            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">{t('sales.product')}</th>
                    {branchOnlyView ? <th className="px-3 py-2">{t('branchProductRequest.productSearch.sku')}</th> : null}
                    <th className="px-3 py-2">{t('distribution.quantity')}</th>
                    {!branchOnlyView ? <th className="px-3 py-2">{t('branchProductRequest.unit')}</th> : null}
                    {!branchOnlyView ? <th className="px-3 py-2">{t('branchProductRequest.branchStock')}</th> : null}
                    {branchOnlyView ? (
                      <th className="px-3 py-2">{t('branchProductRequest.branchPurchasePrice')}</th>
                    ) : (
                      <th className="px-3 py-2">{t('branchProductRequest.wholesalePrice')}</th>
                    )}
                    {branchOnlyView ? <th className="px-3 py-2">{t('branchProductRequest.totalAmount')}</th> : null}
                    {!branchOnlyView ? <th className="px-3 py-2">{t('crm.notes')}</th> : null}
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((line) => (
                    <tr key={line.key}>
                      <td className="px-3 py-2">
                        {line.productId ? (
                          branchOnlyView ? (
                            <p className="font-semibold text-slate-900">{line.productName}</p>
                          ) : (
                            <div>
                              <p className="font-semibold text-slate-900">{line.productName}</p>
                              <p className="text-xs text-slate-500">{line.sku}</p>
                            </div>
                          )
                        ) : (
                          <span className="text-slate-400">{t('branchProductRequest.selectProductHint')}</span>
                        )}
                      </td>
                      {branchOnlyView ? <td className="px-3 py-2 text-slate-700">{line.sku || '—'}</td> : null}
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
                      {!branchOnlyView ? <td className="px-3 py-2">{line.unit}</td> : null}
                      {!branchOnlyView ? <td className="px-3 py-2">{line.branchStock}</td> : null}
                      <td className="px-3 py-2">
                        {formatBranchPrice(line, t)}
                      </td>
                      {branchOnlyView ? (
                        <td className="px-3 py-2 font-semibold text-slate-900">{lineTotal(line).toFixed(2)}</td>
                      ) : null}
                      {!branchOnlyView ? (
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
                      ) : null}
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

            {branchOnlyView ? (
              <div className="flex justify-end rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                <span className="font-semibold text-slate-700">{t('branchProductRequest.totalAmount')}:</span>
                <span className="ml-3 text-lg font-bold text-slate-950">{draftTotalAmount.toFixed(2)} KGS</span>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => setLines((current) => [...current, emptyLine()])}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold"
            >
              {t('branchProductRequest.addRow')}
            </button>

            <label className="block">
              <span className="text-sm font-semibold text-slate-700">{t('crm.notes')}</span>
              <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" rows={2} />
            </label>

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
                {hqSalesView ? <th className="px-4 py-3">{t('branchHqRouting.assignedHqWarehouse')}</th> : null}
                <th className="px-4 py-3">{t('distribution.status')}</th>
                <th className="px-4 py-3">{t('distribution.items')}</th>
                {hqSalesView ? (
                  <>
                    <th className="px-4 py-3">{t('branchProductRequest.totalQuantity')}</th>
                    <th className="px-4 py-3">{t('branchProductRequest.estimatedAmount')}</th>
                  </>
                ) : branchOnlyView ? (
                  <th className="px-4 py-3">{t('branchProductRequest.totalAmount')}</th>
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
                  {hqSalesView ? (
                    <td className="px-4 py-3">
                      {request.assignedHqWarehouse?.name ??
                        request.branch?.assignedHqWarehouse?.name ??
                        branches.find((branch) => branch.id === request.branchId)?.assignedHqWarehouse?.name ??
                        '—'}
                    </td>
                  ) : null}
                  <td className="px-4 py-3">{resolveRequestStatusLabel(t, request, branchOnlyView)}</td>
                  <td className="px-4 py-3">{request.items.length}</td>
                  {hqSalesView ? (
                    <>
                      <td className="px-4 py-3">{request.totalQuantity ?? request.items.reduce((sum, item) => sum + item.quantity, 0)}</td>
                      <td className="px-4 py-3">{Number(request.totalEstimatedAmount ?? 0).toFixed(2)}</td>
                    </>
                  ) : branchOnlyView ? (
                    <td className="px-4 py-3">{Number(request.totalEstimatedAmount ?? 0).toFixed(2)}</td>
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
                          <Link href={`/branch-purchase-requests/${request.id}`} className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white">
                            {t('branchProductRequest.reviewRequest')}
                          </Link>
                          <button type="button" onClick={() => void review(request.id, 'reject')} className="rounded-lg border border-red-200 px-3 py-1 text-xs font-semibold text-red-600">{t('distribution.reject')}</button>
                        </>
                      ) : null}
                      {canManage && (request.status === 'APPROVED' || request.status === 'PARTIALLY_APPROVED' || request.status === 'CONFIRMED') ? (
                        <button type="button" onClick={() => void sendToHqWarehouse(request.id)} className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold">{t('branchHqRouting.sendToWarehouseManager')}</button>
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
      </section>
    </ProtectedShell>
  );
}
