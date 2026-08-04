'use client';

import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';

type MyBonusesResponse = {
  summary: {
    today: number;
    thisMonth: number;
    accrued: number;
    pending: number;
    approved: number;
    paid: number;
    salesPlan: number;
    averageReceipt: number;
    repeatCustomers: number;
    fullPaymentCommissionPercent: number | null;
    installmentApprovalCommissionPercent: number | null;
    installmentRepaymentCommissionPercent: number | null;
  };
  items: Array<{
    id: string;
    date: string;
    receiptNumber?: string | null;
    customerName?: string | null;
    saleAmount: number;
    paymentType?: string | null;
    commissionPercent?: number | null;
    commissionAmount: number;
    status: string;
    comment?: string | null;
  }>;
};

function money(value: number) {
  return `${value.toLocaleString('ru-RU')} KGS`;
}

export default function MyBonusesPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<MyBonusesResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<MyBonusesResponse>('/sales-motivation/my-bonuses')
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  const summary = data?.summary;

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('nav.sales')}</p>
          <h2 className="text-3xl font-bold text-slate-950">{t('nav.myBonuses')}</h2>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {summary ? (
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
            <Stat label="Сегодня" value={money(summary.today)} />
            <Stat label="Этот месяц" value={money(summary.thisMonth)} />
            <Stat label="Начислено" value={money(summary.accrued)} />
            <Stat label="Ожидается" value={money(summary.pending)} />
            <Stat label="Одобрено" value={money(summary.approved)} />
            <Stat label="Выплачено" value={money(summary.paid)} />
            <Stat label="План продаж" value={money(summary.salesPlan)} />
            <Stat label="Средний чек" value={money(summary.averageReceipt)} />
            <Stat label="Повторные клиенты" value={String(summary.repeatCustomers)} />
            <Stat label="Комиссия по полной оплате" value={summary.fullPaymentCommissionPercent != null ? `${summary.fullPaymentCommissionPercent}%` : '—'} />
            <Stat
              label="Комиссия по рассрочке"
              value={
                summary.installmentApprovalCommissionPercent != null
                  ? `${summary.installmentApprovalCommissionPercent}% + ${summary.installmentRepaymentCommissionPercent}%`
                  : '—'
              }
            />
          </div>
        ) : null}

        <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Дата</th>
                <th className="px-3 py-2">Чек</th>
                <th className="px-3 py-2">Клиент</th>
                <th className="px-3 py-2">Сумма продажи</th>
                <th className="px-3 py-2">Тип оплаты</th>
                <th className="px-3 py-2">Комиссия %</th>
                <th className="px-3 py-2">Комиссия</th>
                <th className="px-3 py-2">Статус</th>
                <th className="px-3 py-2">Комментарий</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((item) => (
                <tr key={item.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{new Date(item.date).toLocaleDateString('ru-RU')}</td>
                  <td className="px-3 py-2">{item.receiptNumber ?? '—'}</td>
                  <td className="px-3 py-2">{item.customerName ?? '—'}</td>
                  <td className="px-3 py-2">{money(item.saleAmount)}</td>
                  <td className="px-3 py-2">{item.paymentType ?? '—'}</td>
                  <td className="px-3 py-2">{item.commissionPercent != null ? `${item.commissionPercent}%` : '—'}</td>
                  <td className="px-3 py-2">{money(item.commissionAmount)}</td>
                  <td className="px-3 py-2">{item.status}</td>
                  <td className="px-3 py-2">{item.comment ?? '—'}</td>
                </tr>
              ))}
              {!data?.items?.length ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-slate-500">Нет начислений</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </ProtectedShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-bold text-slate-950">{value}</p>
    </div>
  );
}
