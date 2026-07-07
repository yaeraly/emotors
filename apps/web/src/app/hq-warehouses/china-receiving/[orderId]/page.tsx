'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import {
  canReceiveProcurementToHq,
  canViewChinaReceivingActs,
  isSupplyChainManagerUser,
  isWarehouseManagerUser,
} from '@/lib/rbac';
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

type DifferenceReport = {
  id: string;
  reportNumber: string;
  type: string;
  status: string;
  expectedQuantity: number;
  receivedQuantity: number;
  differenceQuantity: number;
  shortageReason?: string | null;
  note?: string | null;
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
  canViewActs?: boolean;
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
  differenceReports?: DifferenceReport[];
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
  const scmViewOnly = isSupplyChainManagerUser(user);
  const canEditQuantities =
    wmView && canReceiveProcurementToHq(user) && task && !task.hqStockMovementCreatedAt && task.canReceive;
  const canViewActs = canViewChinaReceivingActs(user) && task?.canViewActs && scmViewOnly;

  const hasDifference = useMemo(() => {
    if (!task) return false;
    return task.lineItems.some((item) => {
      const actual = Number(quantities[item.id] ?? item.expectedQuantity);
      return actual !== item.expectedQuantity;
    });
  }, [task, quantities]);

  async function receiveToHq() {
    if (!task || !task.canReceive || !wmView) return;
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
        {scmViewOnly ? (
          <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">{t('productMaster.readOnlyNotice')}</p>
        ) : null}
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
                    {!wmView ? <th className="px-4 py-3">{t('chinaReceiving.differenceType')}</th> : null}
                    <th className="px-4 py-3">{t('inventoryCount.notes')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {task.lineItems.map((item) => {
                    const actual = Number(quantities[item.id] ?? item.expectedQuantity);
                    const diff = actual - item.expectedQuantity;
                    const diffType = diff < 0 ? 'SHORTAGE' : diff > 0 ? 'OVERAGE' : '-';
                    return (
                      <tr key={item.id}>
                        <td className="px-4 py-3">{item.productName}</td>
                        <td className="px-4 py-3">{item.sku}</td>
                        <td className="px-4 py-3">{item.orderedQuantity}</td>
                        <td className="px-4 py-3">{item.expectedQuantity}</td>
                        <td className="px-4 py-3">
                          {task.hqStockMovementCreatedAt || scmViewOnly ? (
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
                        {!wmView ? (
                          <td className="px-4 py-3">{diffType === '-' ? '-' : translateStatus(t, diffType)}</td>
                        ) : null}
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

            {canViewActs && (task.differenceReports?.length ?? 0) > 0 ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-bold text-slate-950">{t('chinaReceiving.differenceActs')}</h3>
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3">#</th>
                        <th className="px-4 py-3">{t('chinaReceiving.differenceType')}</th>
                        <th className="px-4 py-3">{t('chinaReceiving.expectedQty')}</th>
                        <th className="px-4 py-3">{t('chinaReceiving.actualQty')}</th>
                        <th className="px-4 py-3">{t('common.status')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {task.differenceReports?.map((report) => (
                        <tr key={report.id}>
                          <td className="px-4 py-3 font-semibold">{report.reportNumber}</td>
                          <td className="px-4 py-3">{translateStatus(t, report.type)}</td>
                          <td className="px-4 py-3">{report.expectedQuantity}</td>
                          <td className="px-4 py-3">{report.receivedQuantity}</td>
                          <td className="px-4 py-3">{translateStatus(t, report.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {wmView && task.canReceive && !task.hqStockMovementCreatedAt ? (
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

            {scmViewOnly ? (
              <div className="flex flex-wrap gap-3">
                <Link href={`/procurement/orders/${task.id}`} className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold">
                  {t('common.open')}
                </Link>
              </div>
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
