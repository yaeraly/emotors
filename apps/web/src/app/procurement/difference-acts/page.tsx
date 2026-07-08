'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import {
  canArchiveDifferenceAct,
  canViewChinaReceivingActs,
  isSupplyChainManagerUser,
} from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';
import { translateStatus } from '@/lib/translate-status';

type DifferenceAct = {
  id: string;
  reportNumber: string;
  actNumber?: string;
  orderNumber: string;
  procurementOrderId: string;
  supplier?: { name: string } | null;
  factory?: { name: string } | null;
  hqWarehouse?: { id: string; name: string; code?: string } | null;
  productName: string;
  sku: string;
  type: string;
  differenceType: string;
  expectedQuantity: number;
  actualQuantity: number;
  receivedQuantity: number;
  differenceQuantity: number;
  difference: number;
  status: string;
  note?: string | null;
  warehouseManager?: { id: string; fullName: string } | null;
  createdAt: string;
  receivingId?: string | null;
  batchId?: string | null;
  batchNumber?: string | null;
  receivingNumber?: string | null;
};

export default function ProcurementDifferenceActsPage() {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [acts, setActs] = useState<DifferenceAct[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loadingId, setLoadingId] = useState('');
  const [selectedAct, setSelectedAct] = useState<DifferenceAct | null>(null);

  const readOnly = isSupplyChainManagerUser(user);
  const canArchive = canArchiveDifferenceAct(user);

  useEffect(() => {
    void Promise.all([
      apiFetch<User>('/auth/me'),
      apiFetch<DifferenceAct[]>('/procurement/difference-acts'),
    ])
      .then(([me, list]) => {
        setUser(me);
        setActs(list);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  const groupedActs = useMemo(() => {
    const groups: Record<string, DifferenceAct[]> = { SHORTAGE: [], OVERAGE: [], DAMAGED: [] };
    for (const act of acts) {
      const key = act.type in groups ? act.type : act.differenceType;
      if (key in groups) groups[key].push(act);
    }
    return groups;
  }, [acts]);

  const groupedByBatch = useMemo(() => {
    const batches = new Map<string, { batchKey: string; batchNumber: string; acts: DifferenceAct[] }>();
    for (const act of acts) {
      const batchKey = act.batchId ?? act.receivingId ?? `order-${act.procurementOrderId}`;
      const batchNumber = act.batchNumber ?? act.receivingNumber ?? act.orderNumber;
      const existing = batches.get(batchKey);
      if (existing) {
        existing.acts.push(act);
      } else {
        batches.set(batchKey, { batchKey, batchNumber, acts: [act] });
      }
    }
    return [...batches.values()];
  }, [acts]);

  async function archiveAct(act: DifferenceAct) {
    if (!canArchive) return;
    setLoadingId(act.id);
    setError('');
    try {
      await apiFetch(`/procurement/difference-acts/${act.id}/archive`, { method: 'POST' });
      setActs((current) => current.filter((row) => row.id !== act.id));
      setSelectedAct(null);
      setSuccess(t('chinaReceiving.actArchived'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoadingId('');
    }
  }

  function printAct(act: DifferenceAct) {
    setSelectedAct(act);
    window.setTimeout(() => window.print(), 100);
  }

  if (user && !canViewChinaReceivingActs(user)) {
    return (
      <ProtectedShell>
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{t('common.forbiddenMessage')}</p>
      </ProtectedShell>
    );
  }

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('procurement.title')}</p>
            <h2 className="text-3xl font-bold text-slate-950">{t('chinaReceiving.differenceActs')}</h2>
            {readOnly ? (
              <p className="mt-2 text-sm text-slate-500">{t('productMaster.readOnlyNotice')}</p>
            ) : null}
          </div>
          <Link href="/procurement?tab=orders" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold">
            {t('common.back')}
          </Link>
        </div>

        {success ? <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</p> : null}
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        <div className="space-y-3">
          <h3 className="text-lg font-bold text-slate-950">{t('chinaReceiving.shipmentBatch')}</h3>
          {groupedByBatch.map((batch) => (
            <div key={batch.batchKey} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
                <p className="text-sm font-bold text-slate-900">
                  {t('chinaReceiving.batchNumber')}: {batch.batchNumber}
                </p>
                <p className="text-xs text-slate-500">{batch.acts.length} {t('chinaReceiving.differenceActs').toLowerCase()}</p>
              </div>
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-white text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">{t('chinaReceiving.orderNumber')}</th>
                    <th className="px-4 py-3">{t('procurement.orders.product')}</th>
                    <th className="px-4 py-3">{t('chinaReceiving.differenceType')}</th>
                    <th className="px-4 py-3">{t('procurement.orders.difference')}</th>
                    <th className="px-4 py-3">{t('common.status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {batch.acts.map((act) => (
                    <tr key={act.id}>
                      <td className="px-4 py-3 font-bold">{act.orderNumber}</td>
                      <td className="px-4 py-3">{act.productName}</td>
                      <td className="px-4 py-3">{translateStatus(t, act.type)}</td>
                      <td className="px-4 py-3">{act.differenceQuantity}</td>
                      <td className="px-4 py-3">{translateStatus(t, act.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {groupedByBatch.length === 0 ? (
            <p className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500">{t('chinaReceiving.noActsForType')}</p>
          ) : null}
        </div>

        {(['SHORTAGE', 'OVERAGE', 'DAMAGED'] as const).map((type) => (
          <div key={type} className="space-y-3">
            <h3 className="text-lg font-bold text-slate-950">{translateStatus(t, type)}</h3>
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">{t('chinaReceiving.orderNumber')}</th>
                    <th className="px-4 py-3">{t('chinaReceiving.batchNumber')}</th>
                    <th className="px-4 py-3">{t('procurement.orders.product')}</th>
                    <th className="px-4 py-3">{t('procurement.orders.difference')}</th>
                    <th className="px-4 py-3">{t('chinaReceiving.targetWarehouse')}</th>
                    <th className="px-4 py-3">{t('chinaReceiving.actDate')}</th>
                    <th className="px-4 py-3">{t('common.status')}</th>
                    {canArchive ? <th className="px-4 py-3">{t('common.actions')}</th> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {groupedActs[type].map((act) => (
                    <tr key={act.id}>
                      <td className="px-4 py-3 font-bold">{act.orderNumber}</td>
                      <td className="px-4 py-3">{act.batchNumber ?? act.receivingNumber ?? '-'}</td>
                      <td className="px-4 py-3">{act.productName}</td>
                      <td className="px-4 py-3">{act.differenceQuantity}</td>
                      <td className="px-4 py-3">{act.hqWarehouse?.name ?? '-'}</td>
                      <td className="px-4 py-3">{new Date(act.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3">{translateStatus(t, act.status)}</td>
                      {canArchive ? (
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => printAct(act)}
                              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold"
                            >
                              {t('chinaReceiving.printAct')}
                            </button>
                            <button
                              type="button"
                              disabled={loadingId === act.id}
                              onClick={() => void archiveAct(act)}
                              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50"
                            >
                              {t('chinaReceiving.archiveAct')}
                            </button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
              {groupedActs[type].length === 0 ? (
                <p className="p-6 text-sm text-slate-500">{t('chinaReceiving.noActsForType')}</p>
              ) : null}
            </div>
          </div>
        ))}

        {selectedAct ? (
          <div id="difference-act-print" className="hidden print:block rounded-3xl border border-slate-200 bg-white p-6">
            <h3 className="text-xl font-bold">{t('chinaReceiving.differenceActs')}</h3>
            <dl className="mt-4 grid gap-2 text-sm md:grid-cols-2">
              <div><dt className="font-semibold">{t('chinaReceiving.orderNumber')}</dt><dd>{selectedAct.orderNumber}</dd></div>
              <div><dt className="font-semibold">{t('procurement.orders.supplier')}</dt><dd>{selectedAct.supplier?.name ?? '-'}</dd></div>
              <div><dt className="font-semibold">{t('procurement.orders.factory')}</dt><dd>{selectedAct.factory?.name ?? '-'}</dd></div>
              <div><dt className="font-semibold">{t('chinaReceiving.targetWarehouse')}</dt><dd>{selectedAct.hqWarehouse?.name ?? '-'}</dd></div>
              <div><dt className="font-semibold">{t('procurement.orders.product')}</dt><dd>{selectedAct.productName}</dd></div>
              <div><dt className="font-semibold">SKU</dt><dd>{selectedAct.sku}</dd></div>
              <div><dt className="font-semibold">{t('chinaReceiving.expectedQty')}</dt><dd>{selectedAct.expectedQuantity}</dd></div>
              <div><dt className="font-semibold">{t('chinaReceiving.actualQty')}</dt><dd>{selectedAct.actualQuantity}</dd></div>
              <div><dt className="font-semibold">{t('procurement.orders.difference')}</dt><dd>{selectedAct.differenceQuantity}</dd></div>
              <div><dt className="font-semibold">{t('chinaReceiving.differenceType')}</dt><dd>{translateStatus(t, selectedAct.type)}</dd></div>
              <div><dt className="font-semibold">{t('chinaReceiving.warehouseManager')}</dt><dd>{selectedAct.warehouseManager?.fullName ?? '-'}</dd></div>
              <div><dt className="font-semibold">{t('chinaReceiving.actDate')}</dt><dd>{new Date(selectedAct.createdAt).toLocaleString()}</dd></div>
              <div className="md:col-span-2"><dt className="font-semibold">{t('inventoryCount.notes')}</dt><dd>{selectedAct.note ?? '-'}</dd></div>
            </dl>
          </div>
        ) : null}
      </section>
    </ProtectedShell>
  );
}
