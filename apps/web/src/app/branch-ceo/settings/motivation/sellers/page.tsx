'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';

type SellerRow = {
  employeeId: string;
  employeeName: string;
  sales: number;
  plan: number;
  planPercent: number;
  averageReceipt: number;
  repeatCustomers: number;
  commission: number;
  accrued: number;
  paid: number;
  pending: number;
};

export default function SalesMotivationSellersPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<SellerRow[]>([]);
  const [sortBy, setSortBy] = useState('sales');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const result = await apiFetch<{ sellers: SellerRow[] }>(`/sales-motivation/dashboard?sortBy=${sortBy}`);
    setRows(result.sellers);
  }, [sortBy]);

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [load, t]);

  async function calculate() {
    setError('');
    setMessage('');
    try {
      const result = await apiFetch<{ createdCount: number }>('/sales-motivation/bonuses/calculate', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setMessage(`Начислено записей: ${result.createdCount}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('nav.salesMotivation')}</p>
            <h2 className="text-3xl font-bold text-slate-950">{t('nav.salesMotivationSellers')}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
              <option value="sales">Сортировка: продажи</option>
              <option value="bonuses">Сортировка: бонусы</option>
              <option value="averageReceipt">Сортировка: средний чек</option>
              <option value="repeatCustomers">Сортировка: повторные клиенты</option>
              <option value="plan">Сортировка: выполнение плана</option>
            </select>
            <button type="button" onClick={() => void calculate()} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
              Пересчитать бонусы
            </button>
          </div>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {message ? <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p> : null}
        <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Сотрудник</th>
                <th className="px-3 py-2">Продажи</th>
                <th className="px-3 py-2">План</th>
                <th className="px-3 py-2">%</th>
                <th className="px-3 py-2">Средний чек</th>
                <th className="px-3 py-2">Повторные клиенты</th>
                <th className="px-3 py-2">Комиссия</th>
                <th className="px-3 py-2">Начислено</th>
                <th className="px-3 py-2">Выплачено</th>
                <th className="px-3 py-2">Ожидается</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.employeeId} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-semibold">{row.employeeName}</td>
                  <td className="px-3 py-2">{row.sales.toLocaleString('ru-RU')}</td>
                  <td className="px-3 py-2">{row.plan.toLocaleString('ru-RU')}</td>
                  <td className="px-3 py-2">{row.planPercent}%</td>
                  <td className="px-3 py-2">{row.averageReceipt.toLocaleString('ru-RU')}</td>
                  <td className="px-3 py-2">{row.repeatCustomers}</td>
                  <td className="px-3 py-2">{row.commission.toLocaleString('ru-RU')}</td>
                  <td className="px-3 py-2">{row.accrued.toLocaleString('ru-RU')}</td>
                  <td className="px-3 py-2">{row.paid.toLocaleString('ru-RU')}</td>
                  <td className="px-3 py-2">{row.pending.toLocaleString('ru-RU')}</td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-slate-500">Нет данных по продавцам</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </ProtectedShell>
  );
}
