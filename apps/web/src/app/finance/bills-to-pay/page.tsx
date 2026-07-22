'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  FinanceEmptyState,
  FinanceErrorState,
  FinanceLayout,
  FinanceLoadingState,
} from '@/components/finance/FinanceLayout';
import { API_URL, apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';
import { canCreateSupplierPayment } from '@/lib/rbac';
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
  relatedOrderNumber?: string | null;
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
    partiallyPaidCount: number;
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
  const [paymentForm, setPaymentForm] = useState({
    amountYuan: '',
    exchangeRate: '',
    financeAccountId: '',
    accountantComment: '',
  });
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string; availableBalance: number }>>([]);

  const canAccess = canCreateSupplierPayment(user);

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

  async function openPaymentModal(row: BillRow) {
    setPaymentModal(row);
    setPaymentForm({
      amountYuan: row.remainingAmount > 0 ? String(row.remainingAmount) : '',
      exchangeRate: '',
      financeAccountId: '',
      accountantComment: '',
    });
    try {
      const list = await apiFetch<Array<{ id: string; name: string; availableBalance: number }>>(
        '/procurement/supplier-payment-accounts',
      );
      setAccounts(list);
    } catch {
      setAccounts([]);
    }
  }

  async function createSupplierPayment(sendToCashier: boolean) {
    if (!paymentModal || paymentModal.source !== 'SUPPLIER_INVOICE') return;
    setSaving(true);
    setActionError('');
    try {
      await apiFetch(`/procurement/orders/${paymentModal.id}/supplier-payments`, {
        method: 'POST',
        body: JSON.stringify({
          amountYuan: Number(paymentForm.amountYuan),
          exchangeRate: Number(paymentForm.exchangeRate),
          intendedFinanceAccountId: paymentForm.financeAccountId || undefined,
          accountantComment: paymentForm.accountantComment || undefined,
          sendToCashier,
        }),
      });
      setPaymentModal(null);
      await load();
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
          onClose={() => setSelected(null)}
          onTakeReview={() => void runAction('take-review')}
          onApprove={() => void runAction('approve', { sendToCashier: true })}
          onReturn={() => setReasonModal({ mode: 'return', bill: selected })}
          onReject={() => setReasonModal({ mode: 'reject', bill: selected })}
          onCreatePayment={() => void openPaymentModal(selected)}
        />
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
        <Modal title={t('finance.billsToPay.createPayment')} onClose={() => setPaymentModal(null)}>
          <p className="text-xs text-slate-600">
            {t('finance.billsToPay.remaining')}: {Number(paymentModal.remainingAmount).toFixed(2)} {paymentModal.currency}
          </p>
          <label className="mt-2 block text-xs font-semibold">
            {t('finance.billsToPay.paymentAmount')}
            <input
              type="number"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              value={paymentForm.amountYuan}
              onChange={(e) => setPaymentForm({ ...paymentForm, amountYuan: e.target.value })}
            />
          </label>
          <label className="mt-2 block text-xs font-semibold">
            {t('finance.billsToPay.exchangeRate')}
            <input
              type="number"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              value={paymentForm.exchangeRate}
              onChange={(e) => setPaymentForm({ ...paymentForm, exchangeRate: e.target.value })}
            />
          </label>
          <p className="mt-1 text-xs text-slate-600">
            KGS:{' '}
            {(Number(paymentForm.amountYuan || 0) * Number(paymentForm.exchangeRate || 0) || 0).toFixed(2)}
          </p>
          <label className="mt-2 block text-xs font-semibold">
            {t('finance.billsToPay.financeAccount')}
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              value={paymentForm.financeAccountId}
              onChange={(e) => setPaymentForm({ ...paymentForm, financeAccountId: e.target.value })}
            >
              <option value="">{t('common.select')}</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void createSupplierPayment(false)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold"
            >
              {t('finance.billsToPay.saveDraftPayment')}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void createSupplierPayment(true)}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white"
            >
              {t('finance.billsToPay.sendToCashier')}
            </button>
          </div>
        </Modal>
      ) : null}
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
  onClose,
  onTakeReview,
  onApprove,
  onReturn,
  onReject,
  onCreatePayment,
}: {
  t: (key: string) => string;
  bill: BillDetail;
  saving: boolean;
  onClose: () => void;
  onTakeReview: () => void;
  onApprove: () => void;
  onReturn: () => void;
  onReject: () => void;
  onCreatePayment: () => void;
}) {
  const detail = bill.detail || {};
  const cargo = detail.cargo;
  const allQrs = Array.isArray(detail.qrCodes) ? detail.qrCodes : [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40">
      <div className="h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-2xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-950">{bill.requestNumber}</h3>
            <p className="text-sm text-slate-600">
              {t(`finance.billsToPay.type.${bill.requestType}`)} ·{' '}
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold">
                {t(`finance.billsToPay.status.${bill.status}`)}
              </span>
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-sm font-semibold text-slate-500">
            ✕
          </button>
        </div>

        <dl className="grid grid-cols-2 gap-2 text-sm">
          <Field label={t('finance.billsToPay.sender')} value={bill.sender?.fullName || '—'} />
          <Field label={t('finance.billsToPay.department')} value={bill.departmentOrBranch || '—'} />
          <Field label={t('finance.billsToPay.recipient')} value={bill.recipientName} />
          <Field label={t('finance.billsToPay.basis')} value={bill.basis} />
          <Field label={t('finance.billsToPay.amount')} value={`${Number(bill.amount).toFixed(2)} ${bill.currency}`} />
          <Field label={t('finance.billsToPay.paid')} value={`${Number(bill.paidAmount).toFixed(2)} ${bill.currency}`} />
          <Field label={t('finance.billsToPay.remaining')} value={`${Number(bill.remainingAmount).toFixed(2)} ${bill.currency}`} />
          <Field
            label={t('finance.billsToPay.date')}
            value={bill.submittedAt ? new Date(bill.submittedAt).toLocaleString() : '—'}
          />
        </dl>

        {bill.source === 'SUPPLIER_INVOICE' ? (
          <div className="mt-3 rounded-lg border border-slate-200 p-3 text-sm">
            <p className="font-semibold">{t('finance.billsToPay.supplierDetails')}</p>
            <p>{t('finance.billsToPay.totalCny')}: {Number(detail.totalYuan || 0).toFixed(2)}</p>
            <p>{t('finance.billsToPay.paid')}: {Number(detail.totalPaidYuan || 0).toFixed(2)} CNY</p>
            <p>{t('finance.billsToPay.remaining')}: {Number(detail.remainingYuan || 0).toFixed(2)} CNY</p>
            {detail.invoiceReturnReason ? (
              <p className="mt-1 text-amber-800">{t('finance.billsToPay.returnReason')}: {detail.invoiceReturnReason}</p>
            ) : null}
            {detail.invoiceRejectReason ? (
              <p className="mt-1 text-red-700">{t('finance.billsToPay.rejectReason')}: {detail.invoiceRejectReason}</p>
            ) : null}
          </div>
        ) : null}

        {cargo ? (
          <div className="mt-3 rounded-lg border border-slate-200 p-3 text-sm">
            <p className="font-semibold">{t('finance.billsToPay.cargoCalc')}</p>
            <p>{t('procurement.sectionPayable.cargoWeightKg')}: {Number(cargo.totalWeightKg || 0).toFixed(3)}</p>
            <p>{t('procurement.sectionPayable.cargoRateUsdPerKg')}: {Number(cargo.cargoRateUsdPerKg || 0).toFixed(4)}</p>
            <p>{t('procurement.sectionPayable.usdExchangeRate')}: {Number(cargo.usdExchangeRate || 0).toFixed(4)}</p>
            <p>{t('procurement.sectionPayable.calculatedUsd')}: {Number(cargo.calculatedAmountUsd || 0).toFixed(2)}</p>
            <p>{t('procurement.sectionPayable.calculatedKgs')}: {Number(cargo.calculatedAmountKgs || 0).toFixed(2)}</p>
            {cargo.cargoReceipts?.length ? (
              <div className="mt-1 space-y-1">
                {cargo.cargoReceipts.map((file: any) => (
                  <a key={file.id} href={`${API_URL}${file.fileUrl}`} target="_blank" rel="noreferrer" className="block text-blue-700">
                    {file.fileName}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {allQrs?.length ? (
          <div className="mt-3 text-sm">
            <p className="font-semibold">QR</p>
            <div className="mt-1 space-y-1">
              {allQrs.map((qr: any) => (
                <a key={qr.id} href={`${API_URL}${qr.fileUrl}`} target="_blank" rel="noreferrer" className="block text-blue-700">
                  {qr.fileName}
                </a>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {(bill.status === 'AWAITING_ACCOUNTANT' || bill.status === 'UNDER_REVIEW') && bill.source !== 'FINANCE_EXPENSE' ? (
            <button type="button" disabled={saving} onClick={onTakeReview} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold">
              {t('finance.billsToPay.takeReview')}
            </button>
          ) : null}
          {bill.source !== 'FINANCE_EXPENSE' && !['FULLY_PAID', 'REJECTED', 'CANCELLED'].includes(bill.status) ? (
            <>
              <button type="button" disabled={saving} onClick={onApprove} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white">
                {t('finance.billsToPay.approve')}
              </button>
              <button type="button" disabled={saving} onClick={onReturn} className="rounded-lg border border-amber-300 px-3 py-1.5 text-sm font-semibold text-amber-800">
                {t('finance.billsToPay.return')}
              </button>
              <button type="button" disabled={saving} onClick={onReject} className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-700">
                {t('finance.billsToPay.reject')}
              </button>
            </>
          ) : null}
          {bill.source === 'SUPPLIER_INVOICE' && !['REJECTED', 'CANCELLED', 'FULLY_PAID'].includes(bill.status) ? (
            <button type="button" disabled={saving} onClick={onCreatePayment} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white">
              {t('finance.billsToPay.createPartialPayment')}
            </button>
          ) : null}
          <Link href={bill.href} className="rounded-lg border border-blue-200 px-3 py-1.5 text-sm font-semibold text-blue-700">
            {t('finance.billsToPay.openSource')}
          </Link>
        </div>

        {detail.payments?.length ? (
          <div className="mt-4">
            <p className="text-sm font-semibold">{t('finance.billsToPay.paymentHistory')}</p>
            <ul className="mt-2 space-y-1 text-xs text-slate-700">
              {detail.payments.map((payment: any) => (
                <li key={payment.id} className="rounded border border-slate-200 px-2 py-1">
                  #{payment.sequenceNumber} · ¥{Number(payment.amountYuan).toFixed(2)} · rate {Number(payment.exchangeRate).toFixed(4)} ·{' '}
                  {payment.status}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
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
