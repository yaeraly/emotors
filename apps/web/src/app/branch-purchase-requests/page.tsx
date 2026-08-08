'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { BranchProductOrdersSection } from '@/components/BranchProductOrdersSection';
import { ModuleSectionNav } from '@/components/ModuleSectionNav';
import { HqSalesBranchOrdersSection } from '@/components/HqSalesBranchOrdersSection';
import {
  HqSalesBranchOrdersTabContent,
  HqSalesListEmptyState,
  HqSalesListFilterGrid,
  HqSalesListLoadingState,
  HqSalesListTableCard,
  hqSalesListFilterControlClass,
  hqSalesListTableClass,
  hqSalesListTableHeadClass,
  hqSalesListTableTdClass,
  hqSalesListTableThClass,
} from '@/components/HqSalesListLayout';
import { BRANCH_PRODUCT_ORDERS_LIST_HREF } from '@/lib/branch-product-orders-nav';
import { BranchProductSearch, type BranchProductOption, isBranchPriceConfigured, parseBranchMoney, resolveBranchDisplayPrice } from '@/components/BranchProductSearch';
import { branchPurchaseRequestsTitleKey } from '@/lib/distribution-labels';
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
  isExecutiveBranchOrderInspector,
  isHqSalesManagerUser,
  shouldShowBranchColumnForBranchScopedTables,
} from '@/lib/rbac';
import type { Branch, User, Warehouse } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';
import { translateStatus } from '@/lib/translate-status';
import { draftFormLineTotal, draftFormOrderTotal } from '@/lib/branch-purchase-request-display.util';
import { formatKgsLocalized } from '@/lib/money';

type RequestItem = {
  id?: string;
  productId: string;
  sku: string;
  productName: string;
  quantity: number;
  approvedQuantity?: number | null;
  unit: string;
  currentBranchStock: number;
  hqAvailableStock?: number | null;
  wholesalePriceKgs: number;
  branchPurchasePriceKgs?: number;
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
  /** Authoritative backend line total (FIFO / payable). Never recompute from unit×qty. */
  authoritativeLineTotalKgs: number | null;
  pricingPending: boolean;
  priceResolving: boolean;
  branchStock: number | null;
  hqStock: number | null;
  quantity: string;
  note: string;
};

function formatBranchPrice(line: DraftLine, t: (key: string) => string) {
  if (!line.productId) return '—';
  if (line.priceResolving) {
    return (
      <span className="inline-flex items-center gap-1 text-slate-500">
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
        {t('common.loading')}
      </span>
    );
  }
  const branchPrice = parseBranchMoney(line.branchPurchasePriceKgs);
  if (line.pricingPending || branchPrice == null) {
    return t('branchProductRequest.priceNotConfigured');
  }
  return `${branchPrice.toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} сом`;
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
    authoritativeLineTotalKgs: null,
    pricingPending: false,
    priceResolving: false,
    branchStock: 0,
    hqStock: null,
    quantity: '1',
    note: '',
  };
}

function linesFromRequest(request: BranchPurchaseRequest): DraftLine[] {
  if (!request.items.length) return [emptyLine()];
  return request.items.map((item) => {
    const branchPrice =
      item.branchPurchasePriceKgs != null && Number(item.branchPurchasePriceKgs) > 0
        ? Number(item.branchPurchasePriceKgs)
        : item.wholesalePriceKgs > 0
          ? Number(item.wholesalePriceKgs)
          : null;
    return {
      key: item.id ?? `${item.productId}-${Math.random()}`,
      productId: item.productId,
      productName: item.productName,
      sku: item.sku,
      unit: item.unit || 'pcs',
      weightKg: item.weightKg ?? 0,
      branchPurchasePriceKgs: branchPrice,
      wholesalePriceKgs: branchPrice,
      authoritativeLineTotalKgs:
        item.totalAmount != null && Number(item.totalAmount) > 0 ? Number(item.totalAmount) : null,
      pricingPending: branchPrice == null,
      priceResolving: false,
      branchStock: item.currentBranchStock ?? 0,
      hqStock: item.hqAvailableStock ?? null,
      quantity: String(item.quantity),
      note: item.note ?? '',
    };
  });
}

function isSubmittedStatus(status: string) {
  return status === 'SUBMITTED' || status === 'SUBMITTED_TO_HQ';
}

function totalRequestedQuantity(request: BranchPurchaseRequest) {
  return request.totalQuantity ?? request.items.reduce((sum, item) => sum + item.quantity, 0);
}

function totalApprovedQuantity(request: BranchPurchaseRequest) {
  return request.items.reduce((sum, item) => sum + (item.approvedQuantity ?? 0), 0);
}

function matchesPaymentStatusFilter(status: string, filter: string) {
  if (!filter) return true;
  if (filter === 'PENDING_PAYMENT') return status === 'PENDING_PAYMENT';
  if (filter === 'PAYMENT_CONFIRMED') {
    return status === 'PAYMENT_CONFIRMED' || status === 'READY_FOR_HQ_WAREHOUSE' || status === 'SENT_TO_HQ_WAREHOUSE';
  }
  if (filter === 'UNPAID') {
    return !['PENDING_PAYMENT', 'PAYMENT_CONFIRMED', 'READY_FOR_HQ_WAREHOUSE', 'SENT_TO_HQ_WAREHOUSE', 'COMPLETED', 'RECEIVED'].includes(status);
  }
  return true;
}

