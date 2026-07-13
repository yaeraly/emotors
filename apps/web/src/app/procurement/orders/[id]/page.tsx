'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { DomesticTransportSection, type DomesticTransportForm } from '@/components/DomesticTransportSection';
import { ProcurementEditWindowPanel } from '@/components/ProcurementEditWindowPanel';
import { LockedFieldHint } from '@/components/LockedFieldHint';
import { ProcurementStatusButtons } from '@/components/ProcurementStatusButtons';
import { ProcurementSupplierPayments } from '@/components/ProcurementSupplierPayments';
import { sumConfirmedSupplierPaymentsKgs } from '@/lib/supplier-payment-utils';
import { apiFetch, API_URL, getToken } from '@/lib/api';
import { canEditChinaDomesticTransport } from '@/lib/china-domestic-transport-lock';
import { buildHqReceivingValidationResult, CARGO_RECEIPT_ATTACHMENT_REQUIRED_MESSAGE } from '@/lib/hq-receiving-validation';
import { calculateLandedCosts, extractCargoConfig } from '@/lib/landed-cost';
import { resolveChinaDomesticTransportKgs, effectiveLocalTransportKgs, storedLocalTransportKgsFromOrder } from '@/lib/transport-logistics';
import {
  canCreateProcurementOrder,
  canCreateSupplierPayment,
  canEditProcurementOrderItemsInWindow,
  canManageSvhToHqTransport,
  canReceiveProcurementToHq,
  canUnlockProcurementOrder,
  canViewSupplierPayments,
  hasFullAccess,
  hasRole,
  isSupplyChainManagerUser,
} from '@/lib/rbac';
import type { User, Warehouse } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';
import { translateStatus } from '@/lib/translate-status';

type ProcurementOrderItem = {
  id: string;
  productId: string;
  product?: { id: string; purchasePriceYuan?: number | string | null };
  sku: string;
  productName: string;
  status?: string;
  quantity: number;
  receivedQuantity?: number | null;
  purchasePriceYuan: string | number;
  yuanRate: string | number;
  weightKg: string | number;
  unitWeightKg?: string | number | null;
  weightStatus?: 'NOT_SET' | 'PRELIMINARY' | 'CONFIRMED';
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
  dispatchDate?: string | null;
  arrivalDate?: string | null;
  receiptNumber?: string | null;
  receiptDate?: string | null;
  receiptAmountKgs?: number;
  status: 'WAITING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  notes?: string | null;
  transportCompany?: TransportCompany | null;
};

type DomesticTransportAttachment = {
  id: string;
  documentType?: string | null;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  uploadedAt?: string;
  uploadedBy?: { fullName?: string } | null;
  receiptNumber?: string | null;
  receiptAmountKgs?: number | null;
  isCurrent?: boolean;
  replacedAt?: string | null;
  replacedBy?: { fullName?: string } | null;
};

type ProcurementOrder = {
  id: string;
  orderNumber: string;
  createdAt?: string;
  status: string;
  totalYuan: string | number;
  totalCostKgs: string | number;
  landedCostStatus?: 'PENDING_WEIGHT' | 'READY_TO_CALCULATE' | 'CALCULATED' | 'FINALIZED';
  landedCostCalculationVersion?: number;
  landedCostCalculatedAt?: string | null;
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
  createdBy?: { fullName?: string } | null;
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
  svhToHqReceipt?: DomesticTransportAttachment | null;
  domesticTransportAttachments?: DomesticTransportAttachment[];
  domesticTransportReceiptHistory?: DomesticTransportAttachment[];
  domesticTransportTimeline?: Array<{
    key: string;
    status: 'pending' | 'active' | 'completed';
    date: string | null;
    responsibleName: string | null;
    labelKey: string;
  }>;
  sentToSupplierAt?: string | null;
  editableUntil?: string | null;
  unlockedAt?: string | null;
  unlockExpiresAt?: string | null;
  unlockReason?: string | null;
  isEditable?: boolean;
  editWindowStatus?: 'DRAFT_EDITABLE' | 'EDITABLE' | 'LOCKED' | 'CEO_UNLOCKED';
  secondsRemaining?: number | null;
  unlockedBy?: { fullName?: string } | null;
  note?: string | null;
  items?: ProcurementOrderItem[];
  differenceReports?: Array<{ id: string; reportNumber: string; type: string; sku: string; expectedQuantity: number; receivedQuantity: number; differenceQuantity: number; status: string; shortageReason?: string }>;
  receivings?: Array<{ id: string; receivingNumber: string; receivedAt: string }>;
  svhToHqTransport?: SvhToHqTransport | null;
  canReceiveToHq?: boolean;
  cargoReceiptCompleted?: boolean;
  svhToHqTransportCompleted?: boolean;
  chinaDomesticTransportLocked?: boolean;
  chinaDomesticTransportEditable?: boolean;
  chinaDomesticTransportUnlockExpiresAt?: string | null;
  chinaDomesticTransportUnlockReason?: string | null;
  chinaDomesticTransportUnlockedBy?: { fullName?: string } | null;
};

type AuditLog = { id: string; action: string; timestamp: string; user?: { fullName: string } };

const SHORTAGE_REASONS = ['FACTORY_SHORTAGE', 'SUPPLIER_SHORTAGE', 'DAMAGED_GOODS', 'LOST_IN_TRANSPORT', 'CUSTOMS_ISSUE', 'OTHER'] as const;

const SVH_STATUSES = ['ARRIVED_IN_KYRGYZSTAN', 'ARRIVED', 'CUSTOMS_CLEARANCE', 'IN_TRANSIT'];

type OrderDetailTab = 'general' | 'payments' | 'transport' | 'landedCost' | 'history';

const ORDER_DETAIL_TABS: Array<{ id: OrderDetailTab; labelKey: string }> = [
  { id: 'general', labelKey: 'procurement.orders.tabs.general' },
  { id: 'payments', labelKey: 'procurement.orders.tabs.payments' },
  { id: 'transport', labelKey: 'procurement.orders.tabs.transport' },
  { id: 'landedCost', labelKey: 'procurement.orders.tabs.landedCost' },
  { id: 'history', labelKey: 'procurement.orders.tabs.history' },
];

