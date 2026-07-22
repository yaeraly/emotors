'use client';

import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { ProtectedShell } from '@/components/ProtectedShell';
import { API_URL, apiFetch, getToken } from '@/lib/api';
import { canConfirmSupplierPayment } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type BillSource = 'SUPPLIER_PAYMENT' | 'TRANSPORT_EXPENSE';

type BillRow = {
  id: string;
  source: BillSource;
  paymentNumber: string;
  requestNumber: string;
  requestType: string;
  sentToCashierAt: string | null;
  sender: { id: string; fullName: string; role?: string | null } | null;
  accountant: { id: string; fullName: string } | null;
  departmentOrBranch: string | null;
  recipientName: string;
  basis: string;
  amount: number;
  currency: string;
  amountKgs: number;
  debitAccountName: string | null;
  executionStatus: string;
  relatedOrderNumber?: string | null;
  relatedOrderId?: string | null;
  href: string;
};

type BillsResponse = {
  items: BillRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  summary: {
    awaitingCount: number;
    inProgressCount: number;
    paidTodayCount: number;
    totalPayableKgs: number;
  };
};

type BillDetail = Record<string, any>;

const REQUEST_TYPES = [
  'SUPPLIER_PAYMENT',
  'CHINA_DOMESTIC_TRANSPORT',
  'CARGO_PAYMENT',
  'KYRGYZSTAN_DOMESTIC_TRANSPORT',
  'OTHER_PROCUREMENT_EXPENSE',
] as const;

const EXECUTION_STATUSES = [
  'PENDING_EXECUTION',
  'IN_PROGRESS',
  'COMPLETED',
  'FAILED',
  'RETURNED_TO_ACCOUNTANT',
  'CANCELLED',
] as const;

const RETURN_REASONS = [
  'Неверные реквизиты',
  'QR Code не работает',
  'Недостаточно средств на счёте',
  'Получатель не найден',
  'Неверная сумма',
  'Банк отклонил платёж',
  'Требуется уточнение',
];

const emptyFilters = {
  requestType: '',
  executionStatus: '',
  currency: '',
  accountantId: '',
  senderId: '',
  departmentOrBranch: '',
  debitAccountId: '',
  search: '',
  dateFrom: '',
  dateTo: '',
};

