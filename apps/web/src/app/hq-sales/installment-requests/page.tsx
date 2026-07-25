'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';

type SaleRow = {
  id: string;
  saleNumber: string;
  createdAt: string;
  customerName: string;
  customerType: string;
  totalAmount: number;
  status: string;
  responsibleName: string;
};

export default function HqSalesInstallmentRequestsPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionId, setActionId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    void apiFetch<SaleRow[]>('/hq-b2b-sales?status=AWAITING_CEO_APPROVAL')
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, [t]);

  async function approve(id: string) {
    setActionId(id);
    try {
      await apiFetch(`/hq-b2b-sales/${id}/installment/approve`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setActionId(null);
    }
  }

  async function reject(id: string) {
    const reason = prompt('Причина отклонения')?.trim();
    if (!reason) return;
    setActionId(id);
    try {
      await apiFetch(`/hq-b2b-sales/${id}/installment/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setActionId(null);
    }
  }

  return (
    <ProtectedShell>
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-slate-900">Рассрочка HQ Sales — одобрение CEO</h1>
          <Link href="/hq-sales/sales" className="text-sm text-blue-600 hover:underline">
            Все продажи HQ Sales
          </Link>
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[800px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Продажа</th>
                <th className="px-3 py-2">Дата</th>
                <th className="px-3 py-2">Клиент</th>
                <th className="px-3 py-2">Тип</th>
                <th className="px-3 py-2">Сумма</th>
                <th className="px-3 py-2">HQ Sales</th>
                <th className="px-3 py-2">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                    {t('common.loading')}
                  </td>
                </tr>
              ) : null}
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2">
                    <Link href={`/hq-sales/sales/${row.id}`} className="font-mono text-xs text-blue-600">
                      {row.saleNumber}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{new Date(row.createdAt).toLocaleString('ru-RU')}</td>
                  <td className="px-3 py-2">{row.customerName}</td>
                  <td className="px-3 py-2">{row.customerType}</td>
                  <td className="px-3 py-2">{row.totalAmount.toLocaleString('ru-RU')} сом</td>
                  <td className="px-3 py-2">{row.responsibleName}</td>
                  <td className="px-3 py-2 space-x-2">
                    <button
                      type="button"
                      disabled={actionId === row.id}
                      onClick={() => approve(row.id)}
                      className="rounded border border-green-600 px-2 py-1 text-xs text-green-700"
                    >
                      Одобрить
                    </button>
                    <button
                      type="button"
                      disabled={actionId === row.id}
                      onClick={() => reject(row.id)}
                      className="rounded border border-red-600 px-2 py-1 text-xs text-red-700"
                    >
                      Отклонить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ProtectedShell>
  );
}
