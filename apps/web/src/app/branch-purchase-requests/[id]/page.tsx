'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import {
  canManageBranchPurchaseRequests,
  canManageOwnBranchProductRequest,
  canSeeHqStockInBranchRequests,
  canViewBranchPurchaseRequests,
  isHqSalesManagerUser,
} from '@/lib/rbac';
import type { Branch, User, Warehouse } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';
import { translateStatus } from '@/lib/translate-status';

type LineReviewAction = 'APPROVE' | 'PARTIAL' | 'REJECT' | 'REMOVE';

type RequestItem = {
  id: string;
  productId: string;
  sku: string;
  productName: string;
  quantity: number;
  approvedQuantity?: number | null;
  unavailableQuantity?: number | null;
  unit: string;
  currentBranchStock?: number;
  hqAvailableStock?: number | null;
  hqPhysicalStock?: number | null;
  bookedQuantity?: number | null;
  availableForThisRequest?: number | null;
  bookingExpiresAt?: string | null;
  missingQty?: number | null;
  pricingPolicyAvailable?: boolean;
  lineStatus?: string | null;
  rejectionReasonCode?: string | null;
  publicComment?: string | null;
  branchPurchasePriceKgs?: number;
  resolvedBranchPriceKgs?: number | null;
  hasPricingPolicyAtSubmit?: boolean;
  wholesalePriceKgs?: number;
  transportExpenseAllocation?: number;
  estimatedUnitCost?: number;
  totalAmount?: number;
  weightKg: number;
  note?: string | null;
};

type LineDecision = {
  action: LineReviewAction;
  approvedQuantity: number;
  publicComment: string;
};

type RequestDetail = {
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
  reviewedAt?: string | null;
  bookingExpiresAt?: string | null;
  hqStockStatus?: 'loaded' | 'unavailable';
  createdAt: string;
  createdBy?: { id: string; fullName: string; role: string };
  items: RequestItem[];
};

function isSubmittedStatus(status: string) {
  return status === 'SUBMITTED' || status === 'SUBMITTED_TO_HQ';
}

function isReviewedStatus(status: string) {
  return [
    'APPROVED',
    'PARTIALLY_APPROVED',
    'REJECTED',
    'PENDING_BRANCH_CONFIRMATION',
    'BRANCH_CONFIRMED',
    'BRANCH_DECLINED',
    'READY_FOR_HQ_WAREHOUSE',
    'PAYMENT_CONFIRMED',
    'SENT_TO_HQ_WAREHOUSE',
    'SHIPPED',
    'RECEIVED',
    'COMPLETED',
  ].includes(status);
}

function availableForLine(item: RequestItem, hqStockLoaded: boolean) {
  if (!hqStockLoaded) return 0;
  return item.availableForThisRequest ?? (item.hqAvailableStock ?? 0) + (item.bookedQuantity ?? 0);
}

function formatHqStockCell(value: number | null | undefined, hqStockLoaded: boolean, t: (key: string) => string) {
  if (!hqStockLoaded) {
    return <span className="text-slate-400">{t('branchProductRequest.hqStockLoading')}</span>;
  }
  if (value == null) return '—';
  return value;
}

function resolveRequestStatusLabel(
  t: (key: string) => string,
  request: Pick<RequestDetail, 'status' | 'branchDisplayStatus'>,
  branchOnly: boolean,
) {
  if (branchOnly && request.branchDisplayStatus) {
    return translateStatus(t, request.branchDisplayStatus, 'branchRequest');
  }
  return translateStatus(t, request.status);
}

function getFrozenBranchPrice(item: RequestItem) {
  const raw = item.resolvedBranchPriceKgs ?? item.wholesalePriceKgs ?? item.branchPurchasePriceKgs;
  if (raw == null) return null;
  const price = Number(raw);
  if (!Number.isFinite(price)) return null;
  if (price === 0 && item.hasPricingPolicyAtSubmit === false) return null;
  if (price === 0 && item.pricingPolicyAvailable === false) return null;
  return price;
}

