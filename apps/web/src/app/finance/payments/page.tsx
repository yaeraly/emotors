'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  FinanceEmptyState,
  FinanceErrorState,
  FinanceLayout,
  FinanceLoadingState,
  FinanceMoney,
  FinanceStatusBadge,
} from '@/components/finance/FinanceLayout';
import { FINANCE_PAYMENT_TABS } from '@/lib/finance-nav';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';

type FinancePaymentRow = {
  id: string;
  source: string;
  sourceNumber: string;
  receiptNumber: string | null;
  customer: { fullName: string; phone: string };
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: string;
  date: string;
  canAccept: boolean;
};

export default function FinancePaymentsPage() {
  return (
    <Suspense fallback={null}>
      <FinancePaymentsPageContent />
    </Suspense>
  );
}

function FinancePaymentsPageContent() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const status = searchParams.get('status') ?? undefined;
  const [rows, setRows] = useState<FinancePaymentRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (search.trim()) params.set('search', search.trim());
    const query = params.toString() ? `?${params}` : '';
    setLoading(true);
    apiFetch<FinancePaymentRow[]>(`/finance/payments${query}`)
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false));
  }, [status, search, t]);

  return (
    <FinanceLayout titleKey="finance.payments" breadcrumbs={[{ labelKey: 'finance.payments' }]} sectionTabs={FINANCE_PAYMENT_TABS}>
      {error ? <FinanceErrorState message={error} /> : null}
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('finance.searchPayments')} className="w-full rounded-xl border border-slate-300 px-4 py-3 md:max-w-md" />
      {loading ? <FinanceLoadingState /> : null}
      {!loading && rows.length === 0 ? <FinanceEmptyState messageKey="finance.noPayments" /> : null}
      {!loading && rows.length > 0 ? (
        <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-3">{t('finance.payment')}</th>
                <th className="px-4 py-3">{t('finance.source')}</th>
                <th className="px-4 py-3">{t('customers.customer')}</th>
                <th className="px-4 py-3">{t('finance.amount')}</th>
                <th className="px-4 py-3">{t('finance.paid')}</th>
                <th className="px-4 py-3">{t('finance.remaining')}</th>
                <th className="px-4 py-3">{t('distribution.status')}</th>
                <th className="px-4 py-3">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{row.sourceNumber}</td>
                  <td className="px-4 py-3">{row.source}</td>
                  <td className="px-4 py-3">{row.customer.fullName}<div className="text-xs text-slate-500">{row.customer.phone}</div></td>
                  <td className="px-4 py-3 text-right"><FinanceMoney amount={row.totalAmount} /></td>
                  <td className="px-4 py-3 text-right"><FinanceMoney amount={row.paidAmount} /></td>
                  <td className="px-4 py-3 text-right"><FinanceMoney amount={row.remainingAmount} /></td>
                  <td className="px-4 py-3"><FinanceStatusBadge status={row.status} /></td>
                  <td className="px-4 py-3">
                    {row.canAccept ? (
                      <Link href={`/sales/${row.id}`} className="font-semibold text-blue-600">{t('finance.acceptPayment')}</Link>
                    ) : (
                      <Link href={`/sales/${row.id}`} className="font-semibold text-blue-600">{t('common.view')}</Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </FinanceLayout>
  );
}
