'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { ProtectedShell } from '@/components/ProtectedShell';
import { HqSalesBranchOrdersSection } from '@/components/HqSalesBranchOrdersSection';
import { apiFetch } from '@/lib/api';
import {
  canManageBranchPurchaseRequests,
  canManageOwnBranchProductRequest,
  canSeeHqStockInBranchRequests,
  canViewBranchPurchaseRequests,
  canViewProductCost,
  isBranchSalesManagerUser,
  isExecutiveBranchOrderInspector,
  isHqSalesManagerUser,
} from '@/lib/rbac';
import { BranchProductOrdersSection } from '@/components/BranchProductOrdersSection';
import type { Branch, User, Warehouse } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';
import { translateStatus } from '@/lib/translate-status';
import { formatKgs, roundMoney } from '@/lib/money';
import { formatProductUnit } from '@/lib/product-unit';
import {
  branchOrderLineTotal,
  branchOrderTotal,
  formatFrozenBranchPrice,
  formatLineTotalKgs,
  formatOrderTotalKgs,
  getBranchOrderDisplayQuantity,
  hqReviewLineAmount,
  hqReviewOrderAmount,
  requestLineTotal,
} from '@/lib/branch-purchase-request-display.util';

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
  estimatedLineProductCostKgs?: number;
  totalAmount?: number;
  approvedLineTotalKgs?: number | null;
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
  totalProductCostKgs?: number;
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

function approvedLineTotal(item: RequestItem, approvedQuantity: number) {
  if (item.approvedLineTotalKgs != null && Number(item.approvedLineTotalKgs) > 0) {
    return roundMoney(Number(item.approvedLineTotalKgs));
  }
  const price =
    item.resolvedBranchPriceKgs ?? item.wholesalePriceKgs ?? item.branchPurchasePriceKgs;
  if (price == null || !Number.isFinite(Number(price))) return 0;
  return roundMoney(Number(price) * approvedQuantity);
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
  return { action: 'APPROVE', approvedQuantity: item.quantity, publicComment: '' };
}

function lineDecisionFromItem(item: RequestItem, hqStockLoaded: boolean): LineDecision {
  if (!item.lineStatus || item.lineStatus === 'PENDING_REVIEW') {
    return defaultLineDecision(item, hqStockLoaded);
  }
  if (item.lineStatus === 'APPROVED' || item.lineStatus === 'PARTIALLY_APPROVED') {
    return {
      action: 'APPROVE',
      approvedQuantity: item.approvedQuantity ?? item.quantity,
      publicComment: item.publicComment ?? '',
    };
  }
  if (item.lineStatus === 'REMOVED_BY_HQ_SALES') {
    return {
      action: 'REMOVE',
      approvedQuantity: 0,
      publicComment: item.publicComment ?? '',
    };
  }
  return {
    action: 'REJECT',
    approvedQuantity: 0,
    publicComment: item.publicComment ?? '',
  };
}

function buildLineDecisionsFromItems(items: RequestItem[], hqStockLoaded: boolean) {
  return Object.fromEntries(items.map((item) => [item.id, lineDecisionFromItem(item, hqStockLoaded)]));
}

function validateApprovedQuantityForApprove(
  t: (key: string) => string,
  item: RequestItem,
  approvedQuantity: number,
): string | null {
  if (!Number.isFinite(approvedQuantity) || approvedQuantity <= 0) {
    return t('branchProductRequest.approvedQuantityRequired');
  }
  if (approvedQuantity > item.quantity) {
    return t('branchProductRequest.approvedQuantityExceedsRequested');
  }
  return null;
}

function hqDetailThClass(compact: boolean) {
  return compact ? 'px-2 py-1.5 text-[10px] whitespace-nowrap' : 'px-4 py-3';
}

function hqDetailTdClass(compact: boolean, extra = '') {
  return compact ? `px-2 py-1.5 ${extra}`.trim() : `px-4 py-3 ${extra}`.trim();
}

function hqDetailLabel(
  t: (key: string) => string,
  compact: boolean,
  compactKey: string,
  fullKey: string,
) {
  return compact ? t(`branchProductRequest.hqCompact.${compactKey}`) : t(fullKey);
}

function isReviewedApprovedLineStatus(lineStatus?: string | null) {
  return lineStatus === 'APPROVED' || lineStatus === 'PARTIALLY_APPROVED';
}

function isReviewedRejectedLineStatus(lineStatus?: string | null) {
  return lineStatus === 'REJECTED' || lineStatus === 'REMOVED_BY_HQ_SALES';
}

/** Persisted backend line status → subtle row background for HQ Sales review table. */
function hqSalesReviewLineRowClass(lineStatus?: string | null) {
  if (isReviewedApprovedLineStatus(lineStatus)) return 'bg-green-50';
  if (isReviewedRejectedLineStatus(lineStatus)) return 'bg-red-50';
  return '';
}

function hqSalesReviewLineStickyCellClass(lineStatus?: string | null) {
  if (isReviewedApprovedLineStatus(lineStatus)) return 'sticky right-0 bg-green-50';
  if (isReviewedRejectedLineStatus(lineStatus)) return 'sticky right-0 bg-red-50';
  return 'sticky right-0 bg-white';
}

