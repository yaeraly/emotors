'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { canReceiveProcurementToHq, isWarehouseManagerUser } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';
import { translateStatus } from '@/lib/translate-status';

type LineItem = {
  id: string;
  productId: string;
  sku: string;
  productName: string;
  orderedQuantity: number;
  expectedQuantity: number;
  actualReceivedQuantity?: number | null;
  difference: number;
};

type DiscrepancyAct = {
  id: string;
  actNumber: string;
  reportNumber: string;
  batchId: string;
  productName: string;
  sku: string;
  expectedQty: number;
  actualQty: number;
  differenceQty: number;
  differenceType: string;
  status: string;
};

type ShipmentBatch = {
  id: string;
  batchId: string;
  receivingNumber: string;
  receivedAt: string;
  items: Array<{
    id: string;
    productName: string;
    sku: string;
    expectedQuantity: number;
    actualQuantity: number;
    differenceQuantity: number;
    difference: number;
  }>;
  discrepancyActs: DiscrepancyAct[];
};

type ChinaReceivingDetail = {
  id: string;
  orderNumber: string;
  hqWarehouseId: string;
  hqWarehouse?: { id: string; name: string; isActive: boolean };
  supplier?: { name: string };
  factory?: { name: string };
  receivingStatus: string;
  canReceive: boolean;
  hqStockMovementCreatedAt?: string | null;
  cargoTotalWeightKg?: number | string;
  cargoRateUsdPerKg?: number | string;
  defaultUsdRate?: number | string;
  cargoReceiptNumber?: string | null;
  cargoReceiptDate?: string | null;
  customsCostKgs?: number | string;
  insuranceCostKgs?: number | string;
  bankFeeCostKgs?: number | string;
  otherExpenseKgs?: number | string;
  packagingCostKgs?: number | string;
  lineItems: LineItem[];
  shipmentBatches?: ShipmentBatch[];
};

