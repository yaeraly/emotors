'use client';

import { Suspense, useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  FinanceEmptyState,
  FinanceErrorState,
  FinanceLayout,
  FinanceLoadingState,
} from '@/components/finance/FinanceLayout';
import { ImagePreviewModal } from '@/components/ImagePreviewModal';
import { InvoiceReceiptHistoryPanel } from '@/components/InvoiceReceiptHistoryPanel';
import { HqPaymentPermanentDeleteModal, type HqPaymentDeleteSummary } from '@/components/HqPaymentPermanentDeleteModal';
import { API_URL, apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';
import { canCreateSupplierPayment, canPermanentDeleteBusinessData } from '@/lib/rbac';
import {
  deriveSupplierPaymentMethodFromAccountType,
  derivedSupplierPaymentMethodLabelKey,
} from '@/lib/supplier-payment-method-from-account';
import {
  getCargoBillActionVisibility,
  resolveBillRemainingForActions,
} from '@/lib/cargo-bill-actions';
import {
  formatBillCorrectionRoutingAssignee,
  type BillCorrectionRouting,
} from '@/lib/bill-correction-routing';
import {
  formatKgsPreview,
  normalizeExchangeRateInput,
  parseExchangeRateInput,
  previewCnyToKgs,
} from '@/lib/supplier-payment-cny-preview.util';
import type { User } from '@/lib/types';

type BillSource = 'SUPPLIER_INVOICE' | 'TRANSPORT_EXPENSE' | 'FINANCE_EXPENSE';

type BillRow = {
  id: string;
  source: BillSource;
  requestNumber: string;
  requestType: string;
  submittedAt: string | null;
  sender: { id: string; fullName: string; role?: string | null } | null;
  departmentOrBranch: string | null;
  recipientName: string;
  basis: string;
  amount: number;
  currency: string;
  estimatedAmountKgs: number;
  paidAmount: number;
  paidAmountKgs: number;
  remainingAmount: number;
  remainingAmountKgs: number;
  status: string;
  isOverdue: boolean;
  nextPaymentDate?: string | null;
  paymentPostponeComment?: string | null;
  relatedOrderNumber?: string | null;
  href: string;
  correctionRouting?: BillCorrectionRouting;
};

type BillsResponse = {
  items: BillRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  summary: {
    awaitingCount: number;
    partiallyPaidCount: number;
    postponedCount?: number;
    overdueCount: number;
    totalPayableKgs: number;
  };
};

type BillDetail = BillRow & {
  detail?: any;
};

const REQUEST_TYPES = [
  'SUPPLIER_PAYMENT',
  'CHINA_DOMESTIC_TRANSPORT',
  'CARGO_PAYMENT',
  'KYRGYZSTAN_DOMESTIC_TRANSPORT',
  'OTHER_PROCUREMENT_EXPENSE',
  'PRODUCT_PURCHASE',
  'SERVICE_PAYMENT',
  'EMPLOYEE_REIMBURSEMENT',
  'OTHER_EXPENSE',
] as const;

const STATUS_FILTERS = [
  'AWAITING_ACCOUNTANT',
  'UNDER_REVIEW',
  'RETURNED',
  'APPROVED',
  'PARTIALLY_PAID',
  'PAYMENT_POSTPONED',
  'FULLY_PAID',
  'REJECTED',
  'CANCELLED',
] as const;

const emptyFilters = {
  requestType: '',
  status: '',
  currency: '',
  senderId: '',
  departmentOrBranch: '',
  recipient: '',
  search: '',
  dateFrom: '',
  dateTo: '',
};

function isSupplierAccountantBill(bill: {
  source?: string | null;
  requestType?: string | null;
  detail?: { requestType?: string | null } | null;
}): boolean {
  const requestType = String(bill.requestType || bill.detail?.requestType || '');
  return bill.source === 'SUPPLIER_INVOICE' || requestType === 'SUPPLIER_PAYMENT';
}

function isCargoOrSupplierAccountantBill(bill: {
  source?: string | null;
  requestType?: string | null;
  detail?: { requestType?: string | null } | null;
}): boolean {
  const requestType = String(bill.requestType || bill.detail?.requestType || '');
  return (
    bill.source === 'SUPPLIER_INVOICE' ||
    requestType === 'SUPPLIER_PAYMENT' ||
    requestType === 'CARGO_PAYMENT'
  );
}

export default function BillsToPayPage() {
  return (
    <Suspense fallback={null}>
      <BillsToPayPageContent />
    </Suspense>
  );
}

function BillsToPayPageContent() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<BillsResponse | null>(null);
  const [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<BillDetail | null>(null);
  const [actionError, setActionError] = useState('');
  const [saving, setSaving] = useState(false);
  const [reasonModal, setReasonModal] = useState<{ mode: 'return' | 'reject'; bill: BillRow } | null>(null);
  const [reason, setReason] = useState('');
  const [paymentModal, setPaymentModal] = useState<BillRow | null>(null);
  const [editingPayment, setEditingPayment] = useState<any | null>(null);
  const [transportApproveModal, setTransportApproveModal] = useState<BillDetail | null>(null);
  const [transportApproveForm, setTransportApproveForm] = useState({
    financeAccountId: '',
    exchangeRateCnyKgs: '',
    accountantComment: '',
  });
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    exchangeRate: '',
    financeAccountId: '',
    recipientName: '',
    accountantComment: '',
  });
  const [accounts, setAccounts] = useState<
    Array<{ id: string; name: string; availableBalance: number; typeCode?: string }>
  >([]);
  const [paymentFormError, setPaymentFormError] = useState('');
  const [qrPreview, setQrPreview] = useState<{
    images: Array<{ src: string; alt?: string; label?: string }>;
    initialIndex: number;
  } | null>(null);
  const [paymentDeleteContext, setPaymentDeleteContext] = useState<{
    bill: BillDetail;
    payment?: Record<string, unknown>;
  } | null>(null);
  const [postponeModal, setPostponeModal] = useState<BillDetail | null>(null);
  const [postponeForm, setPostponeForm] = useState({ nextPaymentDate: '', reason: '', comment: '' });
  const [postponeError, setPostponeError] = useState('');
  const [cargoReturnModal, setCargoReturnModal] = useState<BillDetail | null>(null);
  const [cargoReturnForm, setCargoReturnForm] = useState({ reason: '', comment: '' });
  const [cargoReturnError, setCargoReturnError] = useState('');
  const [cargoPaymentModal, setCargoPaymentModal] = useState<{
    bill: BillDetail;
    mode: 'full' | 'partial';
  } | null>(null);
  const [cargoPaymentForm, setCargoPaymentForm] = useState({
    amount: '',
    financeAccountId: '',
    accountantComment: '',
  });
  const [cargoPaymentError, setCargoPaymentError] = useState('');
  const [supplierPaymentModal, setSupplierPaymentModal] = useState<{
    bill: BillDetail;
    mode: 'full' | 'partial';
  } | null>(null);
  const [supplierPaymentForm, setSupplierPaymentForm] = useState({
    exchangeRateCnyKgs: '',
    exchangeRateLocked: false,
    paymentAmountKgs: '',
    financeAccountId: '',
    accountantComment: '',
  });
  const [supplierPaymentError, setSupplierPaymentError] = useState('');

  const canAccess = canCreateSupplierPayment(user);
  const canPermanentDelete = canPermanentDeleteBusinessData(user);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', '20');
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return params.toString();
  }, [filters, page]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch<BillsResponse>(`/procurement/bills-to-pay?${queryString}`);
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [queryString, t]);

  useEffect(() => {
    void apiFetch<User>('/auth/me')
      .then(async (current) => {
        setUser(current);
        if (!canCreateSupplierPayment(current)) {
          setLoading(false);
          return;
        }
        await load();
        const deepSource = searchParams.get('source') as BillSource | null;
        const deepId = searchParams.get('id');
        if (deepSource && deepId) {
          const detail = await apiFetch<BillDetail>(`/procurement/bills-to-pay/${deepSource}/${deepId}`);
          setSelected(detail);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : t('common.error'));
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!canAccess) return;
    void load();
  }, [canAccess, load]);

  async function openDetail(row: BillRow) {
    setActionError('');
    try {
      const detail = await apiFetch<BillDetail>(`/procurement/bills-to-pay/${row.source}/${row.id}`);
      setSelected(detail);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function runAction(path: string, body?: Record<string, unknown>) {
    if (!selected && !reasonModal && !paymentModal) return;
    const bill = selected || reasonModal?.bill || paymentModal;
    if (!bill) return;
    setSaving(true);
    setActionError('');
    try {
      await apiFetch(`/procurement/bills-to-pay/${bill.source}/${bill.id}/${path}`, {
        method: 'POST',
        body: JSON.stringify(body || {}),
      });
      setReasonModal(null);
      setReason('');
      await load();
      if (selected) {
        const detail = await apiFetch<BillDetail>(`/procurement/bills-to-pay/${bill.source}/${bill.id}`);
        setSelected(detail);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  function buildPaymentDeleteSummary(
    bill: BillDetail,
    payment?: Record<string, unknown>,
  ): HqPaymentDeleteSummary {
    const paymentNumber = payment
      ? `PAY-${payment.sequenceNumber ?? payment.id}`
      : bill.requestNumber;
    const amountValue = payment
      ? payment.amountYuan != null
        ? Number(payment.amountYuan).toFixed(2)
        : Number(payment.amountKgs ?? payment.amount ?? 0).toFixed(2)
      : Number(bill.amount).toFixed(2);
    const currency = payment
      ? payment.amountYuan != null
        ? 'CNY'
        : 'KGS'
      : bill.currency;
    return {
      paymentNumber: String(paymentNumber),
      amount: amountValue,
      currency,
      paymentDate:
        (payment?.paidAt as string | undefined) ||
        (payment?.sentToCashierAt as string | undefined) ||
        (payment?.paymentDate as string | undefined) ||
        bill.submittedAt ||
        null,
      accountOrCashbox:
        (payment?.actualFinanceAccount as { name?: string } | undefined)?.name ||
        (payment?.intendedFinanceAccount as { name?: string } | undefined)?.name ||
        bill.detail?.financeAccount?.name ||
        null,
      payer: bill.sender?.fullName || null,
      recipient:
        (payment?.recipientName as string | undefined) ||
        bill.recipientName ||
        null,
    };
  }

  async function confirmPermanentDeletePayment() {
    const ctx = paymentDeleteContext;
    if (!ctx) return;
    setSaving(true);
    setActionError('');
    try {
      const body: Record<string, unknown> = {};
      if (ctx.payment?.id) {
        body.paymentId = ctx.payment.id;
      }
      await apiFetch(
        `/procurement/bills-to-pay/${ctx.bill.source}/${ctx.bill.id}/permanent-delete`,
        {
          method: 'POST',
          body: JSON.stringify(body),
        },
      );
      setPaymentDeleteContext(null);
      setSelected(null);
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function refreshSelected(source: BillSource, id: string) {
    const detail = await apiFetch<BillDetail>(`/procurement/bills-to-pay/${source}/${id}`);
    setSelected(detail);
  }

  async function loadAccounts() {
    try {
      const list = await apiFetch<
        Array<{ id: string; name: string; availableBalance: number; typeCode?: string }>
      >('/procurement/supplier-payment-accounts');
      setAccounts(list);
    } catch {
      setAccounts([]);
    }
  }

  const selectedPaymentAccount = useMemo(
    () => accounts.find((account) => account.id === paymentForm.financeAccountId) ?? null,
    [accounts, paymentForm.financeAccountId],
  );
  const derivedPaymentMethod = useMemo(
    () => deriveSupplierPaymentMethodFromAccountType(selectedPaymentAccount?.typeCode),
    [selectedPaymentAccount?.typeCode],
  );

  async function openCargoPaymentModal(bill: BillDetail, mode: 'full' | 'partial') {
    if (isSupplierAccountantBill(bill)) {
      await openSupplierPaymentModal(bill, mode);
      return;
    }
    const remaining = resolveBillRemainingForActions(bill);
    setCargoPaymentModal({ bill, mode });
    setCargoPaymentError('');
    setCargoPaymentForm({
      amount: mode === 'full' && remaining > 0 ? String(remaining) : '',
      financeAccountId: bill.detail?.financeAccountId || bill.detail?.financeAccount?.id || '',
      accountantComment: '',
    });
    await loadAccounts();
  }

  async function openSupplierPaymentModal(bill: BillDetail, mode: 'full' | 'partial') {
    const detail = bill.detail || {};
    const savedRate = Number(detail.exchangeRate || 0);
    const remainingKgs = resolveBillRemainingForActions(bill);
    setSupplierPaymentModal({ bill, mode });
    setSupplierPaymentError('');
    setSupplierPaymentForm({
      exchangeRateCnyKgs: savedRate > 0 ? String(savedRate) : '',
      exchangeRateLocked: savedRate > 0,
      paymentAmountKgs:
        mode === 'full' && remainingKgs > 0 ? String(remainingKgs) : '',
      financeAccountId: detail.financeAccountId || detail.financeAccount?.id || '',
      accountantComment: '',
    });
    await loadAccounts();
  }

  function validateSupplierPaymentForm(bill: BillDetail) {
    const detail = bill.detail || {};
    const isCny = String(bill.currency || 'CNY').toUpperCase() === 'CNY';
    const remainingKgs = resolveBillRemainingForActions(bill);
    const supplierAmountCny = Number(
      detail.supplierAmountCny ?? detail.totalYuan ?? bill.amount ?? 0,
    );
    const paidKgs = Number(detail.paidAmountKgs ?? bill.paidAmountKgs ?? 0);

    let exchangeRate: number | undefined;
    if (isCny) {
      const parsedRate =
        parseExchangeRateInput(supplierPaymentForm.exchangeRateCnyKgs) ?? undefined;
      if (supplierPaymentForm.exchangeRateLocked) {
        exchangeRate = parsedRate;
      } else {
        exchangeRate = parsedRate;
        if (!(exchangeRate != null && exchangeRate > 0)) {
          setSupplierPaymentError(t('finance.billsToPay.cnyRateRequired'));
          return null;
        }
      }
      if (!(exchangeRate != null && exchangeRate > 0)) {
        setSupplierPaymentError(t('finance.billsToPay.cnyRateRequired'));
        return null;
      }
    }

    const approvedKgs =
      isCny && exchangeRate != null
        ? previewCnyToKgs(supplierAmountCny, String(exchangeRate)) ?? 0
        : remainingKgs;
    const debtRemainingKgs = Math.max(approvedKgs - paidKgs, 0);

    let paymentAmountKgs = remainingKgs;
    if (supplierPaymentModal?.mode === 'partial') {
      paymentAmountKgs = Number(supplierPaymentForm.paymentAmountKgs);
      if (!(paymentAmountKgs > 0)) {
        setSupplierPaymentError(t('finance.billsToPay.amountMustBePositive'));
        return null;
      }
      if (paymentAmountKgs > debtRemainingKgs + 0.009) {
        setSupplierPaymentError(t('finance.billsToPay.amountExceedsRemaining'));
        return null;
      }
    } else if (!(remainingKgs > 0)) {
      setSupplierPaymentError(t('finance.billsToPay.amountMustBePositive'));
      return null;
    } else {
      paymentAmountKgs = remainingKgs;
    }

    if (!supplierPaymentForm.financeAccountId) {
      setSupplierPaymentError(t('finance.billsToPay.accountRequired'));
      return null;
    }
    const account = accounts.find((item) => item.id === supplierPaymentForm.financeAccountId);
    if (!account || !deriveSupplierPaymentMethodFromAccountType(account.typeCode)) {
      setSupplierPaymentError(t('finance.billsToPay.accountUnavailable'));
      return null;
    }

    return {
      paymentAmountKgs,
      financeAccountId: supplierPaymentForm.financeAccountId,
      accountantComment: supplierPaymentForm.accountantComment.trim() || undefined,
      exchangeRateCnyKgs:
        isCny && !supplierPaymentForm.exchangeRateLocked ? exchangeRate : undefined,
      idempotencyKey: crypto.randomUUID(),
    };
  }

  async function submitSupplierPayment() {
    if (!supplierPaymentModal || saving) return;
    const payload = validateSupplierPaymentForm(supplierPaymentModal.bill);
    if (!payload) return;

    setSaving(true);
    setSupplierPaymentError('');
    setActionError('');
    try {
      await apiFetch(
        `/procurement/bills-to-pay/${supplierPaymentModal.bill.source}/${supplierPaymentModal.bill.id}/pay`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      );
      const source = supplierPaymentModal.bill.source;
      const id = supplierPaymentModal.bill.id;
      setSupplierPaymentModal(null);
      await load();
      await refreshSelected(source, id);
    } catch (err) {
      setSupplierPaymentError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  function validateCargoPaymentForm(bill: BillDetail) {
    const remaining = resolveBillRemainingForActions(bill);
    const amount = Number(cargoPaymentForm.amount);
    if (!(amount > 0)) {
      setCargoPaymentError(t('finance.billsToPay.amountMustBePositive'));
      return null;
    }
    if (amount > remaining + 0.009) {
      setCargoPaymentError(t('finance.billsToPay.amountExceedsRemaining'));
      return null;
    }
    if (!cargoPaymentForm.financeAccountId) {
      setCargoPaymentError(t('finance.billsToPay.accountRequired'));
      return null;
    }
    const account = accounts.find((item) => item.id === cargoPaymentForm.financeAccountId);
    if (!account || !deriveSupplierPaymentMethodFromAccountType(account.typeCode)) {
      setCargoPaymentError(t('finance.billsToPay.accountUnavailable'));
      return null;
    }
    return {
      paymentAmountKgs: amount,
      financeAccountId: cargoPaymentForm.financeAccountId,
      accountantComment: cargoPaymentForm.accountantComment.trim() || undefined,
      idempotencyKey: crypto.randomUUID(),
    };
  }

  async function submitCargoReturn() {
    if (!cargoReturnModal || saving) return;
    const trimmedReason = cargoReturnForm.reason.trim();
    if (trimmedReason.length < 3) {
      setCargoReturnError(t('finance.billsToPay.returnReasonRequired'));
      return;
    }
    setSaving(true);
    setActionError('');
    setCargoReturnError('');
    try {
      await apiFetch(
        `/procurement/bills-to-pay/${cargoReturnModal.source}/${cargoReturnModal.id}/return`,
        {
          method: 'POST',
          body: JSON.stringify({
            reason: trimmedReason,
            comment: cargoReturnForm.comment.trim() || undefined,
            idempotencyKey: crypto.randomUUID(),
          }),
        },
      );
      const source = cargoReturnModal.source;
      const id = cargoReturnModal.id;
      setCargoReturnModal(null);
      setCargoReturnForm({ reason: '', comment: '' });
      await load();
      await refreshSelected(source, id);
    } catch (err) {
      setCargoReturnError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function submitPostponePayment() {
    if (!postponeModal || saving) return;
    const usesReasonField = isCargoOrSupplierAccountantBill(postponeModal);
    if (usesReasonField && postponeForm.reason.trim().length < 2) {
      setPostponeError(t('finance.billsToPay.postponeReasonRequired'));
      return;
    }
    if (!usesReasonField && postponeForm.comment.trim().length < 2) {
      setPostponeError(t('finance.billsToPay.commentRequired'));
      return;
    }
    setSaving(true);
    setPostponeError('');
    setActionError('');
    try {
      const body: Record<string, string | undefined> = {
        nextPaymentDate: postponeForm.nextPaymentDate,
        comment: postponeForm.comment.trim() || undefined,
      };
      if (usesReasonField) {
        body.reason = postponeForm.reason.trim();
      }
      await apiFetch(
        `/procurement/bills-to-pay/${postponeModal.source}/${postponeModal.id}/postpone`,
        {
          method: 'POST',
          body: JSON.stringify(body),
        },
      );
      const source = postponeModal.source;
      const id = postponeModal.id;
      setPostponeModal(null);
      await load();
      await refreshSelected(source, id);
    } catch (err) {
      setPostponeError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function submitCargoPayment() {
    if (!cargoPaymentModal || saving) return;
    const payload = validateCargoPaymentForm(cargoPaymentModal.bill);
    if (!payload) return;

    setSaving(true);
    setActionError('');
    setCargoPaymentError('');
    try {
      await apiFetch(
        `/procurement/bills-to-pay/${cargoPaymentModal.bill.source}/${cargoPaymentModal.bill.id}/pay`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      );
      const source = cargoPaymentModal.bill.source;
      const id = cargoPaymentModal.bill.id;
      setCargoPaymentModal(null);
      await load();
      await refreshSelected(source, id);
    } catch (err) {
      setCargoPaymentError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function openTransportApprove(bill: BillDetail) {
    setTransportApproveModal(bill);
    setTransportApproveForm({
      financeAccountId: bill.detail?.financeAccountId || bill.detail?.financeAccount?.id || '',
      exchangeRateCnyKgs:
        bill.currency.toUpperCase() === 'KGS'
          ? ''
          : bill.detail?.exchangeRate != null
            ? String(bill.detail.exchangeRate)
            : '',
      accountantComment: bill.detail?.accountantComment || '',
    });
    setPaymentFormError('');
    await loadAccounts();
  }

  async function submitTransportApprove() {
    if (!transportApproveModal) return;
    if (!transportApproveForm.financeAccountId) {
      setPaymentFormError(t('finance.billsToPay.accountRequired'));
      return;
    }
    const currency = String(transportApproveModal.currency || 'KGS').toUpperCase();
    const exchangeRateCnyKgs =
      currency !== 'KGS'
        ? parseExchangeRateInput(transportApproveForm.exchangeRateCnyKgs) ?? undefined
        : undefined;
    if (currency !== 'KGS' && exchangeRateCnyKgs == null) {
      setPaymentFormError(t('finance.billsToPay.cnyRateRequired'));
      return;
    }
    setSaving(true);
    setActionError('');
    setPaymentFormError('');
    try {
      await apiFetch(
        `/procurement/bills-to-pay/${transportApproveModal.source}/${transportApproveModal.id}/approve`,
        {
          method: 'POST',
          body: JSON.stringify({
            sendToCashier: true,
            financeAccountId: transportApproveForm.financeAccountId,
            exchangeRateCnyKgs,
            accountantComment: transportApproveForm.accountantComment || undefined,
          }),
        },
      );
      const source = transportApproveModal.source;
      const id = transportApproveModal.id;
      setTransportApproveModal(null);
      await load();
      await refreshSelected(source, id);
    } catch (err) {
      setPaymentFormError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function openPaymentModal(row: BillRow) {
    setPaymentModal(row);
    setEditingPayment(null);
    setPaymentFormError('');
    setPaymentForm({
      amount: row.remainingAmount > 0 ? String(row.remainingAmount) : '',
      exchangeRate: '',
      financeAccountId: '',
      recipientName: row.recipientName ?? '',
      accountantComment: '',
    });
    await loadAccounts();
  }

  async function openEditPayment(payment: any) {
    if (!selected || selected.source !== 'SUPPLIER_INVOICE' || payment?.status !== 'DRAFT') return;
    setPaymentModal(selected);
    setEditingPayment(payment);
    setPaymentFormError('');
    setPaymentForm({
      amount: String(payment.amountYuan ?? ''),
      exchangeRate: String(payment.exchangeRate ?? ''),
      financeAccountId: payment.intendedFinanceAccountId || payment.intendedFinanceAccount?.id || '',
      recipientName: payment.recipientName ?? selected.recipientName ?? '',
      accountantComment: payment.accountantComment ?? '',
    });
    await loadAccounts();
  }

  function maxPayableAmount(bill: BillRow, draft?: { amountYuan?: number | string } | null) {
    const remaining = Number(bill.remainingAmount);
    const draftYuan = draft ? Number(draft.amountYuan || 0) : 0;
    return remaining + (Number.isFinite(draftYuan) ? draftYuan : 0);
  }

  function validatePaymentForm(bill: BillRow, options?: { requireBalance?: boolean }) {
    const amount = Number(paymentForm.amount);
    const maxAmount = maxPayableAmount(bill, editingPayment);
    if (!(amount > 0)) {
      setPaymentFormError(t('finance.billsToPay.amountMustBePositive'));
      return null;
    }
    if (amount > maxAmount + 0.009) {
      setPaymentFormError(t('finance.billsToPay.amountExceedsRemaining'));
      return null;
    }
    const exchangeRate = Number(paymentForm.exchangeRate);
    if (!(exchangeRate > 0)) {
      setPaymentFormError(t('finance.billsToPay.exchangeRate'));
      return null;
    }
    if (!paymentForm.financeAccountId) {
      setPaymentFormError(t('finance.billsToPay.accountRequired'));
      return null;
    }
    const account = accounts.find((item) => item.id === paymentForm.financeAccountId);
    if (!account || !deriveSupplierPaymentMethodFromAccountType(account.typeCode)) {
      setPaymentFormError(t('finance.billsToPay.paymentMethodUnresolved'));
      return null;
    }
    if (!paymentForm.recipientName.trim()) {
      setPaymentFormError(t('finance.billsToPay.recipientRequired'));
      return null;
    }
    const approvedKgs = Math.round(amount * exchangeRate * 100) / 100;
    if (options?.requireBalance) {
      if (approvedKgs > Number(account.availableBalance) + 0.009) {
        setPaymentFormError(t('finance.billsToPay.insufficientBalance'));
        return null;
      }
    }
    // paymentMethod is intentionally omitted — backend derives it from account type.
    return {
      amountYuan: amount,
      exchangeRate,
      approvedAmountKgs: approvedKgs,
      intendedFinanceAccountId: paymentForm.financeAccountId,
      recipientName: paymentForm.recipientName.trim(),
      accountantComment: paymentForm.accountantComment.trim() || undefined,
    };
  }

  async function savePaymentDraft() {
    if (!paymentModal || paymentModal.source !== 'SUPPLIER_INVOICE') return;
    const payload = validatePaymentForm(paymentModal);
    if (!payload) return;

    setSaving(true);
    setActionError('');
    setPaymentFormError('');
    try {
      if (editingPayment?.id) {
        await apiFetch(
          `/procurement/orders/${paymentModal.id}/supplier-payments/${editingPayment.id}`,
          {
            method: 'PUT',
            body: JSON.stringify({
              ...payload,
              sendToCashier: false,
              changeReason: 'Updated draft payment from bills to pay',
            }),
          },
        );
      } else {
        await apiFetch(`/procurement/orders/${paymentModal.id}/supplier-payments`, {
          method: 'POST',
          body: JSON.stringify({
            ...payload,
            sendToCashier: false,
          }),
        });
      }
      setPaymentModal(null);
      setEditingPayment(null);
      await load();
      await refreshSelected(paymentModal.source, paymentModal.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function payDraftPayment(payment: any) {
    if (!selected || selected.source !== 'SUPPLIER_INVOICE' || payment?.status !== 'DRAFT') return;

    const amountYuan = Number(payment.amountYuan);
    const exchangeRate = Number(payment.exchangeRate);
    const accountId = payment.intendedFinanceAccountId || payment.intendedFinanceAccount?.id || '';
    const recipientName = String(payment.recipientName || '').trim();
    const approvedKgs = Number(
      payment.approvedAmountKgs ?? payment.amountKgs ?? amountYuan * exchangeRate,
    );

    if (!(amountYuan > 0)) {
      setActionError(t('finance.billsToPay.amountMustBePositive'));
      return;
    }
    if (!(exchangeRate > 0)) {
      setActionError(t('finance.billsToPay.exchangeRate'));
      return;
    }
    if (!accountId) {
      setActionError(t('finance.billsToPay.accountRequired'));
      return;
    }
    if (!recipientName) {
      setActionError(t('finance.billsToPay.recipientRequired'));
      return;
    }

    setSaving(true);
    setActionError('');
    try {
      // Refresh accounts so balance check is current before send-to-cashier.
      const list = await apiFetch<Array<{ id: string; name: string; availableBalance: number }>>(
        '/procurement/supplier-payment-accounts',
      );
      setAccounts(list);
      const account = list.find((item) => item.id === accountId);
      if (!account || approvedKgs > Number(account.availableBalance) + 0.009) {
        setActionError(t('finance.billsToPay.insufficientBalance'));
        setSaving(false);
        return;
      }

      await apiFetch(
        `/procurement/orders/${selected.id}/supplier-payments/${payment.id}/send-to-cashier`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      await load();
      await refreshSelected(selected.source, selected.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  if (!user) {
    return (
      <FinanceLayout titleKey="finance.billsToPay">
        <FinanceLoadingState />
      </FinanceLayout>
    );
  }

  if (!canAccess) {
    return (
      <FinanceLayout titleKey="finance.billsToPay">
        <FinanceErrorState message={t('errors.accessDenied') || 'Access denied'} />
      </FinanceLayout>
    );
  }

  const summary = data?.summary;

  return (
    <FinanceLayout titleKey="finance.billsToPay" breadcrumbs={[{ labelKey: 'finance.billsToPay' }]}>
      {error ? <FinanceErrorState message={error} /> : null}
      {actionError ? <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p> : null}

      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <SummaryChip label={t('finance.billsToPay.awaiting')} value={String(summary?.awaitingCount ?? 0)} />
        <SummaryChip label={t('finance.billsToPay.partial')} value={String(summary?.partiallyPaidCount ?? 0)} />
        <SummaryChip label={t('finance.billsToPay.overdue')} value={String(summary?.overdueCount ?? 0)} />
        <SummaryChip
          label={t('finance.billsToPay.totalPayableKgs')}
          value={`${Number(summary?.totalPayableKgs ?? 0).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} KGS`}
        />
      </div>

      <div className="mb-3 flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <select
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          value={filters.requestType}
          onChange={(e) => { setPage(1); setFilters({ ...filters, requestType: e.target.value }); }}
        >
          <option value="">{t('finance.billsToPay.filterType')}</option>
          {REQUEST_TYPES.map((type) => (
            <option key={type} value={type}>{t(`finance.billsToPay.type.${type}`)}</option>
          ))}
        </select>
        <select
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          value={filters.status}
          onChange={(e) => { setPage(1); setFilters({ ...filters, status: e.target.value }); }}
        >
          <option value="">{t('finance.billsToPay.filterStatus')}</option>
          {STATUS_FILTERS.map((status) => (
            <option key={status} value={status}>{t(`finance.billsToPay.status.${status}`)}</option>
          ))}
        </select>
        <select
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          value={filters.currency}
          onChange={(e) => { setPage(1); setFilters({ ...filters, currency: e.target.value }); }}
        >
          <option value="">{t('finance.billsToPay.filterCurrency')}</option>
          <option value="KGS">KGS</option>
          <option value="CNY">CNY</option>
          <option value="USD">USD</option>
        </select>
        <input
          className="min-w-[140px] flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          placeholder={t('finance.billsToPay.filterRecipient')}
          value={filters.recipient}
          onChange={(e) => { setPage(1); setFilters({ ...filters, recipient: e.target.value }); }}
        />
        <input
          className="min-w-[180px] flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          placeholder={t('finance.billsToPay.search')}
          value={filters.search}
          onChange={(e) => { setPage(1); setFilters({ ...filters, search: e.target.value }); }}
        />
        <input
          type="date"
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          value={filters.dateFrom}
          onChange={(e) => { setPage(1); setFilters({ ...filters, dateFrom: e.target.value }); }}
        />
        <input
          type="date"
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          value={filters.dateTo}
          onChange={(e) => { setPage(1); setFilters({ ...filters, dateTo: e.target.value }); }}
        />
      </div>

      {loading ? <FinanceLoadingState /> : null}
      {!loading && !data?.items.length ? (
        <FinanceEmptyState messageKey="finance.billsToPay.empty" />
      ) : null}

      {!loading && data?.items.length ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">№</th>
                <th className="px-3 py-2">{t('finance.billsToPay.date')}</th>
                <th className="px-3 py-2">{t('finance.billsToPay.type')}</th>
                <th className="px-3 py-2">{t('finance.billsToPay.sender')}</th>
                <th className="px-3 py-2">{t('finance.billsToPay.recipient')}</th>
                <th className="px-3 py-2">{t('finance.billsToPay.amount')}</th>
                <th className="px-3 py-2">{t('finance.billsToPay.paid')}</th>
                <th className="px-3 py-2">{t('finance.billsToPay.remaining')}</th>
                <th className="px-3 py-2">{t('finance.billsToPay.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((row) => (
                <tr key={`${row.source}-${row.id}`}>
                  <td className="px-3 py-2 font-semibold">{row.requestNumber}</td>
                  <td className="px-3 py-2">
                    {row.submittedAt ? new Date(row.submittedAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-3 py-2">{t(`finance.billsToPay.type.${row.requestType}`)}</td>
                  <td className="px-3 py-2">{row.sender?.fullName || '—'}</td>
                  <td className="px-3 py-2">{row.recipientName}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {Number(row.amount).toFixed(2)} {row.currency}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {Number(row.paidAmount).toFixed(2)} {row.currency}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {Number(row.remainingAmount).toFixed(2)} {row.currency}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex max-w-[11rem] flex-col gap-1">
                      {row.correctionRouting ? (
                        <p className="text-[10px] leading-snug text-amber-800">
                          {t(
                            row.correctionRouting.direction === 'FROM_HQ_CASHIER'
                              ? 'finance.billsToPay.correctionRouting.fromCashier'
                              : 'finance.billsToPay.correctionRouting.toSupplyManager',
                          )}
                          <br />
                          {formatBillCorrectionRoutingAssignee(
                            row.correctionRouting,
                            t(
                              row.correctionRouting.direction === 'FROM_HQ_CASHIER'
                                ? 'finance.billsToPay.correctionRouting.roleHqCashier'
                                : 'finance.billsToPay.correctionRouting.roleSupplyManager',
                            ),
                          )}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                          {t(`finance.billsToPay.status.${row.status}`)}
                        </span>
                        <button
                          type="button"
                          onClick={() => void openDetail(row)}
                          className="rounded border border-blue-200 px-2 py-0.5 text-xs font-semibold text-blue-700"
                        >
                          {t('common.open')}
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {data && data.totalPages > 1 ? (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40"
          >
            ←
          </button>
          <span>
            {data.page} / {data.totalPages}
          </span>
          <button
            type="button"
            disabled={page >= data.totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40"
          >
            →
          </button>
        </div>
      ) : null}

      {selected ? (
        <DetailDrawer
          t={t}
          bill={selected}
          saving={saving}
          canPermanentDelete={canPermanentDelete}
          onClose={() => setSelected(null)}
          onTakeReview={() => void runAction('take-review')}
          onApprove={() => {
            if (selected.source === 'TRANSPORT_EXPENSE') {
              void openTransportApprove(selected);
              return;
            }
            void runAction('approve', { sendToCashier: true });
          }}
          onReturn={() => {
            if (isCargoOrSupplierAccountantBill(selected)) {
              setCargoReturnError('');
              setCargoReturnForm({ reason: '', comment: '' });
              setCargoReturnModal(selected);
              return;
            }
            setReasonModal({ mode: 'return', bill: selected });
          }}
          onReject={() => setReasonModal({ mode: 'reject', bill: selected })}
          onCreatePayment={() => {
            if (isCargoOrSupplierAccountantBill(selected)) {
              void openCargoPaymentModal(selected, 'partial');
              return;
            }
            void openPaymentModal(selected);
          }}
          onPayFullCargo={() => void openCargoPaymentModal(selected, 'full')}
          onPostpone={() => {
            setPostponeError('');
            setPostponeForm({
              nextPaymentDate: selected.nextPaymentDate
                ? selected.nextPaymentDate.slice(0, 10)
                : '',
              reason: '',
              comment: selected.paymentPostponeComment || '',
            });
            setPostponeModal(selected);
          }}
          onEditPayment={(payment) => void openEditPayment(payment)}
          onPayPayment={(payment) => void payDraftPayment(payment)}
          onPermanentDeletePayment={(payment) =>
            setPaymentDeleteContext({ bill: selected, payment })
          }
          onPermanentDeleteBill={() => setPaymentDeleteContext({ bill: selected })}
          onShowQr={(images, initialIndex) => setQrPreview({ images, initialIndex })}
        />
      ) : null}

      {postponeModal ? (
        <Modal
          title={
            isCargoOrSupplierAccountantBill(postponeModal) &&
            postponeModal.status === 'PAYMENT_POSTPONED'
              ? t('finance.billsToPay.changePostponeDate')
              : t('finance.billsToPay.postponePayment')
          }
          onClose={() => {
            setPostponeModal(null);
            setPostponeError('');
          }}
        >
          <p className="text-xs text-slate-600">
            {postponeModal.requestNumber} · {t('finance.billsToPay.remaining')}:{' '}
            {Number(postponeModal.remainingAmount).toFixed(2)} {postponeModal.currency}
          </p>
          {postponeError ? (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{postponeError}</p>
          ) : null}
          <label className="mt-2 block text-xs font-semibold">
            {t('finance.billsToPay.nextPaymentDate')}
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              value={postponeForm.nextPaymentDate}
              onChange={(e) =>
                setPostponeForm((prev) => ({ ...prev, nextPaymentDate: e.target.value }))
              }
            />
          </label>
          {isCargoOrSupplierAccountantBill(postponeModal) ? (
            <label className="mt-2 block text-xs font-semibold">
              {t('finance.billsToPay.postponeReason')}
              <textarea
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                rows={2}
                value={postponeForm.reason}
                onChange={(e) => setPostponeForm((prev) => ({ ...prev, reason: e.target.value }))}
              />
            </label>
          ) : null}
          <label className="mt-2 block text-xs font-semibold">
            {t('finance.billsToPay.commentOptional')}
            <textarea
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              rows={3}
              value={postponeForm.comment}
              onChange={(e) => setPostponeForm((prev) => ({ ...prev, comment: e.target.value }))}
            />
          </label>
          <p className="mt-2 text-xs text-slate-500">{t('finance.billsToPay.postponeHint')}</p>
          <button
            type="button"
            disabled={
              saving ||
              !postponeForm.nextPaymentDate ||
              (!isCargoOrSupplierAccountantBill(postponeModal) &&
                postponeForm.comment.trim().length < 2) ||
              (isCargoOrSupplierAccountantBill(postponeModal) &&
                postponeForm.reason.trim().length < 2)
            }
            onClick={() => void submitPostponePayment()}
            className="mt-3 rounded-lg bg-amber-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {isCargoOrSupplierAccountantBill(postponeModal)
              ? t('finance.billsToPay.postponeShort')
              : postponeModal.status === 'PAYMENT_POSTPONED'
                ? t('finance.billsToPay.changePostponeDate')
                : t('finance.billsToPay.postponePayment')}
          </button>
        </Modal>
      ) : null}

      {cargoReturnModal ? (
        <Modal
          title={t('finance.billsToPay.return')}
          onClose={() => {
            setCargoReturnModal(null);
            setCargoReturnError('');
          }}
        >
          <p className="text-xs text-slate-600">{cargoReturnModal.requestNumber}</p>
          {cargoReturnError ? (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{cargoReturnError}</p>
          ) : null}
          <label className="mt-2 block text-xs font-semibold">
            {t('finance.billsToPay.returnReason')}
            <textarea
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              rows={2}
              value={cargoReturnForm.reason}
              onChange={(e) => setCargoReturnForm((prev) => ({ ...prev, reason: e.target.value }))}
            />
          </label>
          <label className="mt-2 block text-xs font-semibold">
            {t('finance.billsToPay.commentOptional')}
            <textarea
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              rows={2}
              value={cargoReturnForm.comment}
              onChange={(e) => setCargoReturnForm((prev) => ({ ...prev, comment: e.target.value }))}
            />
          </label>
          <button
            type="button"
            disabled={saving || cargoReturnForm.reason.trim().length < 3}
            onClick={() => void submitCargoReturn()}
            className="mt-3 rounded-lg bg-amber-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {t('finance.billsToPay.return')}
          </button>
        </Modal>
      ) : null}

      {reasonModal ? (
        <Modal
          title={
            reasonModal.mode === 'return'
              ? t('finance.billsToPay.returnReason')
              : t('finance.billsToPay.rejectReason')
          }
          onClose={() => setReasonModal(null)}
        >
          <textarea
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <button
            type="button"
            disabled={saving || reason.trim().length < 3}
            onClick={() => void runAction(reasonModal.mode === 'return' ? 'return' : 'reject', { reason })}
            className="mt-3 rounded-lg bg-amber-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {reasonModal.mode === 'return' ? t('finance.billsToPay.return') : t('finance.billsToPay.reject')}
          </button>
        </Modal>
      ) : null}

      {paymentModal ? (
        <Modal
          title={
            editingPayment
              ? t('finance.billsToPay.editPayment')
              : t('finance.billsToPay.createPartialPayment')
          }
          onClose={() => {
            setPaymentModal(null);
            setEditingPayment(null);
          }}
        >
          <p className="text-xs text-slate-600">
            {t('finance.billsToPay.remaining')}:{' '}
            {maxPayableAmount(paymentModal, editingPayment).toFixed(2)} {paymentModal.currency}
          </p>
          {paymentFormError ? (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{paymentFormError}</p>
          ) : null}
          <label className="mt-2 block text-xs font-semibold">
            {t('finance.billsToPay.paymentAmount')}
            <input
              type="number"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              value={paymentForm.amount ?? ''}
              onChange={(e) =>
                setPaymentForm((prev) => ({ ...prev, amount: e.target.value ?? '' }))
              }
            />
          </label>
          <label className="mt-2 block text-xs font-semibold">
            {t('finance.billsToPay.accountOrCashbox')}
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              value={paymentForm.financeAccountId ?? ''}
              onChange={(e) =>
                setPaymentForm((prev) => ({ ...prev, financeAccountId: e.target.value ?? '' }))
              }
            >
              <option value="">{t('common.select')}</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} ({Number(account.availableBalance).toFixed(2)} KGS)
                </option>
              ))}
            </select>
          </label>
          <p className="mt-2 text-xs text-slate-600">
            {t('finance.billsToPay.paymentMethod')}:{' '}
            <span className="font-semibold text-slate-900">
              {t(derivedSupplierPaymentMethodLabelKey(derivedPaymentMethod))}
            </span>
          </p>
          <label className="mt-2 block text-xs font-semibold">
            {t('finance.billsToPay.recipient')}
            <input
              type="text"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              value={paymentForm.recipientName ?? ''}
              onChange={(e) =>
                setPaymentForm((prev) => ({ ...prev, recipientName: e.target.value ?? '' }))
              }
            />
          </label>
          <label className="mt-2 block text-xs font-semibold">
            {t('finance.billsToPay.exchangeRate')}
            <input
              type="number"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              value={paymentForm.exchangeRate ?? ''}
              onChange={(e) =>
                setPaymentForm((prev) => ({ ...prev, exchangeRate: e.target.value ?? '' }))
              }
            />
          </label>
          <p className="mt-1 text-xs text-slate-600">
            KGS:{' '}
            {(Number(paymentForm.amount || 0) * Number(paymentForm.exchangeRate || 0) || 0).toFixed(2)}
          </p>
          <label className="mt-2 block text-xs font-semibold">
            {t('finance.billsToPay.comment')}
            <textarea
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              rows={2}
              value={paymentForm.accountantComment ?? ''}
              onChange={(e) =>
                setPaymentForm((prev) => ({
                  ...prev,
                  accountantComment: e.target.value ?? '',
                }))
              }
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void savePaymentDraft()}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold disabled:opacity-40"
            >
              {t('finance.billsToPay.saveDraftPayment')}
            </button>
            {editingPayment?.id ? (
              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  const payload = validatePaymentForm(paymentModal, { requireBalance: true });
                  if (!payload || !editingPayment?.id) return;
                  setSaving(true);
                  setActionError('');
                  setPaymentFormError('');
                  try {
                    await apiFetch(
                      `/procurement/orders/${paymentModal.id}/supplier-payments/${editingPayment.id}`,
                      {
                        method: 'PUT',
                        body: JSON.stringify({
                          ...payload,
                          sendToCashier: true,
                          changeReason: 'Sent draft payment to cashier from bills to pay',
                        }),
                      },
                    );
                    setPaymentModal(null);
                    setEditingPayment(null);
                    await load();
                    await refreshSelected(paymentModal.source, paymentModal.id);
                  } catch (err) {
                    setActionError(err instanceof Error ? err.message : t('common.error'));
                  } finally {
                    setSaving(false);
                  }
                }}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
              >
                {t('finance.billsToPay.sendToCashier')}
              </button>
            ) : null}
          </div>
        </Modal>
      ) : null}

      {cargoPaymentModal ? (
        <Modal
          title={
            cargoPaymentModal.mode === 'full'
              ? t('finance.billsToPay.payInFull')
              : t('finance.billsToPay.createPartialPayment')
          }
          onClose={() => {
            setCargoPaymentModal(null);
            setCargoPaymentError('');
          }}
        >
          <p className="text-xs text-slate-600">
            {cargoPaymentModal.bill.requestNumber} · {t('finance.billsToPay.remaining')}:{' '}
            {Number(cargoPaymentModal.bill.remainingAmountKgs ?? cargoPaymentModal.bill.remainingAmount).toFixed(2)}{' '}
            KGS
          </p>
          {cargoPaymentError ? (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{cargoPaymentError}</p>
          ) : null}
          {cargoPaymentModal.mode === 'partial' ? (
            <label className="mt-2 block text-xs font-semibold">
              {t('finance.billsToPay.paymentAmount')} (KGS)
              <input
                type="number"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                value={cargoPaymentForm.amount ?? ''}
                onChange={(e) =>
                  setCargoPaymentForm((prev) => ({ ...prev, amount: e.target.value ?? '' }))
                }
              />
            </label>
          ) : null}
          <label className="mt-2 block text-xs font-semibold">
            {t('finance.billsToPay.accountOrCashbox')}
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              value={cargoPaymentForm.financeAccountId ?? ''}
              onChange={(e) =>
                setCargoPaymentForm((prev) => ({ ...prev, financeAccountId: e.target.value ?? '' }))
              }
            >
              <option value="">{t('common.select')}</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} ({Number(account.availableBalance).toFixed(2)} KGS)
                </option>
              ))}
            </select>
          </label>
          <label className="mt-2 block text-xs font-semibold">
            {t('finance.billsToPay.commentOptional')}
            <textarea
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              rows={2}
              value={cargoPaymentForm.accountantComment ?? ''}
              onChange={(e) =>
                setCargoPaymentForm((prev) => ({
                  ...prev,
                  accountantComment: e.target.value ?? '',
                }))
              }
            />
          </label>
          <button
            type="button"
            disabled={saving}
            onClick={() => void submitCargoPayment()}
            className="mt-3 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {t('finance.billsToPay.sendToCashier')}
          </button>
        </Modal>
      ) : null}

      {supplierPaymentModal ? (
        <SupplierPaymentModal
          t={t}
          modal={supplierPaymentModal}
          form={supplierPaymentForm}
          error={supplierPaymentError}
          saving={saving}
          accounts={accounts}
          onClose={() => {
            setSupplierPaymentModal(null);
            setSupplierPaymentError('');
          }}
          onSubmit={() => void submitSupplierPayment()}
          onFormChange={setSupplierPaymentForm}
        />
      ) : null}

      {transportApproveModal ? (
        <TransportApproveModal
          t={t}
          modal={transportApproveModal}
          form={transportApproveForm}
          error={paymentFormError}
          saving={saving}
          accounts={accounts}
          onClose={() => {
            setTransportApproveModal(null);
            setPaymentFormError('');
          }}
          onSubmit={() => void submitTransportApprove()}
          onFormChange={setTransportApproveForm}
        />
      ) : null}

      {qrPreview ? (
        <ImagePreviewModal
          images={qrPreview.images}
          initialIndex={qrPreview.initialIndex}
          title={t('procurement.paymentInfo.showQr')}
          onClose={() => setQrPreview(null)}
        />
      ) : null}

      <HqPaymentPermanentDeleteModal
        open={!!paymentDeleteContext}
        payment={
          paymentDeleteContext
            ? buildPaymentDeleteSummary(
                paymentDeleteContext.bill,
                paymentDeleteContext.payment,
              )
            : null
        }
        loading={saving}
        onClose={() => setPaymentDeleteContext(null)}
        onConfirm={() => void confirmPermanentDeletePayment()}
      />
    </FinanceLayout>
  );
}

function SummaryChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm font-bold text-slate-900">{value}</p>
    </div>
  );
}

function DetailDrawer({
  t,
  bill,
  saving,
  canPermanentDelete,
  onClose,
  onTakeReview,
  onApprove,
  onReturn,
  onReject,
  onCreatePayment,
  onPayFullCargo,
  onPostpone,
  onEditPayment,
  onPayPayment,
  onPermanentDeletePayment,
  onPermanentDeleteBill,
  onShowQr,
}: {
  t: (key: string) => string;
  bill: BillDetail;
  saving: boolean;
  canPermanentDelete: boolean;
  onClose: () => void;
  onTakeReview: () => void;
  onApprove: () => void;
  onReturn: () => void;
  onReject: () => void;
  onCreatePayment: () => void;
  onPayFullCargo: () => void;
  onPostpone: () => void;
  onEditPayment: (payment: any) => void;
  onPayPayment: (payment: any) => void;
  onPermanentDeletePayment: (payment: Record<string, unknown>) => void;
  onPermanentDeleteBill: () => void;
  onShowQr: (
    images: Array<{ src: string; alt?: string; label?: string }>,
    initialIndex: number,
  ) => void;
}) {
  const detail = bill.detail || {};
  const cargo = detail.cargo;
  const allQrs = Array.isArray(detail.qrCodes) ? detail.qrCodes : [];
  const invoices = Array.isArray(detail.invoices) ? detail.invoices : [];
  const payments = Array.isArray(detail.payments) ? detail.payments : [];
  const auditHistory = Array.isArray(detail.auditHistory) ? detail.auditHistory : [];

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const requestType = String(bill.requestType || bill.detail?.requestType || '');
  const isTerminal = ['FULLY_PAID', 'REJECTED', 'CANCELLED'].includes(bill.status);
  const isFinance = bill.source === 'FINANCE_EXPENSE';
  const isTransport = bill.source === 'TRANSPORT_EXPENSE';
  const isSupplierOrCargo =
    bill.source === 'SUPPLIER_INVOICE' ||
    requestType === 'CARGO_PAYMENT' ||
    requestType === 'SUPPLIER_PAYMENT';
  const isCargoPayment = requestType === 'CARGO_PAYMENT';
  // Prefer source so detail responses missing top-level requestType still get cargo-parity actions.
  const isSupplierPayment =
    bill.source === 'SUPPLIER_INVOICE' || requestType === 'SUPPLIER_PAYMENT';
  const usesAccountantPaymentFlow = isCargoPayment || isSupplierPayment;
  const billActions = usesAccountantPaymentFlow
    ? getCargoBillActionVisibility({
        uiStatus: bill.status,
        paidAmount: Number(bill.paidAmountKgs ?? bill.paidAmount ?? 0),
        remainingAmount: resolveBillRemainingForActions(bill),
      })
    : null;
  const canTakeReview =
    !isFinance &&
    !isTerminal &&
    !usesAccountantPaymentFlow &&
    (bill.status === 'AWAITING_ACCOUNTANT' || bill.status === 'UNDER_REVIEW');
  const canApprove =
    !isFinance &&
    !isTerminal &&
    !usesAccountantPaymentFlow &&
    (isTransport
      ? ['AWAITING_ACCOUNTANT', 'UNDER_REVIEW', 'PAYMENT_POSTPONED'].includes(bill.status)
      : ['AWAITING_ACCOUNTANT', 'UNDER_REVIEW', 'RETURNED', 'PAYMENT_POSTPONED'].includes(
          bill.status,
        ));
  const isKyrgyzstanTransport = requestType === 'KYRGYZSTAN_DOMESTIC_TRANSPORT';
  const isChinaDomesticTransport = requestType === 'CHINA_DOMESTIC_TRANSPORT';
  const executionStatus = String(detail.executionStatus || '');
  const canReturnKyrgyzstanTransport =
    isKyrgyzstanTransport &&
    (['AWAITING_ACCOUNTANT', 'UNDER_REVIEW'].includes(bill.status) ||
      (bill.status === 'RETURNED' && executionStatus === 'RETURNED_TO_ACCOUNTANT'));
  const canReturnChinaDomesticTransport =
    isChinaDomesticTransport &&
    (['AWAITING_ACCOUNTANT', 'UNDER_REVIEW'].includes(bill.status) ||
      (bill.status === 'RETURNED' && executionStatus === 'RETURNED_TO_ACCOUNTANT'));
  const canReturnOrReject =
    !isFinance &&
    !isTerminal &&
    !usesAccountantPaymentFlow &&
    (isKyrgyzstanTransport
      ? canReturnKyrgyzstanTransport
      : isChinaDomesticTransport
        ? canReturnChinaDomesticTransport
        : ['AWAITING_ACCOUNTANT', 'UNDER_REVIEW', 'RETURNED', 'APPROVED'].includes(bill.status));
  const canPayFull =
    usesAccountantPaymentFlow &&
    billActions &&
    (billActions.showPayFull || billActions.showPayRemainder);
  const canCreateBillPartial = usesAccountantPaymentFlow && Boolean(billActions?.showPartial);
  const canPostponeBill =
    usesAccountantPaymentFlow &&
    Boolean(billActions?.showPostpone || billActions?.showChangePostponeDate);
  const canReturnForCorrection =
    usesAccountantPaymentFlow && Boolean(billActions?.showReturnForCorrection);
  const canPostpone =
    !usesAccountantPaymentFlow &&
    isSupplierOrCargo &&
    !isTerminal &&
    Number(bill.remainingAmount) > 0.009 &&
    bill.status !== 'PAYMENT_POSTPONED';
  const returnReason = detail.returnReason || null;
  const approvalStatus = detail.approvalStatus as string | undefined;
  const paymentStatus = detail.paymentStatus as string | undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/40"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-lg font-bold text-slate-950">{bill.requestNumber}</h3>
            <p className="mt-0.5 text-sm text-slate-600">
              {t(`finance.billsToPay.type.${requestType || 'SUPPLIER_PAYMENT'}`)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-sm font-semibold text-slate-500">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {!isChinaDomesticTransport ? (
                <Field label={t('finance.billsToPay.invoiceNumber')} value={bill.requestNumber || '—'} />
              ) : null}
              <Field
                label={t('finance.billsToPay.source')}
                value={t(`finance.billsToPay.type.${requestType || 'SUPPLIER_PAYMENT'}`)}
              />
              <Field label={t('finance.billsToPay.recipient')} value={bill.recipientName || '—'} />
              <Field
                label={t('finance.billsToPay.statusLabel')}
                value={t(`finance.billsToPay.status.${bill.status}`)}
              />
              {usesAccountantPaymentFlow && approvalStatus && !isSupplierPayment ? (
                <Field
                  label={t('finance.billsToPay.processingStatus')}
                  value={t(`finance.billsToPay.approvalStatus.${approvalStatus}`)}
                />
              ) : null}
              {usesAccountantPaymentFlow && paymentStatus ? (
                <Field
                  label={t('finance.billsToPay.paymentStatusLabel')}
                  value={t(`finance.billsToPay.cargoPaymentStatus.${paymentStatus}`)}
                />
              ) : null}
              {isSupplierPayment ? (
                <>
                  <Field
                    label={t('finance.billsToPay.amount')}
                    value={`${Number(detail.supplierAmountCny ?? detail.totalYuan ?? bill.amount).toFixed(2)} CNY`}
                  />
                  {Number(detail.exchangeRate || 0) > 0 ? (
                    <Field
                      label={t('finance.billsToPay.cnyToKgsRate')}
                      value={Number(detail.exchangeRate).toFixed(2)}
                    />
                  ) : null}
                  {Number(detail.approvedAmountKgs || 0) > 0 ? (
                    <Field
                      label={t('finance.billsToPay.amountInKgs')}
                      value={`${Number(detail.approvedAmountKgs).toFixed(2)} KGS`}
                    />
                  ) : null}
                  <Field
                    label={t('finance.billsToPay.paidPreviously')}
                    value={`${Number(detail.paidAmountKgs ?? bill.paidAmountKgs ?? 0).toFixed(2)} KGS`}
                  />
                  <Field
                    label={t('finance.billsToPay.remaining')}
                    value={`${Number(detail.remainingAmountKgs ?? bill.remainingAmountKgs ?? 0).toFixed(2)} KGS`}
                  />
                </>
              ) : isChinaDomesticTransport ? (
                <>
                  <Field
                    label={t('finance.billsToPay.amount')}
                    value={`${Number(bill.amount).toFixed(2)} CNY`}
                  />
                  {Number(detail.exchangeRate || 0) > 0 ? (
                    <Field
                      label={t('finance.billsToPay.cnyToKgsRate')}
                      value={Number(detail.exchangeRate).toFixed(2)}
                    />
                  ) : null}
                  {Number(detail.amountKgs || 0) > 0 ? (
                    <Field
                      label={t('finance.billsToPay.amountInKgs')}
                      value={`${Number(detail.amountKgs).toFixed(2)} сом`}
                    />
                  ) : null}
                  <Field
                    label={t('finance.billsToPay.paid')}
                    value={`${Number(bill.paidAmountKgs ?? bill.paidAmount ?? 0).toFixed(2)} KGS`}
                  />
                  <Field
                    label={t('finance.billsToPay.remaining')}
                    value={`${Number(bill.remainingAmountKgs ?? bill.remainingAmount ?? 0).toFixed(2)} KGS`}
                  />
                </>
              ) : (
                <>
                  <Field
                    label={t('finance.billsToPay.amount')}
                    value={`${Number(bill.amount).toFixed(2)} ${bill.currency}`}
                  />
                  <Field
                    label={t('finance.billsToPay.paid')}
                    value={`${Number(bill.paidAmount).toFixed(2)} ${bill.currency}`}
                  />
                  <Field
                    label={t('finance.billsToPay.remaining')}
                    value={`${Number(bill.remainingAmount).toFixed(2)} ${bill.currency}`}
                  />
                </>
              )}
              {returnReason ? (
                <Field
                  label={t('finance.billsToPay.returnReason')}
                  value={returnReason}
                />
              ) : null}
              <Field label={t('finance.billsToPay.sender')} value={bill.sender?.fullName || '—'} />
              <Field label={t('finance.billsToPay.department')} value={bill.departmentOrBranch || '—'} />
              {!isSupplierPayment && !isChinaDomesticTransport ? (
                <Field label={t('finance.billsToPay.basis')} value={bill.basis || '—'} />
              ) : null}
              {!isChinaDomesticTransport ? (
                <Field
                  label={t('finance.billsToPay.nextPaymentDate')}
                  value={
                    bill.nextPaymentDate
                      ? new Date(bill.nextPaymentDate).toLocaleDateString()
                      : '—'
                  }
                />
              ) : null}
              <Field
                label={t('finance.billsToPay.createdAt')}
                value={bill.submittedAt ? new Date(bill.submittedAt).toLocaleString() : '—'}
              />
              {bill.isOverdue ? (
                <div className="col-span-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  {requestType === 'CARGO_PAYMENT'
                    ? t('finance.billsToPay.overdueCargoWarning')
                    : requestType === 'SUPPLIER_PAYMENT' || bill.source === 'SUPPLIER_INVOICE'
                      ? t('finance.billsToPay.overdueSupplierWarning')
                      : t('finance.billsToPay.overdue')}
                </div>
              ) : null}
              {bill.paymentPostponeComment ? (
                <Field
                  label={t('finance.billsToPay.postponeComment')}
                  value={bill.paymentPostponeComment}
                />
              ) : null}
              {isTransport ? (
                <>
                  <Field
                    label={t('finance.billsToPay.order')}
                    value={bill.relatedOrderNumber || detail.procurementOrder?.orderNumber || '—'}
                  />
                  <Field
                    label={t('finance.billsToPay.paymentMethod')}
                    value={
                      detail.paymentMethod
                        ? t(`procurement.payments.method.${detail.paymentMethod}`)
                        : '—'
                    }
                  />
                  {!isChinaDomesticTransport ? (
                    <Field
                      label={t('finance.billsToPay.comment')}
                      value={detail.comment || detail.expenseName || '—'}
                    />
                  ) : null}
                </>
              ) : null}
            </dl>
          </section>

          {isTransport && invoices.length ? (
            <div className="mt-3 text-sm">
              <p className="font-semibold">{t('finance.billsToPay.supportingDocuments')}</p>
              <div className="mt-1 space-y-1">
                {invoices.map((file: { id: string; fileUrl: string; fileName: string }) => (
                  <a
                    key={file.id}
                    href={`${API_URL}${file.fileUrl}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-blue-700"
                  >
                    {file.fileName}
                  </a>
                ))}
              </div>
            </div>
          ) : null}

          {cargo ? (
            <div className="mt-3 rounded-lg border border-slate-200 p-3 text-sm">
              <p className="font-semibold">{t('finance.billsToPay.cargoCalc')}</p>
              <p>
                {t('procurement.sectionPayable.cargoWeightKg')}:{' '}
                {Number(cargo.totalWeightKg || 0).toFixed(3)}
              </p>
              <p>
                {t('procurement.sectionPayable.cargoRateUsdPerKg')}:{' '}
                {Number(cargo.cargoRateUsdPerKg || 0).toFixed(4)}
              </p>
              <p>
                {t('procurement.sectionPayable.usdExchangeRate')}:{' '}
                {Number(cargo.usdExchangeRate || 0).toFixed(4)}
              </p>
              <p>
                {t('procurement.sectionPayable.calculatedUsd')}:{' '}
                {Number(cargo.calculatedAmountUsd || 0).toFixed(2)}
              </p>
              <p>
                {t('procurement.sectionPayable.calculatedKgs')}:{' '}
                {Number(cargo.calculatedAmountKgs || 0).toFixed(2)}
              </p>
              {cargo.cargoReceipts?.length ? (
                <div className="mt-1 space-y-1">
                  {cargo.cargoReceipts.map((file: { id: string; fileUrl: string; fileName: string }) => (
                    <a
                      key={file.id}
                      href={`${API_URL}${file.fileUrl}`}
                      target="_blank"
                      rel="noreferrer"
                      className="block text-blue-700"
                    >
                      {file.fileName}
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {allQrs?.length ? (
            <div className="mt-3 text-sm">
              <p className="font-semibold">{t('finance.cashierBills.qrCodes')}</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {allQrs.map((qr: { id: string; fileUrl: string; fileName: string }, index: number) => (
                  <button
                    key={qr.id}
                    type="button"
                    onClick={() => {
                      const images = allQrs.map((item: { fileName: string; fileUrl: string }) => {
                        const src = item.fileUrl.startsWith('http')
                          ? item.fileUrl
                          : `${API_URL}${item.fileUrl}`;
                        return { src, alt: item.fileName, label: item.fileName };
                      });
                      onShowQr(images, index);
                    }}
                    className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                  >
                    {t('procurement.paymentInfo.showQr')}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <section className="mt-4">
            <h4 className="text-sm font-semibold text-slate-900">
              {t('finance.billsToPay.paymentHistory')}
            </h4>
            {payments.length ? (
              <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-xs">
                  <thead className="bg-slate-50 text-left font-bold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-2 py-2">{t('finance.billsToPay.date')}</th>
                      <th className="px-2 py-2">{t('finance.billsToPay.amount')}</th>
                      <th className="px-2 py-2">{t('finance.billsToPay.paymentMethod')}</th>
                      <th className="px-2 py-2">{t('finance.billsToPay.accountOrCashbox')}</th>
                      <th className="px-2 py-2">{t('finance.billsToPay.cashier')}</th>
                      <th className="px-2 py-2">{t('finance.billsToPay.statusLabel')}</th>
                      <th className="px-2 py-2">{t('finance.billsToPay.actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {payments.map((payment: any) => {
                      const amount =
                        payment.amountYuan != null
                          ? `${Number(payment.amountYuan).toFixed(2)} CNY`
                          : `${Number(payment.amountKgs ?? payment.amount ?? 0).toFixed(2)} KGS`;
                      const accountName =
                        payment.actualFinanceAccount?.name ||
                        payment.intendedFinanceAccount?.name ||
                        '—';
                      const dateValue =
                        payment.paidAt || payment.sentToCashierAt || payment.paymentDate || payment.createdAt;
                      const methodKey = payment.paymentMethod
                        ? payment.amountYuan != null
                          ? `procurement.payments.method.${payment.paymentMethod}`
                          : `finance.billsToPay.methodFromAccount.${payment.paymentMethod}`
                        : '';
                      const statusKey = payment.status
                        ? `finance.billsToPay.paymentStatus.${payment.status}`
                        : '';
                      const isDraft = payment.status === 'DRAFT';
                      return (
                        <tr key={payment.id}>
                          <td className="px-2 py-2 whitespace-nowrap">
                            {dateValue ? new Date(dateValue).toLocaleString() : '—'}
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap">{amount}</td>
                          <td className="px-2 py-2">
                            {methodKey ? t(methodKey) : '—'}
                          </td>
                          <td className="px-2 py-2">{accountName}</td>
                          <td className="px-2 py-2">{payment.cashier?.fullName || '—'}</td>
                          <td className="px-2 py-2">
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700">
                              {statusKey ? t(statusKey) : payment.status || '—'}
                            </span>
                          </td>
                          <td className="px-2 py-2">
                            {isDraft ? (
                              <div className="flex flex-wrap gap-1">
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={() => onEditPayment(payment)}
                                  className="rounded border border-slate-300 px-1.5 py-0.5 font-semibold text-slate-700 disabled:opacity-40"
                                >
                                  {t('finance.billsToPay.editPayment')}
                                </button>
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={() => onPayPayment(payment)}
                                  className="rounded border border-emerald-300 px-1.5 py-0.5 font-semibold text-emerald-700 disabled:opacity-40"
                                >
                                  {t('finance.billsToPay.pay')}
                                </button>
                              </div>
                            ) : canPermanentDelete ? (
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => onPermanentDeletePayment(payment)}
                                className="rounded border border-red-300 px-1.5 py-0.5 font-semibold text-red-700 disabled:opacity-40"
                              >
                                {t('finance.paymentPermanentDelete.action')}
                              </button>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-500">{t('finance.billsToPay.noPaymentHistory')}</p>
            )}
          </section>

          {isTransport || bill.source === 'SUPPLIER_INVOICE' ? (
            <div className="mt-4">
              <InvoiceReceiptHistoryPanel
                source={isTransport ? 'TRANSPORT_EXPENSE' : 'SUPPLIER_PAYMENT'}
                entityId={isTransport ? bill.id : String(detail.procurementOrderId || bill.id)}
              />
            </div>
          ) : null}

          {!isSupplierPayment && !isChinaDomesticTransport && auditHistory.length ? (
            <section className="mt-4">
              <h4 className="text-sm font-semibold text-slate-900">
                {t('finance.billsToPay.actionHistory')}
              </h4>
              <div className="mt-2 space-y-2">
                {auditHistory.map((entry: { id: string; action: string; timestamp: string }) => (
                  <div
                    key={entry.id}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                  >
                    <p className="font-semibold text-slate-800">{entry.action}</p>
                    <p className="text-slate-500">
                      {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '—'}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-200 px-5 py-4">
          {billActions?.showPaidBanner ? (
            <p className="w-full rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">
              {t('finance.billsToPay.fullyPaidBanner')}
            </p>
          ) : null}
          {billActions?.showAwaitingCorrectionBanner ? (
            <p className="w-full rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
              {t('finance.billsToPay.awaitingCorrectionBanner')}
            </p>
          ) : null}
          {billActions?.showCannotReturnMessage ? (
            <p className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {t('finance.billsToPay.cannotReturnWithPayments')}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
          {canTakeReview ? (
            <button
              type="button"
              disabled={saving}
              onClick={onTakeReview}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold disabled:opacity-40"
            >
              {t('finance.billsToPay.takeReview')}
            </button>
          ) : null}
          {canApprove ? (
            <button
              type="button"
              disabled={saving}
              onClick={onApprove}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              {t('finance.billsToPay.approve')}
            </button>
          ) : null}
          {canReturnOrReject ? (
            <>
              <button
                type="button"
                disabled={saving}
                onClick={onReturn}
                className="rounded-lg border border-amber-300 px-3 py-1.5 text-sm font-semibold text-amber-800 disabled:opacity-40"
              >
                {t('finance.billsToPay.return')}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={onReject}
                className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-700 disabled:opacity-40"
              >
                {t('finance.billsToPay.reject')}
              </button>
            </>
          ) : null}
          {canPayFull ? (
            <button
              type="button"
              disabled={saving}
              onClick={onPayFullCargo}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              {billActions?.payFullUsesRemainderLabel
                ? t('finance.billsToPay.payRemainder')
                : t('finance.billsToPay.payInFull')}
            </button>
          ) : null}
          {canCreateBillPartial ? (
            <button
              type="button"
              disabled={saving}
              onClick={onCreatePayment}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              {t('finance.billsToPay.createPartialPayment')}
            </button>
          ) : null}
          {canPostpone ? (
            <button
              type="button"
              disabled={saving}
              onClick={onPostpone}
              className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-900 disabled:opacity-40"
            >
              {t('finance.billsToPay.postponePayment')}
            </button>
          ) : null}
          {canPostponeBill ? (
            <button
              type="button"
              disabled={saving}
              onClick={onPostpone}
              className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-900 disabled:opacity-40"
            >
              {billActions?.postponeUsesChangeDateLabel
                ? t('finance.billsToPay.changePostponeDate')
                : t('finance.billsToPay.postponePayment')}
            </button>
          ) : null}
          {canReturnForCorrection ? (
            <button
              type="button"
              disabled={saving}
              onClick={onReturn}
              className="rounded-lg border border-amber-300 px-3 py-1.5 text-sm font-semibold text-amber-800 disabled:opacity-40"
            >
              {t('finance.billsToPay.return')}
            </button>
          ) : null}
          {canPermanentDelete && bill.source !== 'SUPPLIER_INVOICE' ? (
            <button
              type="button"
              disabled={saving}
              onClick={onPermanentDeleteBill}
              className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-700 disabled:opacity-40"
            >
              {t('finance.paymentPermanentDelete.action')}
            </button>
          ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function TransportApproveModal({
  t,
  modal,
  form,
  error,
  saving,
  accounts,
  onClose,
  onSubmit,
  onFormChange,
}: {
  t: (key: string) => string;
  modal: BillDetail;
  form: {
    financeAccountId: string;
    exchangeRateCnyKgs: string;
    accountantComment: string;
  };
  error: string;
  saving: boolean;
  accounts: Array<{ id: string; name: string; availableBalance: number; typeCode?: string }>;
  onClose: () => void;
  onSubmit: () => void;
  onFormChange: Dispatch<
    SetStateAction<{
      financeAccountId: string;
      exchangeRateCnyKgs: string;
      accountantComment: string;
    }>
  >;
}) {
  const currency = String(modal.currency || 'KGS').toUpperCase();
  const isCny = currency === 'CNY';
  const amountCny = Number(modal.amount ?? 0);
  const kgsPreview = isCny ? previewCnyToKgs(amountCny, form.exchangeRateCnyKgs) : null;

  return (
    <Modal title={t('finance.billsToPay.approve')} onClose={onClose}>
      {isCny ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <p className="text-xs font-semibold text-slate-700">
            {t('finance.billsToPay.amountCny')}: {amountCny.toFixed(2)} CNY
          </p>
          <label className="mt-2 block text-xs font-semibold">
            {t('finance.billsToPay.cnyToKgsRate')}
            <input
              type="text"
              inputMode="decimal"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
              value={form.exchangeRateCnyKgs}
              onChange={(e) =>
                onFormChange((prev) => ({
                  ...prev,
                  exchangeRateCnyKgs: normalizeExchangeRateInput(e.target.value),
                }))
              }
            />
          </label>
          <p className="mt-2 text-xs text-slate-700">
            {t('finance.billsToPay.amountInKgs')}: {formatKgsPreview(kgsPreview)}
          </p>
        </div>
      ) : (
        <p className="text-xs text-slate-600">
          {modal.requestNumber} · {Number(modal.amount).toFixed(2)} {modal.currency}
        </p>
      )}
      {error ? (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      <label className="mt-2 block text-xs font-semibold">
        {t('finance.billsToPay.accountOrCashbox')}
        <select
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          value={form.financeAccountId}
          onChange={(e) =>
            onFormChange((prev) => ({
              ...prev,
              financeAccountId: e.target.value,
            }))
          }
        >
          <option value="">{t('common.select')}</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name} ({Number(account.availableBalance).toFixed(2)} KGS)
            </option>
          ))}
        </select>
      </label>
      {!isCny && currency !== 'KGS' ? (
        <label className="mt-2 block text-xs font-semibold">
          {t('finance.billsToPay.exchangeRate')}
          <input
            type="text"
            inputMode="decimal"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            value={form.exchangeRateCnyKgs}
            onChange={(e) =>
              onFormChange((prev) => ({
                ...prev,
                exchangeRateCnyKgs: normalizeExchangeRateInput(e.target.value),
              }))
            }
          />
        </label>
      ) : null}
      <label className="mt-2 block text-xs font-semibold">
        {t('finance.billsToPay.comment')}
        <textarea
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          rows={2}
          value={form.accountantComment}
          onChange={(e) =>
            onFormChange((prev) => ({
              ...prev,
              accountantComment: e.target.value,
            }))
          }
        />
      </label>
      <button
        type="button"
        disabled={saving}
        onClick={onSubmit}
        className="mt-3 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
      >
        {t('finance.billsToPay.sendToCashier')}
      </button>
    </Modal>
  );
}

function SupplierPaymentModal({
  t,
  modal,
  form,
  error,
  saving,
  accounts,
  onClose,
  onSubmit,
  onFormChange,
}: {
  t: (key: string) => string;
  modal: { bill: BillDetail; mode: 'full' | 'partial' };
  form: {
    exchangeRateCnyKgs: string;
    exchangeRateLocked: boolean;
    paymentAmountKgs: string;
    financeAccountId: string;
    accountantComment: string;
  };
  error: string;
  saving: boolean;
  accounts: Array<{ id: string; name: string; availableBalance: number; typeCode?: string }>;
  onClose: () => void;
  onSubmit: () => void;
  onFormChange: Dispatch<
    SetStateAction<{
      exchangeRateCnyKgs: string;
      exchangeRateLocked: boolean;
      paymentAmountKgs: string;
      financeAccountId: string;
      accountantComment: string;
    }>
  >;
}) {
  const bill = modal.bill;
  const detail = bill.detail || {};
  const isCny = String(bill.currency || 'CNY').toUpperCase() === 'CNY';
  const supplierAmountCny = Number(detail.supplierAmountCny ?? detail.totalYuan ?? bill.amount ?? 0);
  const paidKgs = Number(detail.paidAmountKgs ?? bill.paidAmountKgs ?? 0);
  const approvedKgsPreview = isCny ? previewCnyToKgs(supplierAmountCny, form.exchangeRateCnyKgs) : null;
  const remainingPreview =
    approvedKgsPreview != null ? Math.max(approvedKgsPreview - paidKgs, 0) : null;

  return (
    <Modal
      title={
        modal.mode === 'full'
          ? t('finance.billsToPay.payInFull')
          : t('finance.billsToPay.createPartialPayment')
      }
      onClose={onClose}
    >
      {isCny ? (
        <p className="text-xs text-slate-600">
          {modal.mode === 'partial'
            ? t('finance.billsToPay.supplierTotalAmountCny')
            : t('finance.billsToPay.supplierAmountCny')}
          : {supplierAmountCny.toFixed(2)} CNY
        </p>
      ) : (
        <p className="text-xs text-slate-600">
          {bill.requestNumber} · {t('finance.billsToPay.remaining')}:{' '}
          {Number(bill.remainingAmountKgs ?? bill.remainingAmount).toFixed(2)} KGS
        </p>
      )}
      {error ? (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      {isCny ? (
        <>
          <label className="mt-2 block text-xs font-semibold">
            {t('finance.billsToPay.cnyToKgsRate')}
            <input
              type="text"
              inputMode="decimal"
              disabled={form.exchangeRateLocked}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:bg-slate-100"
              value={form.exchangeRateCnyKgs}
              onChange={(e) =>
                onFormChange((prev) => ({
                  ...prev,
                  exchangeRateCnyKgs: normalizeExchangeRateInput(e.target.value),
                }))
              }
            />
          </label>
          <p className="mt-2 text-xs text-slate-700">
            {modal.mode === 'partial'
              ? t('finance.billsToPay.totalAmountInKgs')
              : t('finance.billsToPay.amountInKgs')}
            : {formatKgsPreview(approvedKgsPreview)}
          </p>
          {modal.mode === 'partial' ? (
            <>
              <p className="mt-1 text-xs text-slate-600">
                {t('finance.billsToPay.paidPreviously')}:{' '}
                {paidKgs.toFixed(2)} KGS
              </p>
              <p className="mt-1 text-xs text-slate-600">
                {t('finance.billsToPay.remaining')}:{' '}
                {remainingPreview != null ? `${remainingPreview.toFixed(2)} KGS` : '—'}
              </p>
              <label className="mt-2 block text-xs font-semibold">
                {t('finance.billsToPay.currentPaymentAmount')} (KGS)
                <input
                  type="text"
                  inputMode="decimal"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                  value={form.paymentAmountKgs}
                  onChange={(e) =>
                    onFormChange((prev) => ({
                      ...prev,
                      paymentAmountKgs: e.target.value.replace(/[^\d.,]/g, ''),
                    }))
                  }
                />
              </label>
            </>
          ) : null}
        </>
      ) : modal.mode === 'partial' ? (
        <label className="mt-2 block text-xs font-semibold">
          {t('finance.billsToPay.paymentAmount')} (KGS)
          <input
            type="number"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            value={form.paymentAmountKgs}
            onChange={(e) =>
              onFormChange((prev) => ({ ...prev, paymentAmountKgs: e.target.value ?? '' }))
            }
          />
        </label>
      ) : null}
      <label className="mt-2 block text-xs font-semibold">
        {t('finance.billsToPay.accountOrCashbox')}
        <select
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          value={form.financeAccountId}
          onChange={(e) =>
            onFormChange((prev) => ({ ...prev, financeAccountId: e.target.value ?? '' }))
          }
        >
          <option value="">{t('common.select')}</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name} ({Number(account.availableBalance).toFixed(2)} KGS)
            </option>
          ))}
        </select>
      </label>
      <label className="mt-2 block text-xs font-semibold">
        {t('finance.billsToPay.commentOptional')}
        <textarea
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          rows={2}
          value={form.accountantComment}
          onChange={(e) =>
            onFormChange((prev) => ({ ...prev, accountantComment: e.target.value ?? '' }))
          }
        />
      </label>
      <button
        type="button"
        disabled={saving}
        onClick={onSubmit}
        className="mt-3 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
      >
        {t('finance.billsToPay.sendToCashier')}
      </button>
    </Modal>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-900">{value}</dd>
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="font-semibold text-slate-900">{title}</h4>
          <button type="button" onClick={onClose} className="text-sm font-semibold text-slate-500">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
