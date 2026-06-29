'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';
import { hasPermission, hasRole } from '@/lib/rbac';
import type { User } from '@/lib/types';

type ProcurementItem = {
  id: string;
  sku: string;
  productName: string;
  quantity: number;
  confirmedQuantity?: number | null;
  shippedQuantity?: number | null;
  receivedQuantity?: number | null;
  purchasePriceYuan: string | number;
  weightKg: string | number;
  totalWeightKg?: string | number;
  factoryCostKgs?: string | number;
  transportCostKgs?: string | number;
  allocatedChinaShippingKgs?: string | number;
  allocatedPackagingKgs?: string | number;
  allocatedInternationalShippingKgs?: string | number;
  allocatedInsuranceKgs?: string | number;
  allocatedCustomsKgs?: string | number;
  allocatedBankFeesKgs?: string | number;
  allocatedOtherExpensesKgs?: string | number;
  landedCostPerUnitKgs?: string | number;
  totalLandedCostKgs?: string | number;
  finalCostKgs: string | number;
  totalCostKgs: string | number;
  notes?: string | null;
};

type ProcurementOrder = {
  id: string;
  orderNumber: string;
  status: string;
  allocationMethod?: string;
  totalYuan: string | number;
  totalCostKgs: string | number;
  totalWeightKg?: string | number;
  totalTransportCostKgs?: string | number;
  chinaLocalShippingKgs?: string | number;
  packagingCostKgs?: string | number;
  internationalShippingKgs?: string | number;
  insuranceKgs?: string | number;
  customsKgs?: string | number;
  bankFeesKgs?: string | number;
  otherExpensesKgs?: string | number;
  lastRecalculatedAt?: string;
  supplier?: { name: string; companyName?: string };
  factory?: { name: string };
  hqWarehouse?: { name: string };
  estimatedArrivalDate?: string;
  actualArrivalDate?: string;
  items?: ProcurementItem[];
  statusHistory?: Array<{ id: string; oldStatus?: string | null; newStatus: string; changedAt: string; reason?: string | null; changedBy?: { fullName: string } }>;
};

type OrderHistory = {
  statusHistory: Array<{ id: string; oldStatus?: string | null; newStatus: string; changedAt: string; reason?: string | null; changedBy?: { fullName: string } }>;
  auditHistory: Array<{ id: string; action: string; createdAt: string; reason?: string | null; user?: { fullName: string }; oldValue?: unknown; newValue?: unknown }>;
  costRecalculations: Array<{ id: string; trigger: string; recalculatedAt: string; totalLandedCostKgs: string | number }>;
  priceHistory: Array<{ id: string; oldPriceYuan: string | number; newPriceYuan: string | number; changedAt: string; reason?: string | null; changedBy?: { fullName: string }; procurementItem?: { sku: string; productName: string } }>;
  quantityHistory: Array<{ id: string; quantityType: string; oldQuantity: number; newQuantity: number; changedAt: string; reason?: string | null; changedBy?: { fullName: string }; procurementItem?: { sku: string; productName: string } }>;
  shortageReports: Array<{ id: string; reportNumber: string; type: string; productName: string; expectedQuantity: number; receivedQuantity: number; differenceQuantity: number; differenceReason?: string | null }>;
  receivings: Array<{ id: string; receivingNumber: string; receivedAt: string; items: Array<{ productName: string; expectedQuantity: number; receivedQuantity: number; differenceReason?: string | null }> }>;
};

const statusActions = [
  ['waiting-supplier', 'Waiting Supplier'],
  ['supplier-confirmed', 'Supplier Confirmed'],
  ['factory-confirmed', 'Factory Confirmed'],
  ['mark-production', 'Production'],
  ['ready-for-shipment', 'Ready For Shipment'],
  ['in-china-warehouse', 'In China Warehouse'],
  ['mark-in-transit', 'In Transit'],
  ['customs-clearance', 'Customs Clearance'],
  ['mark-arrived', 'Arrived At HQ'],
  ['complete', 'Completed'],
  ['cancel', 'Cancelled'],
] as const;