function formatFrozenBranchPrice(item: RequestItem, t: (key: string) => string) {
  if (item.hasPricingPolicyAtSubmit === false || item.pricingPolicyAvailable === false) {
    return t('branchProductRequest.pricingPending');
  }
  const price = getFrozenBranchPrice(item);
  if (price == null) return t('branchProductRequest.pricingPending');
  return price.toFixed(2);
}

function requestLineTotal(item: RequestItem) {
  const price = getFrozenBranchPrice(item);
  if (price == null) return 0;
  return Math.round((price * item.quantity + Number.EPSILON) * 100) / 100;
}

function approvedLineTotal(item: RequestItem, approvedQuantity: number) {
  const price = getFrozenBranchPrice(item);
  if (price == null) return 0;
  return Math.round((price * approvedQuantity + Number.EPSILON) * 100) / 100;
}

function translateRejectionReason(t: (key: string) => string, code?: string | null) {
  if (!code) return '—';
  const key = `branchRequest.rejectionReason.${code}`;
  const translated = t(key);
  return translated !== key ? translated : code;
}

function defaultLineDecision(item: RequestItem, hqStockLoaded: boolean): LineDecision {
  const available = availableForLine(item, hqStockLoaded);
  const hasPolicy = item.pricingPolicyAvailable !== false;
  if (!hasPolicy || available <= 0) {
    return { action: 'REJECT', approvedQuantity: 0, publicComment: '' };
  }
  if (available >= item.quantity) {
    return { action: 'APPROVE', approvedQuantity: item.quantity, publicComment: '' };
  }
  return { action: 'PARTIAL', approvedQuantity: available, publicComment: '' };
}

