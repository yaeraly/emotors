'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';

type HqB2bSaleRow = {
  id: string;
  saleNumber: string;
  createdAt: string;
  customerName: string;
  customerType: string;
  itemCount: number;
  totalAmount: number;
  paymentType: string;
  paymentStatus: string;
  status: string;
  responsibleName: string;
};

export default function HqSalesListPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<HqB2bSaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    void apiFetch<HqB2bSaleRow[]>('/hq-b2b-sales')
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false));
  }, [t]);

  return (
    <ProtectedShell>
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-slate-900">HQ Sales — Продажи</h1>
          <Link
            href="/hq-sales/sales/new"
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Создать продажу
          </Link>
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Номер</th>
                <th className="px-3 py-2">Дата</th>
                <th className="px-3 py-2">Клиент</th>
                <th className="px-3 py-2">Тип клиента</th>
                <th className="px-3 py-2">Товаров</th>
                <th className="px-3 py-2">Сумма</th>
                <th className="px-3 py-2">Оплата</th>
                <th className="px-3 py-2">Статус оплаты</th>
                <th className="px-3 py-2">Статус</th>
                <th className="px-3 py-2">Ответственный</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-slate-500">
                    {t('common.loading')}
                  </td>
                </tr>
              ) : null}
              {!loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-slate-500">
                    Нет продаж
                  </td>
                </tr>
              ) : null}
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2 font-mono text-xs">
                    <Link href={`/hq-sales/sales/${row.id}`} className="text-blue-600 hover:underline">
                      {row.saleNumber}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{new Date(row.createdAt).toLocaleString('ru-RU')}</td>
                  <td className="px-3 py-2">{row.customerName}</td>
                  <td className="px-3 py-2">{row.customerType}</td>
                  <td className="px-3 py-2">{row.itemCount}</td>
                  <td className="px-3 py-2">{row.totalAmount.toLocaleString('ru-RU')} сом</td>
                  <td className="px-3 py-2">{row.paymentType}</td>
                  <td className="px-3 py-2">{row.paymentStatus}</td>
                  <td className="px-3 py-2">{row.status}</td>
                  <td className="px-3 py-2">{row.responsibleName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ProtectedShell>
  );
}