export default function ProcurementOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [order, setOrder] = useState<ProcurementOrder | null>(null);
  const [history, setHistory] = useState<OrderHistory | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [transportForm, setTransportForm] = useState({
    chinaLocalShippingKgs: '',
    packagingCostKgs: '',
    internationalShippingKgs: '',
    insuranceKgs: '',
    customsKgs: '',
    bankFeesKgs: '',
    otherExpensesKgs: '',
  });
  const [allocationMethod, setAllocationMethod] = useState('BY_WEIGHT');
  const [editingItem, setEditingItem] = useState<ProcurementItem | null>(null);
  const [itemForm, setItemForm] = useState({ purchasePriceYuan: '', quantity: '', confirmedQuantity: '', shippedQuantity: '', reason: '' });
  const [receiveForm, setReceiveForm] = useState<Record<string, { receivedQuantity: string; differenceReason: string }>>({});

  const canManage = hasPermission(user, 'procurement.manage');
  const canChangeStatus = canManage && (hasRole(user, 'CEO') || hasRole(user, 'SUPPLY_CHAIN_MANAGER') || hasRole(user, 'OWNER') || hasRole(user, 'SYSTEM_ADMINISTRATOR'));
  const canRecalculate = canManage && (hasRole(user, 'CEO') || hasRole(user, 'SUPPLY_CHAIN_MANAGER') || hasRole(user, 'OWNER') || hasRole(user, 'SYSTEM_ADMINISTRATOR'));
  const canReceive = hasRole(user, 'WAREHOUSE_MANAGER') || hasRole(user, 'SUPPLY_CHAIN_MANAGER') || hasRole(user, 'CEO') || hasRole(user, 'OWNER');

  const load = useCallback(async () => {
    try {
      const [userData, orderData, historyData] = await Promise.all([
        apiFetch<User>('/auth/me'),
        apiFetch<ProcurementOrder>(`/procurement/orders/${id}`),
        apiFetch<OrderHistory>(`/procurement/orders/${id}/history`),
      ]);
      setUser(userData);
      setOrder(orderData);
      setHistory(historyData);
      setTransportForm({
        chinaLocalShippingKgs: String(orderData.chinaLocalShippingKgs ?? 0),
        packagingCostKgs: String(orderData.packagingCostKgs ?? 0),
        internationalShippingKgs: String(orderData.internationalShippingKgs ?? 0),
        insuranceKgs: String(orderData.insuranceKgs ?? 0),
        customsKgs: String(orderData.customsKgs ?? 0),
        bankFeesKgs: String(orderData.bankFeesKgs ?? 0),
        otherExpensesKgs: String(orderData.otherExpensesKgs ?? 0),
      });
      setAllocationMethod(orderData.allocationMethod ?? 'BY_WEIGHT');
      const receiveDefaults: Record<string, { receivedQuantity: string; differenceReason: string }> = {};
      orderData.items?.forEach((item) => {
        receiveDefaults[item.id] = {
          receivedQuantity: String(item.shippedQuantity ?? item.confirmedQuantity ?? item.quantity),
          differenceReason: '',
        };
      });
      setReceiveForm(receiveDefaults);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }, [id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function action(path: string) {
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/procurement/orders/${id}/${path}`, { method: 'POST' });
      await load();
      setSuccess(t('common.success'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function saveTransportCosts() {
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/procurement/orders/${id}/transport-costs`, {
        method: 'PUT',
        body: JSON.stringify(Object.fromEntries(Object.entries(transportForm).map(([key, value]) => [key, Number(value)]))),
      });
      await load();
      setSuccess('Transportation costs updated and landed cost recalculated');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function saveAllocationMethod() {
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/procurement/orders/${id}/allocation-method`, {
        method: 'PUT',
        body: JSON.stringify({ allocationMethod }),
      });
      await load();
      setSuccess('Allocation method updated');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function recalculate() {
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/procurement/orders/${id}/recalculate-landed-cost`, { method: 'POST' });
      await load();
      setSuccess('Landed cost recalculated');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function saveItem() {
    if (!editingItem) return;
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/procurement/orders/${id}/items/${editingItem.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          purchasePriceYuan: itemForm.purchasePriceYuan ? Number(itemForm.purchasePriceYuan) : undefined,
          quantity: itemForm.quantity ? Number(itemForm.quantity) : undefined,
          confirmedQuantity: itemForm.confirmedQuantity ? Number(itemForm.confirmedQuantity) : undefined,
          shippedQuantity: itemForm.shippedQuantity ? Number(itemForm.shippedQuantity) : undefined,
          reason: itemForm.reason,
        }),
      });
      setEditingItem(null);
      await load();
      setSuccess('Item updated and landed cost recalculated');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function receiveToHq() {
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/procurement/orders/${id}/receive-to-hq`, {
        method: 'POST',
        body: JSON.stringify({
          items: order?.items?.map((item) => ({
            procurementItemId: item.id,
            receivedQuantity: Number(receiveForm[item.id]?.receivedQuantity ?? item.quantity),
            differenceReason: receiveForm[item.id]?.differenceReason || undefined,
          })),
        }),
      });
      await load();
      setSuccess('Goods received at HQ warehouse');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  const totalTransport = Object.values(transportForm).reduce((sum, value) => sum + Number(value || 0), 0);
  const totalWeight = order?.items?.reduce((sum, item) => sum + Number(item.totalWeightKg ?? Number(item.weightKg) * item.quantity), 0) ?? 0;
  const costPerKg = totalWeight > 0 ? totalTransport / totalWeight : 0;

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('procurement.orders.title')}</p>
          <h2 className="text-3xl font-bold">{order?.orderNumber ?? '-'}</h2>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}

        {order ? (
          <>
            <Section title="General Information">
              <div className="grid gap-4 md:grid-cols-4">
                <Info label={t('procurement.orders.supplier')} value={order.supplier?.name ?? ''} />
                <Info label={t('procurement.orders.factory')} value={order.factory?.name ?? '-'} />
                <Info label={t('procurement.orders.warehouse')} value={order.hqWarehouse?.name ?? ''} />
                <Info label={t('procurement.orders.status')} value={order.status} />
                <Info label={t('procurement.orders.totalYuan')} value={`¥${Number(order.totalYuan).toFixed(2)}`} />
                <Info label={t('procurement.orders.totalCostKgs')} value={formatKgs(order.totalCostKgs)} />
                <Info label="Total Weight" value={`${totalWeight.toFixed(2)} kg`} />
                <Info label="Allocation Method" value={order.allocationMethod ?? 'BY_WEIGHT'} />
                <Info label={t('procurement.orders.estimatedArrivalDate')} value={order.estimatedArrivalDate ? new Date(order.estimatedArrivalDate).toLocaleDateString() : '-'} />
                <Info label="Last Recalculated" value={order.lastRecalculatedAt ? new Date(order.lastRecalculatedAt).toLocaleString() : '-'} />
              </div>
            </Section>

            {canChangeStatus ? (
              <Section title="Status Timeline">
                <div className="flex flex-wrap gap-2">
                  {statusActions.map(([path, label]) => (
                    <button key={path} onClick={() => void action(path)} type="button" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold">{label}</button>
                  ))}
                </div>
                <div className="mt-4 space-y-2">
                  {(history?.statusHistory ?? order.statusHistory ?? []).map((entry) => (
                    <div key={entry.id} className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
                      <span className="font-semibold">{entry.oldStatus ?? '—'} → {entry.newStatus}</span>
                      <span className="ml-2 text-slate-500">{new Date(entry.changedAt).toLocaleString()}</span>
                      {entry.changedBy?.fullName ? <span className="ml-2 text-slate-500">by {entry.changedBy.fullName}</span> : null}
                    </div>
                  ))}
                </div>
              </Section>
            ) : null}

            <Section title="Products">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">SKU</th>
                      <th className="px-4 py-3">Product</th>
                      <th className="px-4 py-3">Ordered</th>
                      <th className="px-4 py-3">Confirmed</th>
                      <th className="px-4 py-3">Shipped</th>
                      <th className="px-4 py-3">Received</th>
                      <th className="px-4 py-3">Price ¥</th>
                      <th className="px-4 py-3">Weight</th>
                      <th className="px-4 py-3">Landed Cost</th>
                      {canManage ? <th className="px-4 py-3" /> : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {order.items?.map((item) => (
                      <tr key={item.id}>
                        <td className="px-4 py-3">{item.sku}</td>
                        <td className="px-4 py-3">{item.productName}</td>
                        <td className="px-4 py-3">{item.quantity}</td>
                        <td className="px-4 py-3">{item.confirmedQuantity ?? '—'}</td>
                        <td className="px-4 py-3">{item.shippedQuantity ?? '—'}</td>
                        <td className="px-4 py-3">{item.receivedQuantity ?? '—'}</td>
                        <td className="px-4 py-3">¥{Number(item.purchasePriceYuan).toFixed(2)}</td>
                        <td className="px-4 py-3">{Number(item.weightKg).toFixed(2)} kg</td>
                        <td className="px-4 py-3">{formatKgs(item.landedCostPerUnitKgs ?? item.finalCostKgs)}</td>
                        {canManage ? (
                          <td className="px-4 py-3">
                            <button type="button" className="text-blue-600" onClick={() => {
                              setEditingItem(item);
                              setItemForm({
                                purchasePriceYuan: String(item.purchasePriceYuan),
                                quantity: String(item.quantity),
                                confirmedQuantity: String(item.confirmedQuantity ?? ''),
                                shippedQuantity: String(item.shippedQuantity ?? ''),
                                reason: '',
                              });
                            }}>Edit</button>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            {canManage ? (
              <Section title="Transportation & Packaging Costs">
                <div className="grid gap-4 md:grid-cols-4">
                  {Object.entries(transportForm).map(([key, value]) => (
                    <label key={key} className="block text-sm">
                      <span className="mb-1 block font-semibold text-slate-600">{formatTransportLabel(key)}</span>
                      <input className="w-full rounded-xl border border-slate-300 px-3 py-2" value={value} onChange={(e) => setTransportForm((prev) => ({ ...prev, [key]: e.target.value }))} />
                    </label>
                  ))}
                </div>
                <div className="mt-4 flex gap-3">
                  <button type="button" onClick={() => void saveTransportCosts()} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Save & Recalculate</button>
                </div>
              </Section>
            ) : null}

            <Section title="Weight Summary">
              <div className="grid gap-4 md:grid-cols-3">
                <Info label="Total Weight" value={`${totalWeight.toFixed(2)} kg`} />
                <Info label="Total Transportation" value={formatKgs(totalTransport)} />
                <Info label="Cost Per Kg" value={formatKgs(costPerKg)} />
              </div>
            </Section>

            <Section title="Landed Cost Summary">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Product</th>
                      <th className="px-4 py-3">Factory</th>
                      <th className="px-4 py-3">China Ship</th>
                      <th className="px-4 py-3">Packaging</th>
                      <th className="px-4 py-3">Intl Ship</th>
                      <th className="px-4 py-3">Insurance</th>
                      <th className="px-4 py-3">Customs</th>
                      <th className="px-4 py-3">Bank</th>
                      <th className="px-4 py-3">Other</th>
                      <th className="px-4 py-3">Per Unit</th>
                      <th className="px-4 py-3">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {order.items?.map((item) => (
                      <tr key={item.id}>
                        <td className="px-4 py-3">{item.productName}</td>
                        <td className="px-4 py-3">{formatKgs(item.factoryCostKgs ?? 0)}</td>
                        <td className="px-4 py-3">{formatKgs(item.allocatedChinaShippingKgs ?? 0)}</td>
                        <td className="px-4 py-3">{formatKgs(item.allocatedPackagingKgs ?? 0)}</td>
                        <td className="px-4 py-3">{formatKgs(item.allocatedInternationalShippingKgs ?? 0)}</td>
                        <td className="px-4 py-3">{formatKgs(item.allocatedInsuranceKgs ?? 0)}</td>
                        <td className="px-4 py-3">{formatKgs(item.allocatedCustomsKgs ?? 0)}</td>
                        <td className="px-4 py-3">{formatKgs(item.allocatedBankFeesKgs ?? 0)}</td>
                        <td className="px-4 py-3">{formatKgs(item.allocatedOtherExpensesKgs ?? 0)}</td>
                        <td className="px-4 py-3">{formatKgs(item.landedCostPerUnitKgs ?? item.finalCostKgs)}</td>
                        <td className="px-4 py-3">{formatKgs(item.totalLandedCostKgs ?? item.totalCostKgs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            {canManage ? (
              <Section title="Landed Cost Engine">
                <div className="flex flex-wrap items-end gap-4">
                  <label className="block text-sm">
                    <span className="mb-1 block font-semibold text-slate-600">Allocation Method</span>
                    <select className="rounded-xl border border-slate-300 px-3 py-2" value={allocationMethod} onChange={(e) => setAllocationMethod(e.target.value)}>
                      <option value="BY_WEIGHT">By Weight (default)</option>
                      <option value="BY_PURCHASE_COST">By Purchase Cost</option>
                      <option value="BY_CBM">By CBM (future)</option>
                      <option value="MANUAL">Manual Allocation</option>
                    </select>
                  </label>
                  <button type="button" onClick={() => void saveAllocationMethod()} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold">Save Method</button>
                  {canRecalculate ? (
                    <button type="button" onClick={() => void recalculate()} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Recalculate</button>
                  ) : null}
                </div>
              </Section>
            ) : null}

            {canReceive ? (
              <Section title="HQ Receiving">
                <div className="space-y-3">
                  {order.items?.map((item) => (
                    <div key={item.id} className="grid gap-3 rounded-xl bg-slate-50 p-4 md:grid-cols-4">
                      <div>
                        <p className="font-semibold">{item.productName}</p>
                        <p className="text-sm text-slate-500">Expected: {item.shippedQuantity ?? item.confirmedQuantity ?? item.quantity}</p>
                      </div>
                      <input className="rounded-xl border border-slate-300 px-3 py-2" placeholder="Received qty" value={receiveForm[item.id]?.receivedQuantity ?? ''} onChange={(e) => setReceiveForm((prev) => ({ ...prev, [item.id]: { ...prev[item.id], receivedQuantity: e.target.value } }))} />
                      <select className="rounded-xl border border-slate-300 px-3 py-2" value={receiveForm[item.id]?.differenceReason ?? ''} onChange={(e) => setReceiveForm((prev) => ({ ...prev, [item.id]: { ...prev[item.id], differenceReason: e.target.value } }))}>
                        <option value="">No difference</option>
                        <option value="FACTORY_SHORTAGE">Factory Shortage</option>
                        <option value="SUPPLIER_SHORTAGE">Supplier Shortage</option>
                        <option value="DAMAGED_GOODS">Damaged Goods</option>
                        <option value="LOST_DURING_TRANSPORT">Lost During Transport</option>
                        <option value="CUSTOMS_ISSUE">Customs Issue</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={() => void receiveToHq()} className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Receive to HQ Warehouse</button>
              </Section>
            ) : null}

            <Section title="Price History">
              <HistoryTable rows={(history?.priceHistory ?? []).map((row) => [row.procurementItem?.productName ?? '', `${row.oldPriceYuan} → ${row.newPriceYuan}`, row.reason ?? '', row.changedBy?.fullName ?? '', new Date(row.changedAt).toLocaleString()])} headers={['Product', 'Change', 'Reason', 'By', 'Date']} />
            </Section>

            <Section title="Shortage Reports">
              <HistoryTable rows={(history?.shortageReports ?? []).map((row) => [row.reportNumber, row.productName, row.type, String(row.differenceQuantity), row.differenceReason ?? ''])} headers={['Report', 'Product', 'Type', 'Qty', 'Reason']} />
            </Section>

            <Section title="Receiving Summary">
              <HistoryTable rows={(history?.receivings ?? []).flatMap((receiving) => receiving.items.map((item) => [receiving.receivingNumber, item.productName, String(item.expectedQuantity), String(item.receivedQuantity), item.differenceReason ?? '']))} headers={['Receiving', 'Product', 'Expected', 'Received', 'Reason']} />
            </Section>

            <Section title="Audit History">
              <HistoryTable rows={(history?.auditHistory ?? []).map((row) => [row.action, JSON.stringify(row.oldValue ?? {}), JSON.stringify(row.newValue ?? {}), row.user?.fullName ?? '', new Date(row.createdAt).toLocaleString()])} headers={['Action', 'Old', 'New', 'User', 'Date']} />
            </Section>
          </>
        ) : null}

        {editingItem ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-xl">
              <h3 className="text-xl font-bold">Edit {editingItem.productName}</h3>
              <div className="mt-4 grid gap-3">
                <input className="rounded-xl border px-3 py-2" placeholder="Purchase price ¥" value={itemForm.purchasePriceYuan} onChange={(e) => setItemForm((prev) => ({ ...prev, purchasePriceYuan: e.target.value }))} />
                <input className="rounded-xl border px-3 py-2" placeholder="Ordered quantity" value={itemForm.quantity} onChange={(e) => setItemForm((prev) => ({ ...prev, quantity: e.target.value }))} />
                <input className="rounded-xl border px-3 py-2" placeholder="Confirmed quantity" value={itemForm.confirmedQuantity} onChange={(e) => setItemForm((prev) => ({ ...prev, confirmedQuantity: e.target.value }))} />
                <input className="rounded-xl border px-3 py-2" placeholder="Shipped quantity" value={itemForm.shippedQuantity} onChange={(e) => setItemForm((prev) => ({ ...prev, shippedQuantity: e.target.value }))} />
                <input className="rounded-xl border px-3 py-2" placeholder="Reason" value={itemForm.reason} onChange={(e) => setItemForm((prev) => ({ ...prev, reason: e.target.value }))} />
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" className="rounded-xl border px-4 py-2" onClick={() => setEditingItem(null)}>Cancel</button>
                <button type="button" className="rounded-xl bg-blue-600 px-4 py-2 text-white" onClick={() => void saveItem()}>Save</button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </ProtectedShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h3 className="mb-4 text-lg font-bold">{title}</h3>{children}</section>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase text-slate-400">{label}</p><p className="font-bold text-slate-950">{value}</p></div>;
}

function HistoryTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
          <tr>{headers.map((header) => <th key={header} className="px-4 py-3">{header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length ? rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex} className="px-4 py-3">{cell}</td>)}</tr>) : <tr><td className="px-4 py-3 text-slate-500" colSpan={headers.length}>No records yet</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function formatKgs(value: number | string | null | undefined) {
  return `${Number(value ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} сом`;
}

function formatTransportLabel(key: string) {
  return key
    .replace(/Kgs$/, '')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (char) => char.toUpperCase())
    .trim();
}
