import {
  ProcurementOrderStatus,
  ProcurementSupplierPaymentLedgerStatus,
  ProcurementSupplierPaymentStatus,
} from '@prisma/client';
import { isConfirmedSupplierPayment } from './supplier-payment.util';

const TERMINAL_NON_RESTORABLE_STATUSES = new Set<ProcurementOrderStatus>([
  ProcurementOrderStatus.CANCELLED,
]);

const NON_CANCELLABLE_STATUSES = new Set<ProcurementOrderStatus>([
  ProcurementOrderStatus.RECEIVED_TO_HQ_WAREHOUSE,
  ProcurementOrderStatus.CLOSED,
  ProcurementOrderStatus.CANCELLED,
]);

export type ProcurementAuditRow = {
  action: string;
  timestamp: Date;
  metadata: unknown;
};

export type ProcurementFinancialSnapshot = {
  totalYuan: number;
  totalPaidYuan: number;
  totalPaidKgs: number;
  remainingYuan: number;
  supplierPaymentStatus: ProcurementSupplierPaymentLedgerStatus | string;
  confirmedPaymentCount: number;
  confirmedPaymentKgs: number;
};

export type ProcurementRestoreAssessment = {
  canRestore: boolean;
  restoredStatus: ProcurementOrderStatus | null;
  blockingReasons: string[];
  hasConfirmedFinancialActivity: boolean;
  inferredPreviousStatus: ProcurementOrderStatus | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readStatus(value: unknown): ProcurementOrderStatus | null {
  if (typeof value !== 'string') return null;
  return Object.values(ProcurementOrderStatus).includes(value as ProcurementOrderStatus)
    ? (value as ProcurementOrderStatus)
    : null;
}

function readNestedStatus(container: unknown, key: 'status' | 'previousStatus'): ProcurementOrderStatus | null {
  const record = asRecord(container);
  if (!record) return null;
  return readStatus(record[key]);
}

export function inferPreviousStatusFromAudit(audits: ProcurementAuditRow[]): ProcurementOrderStatus | null {
  const sorted = [...audits].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  for (const row of sorted) {
    const meta = asRecord(row.metadata);
    if (!meta) continue;

    if (row.action === 'PROCUREMENT_CANCELLED') {
      const fromMeta = readStatus(meta.previousStatus);
      if (fromMeta && fromMeta !== ProcurementOrderStatus.CANCELLED) return fromMeta;
      const fromOld = readNestedStatus(meta.oldValue, 'status');
      if (fromOld && fromOld !== ProcurementOrderStatus.CANCELLED) return fromOld;
    }

    if (row.action === 'PROCUREMENT_STATUS_CHANGE') {
      const newStatus = readNestedStatus(meta.newValue, 'status');
      if (newStatus !== ProcurementOrderStatus.CANCELLED) continue;
      const oldStatus = readNestedStatus(meta.oldValue, 'status');
      if (oldStatus && oldStatus !== ProcurementOrderStatus.CANCELLED) return oldStatus;
    }
  }

  return null;
}

export function resolveRestoredProcurementStatus(input: {
  storedPreviousStatus: ProcurementOrderStatus | null | undefined;
  inferredPreviousStatus: ProcurementOrderStatus | null;
}): ProcurementOrderStatus | null {
  const candidate = input.storedPreviousStatus ?? input.inferredPreviousStatus;
  if (!candidate || TERMINAL_NON_RESTORABLE_STATUSES.has(candidate)) return null;
  return candidate;
}

export function captureProcurementFinancialSnapshot(input: {
  totalYuan: unknown;
  totalPaidYuan: unknown;
  totalPaidKgs: unknown;
  remainingYuan: unknown;
  supplierPaymentStatus: ProcurementSupplierPaymentLedgerStatus | string;
  supplierPayments: Array<{ status?: string | null; amountKgs?: unknown; actualPaidKgs?: unknown }>;
}): ProcurementFinancialSnapshot {
  const confirmedPayments = input.supplierPayments.filter((payment) =>
    isConfirmedSupplierPayment(payment.status ?? ProcurementSupplierPaymentStatus.ACTIVE),
  );
  const confirmedPaymentKgs = confirmedPayments.reduce((sum, payment) => {
    const amount = Number(payment.actualPaidKgs ?? payment.amountKgs ?? 0);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);

  return {
    totalYuan: Number(input.totalYuan ?? 0),
    totalPaidYuan: Number(input.totalPaidYuan ?? 0),
    totalPaidKgs: Number(input.totalPaidKgs ?? 0),
    remainingYuan: Number(input.remainingYuan ?? 0),
    supplierPaymentStatus: input.supplierPaymentStatus,
    confirmedPaymentCount: confirmedPayments.length,
    confirmedPaymentKgs: Math.round((confirmedPaymentKgs + Number.EPSILON) * 100) / 100,
  };
}

export function procurementFinancialSnapshotsEqual(
  before: ProcurementFinancialSnapshot,
  after: ProcurementFinancialSnapshot,
): boolean {
  return (
    before.totalYuan === after.totalYuan &&
    before.totalPaidYuan === after.totalPaidYuan &&
    before.totalPaidKgs === after.totalPaidKgs &&
    before.remainingYuan === after.remainingYuan &&
    before.supplierPaymentStatus === after.supplierPaymentStatus &&
    before.confirmedPaymentCount === after.confirmedPaymentCount &&
    before.confirmedPaymentKgs === after.confirmedPaymentKgs
  );
}

export function hasConfirmedProcurementFinancialActivity(input: {
  supplierPaymentStatus: ProcurementSupplierPaymentLedgerStatus | string;
  totalPaidKgs: unknown;
  totalPaidYuan: unknown;
  invoiceReviewStatus?: string | null;
  supplierPayments: Array<{ status?: string | null }>;
}): boolean {
  const paidKgs = Number(input.totalPaidKgs ?? 0);
  const paidYuan = Number(input.totalPaidYuan ?? 0);
  const ledgerStatus = String(input.supplierPaymentStatus ?? '').toUpperCase();
  const hasConfirmedPayment = input.supplierPayments.some((payment) =>
    isConfirmedSupplierPayment(payment.status),
  );

  return (
    hasConfirmedPayment ||
    paidKgs > 0 ||
    paidYuan > 0 ||
    ledgerStatus === ProcurementSupplierPaymentLedgerStatus.PAID ||
    ledgerStatus === ProcurementSupplierPaymentLedgerStatus.PARTIALLY_PAID ||
    ledgerStatus === ProcurementSupplierPaymentLedgerStatus.OVERPAID ||
    String(input.invoiceReviewStatus ?? '').toUpperCase() === 'APPROVED'
  );
}

export function canCancelProcurementOrderStatus(status: ProcurementOrderStatus): boolean {
  return !NON_CANCELLABLE_STATUSES.has(status);
}

export function assessProcurementRestore(input: {
  status: ProcurementOrderStatus;
  deletedAt: Date | null;
  previousStatusBeforeCancellation?: ProcurementOrderStatus | null;
  inferredPreviousStatus: ProcurementOrderStatus | null;
  supplierPaymentStatus: ProcurementSupplierPaymentLedgerStatus | string;
  totalPaidKgs: unknown;
  totalPaidYuan: unknown;
  invoiceReviewStatus?: string | null;
  supplierPayments: Array<{ status?: string | null }>;
}): ProcurementRestoreAssessment {
  const blockingReasons: string[] = [];
  const hasConfirmedFinancialActivity = hasConfirmedProcurementFinancialActivity(input);
  const restoredStatus = resolveRestoredProcurementStatus({
    storedPreviousStatus: input.previousStatusBeforeCancellation,
    inferredPreviousStatus: input.inferredPreviousStatus,
  });

  if (input.status !== ProcurementOrderStatus.CANCELLED) {
    blockingReasons.push('ORDER_NOT_CANCELLED');
  }
  if (input.deletedAt) {
    blockingReasons.push('ORDER_ARCHIVED');
  }
  if (!restoredStatus) {
    blockingReasons.push('PREVIOUS_STATUS_UNKNOWN');
  }

  return {
    canRestore:
      input.status === ProcurementOrderStatus.CANCELLED &&
      !input.deletedAt &&
      !!restoredStatus &&
      blockingReasons.filter((reason) => reason !== 'ORDER_NOT_CANCELLED').length === 0,
    restoredStatus,
    blockingReasons,
    hasConfirmedFinancialActivity,
    inferredPreviousStatus: input.inferredPreviousStatus,
  };
}
