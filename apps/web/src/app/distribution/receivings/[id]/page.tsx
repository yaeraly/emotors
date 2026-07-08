'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import type { GoodsReceiving } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';
import { translateStatus } from '@/lib/translate-status';

export default function ReceivingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [receiving, setReceiving] = useState<GoodsReceiving | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<GoodsReceiving>(`/distribution/receivings/${id}`)
      .then(setReceiving)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [id, t]);

  const shortageReport = receiving?.shortageReport ?? null;

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('distribution.receiveGoods')}</p>
          <h2 className="text-3xl font-bold text-slate-950">{receiving?.receivingNumber ?? '-'}</h2>
          {receiving ? (
            <p className="mt-1 text-sm text-slate-500">
              {t('chinaReceiving.batchNumber')}: {receiving.receivingNumber}
            </p>
          ) : null}
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {receiving ? (
          <>
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 grid gap-4 md:grid-cols-3">
                <Info label={t('chinaReceiving.shipmentBatch')} value={receiving.receivingNumber} />
                <Info label={t('distribution.arrivalDate')} value={new Date(receiving.receivedAt).toLocaleString()} />
                <Info
                  label={t('chinaReceiving.actStatus')}
                  value={
                    shortageReport
                      ? translateStatus(t, shortageReport.status)
                      : t('distribution.noDifferences')
                  }
                />
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">SKU</th>
                      <th className="px-4 py-3">{t('sales.product')}</th>
                      <th className="px-4 py-3">{t('chinaReceiving.expectedQty')}</th>
                      <th className="px-4 py-3">{t('chinaReceiving.actualQty')}</th>
                      <th className="px-4 py-3">{t('distribution.difference')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {receiving.items?.map((item) => (
                      <tr key={item.id}>
                        <td className="px-4 py-3">{item.sku}</td>
                        <td className="px-4 py-3">{item.productName}</td>
                        <td className="px-4 py-3">{item.sentQuantity}</td>
                        <td className="px-4 py-3">{item.receivedQuantity}</td>
                        <td className="px-4 py-3">{item.differenceQuantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {shortageReport ? (
                <div className="mt-4">
                  <Link
                    href={`/distribution/shortage-reports/${shortageReport.id}`}
                    className="inline-flex rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800"
                  >
                    {t('chinaReceiving.openDiscrepancyAct')}
                  </Link>
                </div>
              ) : null}
            </section>
          </>
        ) : null}
      </section>
    </ProtectedShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase text-slate-400">{label}</p>
      <p className="mt-1 font-bold text-slate-950">{value}</p>
    </div>
  );
}
