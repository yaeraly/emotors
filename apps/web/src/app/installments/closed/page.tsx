'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import type { SaleInstallmentApproval } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';
import { installmentStatusLabelKey } from '@/lib/sale-installment';

type InstallmentRow = SaleInstallmentApproval & {
  sale: {
    id: string;
    receiptNumber: string;
    customer: { id: string; fullName: string; phone: string };
    seller?: { id: string; fullName: string };
  };
  manager?: { id: string; fullName: string } | null;
};

function formatKgs(value: number) {
  return `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} KGS`;
}

export default function ClosedInstallmentsPage() {
  const { t } = useTranslation();
  const [installments, setInstallments] = useState<InstallmentRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void apiFetch<InstallmentRow[]>('/sales/installments?scope=closed')
      .then(setInstallments)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false));
  }, [t]);

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">
            {t('nav.closedInstallments')}
          </p>
          <h2 className="text-3xl font-bold text-slate-950">{t('sales.closedInstallmentListTitle')}</h2>
        </div>

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">{t('sales.installmentRequestNumber')}</th>
                <th className="px-4 py-3">{t('sales.customer')}</th>
                <th className="px-4 py-3">{t('sales.receipt')}</th>
                <th className="px-4 py-3">{t('sales.totalAmount')}</th>
                <th className="px-4 py-3">{t('sales.paidAmount')}</th>
                <th className="px-4 py-3">{t('sales.finalPaymentDate')}</th>
                <th className="px-4 py-3">{t('common.status')}</th>
                <th className="px-4 py-3">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    {t('common.loading')}
                  </td>
                </tr>
              ) : installments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    {t('sales.noClosedInstallments')}
                  </td>
                </tr>
              ) : (
                installments.map((installment) => {
                  const statusKey = installmentStatusLabelKey(installment.status);
                  return (
                    <tr key={installment.id}>
                      <td className="px-4 py-3 font-semibold">
                        {installment.installmentNumber ?? installment.requestNumber}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{installment.sale.customer.fullName}</p>
                        <p className="text-xs text-slate-500">{installment.sale.customer.phone}</p>
                      </td>
                      <td className="px-4 py-3">{installment.sale.receiptNumber}</td>
                      <td className="px-4 py-3">{formatKgs(installment.totalAmount)}</td>
                      <td className="px-4 py-3">{formatKgs(installment.paidAmount ?? installment.installmentPaidAmount ?? 0)}</td>
                      <td className="px-4 py-3">
                        {installment.dueDate
                          ? new Date(installment.dueDate).toLocaleDateString()
                          : '—'}
                      </td>
                      <td className="px-4 py-3">{statusKey ? t(statusKey) : installment.status}</td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/installments/${installment.id}`}
                          className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          {t('common.open')}
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </ProtectedShell>
  );
}