function hqThClass(compact: boolean) {
  return compact ? 'px-2 py-1.5 whitespace-nowrap' : 'px-4 py-3';
}

function hqTdClass(compact: boolean, extra = '') {
  return compact ? `px-2 py-1.5 ${extra}`.trim() : `px-4 py-3 ${extra}`.trim();
}

function hqOrderRowHint(t: (key: string) => string, status: string) {
  return isSubmittedStatus(status)
    ? t('operations.hqBranchOrdersRow.reviewHint')
    : t('operations.hqBranchOrdersRow.openHint');
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
  return (
    <Suspense
      fallback={
        <ProtectedShell>
          <p className="text-slate-600">Loading…</p>
        </ProtectedShell>
      }
    >
      <BranchPurchaseRequestsPageInner />
    </Suspense>
  );
}

function BranchPurchaseRequestsPageInner() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const productSearchRef = useRef<HTMLInputElement>(null);
  const [requests, setRequests] = useState<BranchPurchaseRequest[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchWarehouses, setBranchWarehouses] = useState<Warehouse[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showFormLocal, setShowFormLocal] = useState(false);
  const [formDirty, setFormDirty] = useState(false);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [form, setForm] = useState({
    branchId: '',
    branchWarehouseId: '',
    note: '',
  });
  const [listFilters, setListFilters] = useState({
    search: '',
    branchId: '',
    status: '',
    paymentStatus: '',
    dateFrom: '',
    dateTo: '',
  });
  const emptyListFilters = {
    search: '',
    branchId: '',
    status: '',
    paymentStatus: '',
    dateFrom: '',
    dateTo: '',
  };
  function resolveFormBranchContext(
    me: User,
    branchList: Branch[],
    bwList: Warehouse[],
  ): { branchId: string; branchWarehouseId: string } {
    const branchId = isBranchSalesManagerUser(me)
      ? (me.branchId ?? '')
      : (me.branchId || branchList[0]?.id || '');
    const branchWarehouseId =
      bwList.find((warehouse) => warehouse.branchId === branchId)?.id ?? bwList[0]?.id ?? '';
    return { branchId, branchWarehouseId };
  }

  async function load() {
    setLoading(true);
    setListError('');
    try {
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
      const { branchId, branchWarehouseId } = resolveFormBranchContext(me, branchList, bwList);
      setForm((current) => ({
        ...current,
        branchId: isBranchSalesManagerUser(me) ? branchId : current.branchId || branchId,
        branchWarehouseId: isBranchSalesManagerUser(me)
          ? branchWarehouseId
          : current.branchWarehouseId || branchWarehouseId,
      }));
    } catch (err) {
      setListError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  function addProductFromSearch(product: BranchProductOption) {
    if (!isBranchPriceConfigured(product)) {
      setError(t('branchProductRequest.priceNotConfigured'));
      return;
    }
    const branchPrice = resolveBranchDisplayPrice(product);
    if (branchPrice === null || branchPrice === undefined) {
      setError(t('branchProductRequest.priceNotConfigured'));
      return;
    }
    setError('');
    markFormDirty();
    setLines((current) => {
      const existing = current.find((line) => line.productId === product.id && line.productId);
      if (existing) {
        return current.map((line) =>
          line.productId === product.id
            ? {
                ...line,
                quantity: String(Number(line.quantity) + 1),
                branchPurchasePriceKgs: branchPrice ?? line.branchPurchasePriceKgs,
                wholesalePriceKgs: branchPrice ?? line.wholesalePriceKgs,
                authoritativeLineTotalKgs: null,
                pricingPending: false,
                priceResolving: true,
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
        branchPurchasePriceKgs: branchPrice,
        wholesalePriceKgs: branchPrice,
        authoritativeLineTotalKgs: null,
        pricingPending: false,
        priceResolving: true,
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
    markFormDirty();
    setLines((current) => (current.length <= 1 ? current : current.filter((line) => line.key !== key)));
  }

  function resetCreateForm() {
    setEditingDraftId(null);
    setLines([emptyLine()]);
    setForm((current) => ({ ...current, note: '' }));
    setFormDirty(false);
    setError('');
    if (branchSalesManagerView) {
      router.push(BRANCH_PRODUCT_ORDERS_LIST_HREF);
      return;
    }
    setShowFormLocal(false);
  }

  function openNewRequestForm() {
    setError('');
    setSuccess('');
    if (branchSalesManagerView) {
      router.push(`${BRANCH_PRODUCT_ORDERS_LIST_HREF}?new=1`);
      return;
    }
    setEditingDraftId(null);
    setLines([emptyLine()]);
    setForm((current) => ({ ...current, note: '' }));
    setFormDirty(false);
    setShowFormLocal(true);
  }

  function openDraftForEdit(request: BranchPurchaseRequest) {
    if (request.status !== 'DRAFT') {
      openRequest(request.id);
      return;
    }
    if (branchSalesManagerView) {
      router.push(`${BRANCH_PRODUCT_ORDERS_LIST_HREF}?draft=${request.id}`);
      return;
    }
    setEditingDraftId(request.id);
    setForm({
      branchId: isBranchSalesManagerUser(user) ? (user?.branchId ?? request.branchId) : request.branchId,
      branchWarehouseId: isBranchSalesManagerUser(user)
        ? (branchWarehouses.find((warehouse) => warehouse.branchId === user?.branchId)?.id ??
          request.branchWarehouseId ??
          form.branchWarehouseId)
        : (request.branchWarehouseId ?? form.branchWarehouseId),
      note: request.note ?? '',
    });
    setLines(linesFromRequest(request));
    setError('');
    setSuccess('');
    setFormDirty(false);
    setShowFormLocal(true);
  }

  function handleCancelCreate() {
    if (formDirty && !window.confirm(t('procurement.transport.unsavedChanges'))) {
      return;
    }
    resetCreateForm();
  }

  function markFormDirty() {
    setFormDirty(true);
  }

  function buildItemsPayload() {
    const validLines = lines.filter((line) => line.productId && Number(line.quantity) > 0);
    if (!validLines.length) {
      throw new Error(t('branchProductRequest.validation.productsRequired'));
    }
    return validLines.map((line) => ({
      productId: line.productId,
      quantity: Number(line.quantity),
      note: line.note || undefined,
    }));
  }

  function buildPayload(asDraft: boolean) {
    const payload = {
      note: form.note,
      status: asDraft ? 'DRAFT' : 'SUBMITTED_TO_HQ',
      items: buildItemsPayload(),
    };
    if (isBranchSalesManagerUser(user)) {
      return payload;
    }
    return {
      ...payload,
      branchId: form.branchId,
      branchWarehouseId: form.branchWarehouseId,
    };
  }

  function buildUpdatePayload() {
    const payload = {
      note: form.note,
      items: buildItemsPayload(),
    };
    if (isBranchSalesManagerUser(user)) {
      return payload;
    }
    return {
      ...payload,
      branchWarehouseId: form.branchWarehouseId,
    };
  }

  async function saveDraftChanges(event: FormEvent) {
    event.preventDefault();
    const activeDraftId = branchSalesManagerView ? draftIdFromUrl : editingDraftId;
    if (!activeDraftId) return;
    setError('');
    try {
      const payload = buildUpdatePayload();
      await apiFetch(`/branch-purchase-requests/${activeDraftId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      setSuccess(t('branchProductRequest.saveChangesSuccess'));
      await load();
      if (branchSalesManagerView) {
        resetCreateForm();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.error');
      setError(localizeBranchRequestError(message));
    }
  }

  async function submitRequest(event: FormEvent, asDraft = false) {
    event.preventDefault();
    if (submitting) return;
    const activeDraftId = branchSalesManagerView ? draftIdFromUrl : editingDraftId;
    setError('');
    setSuccess('');
    setSubmitting(true);
    try {
      if (activeDraftId) {
        const payload = buildUpdatePayload();
        await apiFetch(`/branch-purchase-requests/${activeDraftId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        if (asDraft) {
          setSuccess(t('branchProductRequest.saveChangesSuccess'));
          await load();
          if (branchSalesManagerView) {
            resetCreateForm();
          }
          return;
        }
        await apiFetch(`/branch-purchase-requests/${activeDraftId}/submit`, { method: 'POST' });
        setSuccess(t('distribution.branchOrderSubmitted'));
        resetCreateForm();
        await load();
        return;
      }

      const payload = buildPayload(asDraft);
      await apiFetch('/branch-purchase-requests', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setSuccess(asDraft ? t('distribution.saveDraft') : t('distribution.branchOrderSubmitted'));
      resetCreateForm();
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.error');
      const localized = localizeBranchRequestError(message);
      setError(
        localized !== message
          ? localized
          : asDraft
            ? message
            : t('branchProductRequest.submitFailed'),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function submitDraft(id: string) {
    if (submitting) return;
    setError('');
    setSubmitting(true);
    try {
      await apiFetch(`/branch-purchase-requests/${id}/submit`, { method: 'POST' });
      setSuccess(t('distribution.branchOrderSubmitted'));
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.error');
      setError(localizeBranchRequestError(message));
    } finally {
      setSubmitting(false);
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
  const canActOnRequests = canManage && !isExecutiveBranchOrderInspector(user);
  const canCreate = canManageOwnBranchProductRequest(user);
  const canView = canViewBranchPurchaseRequests(user);
  const canSeeHqStock = canSeeHqStockInBranchRequests(user);
  const branchOnlyView = !canSeeHqStock;
  const branchSalesManagerView = isBranchSalesManagerUser(user);
  const isCreateMode = searchParams.get('new') === '1';
  const draftIdFromUrl = searchParams.get('draft') ?? null;
  const showFormFromUrl = branchSalesManagerView && (isCreateMode || Boolean(draftIdFromUrl));
  const showForm = branchSalesManagerView ? showFormFromUrl : showFormLocal;
  const branchWarehouseView = isBranchWarehouseOperator(user);
  const branchOwnerView = isBranchOwnerUser(user);
  const showBranchColumn = shouldShowBranchColumnForBranchScopedTables(user);
  const hqSalesView = isHqSalesManagerUser(user);
  const ceoInspectorView = isExecutiveBranchOrderInspector(user);
  const detailHref = (requestId: string) => `/branch-purchase-requests/${requestId}`;
  const activeEditingDraftId = branchSalesManagerView ? draftIdFromUrl : editingDraftId;
  const activeFormBranchId = branchSalesManagerView ? (user?.branchId ?? form.branchId) : form.branchId;

  useEffect(() => {
    if (!branchSalesManagerView) return;
    if (isCreateMode) {
      setEditingDraftId(null);
      setLines([emptyLine()]);
      setForm((current) => ({
        ...current,
        note: '',
        branchId: user?.branchId ?? current.branchId,
        branchWarehouseId:
          branchWarehouses.find((warehouse) => warehouse.branchId === user?.branchId)?.id ??
          current.branchWarehouseId,
      }));
      setFormDirty(false);
      setError('');
      return;
    }
    if (!draftIdFromUrl) return;
    const request = requests.find((row) => row.id === draftIdFromUrl);
    if (!request) return;
    if (request.status !== 'DRAFT') {
      router.replace(detailHref(request.id));
      return;
    }
    setEditingDraftId(request.id);
    setForm({
      branchId: isBranchSalesManagerUser(user) ? (user?.branchId ?? request.branchId) : request.branchId,
      branchWarehouseId: isBranchSalesManagerUser(user)
        ? (branchWarehouses.find((warehouse) => warehouse.branchId === user?.branchId)?.id ??
          request.branchWarehouseId ??
          form.branchWarehouseId)
        : (request.branchWarehouseId ?? form.branchWarehouseId),
      note: request.note ?? '',
    });
    setLines(linesFromRequest(request));
    setFormDirty(false);
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchSalesManagerView, draftIdFromUrl, isCreateMode, requests]);

  const visibleRequests = useMemo(() => {
    if (!ceoInspectorView && !hqSalesView) return requests;
    const search = listFilters.search.trim().toLowerCase();
    return requests.filter((request) => {
      const matchesSearch =
        !search ||
        request.requestNumber.toLowerCase().includes(search) ||
        (branches.find((branch) => branch.id === request.branchId)?.name ?? '').toLowerCase().includes(search);
      const matchesBranch = !listFilters.branchId || request.branchId === listFilters.branchId;
      const matchesStatus = !listFilters.status || request.status === listFilters.status;
      const matchesPayment = matchesPaymentStatusFilter(request.status, listFilters.paymentStatus);
      const createdAt = new Date(request.createdAt);
      const matchesFrom = !listFilters.dateFrom || createdAt >= new Date(`${listFilters.dateFrom}T00:00:00`);
      const matchesTo = !listFilters.dateTo || createdAt <= new Date(`${listFilters.dateTo}T23:59:59`);
      return matchesSearch && matchesBranch && matchesStatus && matchesPayment && matchesFrom && matchesTo;
    });
  }, [branches, ceoInspectorView, hqSalesView, listFilters, requests]);

  function openRequest(requestId: string) {
    if (!requestId) return;
    router.push(detailHref(requestId));
  }

  function handleRequestRowActivate(request: BranchPurchaseRequest) {
    if (request.status === 'DRAFT' && canCreate) {
      openDraftForEdit(request);
      return;
    }
    openRequest(request.id);
  }

  function handleOrderRowKeyDown(event: KeyboardEvent, request: BranchPurchaseRequest) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleRequestRowActivate(request);
    }
  }
  const draftProductIds = lines
    .map((line) => line.productId)
    .filter(Boolean)
    .join(',');
  const draftQuantities = lines
    .filter((line) => line.productId)
    .map((line) => String(Number(line.quantity) || 0))
    .join(',');

  useEffect(() => {
    if (!showForm || !branchOnlyView || !activeFormBranchId || !draftProductIds) return;

    const quantityList = draftQuantities.split(',').map((value) => Number(value) || 0);

    setLines((current) =>
      current.map((line) => {
        if (!line.productId) return line;
        return { ...line, priceResolving: true, pricingPending: false };
      }),
    );

    type BranchProductPricingSnapshot = {
      branchPriceKgs: number | string | null;
      hasPricingPolicy?: boolean;
      priceConfigured?: boolean;
      lineTotalKgs?: number | string | null;
    };

    const params = new URLSearchParams({
      branchId: activeFormBranchId,
      productIds: draftProductIds,
      quantities: quantityList.join(','),
    });
    void apiFetch<Record<string, BranchProductPricingSnapshot | number | null>>(
      `/branch-purchase-requests/product-prices?${params.toString()}`,
    )
      .then((prices) => {
        setLines((current) =>
          current.map((line) => {
            if (!line.productId || prices[line.productId] === undefined) return line;
            const entry = prices[line.productId];
            const branchPrice = parseBranchMoney(
              typeof entry === 'number' || entry === null ? entry : entry?.branchPriceKgs ?? null,
            );
            const hasPricing =
              typeof entry === 'object' && entry != null && entry.priceConfigured === true
                ? true
                : typeof entry === 'object' && entry != null && entry.priceConfigured === false
                  ? false
                  : typeof entry === 'object' && entry != null && 'hasPricingPolicy' in entry
                    ? Boolean(entry.hasPricingPolicy)
                    : branchPrice != null;
            const lineTotalFromApi =
              typeof entry === 'object' && entry != null && entry.lineTotalKgs != null
                ? Number(entry.lineTotalKgs)
                : null;
            return {
              ...line,
              branchPurchasePriceKgs: branchPrice,
              wholesalePriceKgs: branchPrice,
              // Prefer live API line total; keep prior authoritative total when API omits it
              // (HQ at-cost must not fall back to rounded unit × qty).
              authoritativeLineTotalKgs:
                lineTotalFromApi != null && Number.isFinite(lineTotalFromApi) && lineTotalFromApi > 0
                  ? lineTotalFromApi
                  : line.authoritativeLineTotalKgs,
              pricingPending: !hasPricing,
              priceResolving: false,
            };
          }),
        );
      })
      .catch(() => {
        setLines((current) =>
          current.map((line) =>
            line.productId
              ? { ...line, priceResolving: false, pricingPending: line.branchPurchasePriceKgs == null }
              : line,
          ),
        );
      });
  }, [branchOnlyView, draftProductIds, draftQuantities, activeFormBranchId, showForm]);

  const draftTotalAmount = draftFormOrderTotal(lines);

  if (user && !canView) {
    return (
      <ProtectedShell>
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{t('common.forbiddenMessage')}</p>
      </ProtectedShell>
    );
  }

  const pageBody = (
    <>
        {ceoInspectorView ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-end gap-3">
              <label className="min-w-[10rem] flex-1">
                <span className="text-xs font-semibold uppercase text-slate-500">{t('common.search')}</span>
                <input
                  value={listFilters.search}
                  onChange={(e) => setListFilters((current) => ({ ...current, search: e.target.value }))}
                  placeholder={t('branchProductRequest.requestNumber')}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="min-w-[10rem]">
                <span className="text-xs font-semibold uppercase text-slate-500">{t('distribution.branch')}</span>
                <select
                  value={listFilters.branchId}
                  onChange={(e) => setListFilters((current) => ({ ...current, branchId: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">{t('common.all')}</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
              </label>
              <label className="min-w-[10rem]">
                <span className="text-xs font-semibold uppercase text-slate-500">{t('distribution.status')}</span>
                <select
                  value={listFilters.status}
                  onChange={(e) => setListFilters((current) => ({ ...current, status: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">{t('common.all')}</option>
                  {['DRAFT', 'SUBMITTED_TO_HQ', 'PENDING_BRANCH_CONFIRMATION', 'PAYMENT_CONFIRMED', 'READY_FOR_HQ_WAREHOUSE', 'COMPLETED', 'REJECTED', 'CANCELLED'].map((status) => (
                    <option key={status} value={status}>{translateStatus(t, status)}</option>
                  ))}
                </select>
              </label>
              <label className="min-w-[10rem]">
                <span className="text-xs font-semibold uppercase text-slate-500">{t('procurement.payments.paymentStatus')}</span>
                <select
                  value={listFilters.paymentStatus}
                  onChange={(e) => setListFilters((current) => ({ ...current, paymentStatus: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">{t('common.all')}</option>
                  <option value="UNPAID">{t('paymentStatus.DEBT')}</option>
                  <option value="PENDING_PAYMENT">{translateStatus(t, 'PENDING_PAYMENT')}</option>
                  <option value="PAYMENT_CONFIRMED">{translateStatus(t, 'PAYMENT_CONFIRMED')}</option>
                </select>
              </label>
              <label className="min-w-[9rem]">
                <span className="text-xs font-semibold uppercase text-slate-500">{t('chinaReceiving.dateFrom')}</span>
                <input
                  type="date"
                  value={listFilters.dateFrom}
                  onChange={(e) => setListFilters((current) => ({ ...current, dateFrom: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="min-w-[9rem]">
                <span className="text-xs font-semibold uppercase text-slate-500">{t('chinaReceiving.dateTo')}</span>
                <input
                  type="date"
                  value={listFilters.dateTo}
                  onChange={(e) => setListFilters((current) => ({ ...current, dateTo: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
            </div>
          </div>
        ) : null}

        {hqSalesView && !showForm ? (
          <HqSalesBranchOrdersTabContent
            error={listError}
            filters={
              <HqSalesListFilterGrid onClear={() => setListFilters(emptyListFilters)}>
                <input
                  value={listFilters.search}
                  onChange={(e) => setListFilters((current) => ({ ...current, search: e.target.value }))}
                  placeholder={t('branchProductRequest.requestNumber')}
                  className={hqSalesListFilterControlClass}
                />
                <select
                  value={listFilters.branchId}
                  onChange={(e) => setListFilters((current) => ({ ...current, branchId: e.target.value }))}
                  className={hqSalesListFilterControlClass}
                >
                  <option value="">{t('common.all')} {t('distribution.branch')}</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
                <select
                  value={listFilters.status}
                  onChange={(e) => setListFilters((current) => ({ ...current, status: e.target.value }))}
                  className={hqSalesListFilterControlClass}
                >
                  <option value="">{t('common.all')} {t('distribution.status')}</option>
                  {['DRAFT', 'SUBMITTED_TO_HQ', 'PENDING_BRANCH_CONFIRMATION', 'PAYMENT_CONFIRMED', 'READY_FOR_HQ_WAREHOUSE', 'COMPLETED', 'REJECTED', 'CANCELLED'].map((status) => (
                    <option key={status} value={status}>{translateStatus(t, status)}</option>
                  ))}
                </select>
                <select
                  value={listFilters.paymentStatus}
                  onChange={(e) => setListFilters((current) => ({ ...current, paymentStatus: e.target.value }))}
                  className={hqSalesListFilterControlClass}
                >
                  <option value="">{t('common.all')} {t('procurement.payments.paymentStatus')}</option>
                  <option value="UNPAID">{t('paymentStatus.DEBT')}</option>
                  <option value="PENDING_PAYMENT">{translateStatus(t, 'PENDING_PAYMENT')}</option>
                  <option value="PAYMENT_CONFIRMED">{translateStatus(t, 'PAYMENT_CONFIRMED')}</option>
                </select>
                <input
                  type="date"
                  value={listFilters.dateFrom}
                  onChange={(e) => setListFilters((current) => ({ ...current, dateFrom: e.target.value }))}
                  className={hqSalesListFilterControlClass}
                />
                <input
                  type="date"
                  value={listFilters.dateTo}
                  onChange={(e) => setListFilters((current) => ({ ...current, dateTo: e.target.value }))}
                  className={hqSalesListFilterControlClass}
                />
              </HqSalesListFilterGrid>
            }
          >
            {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
            {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}
            <HqSalesListTableCard>
              {loading ? (
                <HqSalesListLoadingState message={t('operations.hqBranchOrdersLoading')} />
              ) : visibleRequests.length === 0 ? (
                <HqSalesListEmptyState message={t('operations.hqBranchOrdersEmpty')} />
              ) : (
                <table className={hqSalesListTableClass}>
                  <thead className={hqSalesListTableHeadClass}>
                    <tr>
                      <th className={hqSalesListTableThClass}>{t('operations.hqBranchOrdersTable.number')}</th>
                      {showBranchColumn ? (
                        <th className={hqSalesListTableThClass}>{t('operations.hqBranchOrdersTable.branch')}</th>
                      ) : null}
                      <th className={hqSalesListTableThClass}>{t('operations.hqBranchOrdersTable.status')}</th>
                      <th className={`${hqSalesListTableThClass} text-center`} title={t('operations.hqBranchOrdersTable.positionsTooltip')}>{t('operations.hqBranchOrdersTable.positions')}</th>
                      <th className={`${hqSalesListTableThClass} text-center`} title={t('operations.hqBranchOrdersTable.quantityTooltip')}>{t('operations.hqBranchOrdersTable.quantity')}</th>
                      <th className={`${hqSalesListTableThClass} text-right`} title={t('operations.hqBranchOrdersTable.amountTooltip')}>{t('operations.hqBranchOrdersTable.amount')}</th>
                      <th className={hqSalesListTableThClass} title={t('operations.hqBranchOrdersTable.dateTooltip')}>{t('operations.hqBranchOrdersTable.date')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleRequests.map((request) => {
                      const branchName = branches.find((branch) => branch.id === request.branchId)?.name ?? request.branchId;
                      return (
                        <tr
                          key={request.id}
                          onClick={() => handleRequestRowActivate(request)}
                          onKeyDown={(event) => handleOrderRowKeyDown(event, request)}
                          tabIndex={0}
                          role="link"
                          title={hqOrderRowHint(t, request.status)}
                          className="cursor-pointer hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                        >
                          <td className={`${hqSalesListTableTdClass} font-bold text-blue-700`}>{request.requestNumber}</td>
                          {showBranchColumn ? (
                            <td className={`${hqSalesListTableTdClass} max-w-[7rem] truncate`} title={String(branchName)}>{branchName}</td>
                          ) : null}
                          <td className={hqSalesListTableTdClass}>{resolveRequestStatusLabel(t, request, branchOnlyView)}</td>
                          <td className={`${hqSalesListTableTdClass} text-center tabular-nums`}>{request.items.length}</td>
                          <td className={`${hqSalesListTableTdClass} text-center tabular-nums`}>{totalRequestedQuantity(request)}</td>
                          <td className={`${hqSalesListTableTdClass} text-right tabular-nums`}>{Number(request.totalEstimatedAmount ?? 0).toFixed(2)}</td>
                          <td className={`${hqSalesListTableTdClass} whitespace-nowrap`}>{new Date(request.createdAt).toLocaleDateString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </HqSalesListTableCard>
          </HqSalesBranchOrdersTabContent>
        ) : null}

        {error && !hqSalesView ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {!hqSalesView && listError ? (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{listError}</p>
        ) : null}
        {success && !hqSalesView ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}

        {showForm ? (
          <form onSubmit={(event) => event.preventDefault()} className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            {activeEditingDraftId ? (
              <p className="text-sm font-semibold text-slate-600">
                {t('branchProductRequest.editingDraft')}:{' '}
                {requests.find((row) => row.id === activeEditingDraftId)?.requestNumber ?? activeEditingDraftId}
              </p>
            ) : null}
            {!branchSalesManagerView ? (
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
                      markFormDirty();
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
                    onChange={(e) => {
                      markFormDirty();
                      setForm({ ...form, branchWarehouseId: e.target.value });
                    }}
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
            ) : null}

            <BranchProductSearch
              inputRef={productSearchRef}
              branchId={activeFormBranchId}
              onSelect={addProductFromSearch}
            />

            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">{t('sales.product')}</th>
                    {branchOnlyView && !branchSalesManagerView ? (
                      <th className="px-3 py-2">{t('branchProductRequest.productSearch.sku')}</th>
                    ) : null}
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
                      {branchOnlyView && !branchSalesManagerView ? (
                        <td className="px-3 py-2 text-slate-700">{line.sku || '—'}</td>
                      ) : null}
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="1"
                          value={line.quantity}
                          disabled={!line.productId}
                          onChange={(e) => {
                            markFormDirty();
                            setLines((current) =>
                              current.map((row) =>
                                row.key === line.key
                                  ? {
                                      ...row,
                                      quantity: e.target.value,
                                      authoritativeLineTotalKgs: null,
                                      priceResolving: Boolean(row.productId),
                                    }
                                  : row,
                              ),
                            );
                          }}
                          className="w-24 rounded-lg border border-slate-300 px-2 py-1"
                        />
                      </td>
                      {!branchOnlyView ? <td className="px-3 py-2">{line.unit}</td> : null}
                      {!branchOnlyView ? <td className="px-3 py-2">{line.branchStock}</td> : null}
                      <td className="px-3 py-2">
                        {formatBranchPrice(line, t)}
                      </td>
                      {branchOnlyView ? (
                        <td className="px-3 py-2 font-semibold text-slate-900">
                          {formatKgsLocalized(draftFormLineTotal(line))}{' '}
                          сом
                        </td>
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
                <span className="ml-3 text-lg font-bold text-slate-950">{formatKgsLocalized(draftTotalAmount)} KGS</span>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => {
                markFormDirty();
                setLines((current) => [...current, emptyLine()]);
              }}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold"
            >
              {t('branchProductRequest.addRow')}
            </button>

            <label className="block">
              <span className="text-sm font-semibold text-slate-700">{t('crm.notes')}</span>
              <textarea
                value={form.note}
                onChange={(e) => {
                  markFormDirty();
                  setForm({ ...form, note: e.target.value });
                }}
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                rows={2}
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={submitting} onClick={(event) => void submitRequest(event, false)} className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-60">{t('distribution.submitOrder')}</button>
              {activeEditingDraftId ? (
                <button type="button" onClick={(event) => void saveDraftChanges(event)} disabled={submitting} className="rounded-xl border border-slate-300 px-4 py-2 font-semibold disabled:opacity-60">
                  {t('branchProductRequest.saveChanges')}
                </button>
              ) : (
                <button type="button" onClick={(event) => void submitRequest(event, true)} disabled={submitting} className="rounded-xl border border-slate-300 px-4 py-2 font-semibold disabled:opacity-60">{t('distribution.saveDraft')}</button>
              )}
              <button type="button" onClick={() => handleCancelCreate()} className="rounded-xl border border-slate-300 px-4 py-2 font-semibold">{t('common.cancel')}</button>
            </div>
          </form>
        ) : null}

        {!hqSalesView && !(showForm && (branchSalesManagerView || hqSalesView)) ? (
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
          {loading ? (
            <p className="px-6 py-10 text-sm text-slate-600">{t('common.loading')}</p>
          ) : !listError && visibleRequests.length === 0 ? (
            <p className="px-6 py-10 text-sm text-slate-600">{t('operations.branchPurchaseRequestsEmpty')}</p>
          ) : (
          <table className="w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className={hqThClass(false)}>#</th>
                {showBranchColumn ? (
                  <th className={hqThClass(false)}>{t('distribution.branch')}</th>
                ) : null}
                {ceoInspectorView ? (
                  <th className={hqThClass(false)}>{t('common.createdDate')}</th>
                ) : null}
                {!ceoInspectorView ? <th className={hqThClass(false)}>{t('distribution.status')}</th> : null}
                <th className={hqThClass(false)}>{t('distribution.items')}</th>
                {ceoInspectorView ? (
                  <>
                    <th className={hqThClass(false)}>{t('branchProductRequest.totalQuantity')}</th>
                    <th className={hqThClass(false)}>{t('branchProductRequest.approvedQuantity')}</th>
                    <th className={hqThClass(false)}>{t('branchProductRequest.estimatedAmount')}</th>
                    <th className={hqThClass(false)}>{t('distribution.status')}</th>
                  </>
                ) : branchOnlyView ? (
                  <th className={hqThClass(false)}>{t('branchProductRequest.totalAmount')}</th>
                ) : null}
                {!ceoInspectorView ? <th className={hqThClass(false)}>{t('common.createdDate')}</th> : null}
                <th className={hqThClass(false)}>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleRequests.map((request) => {
                const branchName = branches.find((branch) => branch.id === request.branchId)?.name ?? request.branchId;
                return (
                <tr
                  key={request.id}
                  onClick={() => handleRequestRowActivate(request)}
                  onKeyDown={(event) => handleOrderRowKeyDown(event, request)}
                  tabIndex={0}
                  role="link"
                  className="cursor-pointer hover:bg-slate-50"
                >
                  <td className={hqTdClass(false, 'font-bold text-blue-700')}>
                    {request.requestNumber}
                  </td>
                  {showBranchColumn ? (
                    <td className={hqTdClass(false, 'max-w-[7rem] truncate')} title={String(branchName)}>
                      {branchName}
                    </td>
                  ) : null}
                  {ceoInspectorView ? (
                    <td className={hqTdClass(false)}>{new Date(request.createdAt).toLocaleDateString()}</td>
                  ) : null}
                  {!ceoInspectorView ? (
                    <td className={hqTdClass(false)}>{resolveRequestStatusLabel(t, request, branchOnlyView)}</td>
                  ) : null}
                  <td className={hqTdClass(false, 'text-center tabular-nums')}>{request.items.length}</td>
                  {ceoInspectorView ? (
                    <>
                      <td className={hqTdClass(false)}>{totalRequestedQuantity(request)}</td>
                      <td className={hqTdClass(false)}>{totalApprovedQuantity(request)}</td>
                      <td className={hqTdClass(false)}>{Number(request.totalEstimatedAmount ?? 0).toFixed(2)}</td>
                      <td className={hqTdClass(false)}>{resolveRequestStatusLabel(t, request, false)}</td>
                    </>
                  ) : branchOnlyView ? (
                    <td className={hqTdClass(false)}>{Number(request.totalEstimatedAmount ?? 0).toFixed(2)}</td>
                  ) : null}
                  {!ceoInspectorView ? (
                    <td className={hqTdClass(false, 'whitespace-nowrap')}>{new Date(request.createdAt).toLocaleDateString()}</td>
                  ) : null}
                  <td className={hqTdClass(false)} onClick={(event) => event.stopPropagation()}>
                    <div className="flex flex-wrap gap-2">
                      {request.status === 'DRAFT' && canCreate ? (
                        <button
                          type="button"
                          onClick={() => openDraftForEdit(request)}
                          className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold"
                        >
                          {t('common.open')}
                        </button>
                      ) : (
                        <Link href={detailHref(request.id)} className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold">
                          {t('common.open')}
                        </Link>
                      )}
                      {canCreate && request.status === 'DRAFT' ? (
                        <>
                          <button type="button" onClick={() => void submitDraft(request.id)} className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white">{t('distribution.submitOrder')}</button>
                          <button type="button" onClick={() => void cancelRequest(request.id)} className="rounded-lg border border-red-200 px-3 py-1 text-xs font-semibold text-red-600">{t('common.cancel')}</button>
                        </>
                      ) : null}
                      {canCreate && isSubmittedStatus(request.status) ? (
                        <button type="button" onClick={() => void cancelRequest(request.id)} className="rounded-lg border border-red-200 px-3 py-1 text-xs font-semibold text-red-600">{t('common.cancel')}</button>
                      ) : null}
                      {canActOnRequests && isSubmittedStatus(request.status) ? (
                        <>
                          <Link href={detailHref(request.id)} className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white">
                            {t('branchProductRequest.reviewRequest')}
                          </Link>
                          <button type="button" onClick={() => void review(request.id, 'reject')} className="rounded-lg border border-red-200 px-3 py-1 text-xs font-semibold text-red-600">{t('distribution.reject')}</button>
                        </>
                      ) : null}
                      {canActOnRequests && (request.status === 'PAYMENT_CONFIRMED' || request.status === 'READY_FOR_HQ_WAREHOUSE') ? (
                        <button type="button" onClick={() => void sendToHqWarehouse(request.id)} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{t('branchHqRouting.sendToWarehouseAfterPayment')}</button>
                      ) : null}
                      {request.convertedOrderId && !branchSalesManagerView && !branchOwnerView ? (
                        <Link href={`/distribution/orders/${request.convertedOrderId}`} className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold">{t('scm.hub.distribution.shipmentOrders')}</Link>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
          )}
        </div>
        ) : null}
    </>
  );

  return (
    <ProtectedShell>
      {hqSalesView ? (
        <HqSalesBranchOrdersSection
          actions={
            canCreate && !showForm ? (
              <button type="button" onClick={() => openNewRequestForm()} className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white">
                {t('branchProductRequest.newRequest')}
              </button>
            ) : null
          }
        >
          {pageBody}
        </HqSalesBranchOrdersSection>
      ) : branchSalesManagerView ? (
        <BranchProductOrdersSection
          user={user}
          actions={
            canCreate && !showForm ? (
              <button type="button" onClick={() => openNewRequestForm()} className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white">
                {t('branchProductRequest.newRequest')}
              </button>
            ) : null
          }
        >
          {pageBody}
        </BranchProductOrdersSection>
      ) : (
        <section className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t(branchPurchaseRequestsTitleKey(user))}</p>
              <h2 className="text-3xl font-bold text-slate-950">
                {ceoInspectorView ? t('nav.hqBranchOrders') : t('operations.branchPurchaseRequests')}
              </h2>
            </div>
            {canCreate && !showForm ? (
              <button type="button" onClick={() => openNewRequestForm()} className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white">
                {t('branchProductRequest.newRequest')}
              </button>
            ) : null}
          </div>
          {!branchSalesManagerView && !branchWarehouseView && !branchOwnerView && !ceoInspectorView ? (
            <ModuleSectionNav sections={distributionHubSections} />
          ) : null}
          {pageBody}
        </section>
      )}
    </ProtectedShell>
  );
}