export default function BranchPurchaseRequestDetailPage() {
  const { t, language } = useTranslation();
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
  const [submitting, setSubmitting] = useState(false);
  const [submittingLineId, setSubmittingLineId] = useState<string | null>(null);
  const [lineDecisions, setLineDecisions] = useState<Record<string, LineDecision>>({});

  function localizeBranchRequestError(message: string) {
    if (message.includes('NO_HQ_WAREHOUSE_ASSIGNED_TO_BRANCH')) return t('branchHqRouting.noWarehouseAssigned');
    if (message.includes('INACTIVE_HQ_WAREHOUSE')) return t('branchHqRouting.inactiveWarehouse');
    if (message.includes('NO_HQ_WAREHOUSE_MANAGER_ASSIGNED')) return t('branchHqRouting.noWarehouseManager');
    if (message.includes('public comment is required')) return t('branchProductRequest.commentRequired');
    if (message.includes('Укажите количество для утверждения')) {
      return t('branchProductRequest.approvedQuantityRequired');
    }
    if (message.includes('Утверждаемое количество не может превышать запрошенное')) {
      return t('branchProductRequest.approvedQuantityExceedsRequested');
    }
    if (message.includes('Нельзя изменить решение: заказ уже передан на следующий необратимый этап.')) {
      return t('branchProductRequest.lineReviewLockedDownstream');
    }
    if (message.includes('не настроена цена для филиала')) return message;
    if (message.includes('Данные заказа изменились')) return message;
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
      setLineDecisions(buildLineDecisionsFromItems(detail.items, detail.hqStockStatus !== 'unavailable'));

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
    setLineDecisions((current) => {
      const previous = current[itemId];
      const next = { ...previous, ...patch };
      if (patch.approvedQuantity !== undefined && request) {
        const item = request.items.find((row) => row.id === itemId);
        if (item && next.action !== 'REJECT' && next.action !== 'REMOVE') {
          const qty = Number(patch.approvedQuantity);
          if (Number.isFinite(qty) && qty > 0) {
            next.action = 'APPROVE';
          }
        }
      }
      return { ...current, [itemId]: next };
    });
  }

  function buildLineReviewPayload(item: RequestItem, decision: LineDecision) {
    if (decision.action === 'REJECT' || decision.action === 'REMOVE') {
      return {
        action: decision.action,
        approvedQuantity: 0,
        publicComment: decision.publicComment.trim() || undefined,
      };
    }
    return {
      action: 'APPROVE',
      approvedQuantity: decision.approvedQuantity,
      publicComment: decision.publicComment.trim() || undefined,
    };
  }

  async function submitLineReview(
    item: RequestItem,
    action?: LineReviewAction,
    overrideApprovedQuantity?: number,
    overridePublicComment?: string,
  ) {
    if (!request || submitting || submittingLineId) return;
    const stockLoaded = request.hqStockStatus !== 'unavailable';
    const decision = lineDecisions[item.id] ?? defaultLineDecision(item, stockLoaded);
    const finalAction = action ?? decision.action;
    const resolvedDecision: LineDecision =
      finalAction === 'APPROVE'
        ? {
            action: 'APPROVE',
            approvedQuantity: overrideApprovedQuantity ?? decision.approvedQuantity,
            publicComment: overridePublicComment ?? decision.publicComment,
          }
        : {
            action: finalAction,
            approvedQuantity: 0,
            publicComment: overridePublicComment ?? decision.publicComment,
          };

    if (resolvedDecision.action === 'APPROVE') {
      const validationError = validateApprovedQuantityForApprove(t, item, resolvedDecision.approvedQuantity);
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    if (
      (resolvedDecision.action === 'REJECT' || resolvedDecision.action === 'REMOVE') &&
      !resolvedDecision.publicComment.trim()
    ) {
      setError(t('branchProductRequest.commentRequired'));
      return;
    }

    setError('');
    setSuccess('');
    setSubmittingLineId(item.id);
    try {
      const detail = await apiFetch<RequestDetail>(
        `/branch-purchase-requests/${request.id}/items/${item.id}/review`,
        {
          method: 'POST',
          body: JSON.stringify(buildLineReviewPayload(item, resolvedDecision)),
        },
      );
      setRequest(detail);
      setLineDecisions(buildLineDecisionsFromItems(detail.items, detail.hqStockStatus !== 'unavailable'));
      setSuccess(t('branchProductRequest.lineReviewSaved'));
    } catch (err) {
      setError(localizeBranchRequestError(err instanceof Error ? err.message : t('common.error')));
    } finally {
      setSubmittingLineId(null);
    }
  }

  function setLineAction(item: RequestItem, action: LineReviewAction) {
    if (action === 'APPROVE') {
      const decision = lineDecisions[item.id] ?? defaultLineDecision(item, request?.hqStockStatus !== 'unavailable');
      const validationError = validateApprovedQuantityForApprove(t, item, decision.approvedQuantity);
      if (validationError) {
        setError(validationError);
        return;
      }
      updateLineDecision(item.id, {
        action: 'APPROVE',
        approvedQuantity: decision.approvedQuantity,
        publicComment: decision.publicComment,
      });
      void submitLineReview(item, 'APPROVE', decision.approvedQuantity);
      return;
    }
    const comment = lineDecisions[item.id]?.publicComment ?? '';
    updateLineDecision(item.id, { action, approvedQuantity: 0, publicComment: comment });
    void submitLineReview(item, action, undefined, comment);
  }

  async function confirmBranchOrder() {
    if (!request || submitting) return;
    setError('');
    setSuccess('');
    setSubmitting(true);
    try {
      await apiFetch(`/branch-purchase-requests/${request.id}/confirm`, { method: 'POST', body: JSON.stringify({}) });
      setSuccess(t('branchProductRequest.branchConfirmed'));
      await load();
    } catch (err) {
      setError(localizeBranchRequestError(err instanceof Error ? err.message : t('common.error')));
    } finally {
      setSubmitting(false);
    }
  }

  async function declineBranchOrder() {
    if (!request || submitting) return;
    setError('');
    setSuccess('');
    setSubmitting(true);
    try {
      await apiFetch(`/branch-purchase-requests/${request.id}/decline`, { method: 'POST', body: JSON.stringify({}) });
      setSuccess(t('branchProductRequest.branchDeclined'));
      await load();
    } catch (err) {
      setError(localizeBranchRequestError(err instanceof Error ? err.message : t('common.error')));
    } finally {
      setSubmitting(false);
    }
  }

  async function submitReview() {
    if (!request || submitting) return;

    const pendingItems = request.items.filter((item) => item.lineStatus === 'PENDING_REVIEW');
    if (pendingItems.length > 0) {
      setError(t('branchProductRequest.allLinesMustBeReviewed'));
      return;
    }

    const hasApproved = request.items.some((item) => (item.approvedQuantity ?? 0) > 0);
    if (!hasApproved) {
      setError(t('branchProductRequest.noApprovedItems'));
      return;
    }

    setError('');
    setSuccess('');
    setSubmitting(true);
    try {
      const body = {
        items: request.items.map((item) => {
          const decision = lineDecisions[item.id] ?? defaultLineDecision(item, hqStockLoaded);
          return {
            id: item.id,
            ...buildLineReviewPayload(item, decision),
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
    } finally {
      setSubmitting(false);
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
  const canActOnRequest = canManage && !isExecutiveBranchOrderInspector(user);
  const executiveCompactView = isExecutiveBranchOrderInspector(user);
  const canCreate = canManageOwnBranchProductRequest(user);
  const canView = canViewBranchPurchaseRequests(user);
  const canSeeHqStock = canSeeHqStockInBranchRequests(user);
  const canViewCost = canViewProductCost(user);
  const hqStockLoaded = request?.hqStockStatus !== 'unavailable';
  const branchOnlyView = !canSeeHqStock;
  const branchSalesManagerView = isBranchSalesManagerUser(user);
  const hqSalesView = isHqSalesManagerUser(user);
  const hqCompactTable = hqSalesView && !executiveCompactView;
  const listHref = '/branch-purchase-requests';
  const listLabel = hqSalesView ? t('operations.hqBranchRequests') : t('operations.branchPurchaseRequests');

  const reviewable = useMemo(() => request && isSubmittedStatus(request.status), [request]);
  const reviewed = useMemo(() => request && (Boolean(request.reviewedAt) || isReviewedStatus(request.status)), [request]);
  const branchOrderTotalOptions = useMemo(
    () =>
      request
        ? {
            requestStatus: request.status,
            reviewed: Boolean(reviewed),
            totalEstimatedAmount: request.totalEstimatedAmount,
          }
        : undefined,
    [request, reviewed],
  );
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

  const detailBody = (
    <>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            {!branchSalesManagerView ? (
              <Link href={listHref} className="text-sm font-semibold text-blue-600">
                ← {listLabel}
              </Link>
            ) : null}
            {!branchSalesManagerView ? (
              <h2 className="mt-2 text-3xl font-bold text-slate-950">{request.requestNumber}</h2>
            ) : null}
            <p className={`${branchSalesManagerView ? '' : 'mt-1'} text-sm text-slate-500`}>{resolveRequestStatusLabel(t, request, branchOnlyView)}</p>
            {request.partialFulfillmentMessage ? (
              <p className="mt-2 text-sm text-amber-700">{t('branchProductRequest.partialFulfillmentLater')}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {canActOnRequest && reviewable ? (
              <>
                <button type="button" disabled={submitting} onClick={() => void submitReview()} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                  {t('branchProductRequest.submitReview')}
                </button>
                <button type="button" disabled={submitting} onClick={() => void rejectWholeRequest()} className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 disabled:opacity-60">
                  {t('branchProductRequest.rejectWholeRequest')}
                </button>
              </>
            ) : null}
            {canCreate && request.status === 'PENDING_BRANCH_CONFIRMATION' ? (
              <>
                <button type="button" disabled={submitting} onClick={() => void confirmBranchOrder()} className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                  {submitting ? t('common.loading') : t('branchProductRequest.confirmOrder')}
                </button>
                <button type="button" disabled={submitting} onClick={() => void declineBranchOrder()} className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 disabled:opacity-60">
                  {t('branchProductRequest.declineOrder')}
                </button>
              </>
            ) : null}
            {canActOnRequest && (request.status === 'PAYMENT_CONFIRMED' || request.status === 'READY_FOR_HQ_WAREHOUSE') ? (
              <button type="button" onClick={() => void sendToHqWarehouse()} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
                {t('branchHqRouting.sendToWarehouseAfterPayment')}
              </button>
            ) : null}
            {canActOnRequest && request.status === 'PAYMENT_CONFIRMED' ? (
              <p className="rounded-xl bg-green-50 px-4 py-2 text-sm font-semibold text-green-700">
                {t('branchHqRouting.paymentConfirmedBanner')}
              </p>
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
          {!hqSalesView ? (
            <div>
              <p className="text-xs font-bold uppercase text-slate-400">{t('distribution.branch')}</p>
              <p className="mt-1 font-semibold text-slate-900">{branchName}</p>
            </div>
          ) : null}
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
          {!branchOnlyView && canViewCost ? (
            <div>
              <p className="text-xs font-bold uppercase text-slate-400">{t('branchProductRequest.totalProductCost')}</p>
              <p className="mt-1 font-semibold text-slate-900">
                {formatKgs(request.totalProductCostKgs)} KGS
              </p>
            </div>
          ) : null}
          {!branchOnlyView ? (
            <div>
              <p className="text-xs font-bold uppercase text-slate-400">
                {hqSalesView ? t('branchProductRequest.orderAmount') : t('branchProductRequest.estimatedAmount')}
              </p>
              <p className="mt-1 font-semibold text-slate-900">
                {formatKgs(hqSalesView ? hqReviewOrderAmount(request.items) : request.totalEstimatedAmount)} KGS
              </p>
            </div>
          ) : branchSalesManagerView ? (
            <div>
              <p className="text-xs font-bold uppercase text-slate-400">{t('branchProductRequest.totalAmount')}</p>
              <p className="mt-1 font-semibold text-slate-900">
                {formatKgs(branchOrderTotal(request.items, branchOrderTotalOptions))} KGS
              </p>
            </div>
          ) : (
            <div>
              <p className="text-xs font-bold uppercase text-slate-400">{t('branchProductRequest.totalAmount')}</p>
              <p className="mt-1 font-semibold text-slate-900">
                {formatKgs(branchOrderTotal(request.items, branchOrderTotalOptions))} KGS
              </p>
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

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          {branchSalesManagerView ? (
            <table className="w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">{t('sales.product')}</th>
                  <th className="px-4 py-3">{t('distribution.quantity')}</th>
                  <th className="px-4 py-3 text-right">{t('branchProductRequest.branchPurchasePrice')}</th>
                  <th className="px-4 py-3 text-right">{t('branchProductRequest.totalAmount')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {request.items.map((item) => {
                  const branchPriceLabel = formatFrozenBranchPrice(item, t);
                  const showKgsSuffix =
                    branchPriceLabel !== t('branchProductRequest.pricingPending');
                  const displayQuantity = getBranchOrderDisplayQuantity(item, { reviewed: Boolean(reviewed) });
                  return (
                  <tr key={item.id}>
                    <td className="px-4 py-3 font-semibold text-slate-900">{item.productName}</td>
                    <td className="px-4 py-3 tabular-nums">{displayQuantity}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {branchPriceLabel}
                      {showKgsSuffix ? ' KGS' : null}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
                      {formatLineTotalKgs(item, branchOrderTotalOptions)} KGS
                    </td>
                  </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t border-slate-200 bg-slate-50">
                <tr>
                  <td colSpan={3} className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">
                    {t('branchProductRequest.totalAmount')}
                  </td>
                  <td className="px-4 py-3 text-right text-base font-bold tabular-nums text-slate-900">
                    {formatOrderTotalKgs(request.items, branchOrderTotalOptions)} KGS
                  </td>
                </tr>
              </tfoot>
            </table>
          ) : executiveCompactView ? (
            <table className="w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">{t('sales.product')}</th>
                  <th className="hidden px-3 py-2 sm:table-cell">{t('inventory.sku')}</th>
                  <th className="px-3 py-2">{t('branchProductRequest.requestedQuantity')}</th>
                  <th className="px-3 py-2">{t('branchProductRequest.branchPurchasePrice')}</th>
                  <th className="px-3 py-2">{t('branchProductRequest.totalAmount')}</th>
                  <th className="px-3 py-2">{t('distribution.status')}</th>
                  <th className="px-3 py-2">{t('branchProductRequest.hqComment')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {request.items.map((item) => (
                  <tr key={item.id}>
                    <td className="max-w-[10rem] truncate px-3 py-2 font-semibold text-slate-900" title={item.productName}>
                      {item.productName}
                    </td>
                    <td className="hidden px-3 py-2 text-slate-600 sm:table-cell">{item.sku}</td>
                    <td className="px-3 py-2">{item.quantity}</td>
                    <td className="px-3 py-2">{formatFrozenBranchPrice(item, t)}</td>
                    <td className="px-3 py-2">{formatKgs(item.totalAmount ?? branchOrderLineTotal(item, branchOrderTotalOptions))}</td>
                    <td className="px-3 py-2">
                      {translateStatus(t, item.lineStatus ?? request.status, 'branchRequestLine')}
                    </td>
                    <td className="max-w-[12rem] truncate px-3 py-2 text-slate-600" title={item.publicComment ?? undefined}>
                      {item.publicComment ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : hqCompactTable && canSeeHqStock ? (
          <table className="w-full table-auto divide-y divide-slate-200 text-xs">
            <thead className="bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="min-w-[6rem] w-auto px-2 py-1.5 align-top">{t('branchProductRequest.hqCompact.product')}</th>
                <th className="w-0 whitespace-nowrap px-1 py-1.5 text-center">{t('branchProductRequest.hqCompact.unit')}</th>
                <th className="w-0 whitespace-nowrap px-2 py-1.5 text-center" title={t('branchProductRequest.hqCompact.tooltip.requested')}>{t('branchProductRequest.hqCompact.requested')}</th>
                <th className="w-0 whitespace-nowrap px-2 py-1.5 text-center" title={t('branchProductRequest.hqCompact.tooltip.hqPhysicalStock')}>{t('branchProductRequest.hqCompact.hqPhysicalStock')}</th>
                <th className="w-0 whitespace-nowrap px-2 py-1.5" title={t('branchProductRequest.hqCompact.tooltip.pricingPolicy')}>{t('branchProductRequest.hqCompact.pricingPolicy')}</th>
                <th className="w-0 whitespace-nowrap px-2 py-1.5 text-center" title={t('branchProductRequest.hqCompact.tooltip.approved')}>{t('branchProductRequest.hqCompact.approved')}</th>
                <th className="w-0 whitespace-nowrap px-2 py-1.5 text-center" title={t('branchProductRequest.hqCompact.tooltip.branchStock')}>{t('branchProductRequest.hqCompact.branchStock')}</th>
                <th className="w-0 whitespace-nowrap px-2 py-1.5 text-right" title={t('branchProductRequest.hqCompact.tooltip.requestTotal')}>{t('branchProductRequest.hqCompact.requestTotal')}</th>
                {canActOnRequest && reviewable ? (
                  <th className="sticky right-0 w-0 whitespace-nowrap bg-slate-50 px-2 py-1.5">{t('branchProductRequest.hqCompact.actions')}</th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {request.items.map((item) => {
                const decision = lineDecisions[item.id] ?? defaultLineDecision(item, hqStockLoaded);
                const hasPolicy = item.pricingPolicyAvailable !== false;

                return (
                  <tr key={item.id} className={hqSalesReviewLineRowClass(item.lineStatus)}>
                    <td className="min-w-[6rem] w-auto px-2 py-1.5 align-top">
                      <p className="whitespace-normal break-normal break-words font-semibold leading-snug text-slate-900">{item.productName}</p>
                      <p className="truncate text-[10px] text-slate-500" title={item.sku}>{item.sku}</p>
                    </td>
                    <td className="w-0 whitespace-nowrap px-1 py-1.5 text-center">{formatProductUnit(item.unit, language, t)}</td>
                    <td className="w-0 whitespace-nowrap px-2 py-1.5 text-center tabular-nums">{item.quantity}</td>
                    <td className="w-0 whitespace-nowrap px-2 py-1.5 text-center tabular-nums">{formatHqStockCell(item.hqPhysicalStock, hqStockLoaded, t)}</td>
                    <td className="w-0 whitespace-nowrap px-2 py-1.5">
                      {hasPolicy ? (
                        <span className="text-green-700">{t('branchProductRequest.pricingPolicyOk')}</span>
                      ) : (
                        <span className="font-semibold text-amber-700">{t('branchProductRequest.pricingPolicyMissing')}</span>
                      )}
                    </td>
                    <td className="w-0 whitespace-nowrap px-2 py-1.5 text-center tabular-nums">
                      {canActOnRequest && reviewable ? (
                        <input
                          type="number"
                          min="0"
                          max={item.quantity}
                          value={decision.approvedQuantity}
                          onChange={(event) =>
                            updateLineDecision(item.id, { approvedQuantity: Number(event.target.value) })
                          }
                          onClick={(event) => event.stopPropagation()}
                          className="w-14 rounded border border-slate-300 px-1 py-0.5 text-xs"
                        />
                      ) : (
                        item.approvedQuantity ?? '-'
                      )}
                    </td>
                    <td className="w-0 whitespace-nowrap px-2 py-1.5 text-center tabular-nums">{item.currentBranchStock ?? '-'}</td>
                    <td className="w-0 whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{formatKgs(hqReviewLineAmount(item))}</td>
                    {canActOnRequest && reviewable ? (
                      <td className={`${hqSalesReviewLineStickyCellClass(item.lineStatus)} w-0 whitespace-nowrap px-2 py-1.5`} onClick={(event) => event.stopPropagation()}>
                        <div className="flex min-w-[7.5rem] flex-col gap-1">
                          <div className="flex flex-wrap gap-0.5">
                            <button
                              type="button"
                              disabled={!hasPolicy || submittingLineId === item.id || submitting}
                              onClick={() => setLineAction(item, 'APPROVE')}
                              className={`rounded px-1 py-0.5 text-[10px] font-semibold ${decision.action === 'APPROVE' ? 'bg-green-600 text-white' : 'border border-slate-300'} disabled:opacity-40`}
                            >
                              {t('branchProductRequest.hqCompact.actionApproveShort')}
                            </button>
                            <button
                              type="button"
                              disabled={submittingLineId === item.id || submitting}
                              onClick={() => setLineAction(item, 'REJECT')}
                              className={`rounded px-1 py-0.5 text-[10px] font-semibold ${decision.action === 'REJECT' ? 'bg-red-600 text-white' : 'border border-slate-300'}`}
                            >
                              {t('branchProductRequest.hqCompact.actionRejectShort')}
                            </button>
                          </div>
                          {decision.action === 'REJECT' || decision.action === 'REMOVE' ? (
                            <textarea
                              value={decision.publicComment}
                              onChange={(event) => updateLineDecision(item.id, { publicComment: event.target.value })}
                              placeholder={t('branchProductRequest.publicCommentPlaceholder')}
                              className="w-full rounded border border-slate-300 px-1 py-0.5 text-[10px]"
                              rows={1}
                            />
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
          ) : (
          <table className={`w-full divide-y divide-slate-200 ${hqCompactTable ? 'text-xs' : 'text-sm'}`}>
            <thead className={`bg-slate-50 text-left font-bold uppercase tracking-wide text-slate-500 ${hqCompactTable ? 'text-[10px]' : 'text-xs'}`}>
              <tr>
                <th className={hqDetailThClass(hqCompactTable)}>{hqDetailLabel(t, hqCompactTable, 'product', 'sales.product')}</th>
                <th className={`${hqDetailThClass(hqCompactTable)} text-center`}>{hqDetailLabel(t, hqCompactTable, 'requested', 'branchProductRequest.requestedQuantity')}</th>
                {canSeeHqStock ? (
                  <>
                    <th className={`${hqDetailThClass(hqCompactTable)} text-center`}>{hqDetailLabel(t, hqCompactTable, 'booked', 'branchProductRequest.bookedQuantity')}</th>
                    <th className={`${hqDetailThClass(hqCompactTable)} text-center`}>{hqDetailLabel(t, hqCompactTable, 'hqPhysicalStock', 'branchProductRequest.physicalStock')}</th>
                    <th className={`${hqDetailThClass(hqCompactTable)} text-center`}>{hqDetailLabel(t, hqCompactTable, 'available', 'branchProductRequest.availableQuantity')}</th>
                    <th className={`${hqDetailThClass(hqCompactTable)} text-center`}>{hqDetailLabel(t, hqCompactTable, 'availableForRequest', 'branchProductRequest.availableForRequest')}</th>
                    <th className={hqDetailThClass(hqCompactTable)}>{hqDetailLabel(t, hqCompactTable, 'pricingPolicy', 'branchProductRequest.pricingPolicyStatus')}</th>
                    <th className={`${hqDetailThClass(hqCompactTable)} text-center`}>{hqDetailLabel(t, hqCompactTable, 'approved', 'branchProductRequest.approvedQuantity')}</th>
                    <th className={`${hqDetailThClass(hqCompactTable)} text-center`}>{hqDetailLabel(t, hqCompactTable, 'missing', 'branchProductRequest.missingQuantity')}</th>
                  </>
                ) : reviewed ? (
                  <>
                    <th className={hqDetailThClass(hqCompactTable)}>{t('branchProductRequest.approvedQuantity')}</th>
                    <th className={hqDetailThClass(hqCompactTable)}>{t('branchProductRequest.missingQuantity')}</th>
                    <th className={hqDetailThClass(hqCompactTable)}>{t('distribution.status')}</th>
                    <th className={hqDetailThClass(hqCompactTable)}>{t('inventoryCount.rejectionReason')}</th>
                    <th className={hqDetailThClass(hqCompactTable)}>{t('crm.notes')}</th>
                  </>
                ) : (
                  <th className={hqDetailThClass(hqCompactTable)}>{t('distribution.quantity')}</th>
                )}
                <th className={`${hqDetailThClass(hqCompactTable)} text-center`}>{hqDetailLabel(t, hqCompactTable, 'unit', 'branchProductRequest.unit')}</th>
                {!branchOnlyView ? <th className={`${hqDetailThClass(hqCompactTable)} text-center`}>{hqDetailLabel(t, hqCompactTable, 'branchStock', 'branchProductRequest.branchStock')}</th> : null}
                {canActOnRequest && reviewable ? <th className={`${hqDetailThClass(hqCompactTable)} ${hqCompactTable ? 'sticky right-0 bg-slate-50' : ''}`}>{hqDetailLabel(t, hqCompactTable, 'actions', 'common.actions')}</th> : null}
                {!branchOnlyView && reviewable ? (
                  <>
                    <th className={`${hqDetailThClass(hqCompactTable)} text-right`}>{hqDetailLabel(t, hqCompactTable, 'branchPrice', 'branchProductRequest.branchPurchasePrice')}</th>
                    <th className={`${hqDetailThClass(hqCompactTable)} text-right`}>{hqDetailLabel(t, hqCompactTable, 'requestTotal', 'branchProductRequest.requestLineTotal')}</th>
                    <th className={`${hqDetailThClass(hqCompactTable)} text-right`}>{hqDetailLabel(t, hqCompactTable, 'approvedTotal', 'branchProductRequest.approvedLineTotal')}</th>
                  </>
                ) : null}
                {!branchOnlyView && !reviewable ? (
                  <>
                    <th className={hqDetailThClass(hqCompactTable)}>{t('branchProductRequest.wholesalePrice')}</th>
                    {canViewCost ? (
                      <>
                        <th className={hqDetailThClass(hqCompactTable)}>{t('branchProductRequest.transportAllocation')}</th>
                        <th className={hqDetailThClass(hqCompactTable)}>{t('branchProductRequest.estimatedUnitCost')}</th>
                        <th className={hqDetailThClass(hqCompactTable)}>{t('branchProductRequest.totalProductCost')}</th>
                      </>
                    ) : null}
                  </>
                ) : null}
                {branchOnlyView && !reviewed ? (
                  <>
                    <th className={hqDetailThClass(hqCompactTable)}>{t('branchProductRequest.branchPurchasePrice')}</th>
                    <th className={hqDetailThClass(hqCompactTable)}>{t('branchProductRequest.totalAmount')}</th>
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

                return (
                  <tr key={item.id}>
                    <td className={hqDetailTdClass(hqCompactTable, 'max-w-[9rem]')}>
                      <p className="truncate font-semibold text-slate-900" title={item.productName}>{item.productName}</p>
                      {!branchSalesManagerView ? (
                        <p className="truncate text-[10px] text-slate-500" title={item.sku}>{item.sku}</p>
                      ) : null}
                    </td>
                    <td className={hqDetailTdClass(hqCompactTable, 'text-center tabular-nums')}>{item.quantity}</td>
                    {canSeeHqStock ? (
                      <>
                        <td className={hqDetailTdClass(hqCompactTable, 'text-center tabular-nums')}>{formatHqStockCell(item.bookedQuantity, hqStockLoaded, t)}</td>
                        <td className={hqDetailTdClass(hqCompactTable, 'text-center tabular-nums')}>{formatHqStockCell(item.hqPhysicalStock, hqStockLoaded, t)}</td>
                        <td className={hqDetailTdClass(hqCompactTable, 'text-center tabular-nums')}>
                          {hqStockLoaded ? (
                            <span className={(generalAvailable ?? 0) <= 0 ? 'font-semibold text-red-600' : ''}>
                              {generalAvailable}
                            </span>
                          ) : (
                            formatHqStockCell(null, false, t)
                          )}
                        </td>
                        <td className={hqDetailTdClass(hqCompactTable, 'text-center tabular-nums')}>
                          {hqStockLoaded ? (
                            <span className={available <= 0 ? 'font-semibold text-red-600' : 'font-semibold text-green-700'}>
                              {available}
                            </span>
                          ) : (
                            formatHqStockCell(null, false, t)
                          )}
                        </td>
                        <td className={hqDetailTdClass(hqCompactTable)}>
                          {hasPolicy ? (
                            <span className="text-green-700">{t('branchProductRequest.pricingPolicyOk')}</span>
                          ) : (
                            <span className="font-semibold text-amber-700">{t('branchProductRequest.pricingPolicyMissing')}</span>
                          )}
                        </td>
                        <td className={hqDetailTdClass(hqCompactTable, 'text-center tabular-nums')}>
                          {canActOnRequest && reviewable ? (
                            decision.action === 'REJECT' || decision.action === 'REMOVE' ? (
                              '0'
                            ) : (
                              <input
                                type="number"
                                min="1"
                                max={item.quantity}
                                value={decision.approvedQuantity}
                                onChange={(event) =>
                                  updateLineDecision(item.id, { approvedQuantity: Number(event.target.value) })
                                }
                                className={`rounded-lg border border-slate-300 ${hqCompactTable ? 'w-14 px-1 py-0.5 text-xs' : 'w-24 px-2 py-1'}`}
                              />
                            )
                          ) : (
                            item.approvedQuantity ?? '-'
                          )}
                        </td>
                        <td className={hqDetailTdClass(hqCompactTable, 'text-center tabular-nums')}>{missing}</td>
                      </>
                    ) : reviewed ? (
                      <>
                        <td className={hqDetailTdClass(hqCompactTable)}>{item.approvedQuantity ?? 0}</td>
                        <td className={hqDetailTdClass(hqCompactTable)}>{missing}</td>
                        <td className={hqDetailTdClass(hqCompactTable)}>
                          {translateStatus(t, item.lineStatus ?? request.status, 'branchRequestLine')}
                        </td>
                        <td className={hqDetailTdClass(hqCompactTable, 'text-slate-700')}>
                          {translateRejectionReason(t, item.rejectionReasonCode)}
                        </td>
                        <td className={hqDetailTdClass(hqCompactTable, 'text-slate-600')}>{item.publicComment ?? '—'}</td>
                      </>
                    ) : (
                      <td className={hqDetailTdClass(hqCompactTable)}>{item.quantity}</td>
                    )}
                    <td className={hqDetailTdClass(hqCompactTable, 'text-center')}>{item.unit}</td>
                    {!branchOnlyView ? <td className={hqDetailTdClass(hqCompactTable, 'text-center tabular-nums')}>{item.currentBranchStock ?? '-'}</td> : null}
                    {canActOnRequest && reviewable ? (
                      <td className={hqDetailTdClass(hqCompactTable, hqCompactTable ? 'sticky right-0 bg-white' : '')}>
                        <div className={`flex flex-col gap-1 ${hqCompactTable ? 'min-w-[8rem]' : 'min-w-[12rem] gap-2'}`}>
                          <div className="flex flex-wrap gap-0.5">
                            <button
                              type="button"
                              disabled={!hasPolicy || submittingLineId === item.id || submitting}
                              onClick={() => setLineAction(item, 'APPROVE')}
                              className={`rounded font-semibold ${hqCompactTable ? 'px-1 py-0.5 text-[10px]' : 'rounded-lg px-2 py-1 text-xs'} ${decision.action === 'APPROVE' ? 'bg-green-600 text-white' : 'border border-slate-300'} disabled:opacity-40`}
                            >
                              {t('branchProductRequest.actionApprove')}
                            </button>
                            <button
                              type="button"
                              disabled={submittingLineId === item.id || submitting}
                              onClick={() => setLineAction(item, 'REJECT')}
                              className={`rounded font-semibold ${hqCompactTable ? 'px-1 py-0.5 text-[10px]' : 'rounded-lg px-2 py-1 text-xs'} ${decision.action === 'REJECT' ? 'bg-red-600 text-white' : 'border border-slate-300'}`}
                            >
                              {t('branchProductRequest.actionReject')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setLineAction(item, 'REMOVE')}
                              className={`rounded font-semibold ${hqCompactTable ? 'px-1 py-0.5 text-[10px]' : 'rounded-lg px-2 py-1 text-xs'} ${decision.action === 'REMOVE' ? 'bg-slate-700 text-white' : 'border border-slate-300'}`}
                            >
                              {t('branchProductRequest.actionRemove')}
                            </button>
                          </div>
                          {decision.action === 'REJECT' || decision.action === 'REMOVE' ? (
                            <textarea
                              value={decision.publicComment}
                              onChange={(event) => updateLineDecision(item.id, { publicComment: event.target.value })}
                              placeholder={t('branchProductRequest.publicCommentPlaceholder')}
                              className="w-full rounded-lg border border-slate-300 px-2 py-1 text-xs"
                              rows={hqCompactTable ? 1 : 2}
                            />
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                    {!branchOnlyView && reviewable ? (
                      <>
                        <td className={hqDetailTdClass(hqCompactTable, 'text-right tabular-nums')}>{formatFrozenBranchPrice(item, t)}</td>
                        <td className={hqDetailTdClass(hqCompactTable, 'text-right tabular-nums')}>{formatKgs(requestLineTotal(item))}</td>
                        <td className={hqDetailTdClass(hqCompactTable, 'text-right font-semibold tabular-nums text-slate-900')}>
                          {formatKgs(approvedLineTotal(item, approvedValue))}
                        </td>
                      </>
                    ) : null}
                    {!branchOnlyView && !reviewable ? (
                      <>
                        <td className={hqDetailTdClass(hqCompactTable, 'text-right tabular-nums')}>{formatKgs(item.wholesalePriceKgs)}</td>
                        {canViewCost ? (
                          <>
                            <td className={hqDetailTdClass(hqCompactTable, 'text-right tabular-nums')}>{formatKgs(item.transportExpenseAllocation)}</td>
                            <td className={hqDetailTdClass(hqCompactTable, 'text-right tabular-nums')}>{formatKgs(item.estimatedUnitCost)}</td>
                            <td className={hqDetailTdClass(hqCompactTable, 'text-right tabular-nums')}>
                              {formatKgs(item.estimatedLineProductCostKgs)}
                            </td>
                          </>
                        ) : null}
                      </>
                    ) : null}
                    {branchOnlyView && !reviewed ? (
                      <>
                        <td className={hqDetailTdClass(hqCompactTable, 'text-right tabular-nums')}>{formatFrozenBranchPrice(item, t)}</td>
                        <td className={hqDetailTdClass(hqCompactTable, 'text-right tabular-nums')}>{formatKgs(requestLineTotal(item))}</td>
                      </>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
          )}
        </div>
    </>
  );

  return (
    <ProtectedShell>
      {branchSalesManagerView ? (
        <BranchProductOrdersSection user={user} title={request.requestNumber}>
          {detailBody}
        </BranchProductOrdersSection>
      ) : hqSalesView ? (
        <HqSalesBranchOrdersSection>{detailBody}</HqSalesBranchOrdersSection>
      ) : (
        <section className="space-y-6">{detailBody}</section>
      )}
    </ProtectedShell>
  );
}
