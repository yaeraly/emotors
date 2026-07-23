'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { FranchiseDirectorShell, formatMoney } from '@/components/franchise-director/FranchiseDirectorShell';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';

type SupplyResponse = {
  stock: Array<{
    branch: { id: string; name: string; code: string };
    stockLevel: number;
    inventoryValue: number;
    criticalShortages: Array<{ sku: string; name: string; quantity: number; minStockLevel: number }>;
  }>;
  pendingOrders: Array<{ id: string; status: string; branch?: { name: string } | null; createdAt: string }>;
  delayedShipments: Array<{ id: string; status: string; branch?: { name: string } | null; createdAt: string }>;
};

function FranchiseDirectorSupplyContent() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const branchId = searchParams.get('branchId') ?? '';
  const [data, setData] = useState<SupplyResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
    void apiFetch<SupplyResponse>(`/franchise-director/supply${query}`)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [branchId, t]);

  return (
    <FranchiseDirectorShell titleKey="franchiseDirector.supply">
      <p className="text-sm text-slate-500">{t('franchiseDirector.supplyReadOnly')}</p>
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {data ? (
        <div className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">{t('franchiseDirector.stockLevels')}</h2>
            <div className="mt-3 space-y-3">
              {data.stock.map((row) => (
                <div key={row.branch.id} className="rounded-xl border border-slate-100 px-3 py-3 text-sm">
                  <p className="font-semibold">{row.branch.name}</p>
                  <p className="text-slate-500">{t('franchiseDirector.stockLevel')}: {row.stockLevel} · {formatMoney(row.inventoryValue)}</p>
                  {row.criticalShortages.length ? (
                    <ul className="mt-2 space-y-1 text-rose-700">
                      {row.criticalShortages.slice(0, 5).map((item) => (
                        <li key={`${row.branch.id}-${item.sku}`}>{item.sku} {item.name}: {item.quantity}/{item.minStockLevel}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold">{t('franchiseDirector.pendingOrders')}</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {data.pendingOrders.map((row) => (
                  <li key={row.id}>{row.branch?.name ?? '-'} · {row.status}</li>
                ))}
              </ul>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold">{t('franchiseDirector.delayedShipments')}</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {data.delayedShipments.map((row) => (
                  <li key={row.id}>{row.branch?.name ?? '-'} · {row.status}</li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      ) : null}
    </FranchiseDirectorShell>
  );
}

export default function FranchiseDirectorSupplyPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-500">Loading…</div>}>
      <FranchiseDirectorSupplyContent />
    </Suspense>
  );
}
