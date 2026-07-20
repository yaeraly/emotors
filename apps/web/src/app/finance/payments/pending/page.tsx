'use client';

import { useEffect, useState } from 'react';
import {
  FinanceEmptyState,
  FinanceErrorState,
  FinanceLayout,
  FinanceLoadingState,
  FinanceMoney,
} from '@/components/finance/FinanceLayout';
import { FINANCE_PAYMENT_TABS } from '@/lib/finance-nav';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';
import Link from 'next/link';

type FinancePaymentRow = {
  id: string;
  sourceNumber: string;
  customer: { fullName: string; phone: string };
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: string;
  canAccept: boolean;
};

export default function FinancePendingPaymentsPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<FinancePaymentRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<FinancePaymentRow[]>('/finance/payments/pending')
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false));
  }, [t]);

  return (
    <FinanceLayout titleKey="finance.payments" breadcrumbs={[{ labelKey: 'finance.payments' }]} sectionTabs={FINANCE_PAYMENT_TABS}>
      {error ? <FinanceErrorState message={error} /> : null}
      {loading ? <FinanceLoadingState /> : null}
      {!loading && rows.length === 0 ? <FinanceEmptyState messageKey="finance.noPayments" /> : null}
      {!loading && rows.length > 0 ? (
        <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-3">{t('finance.payment')}</th>
                <th className="px-4 py-3">{t('customers.customer')}</th>
                <th className="px-4 py-3">{t('finance.remaining')}</th>
                <th className="px-4 py-3">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{row.sourceNumber}</td>
                  <td className="px-4 py-3">{row.customer.fullName}</td>
                  <td className="px-4 py-3 text-right"><FinanceMoney amount={row.remainingAmount} /></td>
                  <td className="px-4 py-3"><Link href={`/sales/${row.id}`} className="font-semibold text-blue-600">{t('finance.acceptPayment')}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </FinanceLayout>
  );
}
