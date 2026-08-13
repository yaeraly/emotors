'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';

import { toast } from '@/lib/toast';

type SaleDetail = {
  id: string;
  saleNumber: string;
  status: string;
  customerType: string;
  customerNameSnapshot: string;
  paymentType: string;
  totalAmount: string | number;
  items: Array<{
    skuSnapshot: string;
    productNameSnapshot: string;
    quantity: number;
    unitPrice: string | number;
    lineTotal: string | number;
  }>;
  installment?: {
    status: string;
    downPayment: string | number;
    remainingBalance: string | number;
  } | null;
  paymentRequests?: Array<{ id: string; status: string; expectedAmount: string | number }>;
};

export default function HqSaleDetailPage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const saleId = params.id;
  const [sale, setSale] = useState<SaleDetail | null>(null);
  const [error, setError] = useState('');
  const [resubmitting, setResubmitting] = useState(false);

  function load() {
    if (!saleId) return;
    void apiFetch<SaleDetail>(`/hq-b2b-sales/${saleId}`)
      .then(setSale)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }

  useEffect(() => {
    load();
  }, [saleId, t]);

  async function resubmitPayment() {
    if (!saleId) return;
    setResubmitting(true);
    setError('');
    try {
      await apiFetch(`/hq-b2b-sales/${saleId}/resubmit-payment`, { method: 'POST' });
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setResubmitting(false);
    }
  }

  const totalAmount = sale ? Number(sale.totalAmount) : 0;

  return (
    <ProtectedShell>
      <div className="mx-auto max-w-4xl space-y-4 p-6">
        <Link href="/hq-sales/sales" className="text-sm text-blue-600 hover:underline">
          ← Список продаж
        </Link>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {!sale ? (
          <p className="text-slate-500">{t('common.loading')}</p>
        ) : (
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h1 className="text-2xl font-bold text-slate-900">{sale.saleNumber}</h1>
              <p className="mt-2 text-sm text-slate-600">
                {sale.customerNameSnapshot} · {sale.customerType} · {sale.paymentType}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-800">
                Статус: {sale.status}
                {sale.installment ? ` · Рассрочка: ${sale.installment.status}` : ''}
              </p>
              <p className="mt-2 text-lg font-bold">
                Итого: {totalAmount.toLocaleString('ru-RU')} сом
              </p>
              {sale.status === 'PAYMENT_REJECTED' ? (
                <button
                  type="button"
                  disabled={resubmitting}
                  onClick={() => void resubmitPayment()}
                  className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {resubmitting ? t('common.saving') : 'Отправить платёж повторно'}
                </button>
              ) : null}
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">SKU</th>
                    <th className="px-3 py-2">Товар</th>
                    <th className="px-3 py-2">Цена</th>
                    <th className="px-3 py-2">Кол-во</th>
                    <th className="px-3 py-2">Сумма</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sale.items.map((item, index) => (
                    <tr key={index}>
                      <td className="px-3 py-2 font-mono text-xs">{item.skuSnapshot}</td>
                      <td className="px-3 py-2">{item.productNameSnapshot}</td>
                      <td className="px-3 py-2">{Number(item.unitPrice).toLocaleString('ru-RU')}</td>
                      <td className="px-3 py-2">{item.quantity}</td>
                      <td className="px-3 py-2">{Number(item.lineTotal).toLocaleString('ru-RU')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </ProtectedShell>
  );
}