function formatMoney(value: number) {
  return Number(value || 0).toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StatusBadge({ status, t }: { status: string; t: (key: string) => string }) {
  const tone =
    status === 'COMPLETED'
      ? 'bg-emerald-50 text-emerald-700'
      : status === 'IN_PROGRESS'
        ? 'bg-amber-50 text-amber-800'
        : status === 'FAILED'
          ? 'bg-red-50 text-red-700'
          : status === 'RETURNED_TO_ACCOUNTANT'
            ? 'bg-orange-50 text-orange-800'
            : 'bg-slate-100 text-slate-700';
  return (
    <span className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-semibold ${tone}`}>
      {t(`finance.cashierBills.status.${status}`)}
    </span>
  );
}

function SummaryChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm font-bold text-slate-900">{value}</div>
    </div>
  );
}

export default function CashierBillsPage() {
  return (
    <Suspense fallback={null}>
      <CashierBillsPageContent />
    </Suspense>
  );
}

function CashierBillsPageContent() {
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
  const [reasonModal, setReasonModal] = useState<{ mode: 'return' | 'fail'; row: BillRow } | null>(null);
  const [reason, setReason] = useState('');
  const [confirmModal, setConfirmModal] = useState<BillRow | null>(null);
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [cashierComment, setCashierComment] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [confirmError, setConfirmError] = useState('');
  const [pinNotice, setPinNotice] = useState('');
  const [pinning, setPinning] = useState(false);

  const canAccess = canConfirmSupplierPayment(user);

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
      const response = await apiFetch<BillsResponse>(`/procurement/cashier-bills?${queryString}`);
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
        if (!canConfirmSupplierPayment(current)) {
          setLoading(false);
          return;
        }
        await load();
        const deepSource = searchParams.get('source') as BillSource | null;
        const deepId = searchParams.get('id');
        if (deepSource && deepId) {
          const detail = await apiFetch<BillDetail>(`/procurement/cashier-bills/${deepSource}/${deepId}`);
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
      const detail = await apiFetch<BillDetail>(`/procurement/cashier-bills/${row.source}/${row.id}`);
      setSelected(detail);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function refreshAfterAction(row: BillRow) {
    await load();
    if (selected?.id === row.id) {
      const detail = await apiFetch<BillDetail>(`/procurement/cashier-bills/${row.source}/${row.id}`);
      setSelected(detail);
      return detail;
    }
    return null;
  }

  function selectedAsRow(): BillRow | null {
    if (!selected?.id || !selected?.source) return null;
    return {
      id: selected.id,
      source: selected.source as BillSource,
      paymentNumber: selected.paymentNumber || '',
      requestNumber: selected.requestNumber || '',
      requestType: selected.requestType || '',
      sentToCashierAt: selected.sentToCashierAt || null,
      sender: selected.sender || null,
      accountant: selected.accountant || null,
      departmentOrBranch: selected.departmentOrBranch || null,
      recipientName: selected.recipient?.name || selected.recipientName || '',
      basis: selected.basis || '',
      amount: Number(selected.amount || 0),
      currency: selected.currency || 'KGS',
      amountKgs: Number(selected.amountKgs || selected.approvedAmountKgs || 0),
      debitAccountName: selected.debitAccount?.name || selected.debitAccountName || null,
      executionStatus: selected.executionStatus || '',
      relatedOrderNumber: selected.relatedOrderNumber || selected.procurement?.orderNumber || null,
      relatedOrderId: selected.relatedOrderId || selected.procurement?.id || null,
      href: selected.href || '',
    };
  }

  function canActOnStatus(status?: string | null) {
    return !(
      status === 'COMPLETED' ||
      status === 'RETURNED_TO_ACCOUNTANT' ||
      status === 'CANCELLED'
    );
  }

  async function runAction(row: BillRow, path: string, body?: Record<string, unknown>) {
    if (saving) return;
    setSaving(true);
    setActionError('');
    try {
      await apiFetch(`/procurement/cashier-bills/${row.source}/${row.id}/${path}`, {
        method: 'POST',
        body: JSON.stringify(body || {}),
      });
      setReasonModal(null);
      setReason('');
      setConfirmModal(null);
      setCashierComment('');
      setReceiptFile(null);
      setConfirmError('');
      setPinNotice('');
      await refreshAfterAction(row);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function uploadReceipt(row: BillRow, file: File) {
    const token = getToken();
    if (!token) {
      throw new Error('Unauthorized');
    }
    const form = new FormData();
    form.append('file', file);

    let url = '';
    if (row.source === 'SUPPLIER_PAYMENT') {
      const orderId = selected?.relatedOrderId || selected?.procurement?.id || row.relatedOrderId;
      if (!orderId) throw new Error('Related order is missing');
      url = `${API_URL}/procurement/orders/${orderId}/supplier-payments/${row.id}/attachments`;
    } else {
      url = `${API_URL}/procurement/transport-expenses/${row.id}/attachments/receipt`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({} as { message?: string | string[] }));
      const rawMessage = payload?.message || t('common.error');
      const message = Array.isArray(rawMessage) ? rawMessage.join(', ') : String(rawMessage);
      throw new Error(message);
    }
  }

  function openConfirmModal(row: BillRow) {
    setConfirmModal(row);
    setConfirmError('');
    setPinNotice('');
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setCashierComment(selected?.cashierComment || '');
    setReceiptFile(null);
    if (!selected || selected.id !== row.id) {
      void openDetail(row);
    }
  }

  async function pinPayment(row: BillRow) {
    if (saving || pinning) return;
    setPinning(true);
    setConfirmError('');
    setPinNotice('');
    setActionError('');
    try {
      if (receiptFile) {
        await uploadReceipt(row, receiptFile);
        setReceiptFile(null);
      }
      const status = selected?.id === row.id ? selected.executionStatus : row.executionStatus;
      if (status === 'PENDING_EXECUTION') {
        await apiFetch(`/procurement/cashier-bills/${row.source}/${row.id}/start`, {
          method: 'POST',
          body: JSON.stringify({}),
        });
      }
      await refreshAfterAction(row);
      setPinNotice(t('finance.cashierBills.pinned'));
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.error');
      setConfirmError(message);
      setActionError(message);
    } finally {
      setPinning(false);
    }
  }

  async function confirmPayment(row: BillRow) {
    if (saving || pinning) return;
    setConfirmError('');
    setPinNotice('');
    setActionError('');

    if (!paymentDate.trim()) {
      setConfirmError(t('finance.cashierBills.paymentDateRequired'));
      return;
    }
    const hasExistingReceipt = Array.isArray(selected?.receiptAttachments) && selected.receiptAttachments.length > 0;
    if (!receiptFile && !hasExistingReceipt) {
      setConfirmError(t('finance.cashierBills.receiptRequired'));
      return;
    }

    setSaving(true);
    try {
      if (receiptFile) {
        await uploadReceipt(row, receiptFile);
      }
      await apiFetch(`/procurement/cashier-bills/${row.source}/${row.id}/confirm`, {
        method: 'POST',
        body: JSON.stringify({
          paymentDate,
          cashierComment: cashierComment || undefined,
          expectedVersion: selected?.version,
        }),
      });
      setConfirmModal(null);
      setCashierComment('');
      setReceiptFile(null);
      setConfirmError('');
      setPinNotice('');
      await refreshAfterAction(row);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.error');
      setConfirmError(message);
      setActionError(message);
    } finally {
      setSaving(false);
    }
  }

  function copyText(value?: string | null) {
    if (!value) return;
    void navigator.clipboard?.writeText(value);
  }

  if (!user) {
    return (
      <ProtectedShell>
        <div className="p-6 text-sm text-slate-500">{t('common.loading')}</div>
      </ProtectedShell>
    );
  }

  if (!canAccess) {
    return (
      <ProtectedShell>
        <div className="p-6 text-sm text-red-700">{t('errors.accessDenied') || 'Access denied'}</div>
      </ProtectedShell>
    );
  }

  const summary = data?.summary;
  const activeRow = confirmModal || reasonModal?.row;

  return (
    <ProtectedShell>
      <div className="space-y-4 p-4 md:p-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">{t('finance.cashierBills')}</h1>
          <p className="mt-1 text-sm text-slate-600">{t('finance.cashierBills.subtitle')}</p>
        </div>

        {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        {actionError ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p> : null}

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <SummaryChip label={t('finance.cashierBills.awaiting')} value={String(summary?.awaitingCount ?? 0)} />
          <SummaryChip label={t('finance.cashierBills.inProgress')} value={String(summary?.inProgressCount ?? 0)} />
          <SummaryChip label={t('finance.cashierBills.paidToday')} value={String(summary?.paidTodayCount ?? 0)} />
          <SummaryChip
            label={t('finance.cashierBills.totalPayableKgs')}
            value={`${formatMoney(summary?.totalPayableKgs ?? 0)} KGS`}
          />
        </div>

        <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-3">
          <select
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            value={filters.requestType}
            onChange={(e) => { setPage(1); setFilters({ ...filters, requestType: e.target.value }); }}
          >
            <option value="">{t('finance.cashierBills.filterType')}</option>
            {REQUEST_TYPES.map((type) => (
              <option key={type} value={type}>{t(`finance.cashierBills.type.${type}`)}</option>
            ))}
          </select>
          <select
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            value={filters.executionStatus}
            onChange={(e) => { setPage(1); setFilters({ ...filters, executionStatus: e.target.value }); }}
          >
            <option value="">{t('finance.cashierBills.filterStatus')}</option>
            {EXECUTION_STATUSES.map((status) => (
              <option key={status} value={status}>{t(`finance.cashierBills.status.${status}`)}</option>
            ))}
          </select>
          <select
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            value={filters.currency}
            onChange={(e) => { setPage(1); setFilters({ ...filters, currency: e.target.value }); }}
          >
            <option value="">{t('finance.cashierBills.filterCurrency')}</option>
            <option value="KGS">KGS</option>
            <option value="CNY">CNY</option>
            <option value="USD">USD</option>
          </select>
          <input
            className="min-w-[160px] flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            placeholder={t('finance.cashierBills.search')}
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

        {loading ? <p className="text-sm text-slate-500">{t('common.loading')}</p> : null}
        {!loading && !data?.items.length ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
            {t('finance.cashierBills.empty')}
          </div>
        ) : null}

        {!loading && data?.items.length ? (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">№</th>
                  <th className="px-3 py-2">{t('finance.cashierBills.sentAt')}</th>
                  <th className="px-3 py-2">{t('finance.cashierBills.type')}</th>
                  <th className="px-3 py-2">{t('finance.cashierBills.recipient')}</th>
                  <th className="px-3 py-2">{t('finance.cashierBills.amount')}</th>
                  <th className="px-3 py-2">KGS</th>
                  <th className="px-3 py-2">{t('finance.cashierBills.debitAccount')}</th>
                  <th className="px-3 py-2">{t('finance.cashierBills.statusColumn')}</th>
                  <th className="px-3 py-2">{t('finance.cashierBills.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((row) => (
                  <tr key={`${row.source}-${row.id}`}>
                    <td className="px-3 py-2 font-semibold">{row.paymentNumber}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDate(row.sentToCashierAt)}</td>
                    <td className="px-3 py-2">{t(`finance.cashierBills.type.${row.requestType}`)}</td>
                    <td className="px-3 py-2">{row.recipientName}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatMoney(row.amount)} {row.currency}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatMoney(row.amountKgs)}</td>
                    <td className="px-3 py-2">{row.debitAccountName || '—'}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={row.executionStatus} t={t} />
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void openDetail(row)}
                        className="rounded bg-slate-800 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {t('finance.cashierBills.open')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {data && data.totalPages > 1 ? (
          <div className="flex items-center gap-2 text-sm">
            <button
              type="button"
              disabled={page <= 1 || saving}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
            >
              ←
            </button>
            <span>{page} / {data.totalPages}</span>
            <button
              type="button"
              disabled={page >= data.totalPages || saving}
              onClick={() => setPage((p) => p + 1)}
              className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
            >
              →
            </button>
          </div>
        ) : null}

        {selected ? (
          <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/40" onClick={() => setSelected(null)}>
            <aside
              className="h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-950">{selected.paymentNumber}</h2>
                  <p className="text-sm text-slate-600">{selected.requestNumber}</p>
                  <div className="mt-1"><StatusBadge status={selected.executionStatus} t={t} /></div>
                </div>
                <button type="button" className="text-sm text-slate-500" onClick={() => setSelected(null)}>✕</button>
              </div>

              <dl className="space-y-2 text-sm">
                <DetailRow label={t('finance.cashierBills.type')} value={t(`finance.cashierBills.type.${selected.requestType}`)} />
                <DetailRow label={t('finance.cashierBills.sender')} value={selected.sender?.fullName} />
                <DetailRow label={t('finance.cashierBills.accountant')} value={selected.accountant?.fullName} />
                <DetailRow label={t('finance.cashierBills.recipient')} value={selected.recipient?.name} onCopy={() => copyText(selected.recipient?.name)} />
                <DetailRow label={t('finance.cashierBills.amount')} value={`${formatMoney(selected.amount)} ${selected.currency}`} />
                <DetailRow label={t('finance.cashierBills.exchangeRate')} value={selected.exchangeRate != null ? String(selected.exchangeRate) : '—'} />
                <DetailRow label="KGS" value={formatMoney(selected.amountKgs || selected.approvedAmountKgs)} />
                <DetailRow label={t('finance.cashierBills.debitAccount')} value={selected.debitAccount?.name} />
                {selected.debitAccount?.availableBalance != null ? (
                  <DetailRow
                    label={t('finance.cashierBills.availableBalance')}
                    value={`${formatMoney(Number(selected.debitAccount.availableBalance))} ${selected.debitAccount.currency || 'KGS'}`}
                  />
                ) : null}
                <DetailRow label={t('finance.cashierBills.paymentMethod')} value={selected.paymentMethod} />
                <DetailRow label={t('finance.cashierBills.bankName')} value={selected.recipient?.bankName} onCopy={() => copyText(selected.recipient?.bankName)} />
                <DetailRow label={t('finance.cashierBills.accountNumber')} value={selected.recipient?.accountNumber} onCopy={() => copyText(selected.recipient?.accountNumber)} />
                <DetailRow label={t('finance.cashierBills.accountHolder')} value={selected.recipient?.beneficiaryName || selected.recipient?.company} onCopy={() => copyText(selected.recipient?.beneficiaryName || selected.recipient?.company)} />
                <DetailRow label={t('finance.cashierBills.instructions')} value={selected.paymentInstructions || selected.accountantComment} />
                {selected.returnReason ? <DetailRow label={t('finance.cashierBills.returnReason')} value={selected.returnReason} /> : null}
                {selected.failureReason ? <DetailRow label={t('finance.cashierBills.failureReason')} value={selected.failureReason} /> : null}
              </dl>

              {selected.procurement ? (
                <section className="mt-4 rounded-lg border border-slate-200 p-3 text-sm">
                  <h3 className="mb-2 font-semibold">{t('finance.cashierBills.supplierDetails')}</h3>
                  <DetailRow label={t('finance.cashierBills.supplier')} value={selected.supplier?.name} />
                  <DetailRow label={t('finance.cashierBills.orderNumber')} value={selected.procurement.orderNumber} />
                  <DetailRow label={t('finance.cashierBills.totalProcurement')} value={`${formatMoney(selected.procurement.totalYuan)} CNY`} />
                  <DetailRow label={t('finance.cashierBills.paidAmount')} value={`${formatMoney(selected.procurement.totalPaidYuan)} CNY`} />
                  <DetailRow label={t('finance.cashierBills.remainingDebt')} value={`${formatMoney(selected.procurement.remainingYuan)} CNY`} />
                  <DetailRow label={t('finance.cashierBills.costBase')} value={`${formatMoney(selected.procurement.costBaseYuan)} CNY`} />
                </section>
              ) : null}

              {selected.cargo ? (
                <section className="mt-4 rounded-lg border border-slate-200 p-3 text-sm">
                  <h3 className="mb-2 font-semibold">{t('finance.cashierBills.cargoDetails')}</h3>
                  <DetailRow label={t('finance.cashierBills.transportCompany')} value={selected.cargo.transportCompany} />
                  <DetailRow label={t('finance.cashierBills.weight')} value={selected.cargo.totalWeightKg != null ? String(selected.cargo.totalWeightKg) : '—'} />
                  <DetailRow label={t('finance.cashierBills.cargoRate')} value={selected.cargo.cargoRateUsdPerKg != null ? String(selected.cargo.cargoRateUsdPerKg) : '—'} />
                  <DetailRow label={t('finance.cashierBills.usdRate')} value={selected.cargo.usdExchangeRate != null ? String(selected.cargo.usdExchangeRate) : '—'} />
                  <DetailRow label={t('finance.cashierBills.cargoAmount')} value={selected.cargo.calculatedAmountKgs != null ? `${formatMoney(selected.cargo.calculatedAmountKgs)} KGS` : '—'} />
                </section>
              ) : null}

              <AttachmentBlock
                title={t('finance.cashierBills.qrCodes')}
                items={selected.qrAttachments || []}
                t={t}
              />
              <AttachmentBlock
                title={t('finance.cashierBills.receipts')}
                items={selected.receiptAttachments || []}
                t={t}
              />
              <AttachmentBlock
                title={t('finance.cashierBills.supporting')}
                items={selected.supportingAttachments || selected.cargoReceipts || []}
                t={t}
              />

              {Array.isArray(selected.previousPayments) && selected.previousPayments.length ? (
                <section className="mt-4 text-sm">
                  <h3 className="mb-2 font-semibold">{t('finance.cashierBills.paymentHistory')}</h3>
                  <ul className="space-y-1">
                    {selected.previousPayments.map((p: any) => (
                      <li key={p.id} className="rounded border border-slate-200 px-2 py-1">
                        {p.paymentNumber}: {formatMoney(p.amountYuan)} CNY / {formatMoney(p.amountKgs)} KGS · {p.status}
                        {p.receiptCount ? ` · ${t('finance.cashierBills.receiptCount')}: ${p.receiptCount}` : ''}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {(() => {
                const row = selectedAsRow();
                if (!row || !canAccess) return null;
                const busy = !canActOnStatus(selected.executionStatus);
                const canStart = !busy && selected.executionStatus !== 'IN_PROGRESS';
                const canConfirm = !busy;
                const canReturn = !busy;
                const canFail = !busy;
                if (!canStart && !canConfirm && !canReturn && !canFail) return null;
                return (
                  <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-200 pt-4">
                    {canStart ? (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void runAction(row, 'start')}
                        className="rounded bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {t('finance.cashierBills.start')}
                      </button>
                    ) : null}
                    {canConfirm ? (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => openConfirmModal(row)}
                        className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {t('finance.cashierBills.confirm')}
                      </button>
                    ) : null}
                    {canReturn ? (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => {
                          setReasonModal({ mode: 'return', row });
                          setReason(RETURN_REASONS[0]);
                        }}
                        className="rounded bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {t('finance.cashierBills.return')}
                      </button>
                    ) : null}
                    {canFail ? (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => {
                          setReasonModal({ mode: 'fail', row });
                          setReason('');
                        }}
                        className="rounded bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {t('finance.cashierBills.fail')}
                      </button>
                    ) : null}
                  </div>
                );
              })()}
            </aside>
          </div>
        ) : null}

        {reasonModal ? (
          <Modal title={reasonModal.mode === 'return' ? t('finance.cashierBills.return') : t('finance.cashierBills.fail')} onClose={() => setReasonModal(null)}>
            {reasonModal.mode === 'return' ? (
              <select className="mb-2 w-full rounded border border-slate-300 px-2 py-1.5 text-sm" value={reason} onChange={(e) => setReason(e.target.value)}>
                {RETURN_REASONS.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            ) : null}
            <textarea
              className="mb-3 h-24 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={reasonModal.mode === 'return' ? t('finance.cashierBills.returnReason') : t('finance.cashierBills.failureReason')}
            />
            <button
              type="button"
              disabled={saving || reason.trim().length < 3}
              onClick={() => void runAction(reasonModal.row, reasonModal.mode === 'return' ? 'return' : 'fail', { reason })}
              className="rounded bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {t('common.confirm')}
            </button>
          </Modal>
        ) : null}

        {confirmModal && activeRow ? (
          <Modal
            title={t('finance.cashierBills.confirm')}
            onClose={() => {
              if (saving || pinning) return;
              setConfirmModal(null);
              setConfirmError('');
              setPinNotice('');
            }}
          >
            <p className="mb-2 text-sm text-slate-600">
              {confirmModal.paymentNumber}: {formatMoney(confirmModal.amount)} {confirmModal.currency} → {formatMoney(confirmModal.amountKgs)} KGS
            </p>
            <label className="mb-2 block text-xs font-semibold text-slate-600">{t('finance.cashierBills.paymentDate')}</label>
            <input
              type="date"
              required
              className="mb-3 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
            />
            <label className="mb-2 block text-xs font-semibold text-slate-600">{t('finance.cashierBills.receipt')}</label>
            <input
              type="file"
              accept="image/*,application/pdf"
              className="mb-3 block w-full text-sm"
              onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
            />
            <label className="mb-2 block text-xs font-semibold text-slate-600">{t('finance.cashierBills.comment')}</label>
            <textarea
              className="mb-3 h-20 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              value={cashierComment}
              onChange={(e) => setCashierComment(e.target.value)}
            />
            {confirmError ? (
              <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{confirmError}</p>
            ) : null}
            {pinNotice ? (
              <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{pinNotice}</p>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={saving || pinning}
                onClick={() => void pinPayment(confirmModal)}
                className="rounded border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-800 disabled:opacity-50"
              >
                {pinning ? t('common.saving') : t('finance.cashierBills.pin')}
              </button>
              <button
                type="button"
                disabled={saving || pinning}
                onClick={() => void confirmPayment(confirmModal)}
                className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? t('common.saving') : t('finance.cashierBills.confirm')}
              </button>
            </div>
          </Modal>
        ) : null}
      </div>
    </ProtectedShell>
  );
}

function DetailRow({
  label,
  value,
  onCopy,
}: {
  label: string;
  value?: string | null;
  onCopy?: () => void;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900">
        {value}
        {onCopy ? (
          <button type="button" onClick={onCopy} className="ml-2 text-xs text-blue-600">copy</button>
        ) : null}
      </dd>
    </div>
  );
}

function AttachmentBlock({
  title,
  items,
  t,
}: {
  title: string;
  items: Array<{ id: string; fileName: string; fileUrl: string }>;
  t: (key: string) => string;
}) {
  if (!items?.length) return null;
  return (
    <section className="mt-4 text-sm">
      <h3 className="mb-2 font-semibold">{title}</h3>
      <ul className="space-y-2">
        {items.map((file) => {
          const url = file.fileUrl.startsWith('http') ? file.fileUrl : `${API_URL}${file.fileUrl}`;
          const isImage = /\.(png|jpe?g|webp|gif)$/i.test(file.fileName);
          return (
            <li key={file.id} className="rounded border border-slate-200 p-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="truncate">{file.fileName}</span>
                <a href={url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-blue-600">
                  {t('finance.cashierBills.openFile')}
                </a>
              </div>
              {isImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt={file.fileName} className="max-h-48 w-full rounded object-contain" />
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-bold text-slate-950">{title}</h3>
          <button type="button" onClick={onClose} className="text-slate-500">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
