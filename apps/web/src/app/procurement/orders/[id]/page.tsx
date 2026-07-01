'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { ProcurementSupplierPayments } from '@/components/ProcurementSupplierPayments';
import { ProcurementEditWindowPanel } from '@/components/ProcurementEditWindowPanel';
import { apiFetch, API_URL, getToken } from '@/lib/api';
import { calculateLandedCosts, extractCargoConfig } from '@/lib/landed-cost';
import { resolveChinaDomesticTransportKgs } from '@/lib/transport-logistics';
import {
  canConfirmSvhToHqArrival,
  canCreateProcurementOrder,
  canCreateSupplierPayment,
  canEditProcurementOrderItemsInWindow,
  canManageSvhToHqTransport,
  canReceiveProcurementToHq,
  canUnlockProcurementOrder,
  canViewSupplierPayments,
  hasRole,
} from '@/lib/rbac';
import type { User, Warehouse } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type ProcurementOrderItem = {
  id: string;
  sku: string;
  productName: string;
  status?: string;
  quantity: number;
  receivedQuantity?: number | null;
  purchasePriceYuan: string | number;
  yuanRate: string | number;
  weightKg: string | number;
  netWeightKg?: string | number;
  packagingWeightKg?: string | number;
  totalWeightKg: string | number;
  transportCostKgs: string | number;
  finalCostKgs: string | number;
};

type TransportCompany = {
  id: string;
  name: string;
  companyCode: string;
  status: string;
};

type SvhToHqTransport = {
  id: string;
  transportCompanyId?: string | null;
  transportCostKgs: number;
  vehicleNumber?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  dispatchDate?: string | null;
  arrivalDate?: string | null;
  status: 'WAITING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  notes?: string | null;
  transportCompany?: TransportCompany | null;
};

type ProcurementOrder = {
  id: string;
  orderNumber: string;
  createdAt?: string;
  status: string;
  totalYuan: string | number;
  totalCostKgs: string | number;
  totalWeightKg: string | number;
  totalNetWeightKg?: string | number;
  totalPackagingWeightKg?: string | number;
  totalCargoCostUsd?: string | number;
  totalCargoCostKgs?: string | number;
  defaultYuanRate?: string | number;
  defaultUsdRate?: string | number;
  cargoRateUsdPerKg?: string | number;
  cargoTotalWeightKg?: string | number;
  cargoCompany?: string | null;
  cargoReceiptNumber?: string | null;
  cargoReceiptDate?: string | null;
  cargoReceiptNote?: string | null;
  chinaDomesticTransportYuan?: string | number;
  chinaDomesticTransportKgs: string | number;
  chinaDomesticTransportCompanyId?: string | null;
  chinaExportTransportCompanyId?: string | null;
  svhToHqTransportCompanyId?: string | null;
  chinaDomesticTransportCompany?: TransportCompany | null;
  chinaExportTransportCompany?: TransportCompany | null;
  svhToHqTransportCompany?: TransportCompany | null;
  localTransportKgs: string | number;
  customsCostKgs: string | number;
  insuranceCostKgs: string | number;
  bankFeeCostKgs: string | number;
  otherExpenseKgs: string | number;
  packagingCostKgs: string | number;
  hqStockMovementCreatedAt?: string | null;
  hqWarehouseId?: string;
  supplier?: { name: string };
  factory?: { name: string };
  hqWarehouse?: { name: string };
  totalPaidYuan?: number;
  totalPaidKgs?: number;
  remainingYuan?: number;
  weightedAverageYuanRate?: number | null;
  effectiveYuanRate?: number;
  supplierPaymentStatus?: string;
  yuanRateLocked?: boolean;
  supplierPayments?: Array<{
    id: string;
    paymentDate: string;
    amountYuan: number;
    exchangeRate: number;
    amountKgs: number;
    paymentMethod: 'BANK' | 'CASH' | 'TRANSFER';
    receiptNumber?: string | null;
    status: 'ACTIVE' | 'VOID';
    attachments?: Array<{ id: string; fileName: string; fileUrl: string }>;
  }>;
  cargoAttachments?: Array<{ id: string; fileName: string; fileUrl: string; mimeType: string }>;
  sentToSupplierAt?: string | null;
  editableUntil?: string | null;
  unlockedAt?: string | null;
  unlockExpiresAt?: string | null;
  unlockReason?: string | null;
  isEditable?: boolean;
  editWindowStatus?: 'DRAFT_EDITABLE' | 'EDITABLE' | 'LOCKED' | 'CEO_UNLOCKED';
  secondsRemaining?: number | null;
  unlockedBy?: { fullName?: string } | null;
  items?: ProcurementOrderItem[];
  differenceReports?: Array<{ id: string; reportNumber: string; type: string; sku: string; expectedQuantity: number; receivedQuantity: number; differenceQuantity: number; status: string; shortageReason?: string }>;
  receivings?: Array<{ id: string; receivingNumber: string; receivedAt: string }>;
  svhToHqTransport?: SvhToHqTransport | null;
  canReceiveToHq?: boolean;
};