const emptySvhForm = (): DomesticTransportForm => ({
  transportCompanyId: '',
  transportCostKgs: '0',
  dispatchDate: '',
  notes: '',
  status: 'WAITING',
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
  const [savingChinaDomestic, setSavingChinaDomestic] = useState(false);
  const [savingCargoReceipt, setSavingCargoReceipt] = useState(false);
  const [uploadingCargoReceipt, setUploadingCargoReceipt] = useState(false);
  const [savingImportCosts, setSavingImportCosts] = useState(false);
  const cargoSaveRequestIdRef = useRef(0);
  const [savingSvh, setSavingSvh] = useState(false);
  const [svhForm, setSvhForm] = useState(emptySvhForm());
  const [chinaDomesticChangeReason, setChinaDomesticChangeReason] = useState('');
  const [svhChangeReason, setSvhChangeReason] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [unlockingChinaDomestic, setUnlockingChinaDomestic] = useState(false);
  const [chinaDomesticUnlockReason, setChinaDomesticUnlockReason] = useState('');
  const [activeTab, setActiveTab] = useState<OrderDetailTab>('general');

  const canEditOrder = canCreateProcurementOrder(user);
  const canEditItems = canEditProcurementOrderItemsInWindow(user, {
    isEditable: order?.isEditable,
    editWindowStatus: order?.editWindowStatus,
    sentToSupplierAt: order?.sentToSupplierAt,
  });
  const canUnlock = canUnlockProcurementOrder(user) && order?.editWindowStatus === 'LOCKED';
  const canSeePayments = canViewSupplierPayments(user);
  const canUploadCargo = canCreateSupplierPayment(user) || canReceiveProcurementToHq(user);
  const readOnlyFinance = hasRole(user, 'FINANCE_MANAGER') || hasRole(user, 'HQ_ACCOUNTANT') || hasRole(user, 'ACCOUNTANT');
  const canReceive = canReceiveProcurementToHq(user);
  const readyForHqReceiving = order?.status === 'ARRIVED' || order?.status === 'ARRIVED_IN_KYRGYZSTAN' || order?.status === 'IN_TRANSIT';
  const canEditSvh = order ? SVH_STATUSES.includes(order.status) : false;
  const canManageSvh = canManageSvhToHqTransport(user);
  const isCeoUser = canUnlockProcurementOrder(user);
  const hqReceivingReadiness = useMemo(() => {
    if (!order) return null;
    return buildHqReceivingValidationResult({
      cargo: {
        cargoTotalWeightKg: logisticsForm.cargoTotalWeightKg,
        cargoRateUsdPerKg: logisticsForm.cargoRateUsdPerKg,
        defaultUsdRate: logisticsForm.defaultUsdRate,
        cargoReceiptNumber: logisticsForm.cargoReceiptNumber,
        cargoReceiptDate: logisticsForm.cargoReceiptDate,
        cargoAttachmentCount: order.cargoAttachments?.length ?? 0,
      },
      svh: order.svhToHqTransport
        ? {
            transportCompanyId: order.svhToHqTransport.transportCompanyId,
            transportCostKgs: order.svhToHqTransport.transportCostKgs,
            dispatchDate: order.svhToHqTransport.dispatchDate,
            arrivalDate: order.svhToHqTransport.arrivalDate,
            status: order.svhToHqTransport.status,
            transportCompanyStatus: order.svhToHqTransport.transportCompany?.status,
          }
        : null,
    });
  }, [order, logisticsForm]);
  const cargoReceiptCompleted = hqReceivingReadiness?.cargoReceiptCompleted ?? false;
  const svhTransportCompleted = hqReceivingReadiness?.svhToHqTransportCompleted ?? false;
  const canReceiveToHq = hqReceivingReadiness?.canReceiveToHq ?? false;
  const missingCargoAttachment = (hqReceivingReadiness?.cargoReceipt.errors ?? []).includes('cargoAttachment');
  const canSaveSvh = canManageSvh || isCeoUser;
  const finalized = !!order?.hqStockMovementCreatedAt;
  const chinaDomesticEditable = order
    ? (order.chinaDomesticTransportEditable ?? canEditChinaDomesticTransport(order))
    : true;
  const chinaDomesticLockedByStatus = order?.chinaDomesticTransportLocked ?? false;
  const chinaDomesticLocked = chinaDomesticLockedByStatus && !chinaDomesticEditable;
  const chinaDomesticFieldsEditable = chinaDomesticEditable || isCeoUser;
  const canUnlockChinaDomestic = isCeoUser && chinaDomesticLocked && !chinaDomesticEditable;

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

  const previewSvhTransportKgs = useMemo(
    () => effectiveLocalTransportKgs(
      storedLocalTransportKgsFromOrder(order?.localTransportKgs, order?.svhToHqTransport?.transportCostKgs),
      Number(svhForm.transportCostKgs || order?.svhToHqTransport?.transportCostKgs || 0),
    ),
    [order?.localTransportKgs, order?.svhToHqTransport?.transportCostKgs, svhForm.transportCostKgs],
  );

  const chinaDomesticDirty = useMemo(() => {
    if (!order) return false;
    return logisticsForm.chinaDomesticTransportYuan !== String(order.chinaDomesticTransportYuan ?? 0)
      || logisticsForm.chinaDomesticTransportCompanyId !== (order.chinaDomesticTransportCompanyId ?? '');
  }, [order, logisticsForm.chinaDomesticTransportYuan, logisticsForm.chinaDomesticTransportCompanyId]);

  const cargoReceiptDirty = useMemo(() => {
    if (!order) return false;
    return logisticsForm.chinaExportTransportCompanyId !== (order.chinaExportTransportCompanyId ?? '')
      || logisticsForm.cargoTotalWeightKg !== String(order.cargoTotalWeightKg ?? 0)
      || logisticsForm.cargoRateUsdPerKg !== String(order.cargoRateUsdPerKg ?? 0)
      || logisticsForm.defaultUsdRate !== String(order.defaultUsdRate ?? 0)
      || logisticsForm.cargoReceiptNumber !== (order.cargoReceiptNumber ?? '')
      || logisticsForm.cargoReceiptDate !== (order.cargoReceiptDate ? order.cargoReceiptDate.slice(0, 10) : '')
      || logisticsForm.cargoReceiptNote !== (order.cargoReceiptNote ?? '');
  }, [order, logisticsForm]);

  const importCostsDirty = useMemo(() => {
    if (!order) return false;
    return logisticsForm.customsCostKgs !== String(order.customsCostKgs ?? 0)
      || logisticsForm.insuranceCostKgs !== String(order.insuranceCostKgs ?? 0)
      || logisticsForm.otherExpenseKgs !== String(order.otherExpenseKgs ?? 0);
  }, [order, logisticsForm]);

  const svhDirty = useMemo(() => {
    const svh = order?.svhToHqTransport;
    if (!svh) {
      return formHasDomesticData(svhForm);
    }
    return svhForm.transportCompanyId !== (svh.transportCompanyId ?? '')
      || svhForm.transportCostKgs !== String(svh.transportCostKgs ?? 0)
      || svhForm.dispatchDate !== (svh.dispatchDate ? svh.dispatchDate.slice(0, 10) : '')
      || svhForm.status !== svh.status
      || svhForm.notes !== (svh.notes ?? '');
  }, [order?.svhToHqTransport, svhForm]);

  const previewTotals = useMemo(() => {
    try {
      return calculateLandedCosts(
        previewItems,
        {
          chinaDomesticTransportKgs: previewChinaDomesticTransportKgs,
          chinaExportTransportKgs: 0,
          localTransportKgs: previewSvhTransportKgs,
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
  }, [previewItems, logisticsForm, previewChinaDomesticTransportKgs, previewSvhTransportKgs]);

  const confirmedSupplierPaidKgs = useMemo(() => {
    return sumConfirmedSupplierPaymentsKgs(order?.supplierPayments ?? []);
  }, [order?.supplierPayments]);

  const confirmedCargoPaymentKgs = useMemo(() => {
    if (!cargoReceiptCompleted) return 0;
    return Number(previewTotals?.totalCargoCostKgs ?? order?.totalCargoCostKgs ?? 0);
  }, [cargoReceiptCompleted, previewTotals?.totalCargoCostKgs, order?.totalCargoCostKgs]);

  const importCostBreakdown = useMemo(() => {
    if (!previewTotals) return null;
    return {
      chinaDomestic: previewChinaDomesticTransportKgs,
      cargoReceipt: previewTotals.totalCargoCostKgs,
      svhTransport: previewSvhTransportKgs,
      insurance: Number(logisticsForm.insuranceCostKgs || 0),
      customs: Number(logisticsForm.customsCostKgs || 0),
      bankFees: Number(logisticsForm.bankFeeCostKgs || 0),
      otherExpenses: Number(logisticsForm.otherExpenseKgs || 0),
      totalImportLogistics: previewTotals.totalTransportCostKgs,
      totalLandedCost: previewTotals.totalCostKgs,
    };
  }, [previewTotals, previewChinaDomesticTransportKgs, previewSvhTransportKgs, logisticsForm]);

  const totalPurchaseCostKgs = useMemo(() => {
    if (!previewTotals) return 0;
    return previewTotals.items.reduce((sum, item) => sum + item.costKgs * item.effectiveQuantity, 0);
  }, [previewTotals]);

  const landedCostCalculated = useMemo(() => {
    if (order?.landedCostStatus === 'CALCULATED' || order?.landedCostStatus === 'FINALIZED') return true;
    if (order?.landedCostStatus === 'PENDING_WEIGHT') return false;
    return (previewTotals?.totalCostKgs ?? Number(order?.totalCostKgs ?? 0)) > 0;
  }, [previewTotals, order?.landedCostStatus, order?.totalCostKgs]);

  const isScmOnlyProcurementView = useMemo(
    () => isSupplyChainManagerUser(user) && !hasFullAccess(user),
    [user],
  );

  const activeOrderItems = useMemo(
    () => (order?.items ?? []).filter((item) => item.status !== 'CANCELLED'),
    [order?.items],
  );

  const scmProductTableTotals = useMemo(() => {
    let totalQuantity = 0;
    let totalYuan = 0;

    for (const item of activeOrderItems) {
      totalQuantity += item.quantity;
      const purchasePriceYuan = Number(item.purchasePriceYuan ?? 0);
      totalYuan += item.quantity * purchasePriceYuan;
    }

    return {
      totalQuantity,
      totalYuan,
    };
  }, [activeOrderItems]);

  const landedCostPendingWeight = order?.landedCostStatus === 'PENDING_WEIGHT';

  const cargoValidationError = useMemo(() => {
    if (!previewTotals) return t('procurement.orders.cargoWeightLessThanNet');
    return null;
  }, [previewTotals, t]);

  async function recalculateLandedCost() {
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/procurement/orders/${id}/recalculate`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Manual recalculation from landed cost tab' }),
      });
      setSuccess(t('common.success'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

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
        dispatchDate: svh.dispatchDate ? svh.dispatchDate.slice(0, 10) : '',
        status: svh.status,
        notes: svh.notes ?? '',
      } : emptySvhForm());
      setChinaDomesticChangeReason('');
      setSvhChangeReason('');
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

  async function unlockChinaDomesticTransport() {
    const reason = chinaDomesticUnlockReason.trim();
    if (!reason) {
      setError(t('procurement.chinaDomestic.unlockReasonRequired'));
      return;
    }
    setUnlockingChinaDomestic(true);
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/procurement/orders/${id}/unlock-china-domestic-transport`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      setSuccess(t('procurement.chinaDomestic.unlockSuccess'));
      setChinaDomesticUnlockReason('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setUnlockingChinaDomestic(false);
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

  async function saveChinaDomesticTransport() {
    if (!order || finalized || readOnlyFinance || !chinaDomesticFieldsEditable) return;
    if (chinaDomesticLocked && isCeoUser && !chinaDomesticChangeReason.trim()) {
      setError(t('procurement.transport.changeReasonRequired'));
      return;
    }
    setSavingChinaDomestic(true);
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/procurement/orders/${id}/china-domestic-transport`, {
        method: 'PUT',
        body: JSON.stringify({
          chinaDomesticTransportYuan: Number(logisticsForm.chinaDomesticTransportYuan || 0),
          chinaDomesticTransportCompanyId: logisticsForm.chinaDomesticTransportCompanyId || null,
          changeReason: chinaDomesticChangeReason.trim() || undefined,
        }),
      });
      setSuccess(t('procurement.transport.saved'));
      setChinaDomesticChangeReason('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSavingChinaDomestic(false);
    }
  }

  async function saveCargoReceipt() {
    if (!order || finalized || readOnlyFinance || uploadingCargoReceipt) return;
    const requestId = ++cargoSaveRequestIdRef.current;
    setSavingCargoReceipt(true);
    setError('');
    setSuccess('');
    try {
      const updated = await apiFetch<ProcurementOrder>(`/procurement/orders/${id}/cargo-receipt`, {
        method: 'PUT',
        body: JSON.stringify({
          chinaExportTransportCompanyId: logisticsForm.chinaExportTransportCompanyId || null,
          cargoTotalWeightKg: Number(logisticsForm.cargoTotalWeightKg || 0),
          cargoRateUsdPerKg: Number(logisticsForm.cargoRateUsdPerKg || 0),
          defaultUsdRate: Number(logisticsForm.defaultUsdRate || 0),
          cargoReceiptNumber: logisticsForm.cargoReceiptNumber || undefined,
          cargoReceiptDate: logisticsForm.cargoReceiptDate || undefined,
          cargoReceiptNote: logisticsForm.cargoReceiptNote || undefined,
        }),
      });
      if (requestId !== cargoSaveRequestIdRef.current) return;
      applyCargoPaymentSaveResult(updated);
      setSuccess(t('procurement.orders.cargoPaymentSaved'));
    } catch (err) {
      if (requestId !== cargoSaveRequestIdRef.current) return;
      setError(err instanceof Error ? err.message : t('procurement.orders.cargoPaymentSaveFailed'));
    } finally {
      if (requestId === cargoSaveRequestIdRef.current) {
        setSavingCargoReceipt(false);
      }
    }
  }

  function applyCargoPaymentSaveResult(updated: ProcurementOrder) {
    setOrder((current) => {
      if (!current) return updated;
      return {
        ...current,
        ...updated,
        cargoAttachments: updated.cargoAttachments ?? current.cargoAttachments,
        items: updated.items ?? current.items,
      };
    });
    // Sync only cargo-payment fields so unrelated dirty sections stay intact.
    setLogisticsForm((current) => ({
      ...current,
      chinaExportTransportCompanyId: updated.chinaExportTransportCompanyId ?? '',
      cargoTotalWeightKg: String(updated.cargoTotalWeightKg ?? 0),
      cargoRateUsdPerKg: String(updated.cargoRateUsdPerKg ?? 0),
      defaultUsdRate: String(updated.defaultUsdRate ?? 0),
      cargoCompany: updated.cargoCompany ?? '',
      cargoReceiptNumber: updated.cargoReceiptNumber ?? '',
      cargoReceiptDate: updated.cargoReceiptDate ? updated.cargoReceiptDate.slice(0, 10) : '',
      cargoReceiptNote: updated.cargoReceiptNote ?? '',
    }));
  }

  async function saveImportCosts() {
    if (!order || finalized || readOnlyFinance) return;
    setSavingImportCosts(true);
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/procurement/orders/${id}/import-costs`, {
        method: 'PUT',
        body: JSON.stringify({
          customsCostKgs: Number(logisticsForm.customsCostKgs || 0),
          insuranceCostKgs: Number(logisticsForm.insuranceCostKgs || 0),
          bankFeeCostKgs: Number(logisticsForm.bankFeeCostKgs || 0),
          otherExpenseKgs: Number(logisticsForm.otherExpenseKgs || 0),
        }),
      });
      setSuccess(t('procurement.transport.saved'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSavingImportCosts(false);
    }
  }

  async function saveSvhTransport() {
    if (!order || finalized || !canEditSvh || !canSaveSvh) return;
    const costChangedAfterHq = !!order.hqStockMovementCreatedAt
      && order.svhToHqTransport
      && Number(svhForm.transportCostKgs || 0) !== Number(order.svhToHqTransport.transportCostKgs || 0);
    if (costChangedAfterHq && isCeoUser && !svhChangeReason.trim()) {
      setError(t('procurement.transport.changeReasonRequired'));
      return;
    }
    setSavingSvh(true);
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/procurement/orders/${id}/svh-to-hq-transport`, {
        method: 'PUT',
        body: JSON.stringify({
          transportCompanyId: svhForm.transportCompanyId || null,
          transportCostKgs: Number(svhForm.transportCostKgs || 0),
          dispatchDate: svhForm.dispatchDate || undefined,
          arrivalDate: svhForm.status === 'COMPLETED' ? (svhForm.dispatchDate || undefined) : undefined,
          status: svhForm.status,
          notes: svhForm.notes || undefined,
          changeReason: svhChangeReason.trim() || undefined,
        }),
      });
      setSuccess(t('procurement.domesticTransport.saved'));
      setSvhChangeReason('');
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
    setUploadingCargoReceipt(true);
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
        throw new Error(payload.message || t('procurement.orders.cargoPaymentSaveFailed'));
      }
      const attachment = await response.json() as {
        id: string;
        fileName: string;
        fileUrl: string;
        mimeType: string;
      };
      // Preserve unsaved cargo payment form values — only refresh attachment list.
      setOrder((current) => {
        if (!current) return current;
        const existing = current.cargoAttachments ?? [];
        const nextAttachments = existing.some((item) => item.id === attachment.id)
          ? existing.map((item) => (item.id === attachment.id ? attachment : item))
          : [...existing, attachment];
        return {
          ...current,
          cargoAttachments: nextAttachments,
        };
      });
      setSuccess(t('procurement.payments.cargoReceiptAttached'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('procurement.orders.cargoPaymentSaveFailed'));
    } finally {
      setUploadingCargoReceipt(false);
    }
  }

  async function receiveGoods() {
    if (!order || cargoValidationError) return;
    if (missingCargoAttachment) {
      setError(t('chinaReceiving.cargoReceiptRequired'));
      return;
    }
    if (!canReceiveToHq) return;
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
      const message = err instanceof Error ? err.message : t('common.error');
      setError(
        message === CARGO_RECEIPT_ATTACHMENT_REQUIRED_MESSAGE
          ? t('chinaReceiving.cargoReceiptRequired')
          : message,
      );
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

        {order ? (
          <nav className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
            {ORDER_DETAIL_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  activeTab === tab.id ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {t(tab.labelKey)}
              </button>
            ))}
          </nav>
        ) : null}

        {order ? <>
          {activeTab === 'general' && order.sentToSupplierAt ? (
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

          {activeTab === 'general' ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-bold">{t('procurement.orders.generalInfo')}</h3>
            <div className="grid gap-4 md:grid-cols-4">
              <Info label={t('procurement.orders.orderNumber')} value={order.orderNumber} />
              <Info label={t('procurement.orders.orderDate')} value={order.createdAt ? formatOrderDate(order.createdAt) : '-'} />
              <Info label={t('procurement.orders.status')} value={translateStatus(t, order.status, 'procurement')} />
              <Info
                label={t('procurement.orders.warehouse')}
                value={order.hqWarehouse?.name ?? t('procurement.orders.hqWarehouseNotAssigned')}
              />
              <Info
                label={t('chinaReceiving.supplyManager')}
                value={order.createdBy?.fullName ?? t('chinaReceiving.supplyManagerNotAssigned')}
              />
              <Info label={t('procurement.orders.supplier')} value={order.supplier?.name ?? ''} />
              <Info label={t('procurement.orders.factory')} value={order.factory?.name ?? '-'} />
              <Info label={t('procurement.orders.exchangeRate')} value={String(order.effectiveYuanRate ?? order.defaultYuanRate ?? '-')} />
            </div>
            {order.yuanRateLocked ? (
              <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{t('procurement.payments.rateLocked')}</p>
            ) : null}
          </section>
          ) : null}

          {activeTab === 'payments' && canSeePayments ? (
            <ProcurementSupplierPayments
              order={{
                ...order,
                totalYuan: Number(order.totalYuan),
                totalPaidYuan: Number(order.totalPaidYuan ?? 0),
                totalPaidKgs: Number(order.totalPaidKgs ?? 0),
                remainingYuan: Number(order.remainingYuan ?? order.totalYuan),
                hqStockMovementCreatedAt: order.hqStockMovementCreatedAt,
              }}
              user={user}
              onChanged={load}
            />
          ) : null}

          {activeTab === 'transport' ? (
          <>
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-bold">{t('procurement.orders.chinaDomestic')}</h3>
              {chinaDomesticLocked && !chinaDomesticEditable ? (
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase text-amber-800">{t('procurement.chinaDomestic.locked')}</span>
              ) : null}
            </div>
            {chinaDomesticLocked && !chinaDomesticFieldsEditable ? (
              <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{t('procurement.chinaDomestic.lockedTooltip')}</p>
            ) : null}
            {chinaDomesticLocked && !chinaDomesticEditable && isCeoUser ? (
              <p className="mb-4 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-800">{t('procurement.transport.changeReasonRequired')}</p>
            ) : null}
            <div className="grid gap-4 md:grid-cols-3">
              <LockedFieldHint locked={chinaDomesticLocked && !chinaDomesticFieldsEditable} tooltip={t('procurement.chinaDomestic.lockedTooltip')}>
                <TransportCompanySelect
                  label={t('procurement.transportCompanies.select')}
                  value={logisticsForm.chinaDomesticTransportCompanyId}
                  companies={transportCompanies}
                  onChange={(value) => setLogistics('chinaDomesticTransportCompanyId', value)}
                  disabled={finalized || readOnlyFinance || !chinaDomesticFieldsEditable}
                />
              </LockedFieldHint>
              <LockedFieldHint locked={chinaDomesticLocked && !chinaDomesticFieldsEditable} tooltip={t('procurement.chinaDomestic.lockedTooltip')}>
                <EditableField
                  label={t('procurement.orders.costInYuan')}
                  value={logisticsForm.chinaDomesticTransportYuan}
                  onChange={(v) => setLogistics('chinaDomesticTransportYuan', v)}
                  type="number"
                  disabled={finalized || readOnlyFinance || !chinaDomesticFieldsEditable}
                />
              </LockedFieldHint>
              <Info label={t('procurement.orders.costInKgs')} value={formatKgs(previewChinaDomesticTransportKgs)} />
              <Info label={t('procurement.orders.weightedAverageYuanRate')} value={String(effectiveYuanRate || '-')} />
            </div>
            {chinaDomesticLocked && isCeoUser && !finalized ? (
              <div className="mt-4">
                <label className="block text-sm font-semibold text-slate-700">{t('procurement.chinaDomestic.unlockReasonPlaceholder')}</label>
                <textarea
                  value={chinaDomesticChangeReason}
                  onChange={(e) => setChinaDomesticChangeReason(e.target.value)}
                  placeholder={t('procurement.chinaDomestic.unlockReasonPlaceholder')}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  rows={2}
                />
              </div>
            ) : null}
            {canUnlockChinaDomestic && !finalized ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-semibold text-amber-900">{t('procurement.chinaDomestic.unlockTitle')}</p>
                <textarea
                  value={chinaDomesticUnlockReason}
                  onChange={(e) => setChinaDomesticUnlockReason(e.target.value)}
                  placeholder={t('procurement.chinaDomestic.unlockReasonPlaceholder')}
                  className="mt-3 w-full rounded-xl border border-amber-200 px-3 py-2 text-sm"
                  rows={2}
                />
                <button
                  type="button"
                  disabled={unlockingChinaDomestic}
                  onClick={() => void unlockChinaDomesticTransport()}
                  className="mt-3 rounded-xl bg-amber-700 px-4 py-2 text-sm font-semibold text-white disabled:bg-amber-300"
                >
                  {unlockingChinaDomestic ? t('common.loading') : t('procurement.chinaDomestic.unlock')}
                </button>
              </div>
            ) : null}
            {chinaDomesticDirty && chinaDomesticFieldsEditable && !finalized && !readOnlyFinance ? (
              <p className="mt-4 text-sm font-semibold text-amber-700">{t('procurement.transport.unsavedChanges')}</p>
            ) : null}
            {chinaDomesticFieldsEditable && !finalized && !readOnlyFinance ? (
              <button
                type="button"
                disabled={savingChinaDomestic || !chinaDomesticDirty}
                onClick={() => void saveChinaDomesticTransport()}
                className="mt-4 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:bg-blue-300"
              >
                {savingChinaDomestic ? t('common.loading') : t('procurement.transport.save')}
              </button>
            ) : null}
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-bold">{t('procurement.orders.cargoPayment')}</h3>
            <div className="grid gap-4 md:grid-cols-3">
              <TransportCompanySelect
                label={t('procurement.transportCompanies.select')}
                value={logisticsForm.chinaExportTransportCompanyId}
                companies={transportCompanies}
                onChange={(value) => setLogistics('chinaExportTransportCompanyId', value)}
                disabled={finalized || readOnlyFinance}
              />
              <EditableField label={t('procurement.orders.cargoReceiptNumber')} value={logisticsForm.cargoReceiptNumber} onChange={(v) => setLogistics('cargoReceiptNumber', v)} disabled={finalized || readOnlyFinance} />
              <EditableField label={t('procurement.orders.cargoReceiptDate')} value={logisticsForm.cargoReceiptDate} onChange={(v) => setLogistics('cargoReceiptDate', v)} type="date" disabled={finalized || readOnlyFinance} />
              <EditableField label={t('procurement.orders.cargoTotalWeightKg')} value={logisticsForm.cargoTotalWeightKg} onChange={(v) => setLogistics('cargoTotalWeightKg', v)} type="number" disabled={finalized || readOnlyFinance} />
              <EditableField label={t('procurement.orders.cargoRateUsdPerKg')} value={logisticsForm.cargoRateUsdPerKg} onChange={(v) => setLogistics('cargoRateUsdPerKg', v)} type="number" disabled={finalized || readOnlyFinance} />
              <EditableField label={t('procurement.orders.usdExchangeRate')} value={logisticsForm.defaultUsdRate} onChange={(v) => setLogistics('defaultUsdRate', v)} type="number" disabled={finalized || readOnlyFinance} />
              <Info label={t('procurement.orders.totalCargoCostUsd')} value={`$${(previewTotals?.totalCargoCostUsd ?? 0).toFixed(2)}`} />
              <Info label={t('procurement.orders.totalCargoCostKgs')} value={formatKgs(previewTotals?.totalCargoCostKgs ?? 0)} />
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <EditableField label={t('procurement.orders.cargoReceiptNote')} value={logisticsForm.cargoReceiptNote} onChange={(v) => setLogistics('cargoReceiptNote', v)} disabled={finalized || readOnlyFinance} />
            </div>
            <div className={`mt-4 space-y-3 rounded-2xl border p-4 ${
              missingCargoAttachment && canReceive && readyForHqReceiving && !finalized
                ? 'border-red-400 bg-red-50'
                : 'border-transparent'
            }`}>
              <div className="flex items-center justify-between gap-4">
                <h4 className="font-semibold text-slate-900">{t('procurement.payments.cargoAttachments')}</h4>
                {canUploadCargo && !finalized ? (
                  <label className={`cursor-pointer rounded-xl border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700 ${uploadingCargoReceipt ? 'opacity-50' : ''}`}>
                    {uploadingCargoReceipt ? t('common.loading') : t('procurement.payments.attachCargoReceipt')}
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png,.webp"
                      disabled={uploadingCargoReceipt || savingCargoReceipt}
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
                <p className={`text-sm ${missingCargoAttachment ? 'font-semibold text-red-700' : 'text-slate-500'}`}>
                  {t('procurement.payments.noCargoAttachments')}
                </p>
              )}
              {missingCargoAttachment && canReceive && readyForHqReceiving && !finalized ? (
                <p className="rounded-xl bg-red-100 px-4 py-3 text-sm font-semibold text-red-800">
                  {t('chinaReceiving.cargoReceiptRequired')}
                </p>
              ) : null}
            </div>
            {cargoReceiptDirty && canEditOrder && !finalized && !readOnlyFinance ? (
              <p className="mt-4 text-sm font-semibold text-amber-700">{t('procurement.transport.unsavedChanges')}</p>
            ) : null}
            {canEditOrder && !finalized && !readOnlyFinance ? (
              <button
                type="button"
                disabled={savingCargoReceipt || uploadingCargoReceipt || !!cargoValidationError || !cargoReceiptDirty}
                onClick={() => void saveCargoReceipt()}
                className="mt-4 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:bg-blue-300"
              >
                {savingCargoReceipt ? t('common.loading') : t('procurement.transport.save')}
              </button>
            ) : null}
            {!cargoReceiptCompleted && canReceive && readyForHqReceiving && !finalized ? (
              <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {missingCargoAttachment
                  ? t('chinaReceiving.cargoReceiptRequired')
                  : t('procurement.receiving.warning.cargo')}
              </p>
            ) : null}
          </section>

          <DomesticTransportSection
            user={user}
            finalized={finalized}
            readOnlyFinance={readOnlyFinance}
            canEditSection={canEditSvh}
            transportCompanies={transportCompanies}
            form={svhForm}
            onChange={setSvhField}
            dirty={svhDirty}
            saving={savingSvh}
            changeReason={svhChangeReason}
            onChangeReason={setSvhChangeReason}
            onSave={() => void saveSvhTransport()}
          />
          {!svhTransportCompleted && canReceive && readyForHqReceiving && !finalized ? (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{t('procurement.domesticTransport.receiveBlocked')}</p>
          ) : null}

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-bold">{t('procurement.orders.otherExpenses')}</h3>
            <div className="grid gap-4 md:grid-cols-3">
              <EditableField label={t('procurement.orders.insurance')} value={logisticsForm.insuranceCostKgs} onChange={(v) => setLogistics('insuranceCostKgs', v)} type="number" disabled={finalized || readOnlyFinance} />
              <EditableField label={t('procurement.orders.customs')} value={logisticsForm.customsCostKgs} onChange={(v) => setLogistics('customsCostKgs', v)} type="number" disabled={finalized || readOnlyFinance} />
              <EditableField label={t('procurement.orders.transportCosts')} value={logisticsForm.otherExpenseKgs} onChange={(v) => setLogistics('otherExpenseKgs', v)} type="number" disabled={finalized || readOnlyFinance} />
            </div>
            {importCostsDirty && canEditOrder && !finalized && !readOnlyFinance ? (
              <p className="mt-4 text-sm font-semibold text-amber-700">{t('procurement.transport.unsavedChanges')}</p>
            ) : null}
            {canEditOrder && !finalized && !readOnlyFinance ? (
              <button
                type="button"
                disabled={savingImportCosts || !!cargoValidationError || !importCostsDirty}
                onClick={() => void saveImportCosts()}
                className="mt-4 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:bg-blue-300"
              >
                {savingImportCosts ? t('common.loading') : t('procurement.transport.save')}
              </button>
            ) : null}
          </section>
          </>
          ) : null}

      {activeTab === 'landedCost' ? (
      <>
      {!isScmOnlyProcurementView ? (
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-bold">{t('procurement.orders.landedCostSummary')}</h3>
          {!finalized && (isCeoUser || canCreateProcurementOrder(user)) ? (
            <button
              type="button"
              onClick={() => void recalculateLandedCost()}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold"
            >
              {t('procurement.orders.recalculateLandedCost')}
            </button>
          ) : null}
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Info
            label={t('procurement.orders.landedCostStatus')}
            value={t(`procurement.orders.landedCostStatus.${order.landedCostStatus ?? 'PENDING_WEIGHT'}`)}
          />
          {order.landedCostCalculatedAt ? (
            <Info label={t('procurement.orders.lastCalculationDate')} value={new Date(order.landedCostCalculatedAt).toLocaleString('ru-RU')} />
          ) : null}
          {order.landedCostCalculationVersion != null ? (
            <Info label={t('procurement.orders.calculationVersion')} value={String(order.landedCostCalculationVersion)} />
          ) : null}
        </div>
        {landedCostPendingWeight ? (
          <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {t('procurement.orders.landedCostPendingWeight')}
          </p>
        ) : null}
        {landedCostPendingWeight ? (
          <div className="mt-4">
            <p className="text-sm font-semibold text-slate-700">{t('procurement.orders.missingWeightProducts')}</p>
            <ul className="mt-2 list-disc pl-5 text-sm text-slate-600">
              {(order.items ?? [])
                .filter((item) => item.weightStatus === 'NOT_SET' || !Number(item.unitWeightKg ?? item.weightKg))
                .map((item) => (
                  <li key={item.id}>{item.sku} · {item.productName}</li>
                ))}
            </ul>
          </div>
        ) : null}
        {landedCostPendingWeight && importCostBreakdown ? (
          <p className="mt-4 text-sm font-medium text-amber-700">{t('procurement.orders.landedCostProvisional')}</p>
        ) : null}
      </section>
      ) : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <CostBlock title={t('procurement.orders.productPurchase')}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Info label={t('procurement.orders.paidToSupplier')} value={formatKgs(confirmedSupplierPaidKgs)} />
            <Info
              label={t('procurement.orders.weightedAverageYuanRate')}
              value={effectiveYuanRate > 0 ? effectiveYuanRate.toFixed(4) : '-'}
            />
            <Info label={t('procurement.orders.totalPurchaseCost')} value={formatKgs(totalPurchaseCostKgs)} />
          </div>
        </CostBlock>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <CostBlock title={t('procurement.orders.importLogistics')}>
          {importCostBreakdown ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Info label={t('procurement.orders.chinaDomestic')} value={formatKgs(importCostBreakdown.chinaDomestic)} />
              <Info label={t('procurement.orders.cargoPayment')} value={formatKgs(importCostBreakdown.cargoReceipt)} />
              <Info label={t('procurement.orders.domesticTransportKyrgyzstan')} value={formatKgs(importCostBreakdown.svhTransport)} />
              <Info label={t('procurement.orders.insurance')} value={formatKgs(importCostBreakdown.insurance)} />
              <Info label={t('procurement.orders.customs')} value={formatKgs(importCostBreakdown.customs)} />
              <Info label={t('procurement.orders.transportCosts')} value={formatKgs(importCostBreakdown.otherExpenses)} />
              <Info
                label={t('procurement.orders.totalImportLogistics')}
                value={formatKgs(importCostBreakdown.totalImportLogistics)}
                highlight
              />
            </div>
          ) : null}
          <p className="mt-4 text-sm text-slate-500">{t('procurement.orders.weightAllocationHint')}</p>
        </CostBlock>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <CostBlock title={t('procurement.orders.finalLandedCost')}>
          {importCostBreakdown ? (
            <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr_auto_1fr] lg:items-center">
              <Info label={t('procurement.orders.totalPurchaseCost')} value={formatKgs(totalPurchaseCostKgs)} />
              <p className="hidden text-center text-2xl font-bold text-slate-400 lg:block">+</p>
              <Info
                label={t('procurement.orders.totalImportLogistics')}
                value={formatKgs(importCostBreakdown.totalImportLogistics)}
              />
              <p className="hidden text-center text-2xl font-bold text-slate-400 lg:block">=</p>
              <Info
                label={t('procurement.orders.estimatedLandedCost')}
                value={formatKgs(importCostBreakdown.totalLandedCost)}
                highlight
              />
            </div>
          ) : null}
        </CostBlock>
      </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-bold">{t('procurement.orders.productsTable')}</h3>
            <div className="overflow-x-auto">
              {isScmOnlyProcurementView ? (
                <table className="w-full table-fixed divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-2 py-2" title={t('procurement.orders.product')}>{t('procurement.orders.product')}</th>
                      <th className="w-14 px-2 py-2 text-right" title={t('procurement.orders.quantity')}>{t('procurement.orders.col.quantityShort')}</th>
                      <th className="w-20 px-2 py-2 text-right" title={t('procurement.orders.purchasePriceYuan')}>{t('procurement.orders.col.purchasePriceShort')}</th>
                      <th className="w-20 px-2 py-2 text-right" title={t('procurement.orders.priceDifferenceYuan')}>{t('procurement.orders.col.priceDifferenceShort')}</th>
                      <th className="w-20 px-2 py-2 text-right" title={t('procurement.orders.productWeight')}>{t('procurement.orders.col.weightShort')}</th>
                      <th className="w-20 px-2 py-2 text-right" title={t('procurement.orders.totalYuan')}>{t('procurement.orders.col.totalYuanShort')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activeOrderItems.map((row) => {
                      const purchasePriceYuan = Number(row.purchasePriceYuan ?? 0);
                      const referencePriceYuan = getReferencePriceYuan(row);
                      const priceDifferenceYuan = referencePriceYuan != null ? purchasePriceYuan - referencePriceYuan : null;
                      const unitWeightKg = resolveUnitWeightKg(row);
                      const lineTotalYuan = row.quantity * purchasePriceYuan;

                      return (
                        <tr key={row.id}>
                          <td className="px-2 py-1.5">
                            <p className="truncate font-medium text-slate-900" title={row.productName}>
                              {row.productName}
                            </p>
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{row.quantity}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{formatYuan(purchasePriceYuan)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">
                            {priceDifferenceYuan != null ? formatPriceDifferenceYuan(priceDifferenceYuan) : '—'}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums">
                            {unitWeightKg != null ? formatWeightKg(unitWeightKg) : t('procurement.orders.weightNotSpecified')}
                          </td>
                          <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{formatYuan(lineTotalYuan)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700">
                    <tr>
                      <td className="px-2 py-2">{t('procurement.orders.tableTotals')}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{scmProductTableTotals.totalQuantity}</td>
                      <td className="px-2 py-2" colSpan={3} />
                      <td className="px-2 py-2 text-right tabular-nums">{formatYuan(scmProductTableTotals.totalYuan)}</td>
                    </tr>
                  </tfoot>
                </table>
              ) : (
                <table className="w-full table-fixed divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="w-[40%] px-4 py-3">{t('procurement.orders.product')}</th>
                      <th className="w-[12%] px-4 py-3 text-right">{t('procurement.orders.quantity')}</th>
                      <th className="w-[16%] px-4 py-3 text-right">{t('inventory.purchaseCostKgs')}</th>
                      <th className="w-[16%] px-4 py-3 text-right">{t('stockMovement.unitCost')}</th>
                      <th className="w-[16%] px-4 py-3 text-right">{t('procurement.orders.col.lineTotalLandedCost')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(previewTotals?.items ?? []).map((item, index) => {
                      const row = (order.items ?? []).filter((entry) => entry.status !== 'CANCELLED')[index];
                      if (!row) return null;
                      return (
                        <tr key={row.id}>
                          <td className="px-4 py-3">
                            <p className="truncate font-medium text-slate-900" title={row.productName}>
                              {row.productName}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">{row.quantity}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{formatKgs(item.costKgs)}</td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatKgs(item.finalCostKgs)}</td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatKgs(item.totalCostKgs)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </section>
          </>
          ) : null}

          {activeTab === 'general' && canEditOrder && !finalized ? (
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <ProcurementStatusButtons orderStatus={order.status} onAction={(path) => void action(path)} />
            </section>
          ) : null}

          {activeTab === 'general' && canReceive && readyForHqReceiving && !finalized ? (
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
              {!cargoReceiptCompleted ? (
                <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {missingCargoAttachment
                    ? t('chinaReceiving.cargoReceiptRequired')
                    : t('procurement.receiving.warning.cargo')}
                </p>
              ) : null}
              {!svhTransportCompleted ? (
                <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{t('procurement.receiving.warning.svh')}</p>
              ) : null}
              <ul className="mt-4 space-y-2 text-sm">
                <li className={cargoReceiptCompleted ? 'text-emerald-700' : 'text-red-700'}>
                  {cargoReceiptCompleted
                    ? t('procurement.receiving.checklist.cargoComplete')
                    : t('procurement.receiving.checklist.cargoIncomplete')}
                </li>
                <li className={svhTransportCompleted ? 'text-emerald-700' : 'text-red-700'}>
                  {svhTransportCompleted
                    ? t('procurement.receiving.checklist.svhComplete')
                    : t('procurement.receiving.checklist.svhIncomplete')}
                </li>
                <li className={landedCostCalculated ? 'text-emerald-700' : 'text-red-700'}>
                  {landedCostCalculated
                    ? t('procurement.receiving.checklist.landedCostComplete')
                    : t('procurement.receiving.checklist.landedCostIncomplete')}
                </li>
              </ul>
              {!landedCostCalculated ? (
                <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{t('procurement.receiving.warning.landedCost')}</p>
              ) : null}
              <button
                type="button"
                disabled={!!cargoValidationError || !canReceiveToHq || !landedCostCalculated}
                onClick={() => void receiveGoods()}
                className="mt-4 rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white disabled:bg-emerald-300"
              >
                {t('procurement.orders.receiveToHq')}
              </button>
            </section>
          ) : null}

          {activeTab === 'general' && order.differenceReports && order.differenceReports.length > 0 ? (
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm overflow-x-auto">
              <h3 className="mb-4 text-lg font-bold">{t('procurement.orders.shortageReport')}</h3>
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">#</th><th className="px-4 py-3">SKU</th><th className="px-4 py-3">{t('procurement.orders.expected')}</th><th className="px-4 py-3">{t('procurement.orders.receivedQty')}</th><th className="px-4 py-3">{t('procurement.orders.difference')}</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{order.differenceReports.map((report) => <tr key={report.id}><td className="px-4 py-3">{report.reportNumber}</td><td className="px-4 py-3">{report.sku}</td><td className="px-4 py-3">{report.expectedQuantity}</td><td className="px-4 py-3">{report.receivedQuantity}</td><td className="px-4 py-3">{report.differenceQuantity} ({report.type})</td></tr>)}</tbody>
              </table>
            </section>
          ) : null}

          {activeTab === 'history' ? (
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
          ) : null}
        </> : null}
      </section>
    </ProtectedShell>
  );
}

function Info({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-2xl p-4 ${highlight ? 'border border-blue-200 bg-blue-50' : 'bg-slate-50'}`}>
      <p className="text-xs font-semibold uppercase text-slate-400">{label}</p>
      <p className={`font-bold ${highlight ? 'text-blue-900' : 'text-slate-950'}`}>{value}</p>
    </div>
  );
}

function CostBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="border-b border-slate-200 pb-3">
        <h3 className="text-lg font-bold text-slate-950">{title}</h3>
      </div>
      {children}
    </div>
  );
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

function formHasDomesticData(form: DomesticTransportForm) {
  return form.transportCompanyId !== ''
    || form.transportCostKgs !== '0'
    || form.dispatchDate !== ''
    || form.notes !== ''
    || form.status !== 'WAITING';
}

function formatKgs(value: number | string | null | undefined) {
  return `${Number(value ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} сом`;
}

function resolveUnitWeightKg(item: ProcurementOrderItem): number | null {
  if (item.weightStatus === 'NOT_SET') return null;
  const raw = item.unitWeightKg ?? item.weightKg;
  if (raw == null || raw === '') return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function getReferencePriceYuan(item: ProcurementOrderItem): number | null {
  const raw = item.product?.purchasePriceYuan;
  if (raw == null || raw === '') return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function formatYuan(value: number) {
  return `${value.toLocaleString('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} ¥`;
}

function formatWeightKg(value: number) {
  return `${value.toLocaleString('ru-RU', { maximumFractionDigits: 3, minimumFractionDigits: 0 })} кг`;
}

function formatPriceDifferenceYuan(value: number) {
  if (value === 0) return '0.00 ¥';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)} ¥`;
}
