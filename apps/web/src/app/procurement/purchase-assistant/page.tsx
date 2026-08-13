'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { ProcurementHubNav } from '@/components/procurement/ProcurementHubNav';
import { apiFetch } from '@/lib/api';
import { savePurchaseAssistantDraft } from '@/lib/purchase-assistant-draft';
import { canManageProcurement, isSupplyChainManagerUser, hasFullAccess } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

import { toast } from '@/lib/toast';

type Priority = 'URGENT' | 'RECOMMENDED' | 'SUFFICIENT';

type AssistantItem = {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  purchasePriceYuan: number;
  defaultFactoryId: string | null;
  photoUrl: string | null;
  hqStock: number;
  salesQuantity: number;
  onTheWay: number;
  branchOrders: number;
  requiredStock: number;
  averageDailySales: number;
  recommendedQuantity: number;
  orderingRequired: boolean;
  priority: Priority;
};

type AssistantResponse = {
  periodDays: number;
  reserveDays: number;
  generatedAt: string;
  items: AssistantItem[];
};

type RowState = {
  finalQuantity: number;
  reason: string;
  ignored: boolean;
};

export default function PurchaseAssistantPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [periodDays, setPeriodDays] = useState<30 | 60 | 90>(30);
  const [reserveDays, setReserveDays] = useState(10);
  const [data, setData] = useState<AssistantResponse | null>(null);
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detailItem, setDetailItem] = useState<AssistantItem | null>(null);
  const [busy, setBusy] = useState(false);

  const canAccess =
    !!user &&
    canManageProcurement(user) &&
    (isSupplyChainManagerUser(user) || hasFullAccess(user));

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await apiFetch<AssistantResponse>(
        `/procurement/purchase-assistant?periodDays=${periodDays}&reserveDays=${reserveDays}`,
      );
      setData(result);
      setRowState((current) => {
        const next: Record<string, RowState> = {};
        for (const item of result.items) {
          next[item.productId] = current[item.productId]?.ignored
            ? current[item.productId]
            : {
                finalQuantity: item.recommendedQuantity,
                reason: current[item.productId]?.reason ?? '',
                ignored: false,
              };
        }
        return next;
      });
    } catch (err) {
      setData(null);
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [periodDays, reserveDays, t]);

  useEffect(() => {
    void apiFetch<User>('/auth/me').then(setUser).catch(() => null);
  }, []);

  useEffect(() => {
    if (!user) return;
    if (!canAccess) return;
    void load();
  }, [user, canAccess, load]);

  const visibleItems = useMemo(
    () => (data?.items ?? []).filter((item) => !rowState[item.productId]?.ignored),
    [data, rowState],
  );

  const recommendedItems = useMemo(
    () => visibleItems.filter((item) => item.orderingRequired && (rowState[item.productId]?.finalQuantity ?? 0) > 0),
    [visibleItems, rowState],
  );

  function updateRow(productId: string, patch: Partial<RowState>) {
    setRowState((current) => ({
      ...current,
      [productId]: {
        finalQuantity: current[productId]?.finalQuantity ?? 0,
        reason: current[productId]?.reason ?? '',
        ignored: current[productId]?.ignored ?? false,
        ...patch,
      },
    }));
  }

  async function auditAccept(items: AssistantItem[]) {
    await apiFetch('/procurement/purchase-assistant/accept', {
      method: 'POST',
      body: JSON.stringify({
        items: items.map((item) => ({
          productId: item.productId,
          recommendedQuantity: item.recommendedQuantity,
          finalQuantity: rowState[item.productId]?.finalQuantity ?? item.recommendedQuantity,
          reason: rowState[item.productId]?.reason || undefined,
          periodDays: data?.periodDays ?? periodDays,
          reserveDays: data?.reserveDays ?? reserveDays,
          hqStock: item.hqStock,
          onTheWay: item.onTheWay,
          branchOrders: item.branchOrders,
          salesQuantity: item.salesQuantity,
        })),
      }),
    });
  }

  async function auditModify(item: AssistantItem, finalQuantity: number, reason: string) {
    if (finalQuantity === item.recommendedQuantity && !reason.trim()) return;
    await apiFetch('/procurement/purchase-assistant/modify', {
      method: 'POST',
      body: JSON.stringify({
        item: {
          productId: item.productId,
          recommendedQuantity: item.recommendedQuantity,
          finalQuantity,
          reason: reason || undefined,
          periodDays: data?.periodDays ?? periodDays,
          reserveDays: data?.reserveDays ?? reserveDays,
          hqStock: item.hqStock,
          onTheWay: item.onTheWay,
          branchOrders: item.branchOrders,
          salesQuantity: item.salesQuantity,
        },
      }),
    });
  }

  async function addItemsToPurchaseOrder(items: AssistantItem[]) {
    if (!items.length) return;
    setBusy(true);
    setError('');
    try {
      const modified = items.filter((item) => {
        const finalQuantity = rowState[item.productId]?.finalQuantity ?? item.recommendedQuantity;
        const reason = rowState[item.productId]?.reason ?? '';
        return finalQuantity !== item.recommendedQuantity || !!reason.trim();
      });
      for (const item of modified) {
        await auditModify(
          item,
          rowState[item.productId]?.finalQuantity ?? item.recommendedQuantity,
          rowState[item.productId]?.reason ?? '',
        );
      }
      await auditAccept(items);
      savePurchaseAssistantDraft(
        items.map((item) => ({
          productId: item.productId,
          quantity: rowState[item.productId]?.finalQuantity ?? item.recommendedQuantity,
          purchasePriceYuan: item.purchasePriceYuan,
          factoryId: item.defaultFactoryId,
          name: item.name,
          sku: item.sku,
          recommendedQuantity: item.recommendedQuantity,
          reason: rowState[item.productId]?.reason,
        })),
      );
      router.push('/procurement/orders/new');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  if (user && !canAccess) {
    return (
      <ProtectedShell>
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{t('common.forbiddenMessage')}</p>
      </ProtectedShell>
    );
  }

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('procurement.title')}</p>
            <h2 className="text-3xl font-bold text-slate-950">{t('procurement.purchaseAssistant.title')}</h2>
            <p className="mt-2 text-slate-500">{t('procurement.purchaseAssistant.subtitle')}</p>
          </div>
          <button
            type="button"
            disabled={busy || recommendedItems.length === 0}
            onClick={() => void addItemsToPurchaseOrder(recommendedItems)}
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {t('procurement.purchaseAssistant.addAllRecommended')}
          </button>
        </div>

        <ProcurementHubNav activeTab="purchase-assistant" />

        <div className="grid gap-3 md:grid-cols-3">
          <label className="block space-y-1 text-sm">
            <span className="font-semibold text-slate-700">{t('procurement.purchaseAssistant.period')}</span>
            <select
              value={periodDays}
              onChange={(event) => setPeriodDays(Number(event.target.value) as 30 | 60 | 90)}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none ring-blue-500 focus:ring-2"
            >
              <option value={30}>{t('procurement.purchaseAssistant.period30')}</option>
              <option value={60}>{t('procurement.purchaseAssistant.period60')}</option>
              <option value={90}>{t('procurement.purchaseAssistant.period90')}</option>
            </select>
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-semibold text-slate-700">{t('procurement.purchaseAssistant.reserveDays')}</span>
            <input
              type="number"
              min={0}
              max={365}
              value={reserveDays}
              onChange={(event) => setReserveDays(Math.max(0, Number(event.target.value) || 0))}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none ring-blue-500 focus:ring-2"
            />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="w-full rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {t('procurement.purchaseAssistant.refresh')}
            </button>
          </div>
        </div>

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">{t('common.loading')}</p>
          ) : null}
          {!loading && visibleItems.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">{t('procurement.purchaseAssistant.empty')}</p>
          ) : null}
          {!loading && visibleItems.length > 0 ? (
            <table className="w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">{t('procurement.purchaseAssistant.product')}</th>
                  <th className="px-3 py-2">{t('procurement.purchaseAssistant.hqStock')}</th>
                  <th className="px-3 py-2">{t('procurement.purchaseAssistant.sales')}</th>
                  <th className="px-3 py-2">{t('procurement.purchaseAssistant.onTheWay')}</th>
                  <th className="px-3 py-2">{t('procurement.purchaseAssistant.branchOrders')}</th>
                  <th className="px-3 py-2">{t('procurement.purchaseAssistant.recommended')}</th>
                  <th className="px-3 py-2 text-right">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleItems.map((item) => {
                  const state = rowState[item.productId] ?? {
                    finalQuantity: item.recommendedQuantity,
                    reason: '',
                    ignored: false,
                  };
                  return (
                    <tr key={item.productId} className="hover:bg-blue-50/40">
                      <td className="px-3 py-3">
                        <p className="font-semibold text-slate-900">{item.name}</p>
                        <p className="text-xs text-slate-500">{item.sku}</p>
                        <PriorityBadge priority={item.priority} />
                      </td>
                      <td className="px-3 py-3">{item.hqStock}</td>
                      <td className="px-3 py-3">{item.salesQuantity}</td>
                      <td className="px-3 py-3">{item.onTheWay}</td>
                      <td className="px-3 py-3">{item.branchOrders}</td>
                      <td className="px-3 py-3">
                        {item.orderingRequired ? (
                          <div className="space-y-2">
                            <input
                              type="number"
                              min={0}
                              value={state.finalQuantity}
                              onChange={(event) =>
                                updateRow(item.productId, {
                                  finalQuantity: Math.max(0, Math.floor(Number(event.target.value) || 0)),
                                })
                              }
                              className="w-24 rounded-lg border border-slate-300 px-2 py-1"
                            />
                            {state.finalQuantity !== item.recommendedQuantity ? (
                              <p className="text-xs text-slate-500">
                                {t('procurement.purchaseAssistant.systemRecommended')}: {item.recommendedQuantity}
                              </p>
                            ) : null}
                            <input
                              value={state.reason}
                              onChange={(event) => updateRow(item.productId, { reason: event.target.value })}
                              placeholder={t('procurement.purchaseAssistant.reasonPlaceholder')}
                              className="w-full max-w-[12rem] rounded-lg border border-slate-300 px-2 py-1 text-xs"
                            />
                          </div>
                        ) : (
                          <span className="text-slate-500">{t('procurement.purchaseAssistant.orderingNotRequired')}</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex flex-col items-end gap-2">
                          <button
                            type="button"
                            className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                            onClick={() => setDetailItem(item)}
                          >
                            {t('procurement.purchaseAssistant.viewCalculation')}
                          </button>
                          {item.orderingRequired ? (
                            <button
                              type="button"
                              disabled={busy || state.finalQuantity <= 0}
                              onClick={() => void addItemsToPurchaseOrder([item])}
                              className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold disabled:opacity-50"
                            >
                              {t('procurement.purchaseAssistant.addToOrder')}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => updateRow(item.productId, { ignored: true })}
                            className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                          >
                            {t('procurement.purchaseAssistant.ignore')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : null}
        </div>
      </section>

      {detailItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-950">{detailItem.name}</h3>
            <p className="mt-1 text-sm text-slate-500">{detailItem.sku}</p>
            <dl className="mt-4 space-y-2 text-sm">
              <DetailRow
                label={`${t('procurement.purchaseAssistant.sales')} (${data?.periodDays ?? periodDays} ${t('procurement.purchaseAssistant.days')})`}
                value={`${detailItem.salesQuantity} ${t('procurement.purchaseAssistant.pcs')}`}
              />
              <DetailRow
                label={t('procurement.purchaseAssistant.hqStock')}
                value={`${detailItem.hqStock} ${t('procurement.purchaseAssistant.pcs')}`}
              />
              <DetailRow
                label={t('procurement.purchaseAssistant.onTheWay')}
                value={`${detailItem.onTheWay} ${t('procurement.purchaseAssistant.pcs')}`}
              />
              <DetailRow
                label={t('procurement.purchaseAssistant.branchOrders')}
                value={`${detailItem.branchOrders} ${t('procurement.purchaseAssistant.pcs')}`}
              />
              <DetailRow
                label={t('procurement.purchaseAssistant.systemRecommended')}
                value={`${detailItem.recommendedQuantity} ${t('procurement.purchaseAssistant.pcs')}`}
              />
            </dl>
            <button
              type="button"
              onClick={() => setDetailItem(null)}
              className="mt-6 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white"
            >
              {t('common.close')}
            </button>
          </div>
        </div>
      ) : null}
    </ProtectedShell>
  );
}

function PriorityBadge({ priority }: { priority: Priority }) {
  const { t } = useTranslation();
  if (priority === 'URGENT') {
    return (
      <span className="mt-2 inline-flex rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700">
        {t('procurement.purchaseAssistant.priorityUrgent')}
      </span>
    );
  }
  if (priority === 'RECOMMENDED') {
    return (
      <span className="mt-2 inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
        {t('procurement.purchaseAssistant.priorityRecommended')}
      </span>
    );
  }
  return (
    <span className="mt-2 inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">
      {t('procurement.purchaseAssistant.prioritySufficient')}
    </span>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 py-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-semibold text-slate-900">{value}</dd>
    </div>
  );
}