export default function BranchPurchaseRequestDetailPage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const [request, setRequest] = useState<RequestDetail | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [lineDecisions, setLineDecisions] = useState<Record<string, LineDecision>>({});

  function localizeBranchRequestError(message: string) {
    if (message.includes('NO_HQ_WAREHOUSE_ASSIGNED_TO_BRANCH')) return t('branchHqRouting.noWarehouseAssigned');
    if (message.includes('INACTIVE_HQ_WAREHOUSE')) return t('branchHqRouting.inactiveWarehouse');
    if (message.includes('NO_HQ_WAREHOUSE_MANAGER_ASSIGNED')) return t('branchHqRouting.noWarehouseManager');
    if (message.includes('public comment is required')) return t('branchProductRequest.commentRequired');
    return message;
  }

  function resolveLoadError(err: unknown) {
    const message = err instanceof Error ? err.message : t('common.error');
    if (message.includes('not found') || message.includes('Not Found') || message.includes('404')) {
      setNotFound(true);
      return;
    }
    if (
      message.includes('Forbidden') ||
      message.includes('HQ_SALES_MANAGER_ACCESS_DENIED') ||
      message.includes('нет доступа')
    ) {
      setForbidden(true);
      return;
    }
    setError(isHqSalesManagerUser(user) ? t('operations.hqBranchOrderLoadError') : message);
  }

  async function load() {
    if (!params.id) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    setNotFound(false);
    setForbidden(false);

    try {
      const [detail, me] = await Promise.all([
        apiFetch<RequestDetail>(`/branch-purchase-requests/${params.id}`),
        apiFetch<User>('/auth/me'),
      ]);
      setRequest(detail);
      setUser(me);
      setLineDecisions(
        Object.fromEntries(
          detail.items.map((item) => [
            item.id,
            defaultLineDecision(item, detail.hqStockStatus !== 'unavailable'),
          ]),
        ),
      );

      void Promise.all([
        apiFetch<Branch[]>('/branches'),
        apiFetch<Warehouse[]>('/inventory/warehouses?warehouseType=BRANCH&status=ACTIVE'),
      ])
        .then(([branchList, bwList]) => {
          setBranches(branchList);
          setWarehouses(bwList);
        })
        .catch(() => null);
    } catch (err) {
      setRequest(null);
      resolveLoadError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, t]);

  function updateLineDecision(itemId: string, patch: Partial<LineDecision>) {
    setLineDecisions((current) => ({
      ...current,
      [itemId]: { ...current[itemId], ...patch },
    }));
  }

  function setLineAction(item: RequestItem, action: LineReviewAction) {
    const hqStockLoaded = request?.hqStockStatus !== 'unavailable';
    const available = availableForLine(item, hqStockLoaded);
    if (action === 'APPROVE') {
      updateLineDecision(item.id, { action, approvedQuantity: Math.min(item.quantity, available), publicComment: '' });
    } else if (action === 'PARTIAL') {
      updateLineDecision(item.id, { action, approvedQuantity: Math.min(available, item.quantity - 1) || available, publicComment: '' });
    } else {
      updateLineDecision(item.id, { action, approvedQuantity: 0, publicComment: lineDecisions[item.id]?.publicComment ?? '' });
    }
  }

  async function confirmBranchOrder() {
    if (!request) return;
    setError('');
    try {
      await apiFetch(`/branch-purchase-requests/${request.id}/confirm`, { method: 'POST', body: JSON.stringify({}) });
      setSuccess(t('branchProductRequest.branchConfirmed'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function declineBranchOrder() {
    if (!request) return;
    setError('');
    try {
      await apiFetch(`/branch-purchase-requests/${request.id}/decline`, { method: 'POST', body: JSON.stringify({}) });
      setSuccess(t('branchProductRequest.branchDeclined'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function submitReview() {
    if (!request) return;
    setError('');
    try {
      const body = {
        items: request.items.map((item) => {
          const decision = lineDecisions[item.id] ?? defaultLineDecision(item, hqStockLoaded);
          return {
            id: item.id,
            action: decision.action,
            approvedQuantity: decision.approvedQuantity,
            publicComment: decision.publicComment.trim() || undefined,
          };
        }),
      };
      await apiFetch(`/branch-purchase-requests/${request.id}/submit-review`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setSuccess(t('branchProductRequest.reviewSubmitted'));
      await load();
    } catch (err) {
      setError(localizeBranchRequestError(err instanceof Error ? err.message : t('common.error')));
    }
  }

  async function rejectWholeRequest() {
    if (!request) return;
    setError('');
    try {
      await apiFetch(`/branch-purchase-requests/${request.id}/reject`, { method: 'POST', body: JSON.stringify({}) });
      setSuccess(t('distribution.orderRejected'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function sendToHqWarehouse() {
    if (!request) return;
    setError('');
    try {
      const order = await apiFetch<{ id: string }>(`/branch-purchase-requests/${request.id}/send-to-hq-warehouse`, {
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
  const hqStockLoaded = request?.hqStockStatus !== 'unavailable';
  const branchOnlyView = !canSeeHqStock;
  const hqSalesView = isHqSalesManagerUser(user);
  const listHref = '/branch-purchase-requests';
  const listLabel = hqSalesView ? t('operations.hqBranchRequests') : t('operations.branchPurchaseRequests');

  const reviewable = useMemo(() => request && isSubmittedStatus(request.status), [request]);
  const reviewed = useMemo(() => request && (Boolean(request.reviewedAt) || isReviewedStatus(request.status)), [request]);
  const approvedItemCount = useMemo(
    () => request?.items.filter((item) => (item.approvedQuantity ?? 0) > 0).length ?? 0,
    [request],
  );
  const rejectedItemCount = useMemo(
    () =>
      request?.items.filter(
        (item) =>
          item.lineStatus === 'REJECTED' ||
          item.lineStatus === 'REMOVED_BY_HQ_SALES' ||
          (item.approvedQuantity ?? 0) === 0,
      ).length ?? 0,
    [request],
  );

  if (user && !canView) {
    return (
      <ProtectedShell>
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{t('operations.hqBranchOrderForbidden')}</p>
      </ProtectedShell>
    );
  }

  if (loading) {
    return (
      <ProtectedShell>
        <p className="text-slate-600">{t('operations.hqBranchOrderLoading')}</p>
      </ProtectedShell>
    );
  }

  if (notFound) {
    return (
      <ProtectedShell>
        <section className="space-y-4">
          <Link href={listHref} className="text-sm font-semibold text-blue-600">
            ← {listLabel}
          </Link>
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{t('operations.hqBranchOrderNotFound')}</p>
        </section>
      </ProtectedShell>
    );
  }

  if (forbidden) {
    return (
      <ProtectedShell>
        <section className="space-y-4">
          <Link href={listHref} className="text-sm font-semibold text-blue-600">
            ← {listLabel}
          </Link>
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{t('operations.hqBranchOrderForbidden')}</p>
        </section>
      </ProtectedShell>
    );
  }

  if (!request) {
    return (
      <ProtectedShell>
        <section className="space-y-4">
          <Link href={listHref} className="text-sm font-semibold text-blue-600">
            ← {listLabel}
          </Link>
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error || t('operations.hqBranchOrderLoadError')}
          </p>
        </section>
      </ProtectedShell>
    );
  }

  const branchName = request.branch?.name ?? branches.find((branch) => branch.id === request.branchId)?.name ?? request.branchId;
  const assignedHqWarehouseName =
    request.assignedHqWarehouse?.name ??
    request.branch?.assignedHqWarehouse?.name ??
    branches.find((branch) => branch.id === request.branchId)?.assignedHqWarehouse?.name ??
    '-';
  const branchWarehouseName =
    warehouses.find((warehouse) => warehouse.id === request.branchWarehouseId)?.name ?? request.branchWarehouseId ?? '-';

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href={listHref} className="text-sm font-semibold text-blue-600">
              ← {listLabel}
            </Link>
            <h2 className="mt-2 text-3xl font-bold text-slate-950">{request.requestNumber}</h2>
            <p className="mt-1 text-sm text-slate-500">{resolveRequestStatusLabel(t, request, branchOnlyView)}</p>
            {request.partialFulfillmentMessage ? (
              <p className="mt-2 text-sm text-amber-700">{t('branchProductRequest.partialFulfillmentLater')}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {canManage && reviewable ? (
              <>
                <button type="button" onClick={() => void submitReview()} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
                  {t('branchProductRequest.submitReview')}
                </button>
                <button type="button" onClick={() => void rejectWholeRequest()} className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600">
                  {t('branchProductRequest.rejectWholeRequest')}
                </button>
              </>
            ) : null}
            {canCreate && request.status === 'PENDING_BRANCH_CONFIRMATION' ? (
              <>
                <button type="button" onClick={() => void confirmBranchOrder()} className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white">
                  {t('branchProductRequest.confirmOrder')}
                </button>
                <button type="button" onClick={() => void declineBranchOrder()} className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600">
                  {t('branchProductRequest.declineOrder')}
                </button>
              </>
            ) : null}
            {canManage && (request.status === 'READY_FOR_HQ_WAREHOUSE' || request.status === 'APPROVED' || request.status === 'PARTIALLY_APPROVED') ? (
              <button type="button" onClick={() => void sendToHqWarehouse()} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold">
                {t('branchHqRouting.sendToWarehouseManager')}
              </button>
            ) : null}
          </div>
        </div>

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}

        {branchOnlyView && reviewed ? (
          <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm md:grid-cols-2">
            <p className="font-semibold text-green-700">
              {t('branchProductRequest.approvedItems')}: {approvedItemCount}
            </p>
            <p className="font-semibold text-red-700">
              {t('branchProductRequest.rejectedItems')}: {rejectedItemCount}
            </p>
          </div>
        ) : null}

        <div className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-3">
          <div>
            <p className="text-xs font-bold uppercase text-slate-400">{t('distribution.branch')}</p>
            <p className="mt-1 font-semibold text-slate-900">{branchName}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase text-slate-400">{t('branchProductRequest.branchWarehouse')}</p>
            <p className="mt-1 font-semibold text-slate-900">{branchWarehouseName}</p>
          </div>
          {!branchOnlyView ? (
            <div>
              <p className="text-xs font-bold uppercase text-slate-400">{t('branchProductRequest.requestedBy')}</p>
              <p className="mt-1 font-semibold text-slate-900">{request.createdBy?.fullName ?? '-'}</p>
            </div>
          ) : null}
          {!branchOnlyView ? (
            <div>
              <p className="text-xs font-bold uppercase text-slate-400">{t('branchHqRouting.assignedHqWarehouse')}</p>
              <p className="mt-1 font-semibold text-slate-900">{assignedHqWarehouseName}</p>
            </div>
          ) : null}
          <div>
            <p className="text-xs font-bold uppercase text-slate-400">{t('branchProductRequest.requestDate')}</p>
            <p className="mt-1 font-semibold text-slate-900">{new Date(request.createdAt).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase text-slate-400">{t('branchProductRequest.totalQuantity')}</p>
            <p className="mt-1 font-semibold text-slate-900">{request.totalQuantity ?? request.items.reduce((sum, item) => sum + item.quantity, 0)}</p>
          </div>
          {!branchOnlyView ? (
            <div>
              <p className="text-xs font-bold uppercase text-slate-400">{t('branchProductRequest.estimatedAmount')}</p>
              <p className="mt-1 font-semibold text-slate-900">{Number(request.totalEstimatedAmount ?? 0).toFixed(2)} KGS</p>
            </div>
          ) : (
            <div>
              <p className="text-xs font-bold uppercase text-slate-400">{t('branchProductRequest.totalAmount')}</p>
              <p className="mt-1 font-semibold text-slate-900">{Number(request.totalEstimatedAmount ?? 0).toFixed(2)} KGS</p>
            </div>
          )}
          {request.note ? (
            <div className="md:col-span-3">
              <p className="text-xs font-bold uppercase text-slate-400">{t('crm.notes')}</p>
              <p className="mt-1 text-slate-700">{request.note}</p>
            </div>
          ) : null}
        </div>

        {request.hqStockStatus === 'unavailable' && canSeeHqStock ? (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{t('branchProductRequest.hqStockLoadError')}</p>
        ) : null}

        <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">{t('sales.product')}</th>
                <th className="px-4 py-3">{t('branchProductRequest.requestedQuantity')}</th>
                {canSeeHqStock ? (
                  <>
                    <th className="px-4 py-3">{t('branchProductRequest.bookedQuantity')}</th>
                    <th className="px-4 py-3">{t('branchProductRequest.physicalStock')}</th>
                    <th className="px-4 py-3">{t('branchProductRequest.availableQuantity')}</th>
                    <th className="px-4 py-3">{t('branchProductRequest.availableForRequest')}</th>
                    <th className="px-4 py-3">{t('branchProductRequest.pricingPolicyStatus')}</th>
                    <th className="px-4 py-3">{t('branchProductRequest.approvedQuantity')}</th>
                    <th className="px-4 py-3">{t('branchProductRequest.missingQuantity')}</th>
                  </>
                ) : reviewed ? (
                  <>
                    <th className="px-4 py-3">{t('branchProductRequest.approvedQuantity')}</th>
                    <th className="px-4 py-3">{t('branchProductRequest.missingQuantity')}</th>
                    <th className="px-4 py-3">{t('distribution.status')}</th>
                    <th className="px-4 py-3">{t('inventoryCount.rejectionReason')}</th>
                    <th className="px-4 py-3">{t('crm.notes')}</th>
                  </>
                ) : (
                  <th className="px-4 py-3">{t('distribution.quantity')}</th>
                )}
                <th className="px-4 py-3">{t('branchProductRequest.unit')}</th>
                {!branchOnlyView ? <th className="px-4 py-3">{t('branchProductRequest.branchStock')}</th> : null}
                {canManage && reviewable ? <th className="px-4 py-3">{t('common.actions')}</th> : null}
                {!branchOnlyView && reviewable ? (
                  <>
                    <th className="px-4 py-3">{t('branchProductRequest.branchPurchasePrice')}</th>
                    <th className="px-4 py-3">{t('branchProductRequest.requestLineTotal')}</th>
                    <th className="px-4 py-3">{t('branchProductRequest.approvedLineTotal')}</th>
                  </>
                ) : null}
                {!branchOnlyView && !reviewable ? (
                  <>
                    <th className="px-4 py-3">{t('branchProductRequest.wholesalePrice')}</th>
                    <th className="px-4 py-3">{t('branchProductRequest.transportAllocation')}</th>
                    <th className="px-4 py-3">{t('branchProductRequest.estimatedUnitCost')}</th>
                    <th className="px-4 py-3">{t('branchProductRequest.totalAmount')}</th>
                  </>
                ) : null}
                {branchOnlyView && !reviewed ? (
                  <>
                    <th className="px-4 py-3">{t('branchProductRequest.branchPurchasePrice')}</th>
                    <th className="px-4 py-3">{t('branchProductRequest.totalAmount')}</th>
                  </>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {request.items.map((item) => {
                const generalAvailable = hqStockLoaded ? (item.hqAvailableStock ?? 0) : null;
                const available = availableForLine(item, hqStockLoaded);
                const decision = lineDecisions[item.id] ?? defaultLineDecision(item, hqStockLoaded);
                const hasPolicy = item.pricingPolicyAvailable !== false;
                const approvedValue = reviewable
                  ? decision.approvedQuantity
                  : (item.approvedQuantity ?? 0);
                const missing = reviewed || !reviewable
                  ? (item.unavailableQuantity ?? Math.max(item.quantity - approvedValue, 0))
                  : Math.max(item.quantity - approvedValue, 0);
                const canApproveFull = hasPolicy && available >= item.quantity;
                const canPartial = hasPolicy && available > 0 && available < item.quantity;

                return (
                  <tr key={item.id}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{item.productName}</p>
                      <p className="text-xs text-slate-500">{item.sku}</p>
                    </td>
                    <td className="px-4 py-3">{item.quantity}</td>
                    {canSeeHqStock ? (
                      <>
                        <td className="px-4 py-3">{formatHqStockCell(item.bookedQuantity, hqStockLoaded, t)}</td>
                        <td className="px-4 py-3">{formatHqStockCell(item.hqPhysicalStock, hqStockLoaded, t)}</td>
                        <td className="px-4 py-3">
                          {hqStockLoaded ? (
                            <span className={(generalAvailable ?? 0) <= 0 ? 'font-semibold text-red-600' : ''}>
                              {generalAvailable}
                            </span>
                          ) : (
                            formatHqStockCell(null, false, t)
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {hqStockLoaded ? (
                            <span className={available <= 0 ? 'font-semibold text-red-600' : 'font-semibold text-green-700'}>
                              {available}
                            </span>
                          ) : (
                            formatHqStockCell(null, false, t)
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {hasPolicy ? (
                            <span className="text-green-700">{t('branchProductRequest.pricingPolicyOk')}</span>
                          ) : (
                            <span className="font-semibold text-amber-700">{t('branchProductRequest.pricingPolicyMissing')}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {canManage && reviewable ? (
                            decision.action === 'PARTIAL' || decision.action === 'APPROVE' ? (
                              <input
                                type="number"
                                min="0"
                                max={available}
                                value={decision.approvedQuantity}
                                onChange={(event) =>
                                  updateLineDecision(item.id, { approvedQuantity: Number(event.target.value) })
                                }
                                className="w-24 rounded-lg border border-slate-300 px-2 py-1"
                              />
                            ) : (
                              '0'
                            )
                          ) : (
                            item.approvedQuantity ?? '-'
                          )}
                        </td>
                        <td className="px-4 py-3">{missing}</td>
                      </>
                    ) : reviewed ? (
                      <>
                        <td className="px-4 py-3">{item.approvedQuantity ?? 0}</td>
                        <td className="px-4 py-3">{missing}</td>
                        <td className="px-4 py-3">
                          {translateStatus(t, item.lineStatus ?? request.status, 'branchRequestLine')}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {translateRejectionReason(t, item.rejectionReasonCode)}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{item.publicComment ?? '—'}</td>
                      </>
                    ) : (
                      <td className="px-4 py-3">{item.quantity}</td>
                    )}
                    <td className="px-4 py-3">{item.unit}</td>
                    {!branchOnlyView ? <td className="px-4 py-3">{item.currentBranchStock ?? '-'}</td> : null}
                    {canManage && reviewable ? (
                      <td className="px-4 py-3">
                        <div className="flex min-w-[12rem] flex-col gap-2">
                          <div className="flex flex-wrap gap-1">
                            <button
                              type="button"
                              disabled={!canApproveFull}
                              onClick={() => setLineAction(item, 'APPROVE')}
                              className={`rounded-lg px-2 py-1 text-xs font-semibold ${decision.action === 'APPROVE' ? 'bg-green-600 text-white' : 'border border-slate-300'} disabled:opacity-40`}
                            >
                              {t('branchProductRequest.actionApprove')}
                            </button>
                            <button
                              type="button"
                              disabled={!canPartial}
                              onClick={() => setLineAction(item, 'PARTIAL')}
                              className={`rounded-lg px-2 py-1 text-xs font-semibold ${decision.action === 'PARTIAL' ? 'bg-amber-500 text-white' : 'border border-slate-300'} disabled:opacity-40`}
                            >
                              {t('branchProductRequest.actionPartial')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setLineAction(item, 'REJECT')}
                              className={`rounded-lg px-2 py-1 text-xs font-semibold ${decision.action === 'REJECT' ? 'bg-red-600 text-white' : 'border border-slate-300'}`}
                            >
                              {t('branchProductRequest.actionReject')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setLineAction(item, 'REMOVE')}
                              className={`rounded-lg px-2 py-1 text-xs font-semibold ${decision.action === 'REMOVE' ? 'bg-slate-700 text-white' : 'border border-slate-300'}`}
                            >
                              {t('branchProductRequest.actionRemove')}
                            </button>
                          </div>
                          {(decision.action === 'REJECT' || decision.action === 'REMOVE' || decision.action === 'PARTIAL') ? (
                            <textarea
                              value={decision.publicComment}
                              onChange={(event) => updateLineDecision(item.id, { publicComment: event.target.value })}
                              placeholder={t('branchProductRequest.publicCommentPlaceholder')}
                              className="w-full rounded-lg border border-slate-300 px-2 py-1 text-xs"
                              rows={2}
                            />
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                    {!branchOnlyView && reviewable ? (
                      <>
                        <td className="px-4 py-3">{formatFrozenBranchPrice(item, t)}</td>
                        <td className="px-4 py-3">{requestLineTotal(item).toFixed(2)}</td>
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          {approvedLineTotal(item, approvedValue).toFixed(2)}
                        </td>
                      </>
                    ) : null}
                    {!branchOnlyView && !reviewable ? (
                      <>
                        <td className="px-4 py-3">{Number(item.wholesalePriceKgs ?? 0).toFixed(2)}</td>
                        <td className="px-4 py-3">{Number(item.transportExpenseAllocation ?? 0).toFixed(2)}</td>
                        <td className="px-4 py-3">{Number(item.estimatedUnitCost ?? 0).toFixed(2)}</td>
                        <td className="px-4 py-3">{Number(item.totalAmount ?? 0).toFixed(2)}</td>
                      </>
                    ) : null}
                    {branchOnlyView && !reviewed ? (
                      <>
                        <td className="px-4 py-3">{Number(item.branchPurchasePriceKgs ?? 0).toFixed(2)}</td>
                        <td className="px-4 py-3">{Number(item.totalAmount ?? 0).toFixed(2)}</td>
                      </>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </ProtectedShell>
  );
}
