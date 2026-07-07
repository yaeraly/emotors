'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';
import { translateStatus } from '@/lib/translate-status';

type InstallmentRow = {
  id: string;
  amount: number;
  paidAmount: number;
  dueDate: string;
  status: string;
  customer: { id: string; fullName: string; phone: string };
  sale: { id: string; receiptNumber: string; saleDate: string };
};

export default function InstallmentsPage() {
  const { t } = useTranslation();
  const [installments, setInstallments] = useState<InstallmentRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void apiFetch<InstallmentRow[]>('/sales/installments')
      .then(setInstallments)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false));
  }, [t]);

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('nav.installments')}</p>
          <h2 className="text-3xl font-bold text-slate-950">{t('sales.installment')}</h2>
        </div>

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">{t('sales.customer')}</th>
                <th className="px-4 py-3">{t('sales.receipt')}</th>
                <th className="px-4 py-3">{t('common.date')}</th>
                <th className="px-4 py-3">{t('sales.payments')}</th>
                <th className="px-4 py-3">{t('common.status')}</th>
                <th className="px-4 py-3">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">{t('common.loading')}</td>
                </tr>
              ) : installments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">{t('sales.noInstallments')}</td>
                </tr>
              ) : (
                installments.map((installment) => (
                  <tr key={installment.id}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{installment.customer.fullName}</p>
                      <p className="text-xs text-slate-500">{installment.customer.phone}</p>
                    </td>
                    <td className="px-4 py-3">{installment.sale.receiptNumber}</td>
                    <td className="px-4 py-3">{new Date(installment.dueDate).toLocaleDateString()}</td>
                    <td className="px-4 py-3">{installment.amount.toLocaleString()} / {installment.paidAmount.toLocaleString()}</td>
                    <td className="px-4 py-3">{translateStatus(t, installment.status)}</td>
                    <td className="px-4 py-3">
                      <Link href={`/sales/${installment.sale.id}`} className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                        {t('common.open')}
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </ProtectedShell>
  );
}