type AuditLog = { id: string; action: string; timestamp: string; user?: { fullName: string } };

const SHORTAGE_REASONS = ['FACTORY_SHORTAGE', 'SUPPLIER_SHORTAGE', 'DAMAGED_GOODS', 'LOST_IN_TRANSPORT', 'CUSTOMS_ISSUE', 'OTHER'] as const;
const statusActions = [
  ['approve', 'distribution.approve'],
  ['mark-ordered', 'procurement.orders.markOrdered'],
  ['mark-sent-to-supplier', 'procurement.orders.markSentToSupplier'],
  ['mark-paid', 'paymentStatus.PAID'],
  ['mark-production', 'procurement.inProduction'],
  ['mark-shipped-to-yiwu', 'procurement.shippedToYiwu'],
  ['mark-in-transit', 'procurement.inTransit'],
  ['mark-arrived', 'procurement.markArrived'],
  ['cancel', 'distribution.cancel'],
] as const;

const SVH_STATUSES = ['ARRIVED_IN_KYRGYZSTAN', 'ARRIVED', 'CUSTOMS_CLEARANCE', 'IN_TRANSIT'];
const SVH_TRANSPORT_STATUSES = ['WAITING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;

const emptySvhForm = () => ({
  transportCompanyId: '',
  transportCostKgs: '0',
  vehicleNumber: '',
  driverName: '',
  driverPhone: '',
  dispatchDate: '',
  arrivalDate: '',
  status: 'WAITING' as SvhToHqTransport['status'],
  notes: '',
});

export default function ProcurementOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [order, setOrder] = useState<ProcurementOrder | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({});
  const [receiveReason, setReceiveReason] = useState<Record<string, string>>({});
  const [transportCompanies, setTransportCompanies] = useState<TransportCompany[]>([]);
  const [logisticsForm, setLogisticsForm] = useState({
    chinaDomesticTransportYuan: '0',
    chinaDomesticTransportCompanyId: '',
    chinaExportTransportCompanyId: '',
    customsCostKgs: '0',
    insuranceCostKgs: '0',
    bankFeeCostKgs: '0',
    otherExpenseKgs: '0',
    packagingCostKgs: '0',
    cargoTotalWeightKg: '0',
    cargoRateUsdPerKg: '0',
    defaultUsdRate: '0',
    cargoCompany: '',
    cargoReceiptNumber: '',
    cargoReceiptDate: '',
    cargoReceiptNote: '',
    hqWarehouseId: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [savingLogistics, setSavingLogistics] = useState(false);
  const [savingSvh, setSavingSvh] = useState(false);
  const [svhForm, setSvhForm] = useState(emptySvhForm());
  const [unlocking, setUnlocking] = useState(false);

  const canEditOrder = canCreateProcurementOrder(user);
  const canEditItems = canEditProcurementOrderItemsInWindow(user, {
    isEditable: order?.isEditable,
    editWindowStatus: order?.editWindowStatus,
    sentToSupplierAt: order?.sentToSupplierAt,
  });
  const canUnlock = canUnlockProcurementOrder(user) && order?.editWindowStatus === 'LOCKED';
  const canSeePayments = canViewSupplierPayments(user);
  const canUploadCargo = canCreateSupplierPayment(user);
  const readOnlyFinance = hasRole(user, 'FINANCE_MANAGER') || hasRole(user, 'ACCOUNTANT');
  const canReceive = canReceiveProcurementToHq(user);
  const readyForHqReceiving = order?.status === 'ARRIVED' || order?.status === 'ARRIVED_IN_KYRGYZSTAN' || order?.status === 'IN_TRANSIT';
  const canEditSvh = order ? SVH_STATUSES.includes(order.status) : false;
  const canManageSvh = canManageSvhToHqTransport(user);
  const canConfirmSvh = canConfirmSvhToHqArrival(user);
  const svhTransportCompleted = order?.svhToHqTransport?.status === 'COMPLETED' || order?.canReceiveToHq === true;
  const canSaveSvh = canManageSvh || (canConfirmSvh && !!order?.svhToHqTransport);
  const svhStatusOptions = canManageSvh
    ? SVH_TRANSPORT_STATUSES
    : canConfirmSvh
      ? ([svhForm.status, 'COMPLETED'] as const).filter((status, index, list) => list.indexOf(status) === index)
      : ([] as const);
  const finalized = !!order?.hqStockMovementCreatedAt;

  const previewItems = useMemo(() => (order?.items ?? [])
    .filter((item) => item.status !== 'CANCELLED')
    .map((item) => ({
    quantity: item.quantity,
    receivedQuantity: canReceive && !finalized ? Number(receiveQty[item.id] ?? item.quantity) : item.receivedQuantity,
    purchasePriceYuan: Number(item.purchasePriceYuan),
    yuanRate: Number(
      order?.effectiveYuanRate ??
      item.yuanRate ??
      order?.weightedAverageYuanRate ??
      order?.defaultYuanRate ??
      0,
    ),
    weightKg: Number(item.netWeightKg ?? item.weightKg),
  })), [order, receiveQty, canReceive, finalized]);

  const effectiveYuanRate = Number(
    order?.effectiveYuanRate ??
    order?.weightedAverageYuanRate ??
    order?.defaultYuanRate ??
    0,
  );

  const previewChinaDomesticTransportKgs = useMemo(
    () => resolveChinaDomesticTransportKgs({
      chinaDomesticTransportYuan: Number(logisticsForm.chinaDomesticTransportYuan || 0),
      chinaDomesticTransportKgs: Number(order?.chinaDomesticTransportKgs || 0),
      effectiveYuanRate,
    }),
    [logisticsForm.chinaDomesticTransportYuan, order?.chinaDomesticTransportKgs, effectiveYuanRate],
  );

  const previewTotals = useMemo(() => {
    try {
      return calculateLandedCosts(
        previewItems,
        {
          chinaDomesticTransportKgs: previewChinaDomesticTransportKgs,
          chinaExportTransportKgs: 0,
          localTransportKgs: Number(svhForm.transportCostKgs || order?.localTransportKgs || 0),
          packagingCostKgs: Number(logisticsForm.packagingCostKgs || 0),
          customsCostKgs: Number(logisticsForm.customsCostKgs || 0),
          insuranceCostKgs: Number(logisticsForm.insuranceCostKgs || 0),
          bankFeeCostKgs: Number(logisticsForm.bankFeeCostKgs || 0),
          otherExpenseKgs: Number(logisticsForm.otherExpenseKgs || 0),
        },
        { cargo: extractCargoConfig(logisticsForm) },
      );
    } catch (err) {
      return null;
    }
  }, [previewItems, logisticsForm, previewChinaDomesticTransportKgs, svhForm.transportCostKgs, order?.localTransportKgs]);

  const cargoValidationError = useMemo(() => {
    if (!previewTotals) return t('procurement.orders.cargoWeightLessThanNet');
    return null;
  }, [previewTotals, t]);

  async function load() {
    try {
      const [orderResult, auditResult, me, warehouseResult, transportCompanyResult] = await Promise.all([
        apiFetch<ProcurementOrder>(`/procurement/orders/${id}`),
        apiFetch<AuditLog[]>(`/procurement/orders/${id}/audit-logs`),
        apiFetch<User>('/auth/me'),
        apiFetch<Warehouse[]>('/inventory/warehouses?warehouseType=HQ&status=ACTIVE'),
        apiFetch<TransportCompany[]>('/procurement/transport-companies?selectable=true').catch(() => []),
      ]);
      setOrder(orderResult);
      setAuditLogs(auditResult);
      setUser(me);
      setWarehouses(warehouseResult);
      setTransportCompanies(transportCompanyResult);
      setReceiveQty(Object.fromEntries((orderResult.items ?? []).map((item) => [item.id, String(item.receivedQuantity ?? item.quantity)])));
      setLogisticsForm({
        chinaDomesticTransportYuan: String(orderResult.chinaDomesticTransportYuan ?? 0),
        chinaDomesticTransportCompanyId: orderResult.chinaDomesticTransportCompanyId ?? '',
        chinaExportTransportCompanyId: orderResult.chinaExportTransportCompanyId ?? '',
        customsCostKgs: String(orderResult.customsCostKgs ?? 0),
        insuranceCostKgs: String(orderResult.insuranceCostKgs ?? 0),
        bankFeeCostKgs: String(orderResult.bankFeeCostKgs ?? 0),
        otherExpenseKgs: String(orderResult.otherExpenseKgs ?? 0),
        packagingCostKgs: String(orderResult.packagingCostKgs ?? 0),
        cargoTotalWeightKg: String(orderResult.cargoTotalWeightKg ?? 0),
        cargoRateUsdPerKg: String(orderResult.cargoRateUsdPerKg ?? 0),
        defaultUsdRate: String(orderResult.defaultUsdRate ?? 0),
        cargoCompany: orderResult.cargoCompany ?? '',
        cargoReceiptNumber: orderResult.cargoReceiptNumber ?? '',
        cargoReceiptDate: orderResult.cargoReceiptDate ? orderResult.cargoReceiptDate.slice(0, 10) : '',
        cargoReceiptNote: orderResult.cargoReceiptNote ?? '',
        hqWarehouseId: orderResult.hqWarehouseId ?? '',
      });
      const svh = orderResult.svhToHqTransport;
      setSvhForm(svh ? {
        transportCompanyId: svh.transportCompanyId ?? '',
        transportCostKgs: String(svh.transportCostKgs ?? 0),
        vehicleNumber: svh.vehicleNumber ?? '',
        driverName: svh.driverName ?? '',
        driverPhone: svh.driverPhone ?? '',
        dispatchDate: svh.dispatchDate ? svh.dispatchDate.slice(0, 10) : '',
        arrivalDate: svh.arrivalDate ? svh.arrivalDate.slice(0, 10) : '',
        status: svh.status,
        notes: svh.notes ?? '',
      } : emptySvhForm());
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function unlockOrder(reason: string) {
    setUnlocking(true);
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/procurement/orders/${id}/unlock`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      setSuccess(t('procurement.orders.editWindow.unlockSuccess'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setUnlocking(false);
    }
  }

  async function action(path: string) {
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/procurement/orders/${id}/${path}`, { method: 'POST' });
      setSuccess(t('common.success'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function saveLogistics() {
    if (!order || finalized) return;
    setSavingLogistics(true);
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/procurement/orders/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          chinaDomesticTransportYuan: Number(logisticsForm.chinaDomesticTransportYuan || 0),
          chinaDomesticTransportCompanyId: logisticsForm.chinaDomesticTransportCompanyId || null,
          chinaExportTransportCompanyId: logisticsForm.chinaExportTransportCompanyId || null,
          customsCostKgs: Number(logisticsForm.customsCostKgs || 0),
          insuranceCostKgs: Number(logisticsForm.insuranceCostKgs || 0),
          bankFeeCostKgs: Number(logisticsForm.bankFeeCostKgs || 0),
          otherExpenseKgs: Number(logisticsForm.otherExpenseKgs || 0),
          packagingCostKgs: Number(logisticsForm.packagingCostKgs || 0),
          cargoTotalWeightKg: Number(logisticsForm.cargoTotalWeightKg || 0),
          cargoRateUsdPerKg: Number(logisticsForm.cargoRateUsdPerKg || 0),
          defaultUsdRate: Number(logisticsForm.defaultUsdRate || 0),
          cargoCompany: logisticsForm.cargoCompany || undefined,
          cargoReceiptNumber: logisticsForm.cargoReceiptNumber || undefined,
          cargoReceiptDate: logisticsForm.cargoReceiptDate || undefined,
          cargoReceiptNote: logisticsForm.cargoReceiptNote || undefined,
          hqWarehouseId: logisticsForm.hqWarehouseId || order.hqWarehouseId,
        }),
      });
      setSuccess(t('procurement.orders.logisticsSaved'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSavingLogistics(false);
    }
  }

  async function saveSvhTransport() {
    if (!order || finalized || !canEditSvh || !canSaveSvh) return;
    setSavingSvh(true);
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/procurement/orders/${id}/svh-to-hq-transport`, {
        method: 'PUT',
        body: JSON.stringify({
          transportCompanyId: svhForm.transportCompanyId || null,
          transportCostKgs: Number(svhForm.transportCostKgs || 0),
          vehicleNumber: svhForm.vehicleNumber || undefined,
          driverName: svhForm.driverName || undefined,
          driverPhone: svhForm.driverPhone || undefined,
          dispatchDate: svhForm.dispatchDate || undefined,
          arrivalDate: svhForm.arrivalDate || undefined,
          status: svhForm.status,
          notes: svhForm.notes || undefined,
        }),
      });
      setSuccess(t('procurement.svhTransport.saved'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSavingSvh(false);
    }
  }

  async function uploadCargoReceipt(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const token = getToken();
    if (!token) return;
    setError('');
    setSuccess('');
    const formData = new FormData();
    formData.append('file', file);
    try {
      const response = await fetch(`${API_URL}/procurement/orders/${id}/attachments/cargo-receipt`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || t('common.error'));
      }
      setSuccess(t('common.success'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function receiveGoods() {
    if (!order || cargoValidationError || !svhTransportCompleted) return;
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/procurement/orders/${id}/receive-to-hq`, {
        method: 'POST',
        body: JSON.stringify({
          hqWarehouseId: logisticsForm.hqWarehouseId || order.hqWarehouseId,
          cargoTotalWeightKg: Number(logisticsForm.cargoTotalWeightKg || 0),
          cargoRateUsdPerKg: Number(logisticsForm.cargoRateUsdPerKg || 0),
          defaultUsdRate: Number(logisticsForm.defaultUsdRate || 0),
          cargoCompany: logisticsForm.cargoCompany || undefined,
          cargoReceiptNumber: logisticsForm.cargoReceiptNumber || undefined,
          cargoReceiptDate: logisticsForm.cargoReceiptDate || undefined,
          cargoReceiptNote: logisticsForm.cargoReceiptNote || undefined,
          customsCostKgs: Number(logisticsForm.customsCostKgs || 0),
          insuranceCostKgs: Number(logisticsForm.insuranceCostKgs || 0),
          bankFeeCostKgs: Number(logisticsForm.bankFeeCostKgs || 0),
          otherExpenseKgs: Number(logisticsForm.otherExpenseKgs || 0),
          packagingCostKgs: Number(logisticsForm.packagingCostKgs || 0),
          items: (order.items ?? []).map((item) => ({
            procurementItemId: item.id,
            receivedQuantity: Number(receiveQty[item.id] ?? item.quantity),
            shortageReason: Number(receiveQty[item.id] ?? item.quantity) !== item.quantity
              ? (receiveReason[item.id] || 'OTHER')
              : undefined,
          })),
        }),
      });
      setSuccess(t('procurement.orders.received'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function setLogistics<K extends keyof typeof logisticsForm>(key: K, value: string) {
    setLogisticsForm((current) => ({ ...current, [key]: value }));
  }

  function setSvhField<K extends keyof ReturnType<typeof emptySvhForm>>(key: K, value: ReturnType<typeof emptySvhForm>[K]) {
    setSvhForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('procurement.orders.title')}</p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('procurement.orders.orderDate')}</p>
            <h2 className="text-3xl font-bold">{order?.createdAt ? formatOrderDate(order.createdAt) : '-'}</h2>
          </div>
          {canEditItems && order && !finalized ? (
            <Link href={`/procurement/orders/${id}/edit`} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold">{t('procurement.orders.edit')}</Link>
          ) : null}
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}
        {readOnlyFinance ? <p className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-700">{t('procurement.orders.readOnlyFinance')}</p> : null}
        {previewTotals?.isEstimated ? (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{t('procurement.orders.landedCostEstimatedWarning')}</p>
        ) : null}
        {cargoValidationError ? (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{cargoValidationError}</p>
        ) : null}

        {order ? <>
          {order.sentToSupplierAt ? (
            <ProcurementEditWindowPanel
              sentToSupplierAt={order.sentToSupplierAt}
              editableUntil={order.editableUntil}
              unlockedAt={order.unlockedAt}
              unlockExpiresAt={order.unlockExpiresAt}
              unlockReason={order.unlockReason}
              unlockedBy={order.unlockedBy}
              isEditable={order.isEditable}
              editWindowStatus={order.editWindowStatus}
              secondsRemaining={order.secondsRemaining}
              showUnlockForm={canUnlock}
              unlocking={unlocking}
              onUnlock={unlockOrder}
            />
          ) : null}

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-bold">{t('procurement.orders.generalInfo')}</h3>
            <div className="grid gap-4 md:grid-cols-4">
              <Info label={t('procurement.orders.supplier')} value={order.supplier?.name ?? ''} />
              <Info label={t('procurement.orders.factory')} value={order.factory?.name ?? '-'} />
              <Info label={t('procurement.orders.exchangeRate')} value={String(order.effectiveYuanRate ?? order.defaultYuanRate ?? '-')} />
              <Info label={t('procurement.orders.status')} value={order.status} />
            </div>
            {order.yuanRateLocked ? (
              <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{t('procurement.payments.rateLocked')}</p>
            ) : null}
          </section>

          {canSeePayments ? (
            <ProcurementSupplierPayments
              order={{
                ...order,
                totalYuan: Number(order.totalYuan),
                totalPaidYuan: Number(order.totalPaidYuan ?? 0),
                totalPaidKgs: Number(order.totalPaidKgs ?? 0),
                remainingYuan: Number(order.remainingYuan ?? order.totalYuan),
              }}
              user={user}
              onChanged={load}
            />
          ) : null}

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-bold">{t('procurement.orders.chinaDomestic')}</h3>
            <div className="grid gap-4 md:grid-cols-3">
              <TransportCompanySelect
                label={t('procurement.transportCompanies.select')}
                value={logisticsForm.chinaDomesticTransportCompanyId}
                companies={transportCompanies}
                onChange={(value) => setLogistics('chinaDomesticTransportCompanyId', value)}
                disabled={finalized || readOnlyFinance}
              />
              <EditableField label={t('procurement.orders.costInYuan')} value={logisticsForm.chinaDomesticTransportYuan} onChange={(v) => setLogistics('chinaDomesticTransportYuan', v)} type="number" disabled={finalized || readOnlyFinance} />
              <Info label={t('procurement.orders.costInKgs')} value={formatKgs(previewChinaDomesticTransportKgs)} />
              <Info label={t('procurement.orders.weightedAverageYuanRate')} value={String(effectiveYuanRate || '-')} />
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-bold">{t('procurement.orders.chinaExport')}</h3>
            <div className="grid gap-4 md:grid-cols-3">
              <TransportCompanySelect
                label={t('procurement.transportCompanies.select')}
                value={logisticsForm.chinaExportTransportCompanyId}
                companies={transportCompanies}
                onChange={(value) => setLogistics('chinaExportTransportCompanyId', value)}
                disabled={finalized || readOnlyFinance}
              />
              <EditableField label={t('procurement.orders.cargoTotalWeightKg')} value={logisticsForm.cargoTotalWeightKg} onChange={(v) => setLogistics('cargoTotalWeightKg', v)} type="number" disabled={finalized || readOnlyFinance} />
              <EditableField label={t('procurement.orders.cargoRateUsdPerKg')} value={logisticsForm.cargoRateUsdPerKg} onChange={(v) => setLogistics('cargoRateUsdPerKg', v)} type="number" disabled={finalized || readOnlyFinance} />
              <EditableField label={t('procurement.orders.usdExchangeRate')} value={logisticsForm.defaultUsdRate} onChange={(v) => setLogistics('defaultUsdRate', v)} type="number" disabled={finalized || readOnlyFinance} />
              <Info label={t('procurement.orders.totalCargoCostUsd')} value={`$${(previewTotals?.totalCargoCostUsd ?? 0).toFixed(2)}`} />
              <Info label={t('procurement.orders.totalCargoCostKgs')} value={formatKgs(previewTotals?.totalCargoCostKgs ?? 0)} />
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <EditableField label={t('procurement.orders.cargoCompany')} value={logisticsForm.cargoCompany} onChange={(v) => setLogistics('cargoCompany', v)} disabled={finalized || readOnlyFinance} />
              <EditableField label={t('procurement.orders.cargoReceiptNumber')} value={logisticsForm.cargoReceiptNumber} onChange={(v) => setLogistics('cargoReceiptNumber', v)} disabled={finalized || readOnlyFinance} />
              <EditableField label={t('procurement.orders.cargoReceiptDate')} value={logisticsForm.cargoReceiptDate} onChange={(v) => setLogistics('cargoReceiptDate', v)} type="date" disabled={finalized || readOnlyFinance} />
              <EditableField label={t('procurement.orders.cargoReceiptNote')} value={logisticsForm.cargoReceiptNote} onChange={(v) => setLogistics('cargoReceiptNote', v)} disabled={finalized || readOnlyFinance} />
            </div>
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between gap-4">
                <h4 className="font-semibold text-slate-900">{t('procurement.payments.cargoAttachments')}</h4>
                {canUploadCargo && !finalized ? (
                  <label className="cursor-pointer rounded-xl border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700">
                    {t('procurement.payments.attachCargoReceipt')}
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png,.webp"
                      onChange={(e) => void uploadCargoReceipt(e)}
                    />
                  </label>
                ) : null}
              </div>
              {order.cargoAttachments?.length ? (
                <ul className="space-y-2">
                  {order.cargoAttachments.map((attachment) => (
                    <li key={attachment.id}>
                      <a href={`${API_URL}${attachment.fileUrl}`} target="_blank" rel="noreferrer" className="text-sm font-semibold text-blue-700">
                        {attachment.fileName}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">{t('procurement.payments.noCargoAttachments')}</p>
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-bold">{t('procurement.orders.svhToHqTransport')}</h3>
              {order.svhToHqTransport ? (
                <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${svhStatusBadgeClass(svhForm.status)}`}>
                  {t(`procurement.svhTransport.status.${svhForm.status}`)}
                </span>
              ) : null}
            </div>
            {!canEditSvh ? (
              <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{t('procurement.svhTransport.notEligible')}</p>
            ) : null}
            <div className="grid gap-4 md:grid-cols-3">
              <TransportCompanySelect
                label={t('procurement.transportCompanies.select')}
                value={svhForm.transportCompanyId}
                companies={transportCompanies}
                onChange={(value) => setSvhField('transportCompanyId', value)}
                disabled={finalized || readOnlyFinance || !canEditSvh || !canManageSvh}
              />
              <EditableField
                label={t('procurement.svhTransport.costKgs')}
                value={svhForm.transportCostKgs}
                onChange={(v) => setSvhField('transportCostKgs', v)}
                type="number"
                disabled={finalized || readOnlyFinance || !canEditSvh || !canManageSvh}
              />
              <EditableField label={t('procurement.svhTransport.vehicleNumber')} value={svhForm.vehicleNumber} onChange={(v) => setSvhField('vehicleNumber', v)} disabled={finalized || readOnlyFinance || !canEditSvh || !canManageSvh} />
              <EditableField label={t('procurement.svhTransport.driverName')} value={svhForm.driverName} onChange={(v) => setSvhField('driverName', v)} disabled={finalized || readOnlyFinance || !canEditSvh || !canManageSvh} />
              <EditableField label={t('procurement.svhTransport.driverPhone')} value={svhForm.driverPhone} onChange={(v) => setSvhField('driverPhone', v)} disabled={finalized || readOnlyFinance || !canEditSvh || !canManageSvh} />
              <EditableField label={t('procurement.svhTransport.dispatchDate')} value={svhForm.dispatchDate} onChange={(v) => setSvhField('dispatchDate', v)} type="date" disabled={finalized || readOnlyFinance || !canEditSvh || !canManageSvh} />
              <EditableField label={t('procurement.svhTransport.arrivalDate')} value={svhForm.arrivalDate} onChange={(v) => setSvhField('arrivalDate', v)} type="date" disabled={finalized || readOnlyFinance || !canEditSvh || (!canManageSvh && !canConfirmSvh)} />
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">{t('procurement.svhTransport.statusLabel')}</span>
                <select
                  value={svhForm.status}
                  onChange={(e) => setSvhField('status', e.target.value as SvhToHqTransport['status'])}
                  disabled={finalized || readOnlyFinance || !canEditSvh || (!canManageSvh && !canConfirmSvh)}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                >
                  {svhStatusOptions.map((status) => (
                    <option key={status} value={status}>{t(`procurement.svhTransport.status.${status}`)}</option>
                  ))}
                </select>
              </label>
              <EditableField label={t('procurement.svhTransport.notes')} value={svhForm.notes} onChange={(v) => setSvhField('notes', v)} disabled={finalized || readOnlyFinance || !canEditSvh || !canManageSvh} />
            </div>
            {canSaveSvh && canEditSvh && !finalized && !readOnlyFinance ? (
              <button type="button" disabled={savingSvh} onClick={() => void saveSvhTransport()} className="mt-4 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:bg-blue-300">
                {savingSvh ? t('common.loading') : order.svhToHqTransport ? t('procurement.svhTransport.save') : t('procurement.svhTransport.create')}
              </button>
            ) : null}
            {!svhTransportCompleted && canReceive && readyForHqReceiving && !finalized ? (
              <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{t('procurement.svhTransport.receiveBlocked')}</p>
            ) : null}
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-bold">{t('procurement.orders.transportCosts')}</h3>
            <div className="grid gap-4 md:grid-cols-3">
              <EditableField label={t('procurement.orders.customs')} value={logisticsForm.customsCostKgs} onChange={(v) => setLogistics('customsCostKgs', v)} type="number" disabled={finalized || readOnlyFinance} />
              <EditableField label={t('procurement.orders.insurance')} value={logisticsForm.insuranceCostKgs} onChange={(v) => setLogistics('insuranceCostKgs', v)} type="number" disabled={finalized || readOnlyFinance} />
              <EditableField label={t('procurement.orders.bankFees')} value={logisticsForm.bankFeeCostKgs} onChange={(v) => setLogistics('bankFeeCostKgs', v)} type="number" disabled={finalized || readOnlyFinance} />
              <EditableField label={t('procurement.orders.otherExpenses')} value={logisticsForm.otherExpenseKgs} onChange={(v) => setLogistics('otherExpenseKgs', v)} type="number" disabled={finalized || readOnlyFinance} />
            </div>
            {canEditOrder && !finalized && !readOnlyFinance ? (
              <button type="button" disabled={savingLogistics || !!cargoValidationError} onClick={() => void saveLogistics()} className="mt-4 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:bg-blue-300">
                {savingLogistics ? t('common.loading') : t('procurement.orders.saveLogistics')}
              </button>
            ) : null}
          </section>

          <section className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
            <Info label={t('procurement.orders.totalNetWeightKg')} value={`${(previewTotals?.totalNetWeightKg ?? 0).toFixed(3)} kg`} />
            <Info label={t('procurement.orders.totalPackagingWeightKg')} value={`${(previewTotals?.totalPackagingWeightKg ?? 0).toFixed(3)} kg`} />
            <Info label={t('procurement.orders.shipmentWeight')} value={`${(previewTotals?.totalShipmentWeightKg ?? 0).toFixed(3)} kg`} />
            <Info label={t('procurement.orders.totalCargoCostKgs')} value={formatKgs(previewTotals?.totalCargoCostKgs ?? 0)} />
            <Info label={t('procurement.orders.estimatedLandedCost')} value={formatKgs(previewTotals?.totalCostKgs ?? order.totalCostKgs)} />
          </section>

          {canEditOrder && !finalized ? (
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap gap-2">
                {statusActions.map(([path, label]) => <button key={path} onClick={() => void action(path)} type="button" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold">{t(label)}</button>)}
              </div>
            </section>
          ) : null}

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm overflow-x-auto">
            <h3 className="mb-4 text-lg font-bold">{t('procurement.orders.productsTable')}</h3>
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">{t('procurement.orders.product')}</th>
                  <th className="px-4 py-3">{t('procurement.orders.quantity')}</th>
                  <th className="px-4 py-3">{t('procurement.orders.netWeightKg')}</th>
                  <th className="px-4 py-3">{t('procurement.orders.totalNetWeightKg')}</th>
                  <th className="px-4 py-3">{t('procurement.orders.purchasePriceYuan')}</th>
                  <th className="px-4 py-3">{t('procurement.orders.totalYuan')}</th>
                  <th className="px-4 py-3">{t('procurement.orders.receivedQty')}</th>
                  <th className="px-4 py-3">{t('inventory.finalCostKgs')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(previewTotals?.items ?? []).map((item, index) => {
                  const row = (order.items ?? []).filter((entry) => entry.status !== 'CANCELLED')[index];
                  if (!row) return null;
                  return (
                    <tr key={row.id}>
                      <td className="px-4 py-3">{row.sku}</td>
                      <td className="px-4 py-3">{row.productName}</td>
                      <td className="px-4 py-3">{row.quantity}</td>
                      <td className="px-4 py-3">{item.netWeightKg.toFixed(3)}</td>
                      <td className="px-4 py-3">{item.lineNetWeightKg.toFixed(3)}</td>
                      <td className="px-4 py-3">¥{Number(row.purchasePriceYuan).toFixed(2)}</td>
                      <td className="px-4 py-3">¥{item.totalYuan.toFixed(2)}</td>
                      <td className="px-4 py-3">{row.receivedQuantity ?? '-'}</td>
                      <td className="px-4 py-3 font-semibold">{formatKgs(item.finalCostKgs)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          {canReceive && readyForHqReceiving && !finalized ? (
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-4 text-lg font-bold">{t('procurement.orders.receivingSummary')}</h3>
              <div className="mb-4">
                <label className="block text-sm font-semibold text-slate-700">{t('procurement.orders.warehouse')}</label>
                <select value={logisticsForm.hqWarehouseId} onChange={(e) => setLogistics('hqWarehouseId', e.target.value)} className="mt-2 rounded-xl border border-slate-300 px-3 py-2">
                  {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div className="space-y-3">
                {order.items?.map((item) => {
                  const received = Number(receiveQty[item.id] ?? item.quantity);
                  const hasDifference = received !== item.quantity;
                  return (
                    <label key={item.id} className="block rounded-2xl bg-slate-50 p-4">
                      <div className="flex flex-wrap items-center gap-4">
                        <span className="min-w-48 font-semibold">{item.sku} · {item.productName}</span>
                        <span className="text-sm text-slate-500">{t('procurement.orders.expected')}: {item.quantity}</span>
                        <input type="number" min={0} value={receiveQty[item.id] ?? String(item.quantity)} onChange={(e) => setReceiveQty((current) => ({ ...current, [item.id]: e.target.value }))} className="rounded-xl border border-slate-300 px-3 py-2" />
                        {hasDifference ? (
                          <select value={receiveReason[item.id] ?? 'OTHER'} onChange={(e) => setReceiveReason((current) => ({ ...current, [item.id]: e.target.value }))} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
                            {SHORTAGE_REASONS.map((reason) => <option key={reason} value={reason}>{t(`procurement.orders.shortageReason.${reason}`)}</option>)}
                          </select>
                        ) : null}
                      </div>
                    </label>
                  );
                })}
              </div>
              <button type="button" disabled={!!cargoValidationError || !svhTransportCompleted} onClick={() => void receiveGoods()} className="mt-4 rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white disabled:bg-emerald-300">{t('procurement.orders.receiveToHq')}</button>
              {!svhTransportCompleted ? (
                <p className="mt-3 text-sm text-amber-700">{t('procurement.svhTransport.receiveBlocked')}</p>
              ) : null}
            </section>
          ) : null}

          {order.differenceReports && order.differenceReports.length > 0 ? (
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm overflow-x-auto">
              <h3 className="mb-4 text-lg font-bold">{t('procurement.orders.shortageReport')}</h3>
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">#</th><th className="px-4 py-3">SKU</th><th className="px-4 py-3">{t('procurement.orders.expected')}</th><th className="px-4 py-3">{t('procurement.orders.receivedQty')}</th><th className="px-4 py-3">{t('procurement.orders.difference')}</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{order.differenceReports.map((report) => <tr key={report.id}><td className="px-4 py-3">{report.reportNumber}</td><td className="px-4 py-3">{report.sku}</td><td className="px-4 py-3">{report.expectedQuantity}</td><td className="px-4 py-3">{report.receivedQuantity}</td><td className="px-4 py-3">{report.differenceQuantity} ({report.type})</td></tr>)}</tbody>
              </table>
            </section>
          ) : null}

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-bold">{t('procurement.orders.auditHistory')}</h3>
            <div className="space-y-3">
              {auditLogs.length ? auditLogs.map((log) => (
                <div key={log.id} className="rounded-2xl bg-slate-50 p-4 text-sm">
                  <p className="font-semibold">{t(`procurement.audit.${log.action}`)}</p>
                  <p className="text-slate-500">{log.user?.fullName ?? '-'} · {new Date(log.timestamp).toLocaleString()}</p>
                </div>
              )) : <p className="text-sm text-slate-500">{t('procurement.orders.noAudit')}</p>}
            </div>
          </section>
        </> : null}
      </section>
    </ProtectedShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase text-slate-400">{label}</p><p className="font-bold text-slate-950">{value}</p></div>;
}

function TransportCompanySelect({
  label,
  value,
  companies,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  companies: Array<{ id: string; name: string; companyCode: string }>;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 disabled:bg-slate-100">
        <option value="">-</option>
        {companies.map((company) => (
          <option key={company.id} value={company.id}>{company.name} ({company.companyCode})</option>
        ))}
      </select>
    </label>
  );
}

function EditableField({ label, value, onChange, type = 'text', disabled }: { label: string; value: string; onChange: (value: string) => void; type?: string; disabled?: boolean }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input type={type} step={type === 'number' ? '0.001' : undefined} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 disabled:bg-slate-100" />
    </label>
  );
}

function formatOrderDate(value: string) {
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatKgs(value: number | string | null | undefined) {
  return `${Number(value ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} сом`;
}

function svhStatusBadgeClass(status: SvhToHqTransport['status']) {
  switch (status) {
    case 'WAITING':
      return 'bg-slate-200 text-slate-700';
    case 'IN_PROGRESS':
      return 'bg-blue-100 text-blue-800';
    case 'COMPLETED':
      return 'bg-emerald-100 text-emerald-800';
    case 'CANCELLED':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-slate-200 text-slate-700';
  }
}