export default function ChinaReceivingDetailPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams<{ orderId: string }>();
  const [user, setUser] = useState<User | null>(null);
  const [task, setTask] = useState<ChinaReceivingDetail | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void load();
  }, [params.orderId]);

  async function load() {
    try {
      const [me, detail] = await Promise.all([
        apiFetch<User>('/auth/me'),
        apiFetch<ChinaReceivingDetail>(`/procurement/china-receiving/${params.orderId}`),
      ]);
      setUser(me);
      setTask(detail);
      const initialQty: Record<string, string> = {};
      detail.lineItems.forEach((item) => {
        initialQty[item.id] = String(item.actualReceivedQuantity ?? item.expectedQuantity);
      });
      setQuantities(initialQty);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  const wmView = isWarehouseManagerUser(user);
  const canEditQuantities =
    wmView && canReceiveProcurementToHq(user) && task && !task.hqStockMovementCreatedAt;
  const canSubmitReceive = canEditQuantities;

  const hasDifference = useMemo(() => {
    if (!task) return false;
    return task.lineItems.some((item) => {
      const actual = Number(quantities[item.id] ?? item.expectedQuantity);
      return actual !== item.expectedQuantity;
    });
  }, [task, quantities]);

  async function receiveToHq() {
    if (!task || !canSubmitReceive) return;
    setLoading(true);
    setError('');
    try {
      await apiFetch(`/procurement/orders/${task.id}/receive-to-hq`, {
        method: 'POST',
        body: JSON.stringify({
          hqWarehouseId: task.hqWarehouseId,
          cargoTotalWeightKg: Number(task.cargoTotalWeightKg ?? 0),
          cargoRateUsdPerKg: Number(task.cargoRateUsdPerKg ?? 0),
          defaultUsdRate: Number(task.defaultUsdRate ?? 0),
          cargoReceiptNumber: task.cargoReceiptNumber ?? undefined,
          cargoReceiptDate: task.cargoReceiptDate ?? undefined,
          customsCostKgs: Number(task.customsCostKgs ?? 0),
          insuranceCostKgs: Number(task.insuranceCostKgs ?? 0),
          bankFeeCostKgs: Number(task.bankFeeCostKgs ?? 0),
          otherExpenseKgs: Number(task.otherExpenseKgs ?? 0),
          packagingCostKgs: Number(task.packagingCostKgs ?? 0),
          items: task.lineItems.map((item) => ({
            procurementItemId: item.id,
            receivedQuantity: Number(quantities[item.id] ?? item.expectedQuantity),
            note: notes[item.id] || undefined,
            shortageReason:
              Number(quantities[item.id] ?? item.expectedQuantity) !== item.expectedQuantity
                ? 'OTHER'
                : undefined,
          })),
        }),
      });
      window.localStorage.setItem('emotors_china_receiving_success', t('chinaReceiving.receivedSuccess'));
      router.push('/hq-warehouses/china-receiving');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('chinaReceiving.title')}</p>
            <h2 className="text-3xl font-bold text-slate-950">{task?.orderNumber ?? '...'}</h2>
            <p className="text-sm text-slate-500">
              {task?.hqWarehouse?.name} · {task ? translateStatus(t, task.receivingStatus, 'procurement') : ''}
            </p>
          </div>
          <Link href="/hq-warehouses/china-receiving" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold">
            {t('common.back')}
          </Link>
        </div>

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {hasDifference && canEditQuantities ? (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
            {t('chinaReceiving.differenceAutoWarning')}
          </p>
        ) : null}

        {task ? (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <Info label={t('procurement.orders.supplier')} value={task.supplier?.name ?? '-'} />
              <Info label={t('procurement.orders.factory')} value={task.factory?.name ?? '-'} />
              <Info label={t('chinaReceiving.targetWarehouse')} value={task.hqWarehouse?.name ?? '-'} />
            </div>

            <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">{t('procurement.orders.product')}</th>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3">{t('chinaReceiving.orderedQty')}</th>
                    <th className="px-4 py-3">{t('chinaReceiving.expectedQty')}</th>
                    <th className="px-4 py-3">{t('chinaReceiving.actualQty')}</th>
                    <th className="px-4 py-3">{t('procurement.orders.difference')}</th>
                    <th className="px-4 py-3">{t('inventoryCount.notes')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {task.lineItems.map((item) => {
                    const actual = Number(quantities[item.id] ?? item.expectedQuantity);
                    const diff = actual - item.expectedQuantity;
                    return (
                      <tr key={item.id}>
                        <td className="px-4 py-3">{item.productName}</td>
                        <td className="px-4 py-3">{item.sku}</td>
                        <td className="px-4 py-3">{item.orderedQuantity}</td>
                        <td className="px-4 py-3">{item.expectedQuantity}</td>
                        <td className="px-4 py-3">
                          {task.hqStockMovementCreatedAt ? (
                            actual
                          ) : (
                            <input
                              type="number"
                              min={0}
                              value={quantities[item.id] ?? ''}
                              onChange={(e) => setQuantities((c) => ({ ...c, [item.id]: e.target.value }))}
                              className="w-24 rounded-lg border border-slate-300 px-2 py-1"
                              disabled={!canEditQuantities}
                            />
                          )}
                        </td>
                        <td className="px-4 py-3">{diff}</td>
                        <td className="px-4 py-3">
                          {!task.hqStockMovementCreatedAt && canEditQuantities ? (
                            <input
                              value={notes[item.id] ?? ''}
                              onChange={(e) => setNotes((c) => ({ ...c, [item.id]: e.target.value }))}
                              className="w-full min-w-[120px] rounded-lg border border-slate-300 px-2 py-1"
                              placeholder={t('inventoryCount.notes')}
                            />
                          ) : (
                            notes[item.id] ?? '-'
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {canSubmitReceive ? (
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void receiveToHq()}
                  className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {t('procurement.orders.receiveToHq')}
                </button>
              </div>
            ) : null}

            {(task.shipmentBatches?.length ?? 0) > 0 ? (
              <section className="space-y-4">
                <h3 className="text-lg font-bold text-slate-950">{t('chinaReceiving.shipmentBatch')}</h3>
                {task.shipmentBatches?.map((batch) => (
                  <div key={batch.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase text-slate-400">{t('chinaReceiving.batchNumber')}</p>
                        <p className="text-lg font-bold text-slate-950">{batch.receivingNumber}</p>
                      </div>
                      <p className="text-sm text-slate-500">{new Date(batch.receivedAt).toLocaleString()}</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-slate-200 text-sm">
                        <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-4 py-3">{t('procurement.orders.product')}</th>
                            <th className="px-4 py-3">SKU</th>
                            <th className="px-4 py-3">{t('chinaReceiving.expectedQty')}</th>
                            <th className="px-4 py-3">{t('chinaReceiving.actualQty')}</th>
                            <th className="px-4 py-3">{t('procurement.orders.difference')}</th>
                            <th className="px-4 py-3">{t('chinaReceiving.actStatus')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {batch.items.map((item) => {
                            const act = batch.discrepancyActs.find((row) => row.sku === item.sku);
                            return (
                              <tr key={item.id}>
                                <td className="px-4 py-3">{item.productName}</td>
                                <td className="px-4 py-3">{item.sku}</td>
                                <td className="px-4 py-3">{item.expectedQuantity}</td>
                                <td className="px-4 py-3">{item.actualQuantity}</td>
                                <td className="px-4 py-3">{item.difference}</td>
                                <td className="px-4 py-3">
                                  {act ? translateStatus(t, act.status) : '-'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {batch.discrepancyActs.length > 0 ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {batch.discrepancyActs.map((act) => (
                          <Link
                            key={act.id}
                            href="/procurement/difference-acts"
                            className="inline-flex rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800"
                          >
                            {t('chinaReceiving.openDiscrepancyAct')} ({act.actNumber})
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </section>
            ) : null}
          </>
        ) : null}
      </section>
    </ProtectedShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase text-slate-400">{label}</p>
      <p className="mt-1 font-bold text-slate-950">{value}</p>
    </div>
  );
}
