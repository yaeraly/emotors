import {
  ProcurementOrderStatus,
  ProcurementSupplierPaymentLedgerStatus,
  ProcurementSupplierPaymentStatus,
} from '@prisma/client';
import {
  assessProcurementRestore,
  canCancelProcurementOrderStatus,
  captureProcurementFinancialSnapshot,
  inferPreviousStatusFromAudit,
  procurementFinancialSnapshotsEqual,
  resolveRestoredProcurementStatus,
} from './procurement-order-restore.util';

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertTrue(value: boolean, label: string) {
  if (!value) throw new Error(`${label}: expected true`);
}

function assertFalse(value: boolean, label: string) {
  if (value) throw new Error(`${label}: expected false`);
}

const cancelledAudit = [
  {
    action: 'PROCUREMENT_CANCELLED',
    timestamp: new Date('2026-08-10T12:00:00.000Z'),
    metadata: {
      previousStatus: ProcurementOrderStatus.PAID,
      oldValue: { status: ProcurementOrderStatus.PAID },
      newValue: { status: ProcurementOrderStatus.CANCELLED },
    },
  },
];

assertEqual(
  inferPreviousStatusFromAudit(cancelledAudit),
  ProcurementOrderStatus.PAID,
  'reads previous status from PROCUREMENT_CANCELLED audit',
);

assertEqual(
  inferPreviousStatusFromAudit([
    {
      action: 'PROCUREMENT_STATUS_CHANGE',
      timestamp: new Date('2026-08-10T12:00:00.000Z'),
      metadata: {
        oldValue: { status: ProcurementOrderStatus.IN_TRANSIT },
        newValue: { status: ProcurementOrderStatus.CANCELLED },
      },
    },
  ]),
  ProcurementOrderStatus.IN_TRANSIT,
  'reads previous status from legacy PROCUREMENT_STATUS_CHANGE audit',
);

assertEqual(
  resolveRestoredProcurementStatus({
    storedPreviousStatus: ProcurementOrderStatus.PAID,
    inferredPreviousStatus: ProcurementOrderStatus.DRAFT,
  }),
  ProcurementOrderStatus.PAID,
  'prefers stored previous status',
);

assertEqual(
  resolveRestoredProcurementStatus({
    storedPreviousStatus: null,
    inferredPreviousStatus: ProcurementOrderStatus.IN_TRANSIT,
  }),
  ProcurementOrderStatus.IN_TRANSIT,
  'falls back to inferred previous status',
);

const snapshot = captureProcurementFinancialSnapshot({
  totalYuan: 500000,
  totalPaidYuan: 500000,
  totalPaidKgs: 6000000,
  remainingYuan: 0,
  supplierPaymentStatus: ProcurementSupplierPaymentLedgerStatus.PAID,
  supplierPayments: [
    { status: ProcurementSupplierPaymentStatus.ACTIVE, amountKgs: 6000000, actualPaidKgs: 6000000 },
  ],
});

assertEqual(snapshot.totalYuan, 500000, 'snapshot total yuan');
assertEqual(snapshot.confirmedPaymentCount, 1, 'snapshot confirmed payment count');
assertTrue(
  procurementFinancialSnapshotsEqual(snapshot, { ...snapshot }),
  'identical financial snapshots match',
);

const restoreAssessment = assessProcurementRestore({
  status: ProcurementOrderStatus.CANCELLED,
  deletedAt: null,
  previousStatusBeforeCancellation: ProcurementOrderStatus.PAID,
  inferredPreviousStatus: ProcurementOrderStatus.PAID,
  supplierPaymentStatus: ProcurementSupplierPaymentLedgerStatus.PAID,
  totalPaidKgs: 6000000,
  totalPaidYuan: 500000,
  invoiceReviewStatus: 'APPROVED',
  supplierPayments: [{ status: ProcurementSupplierPaymentStatus.ACTIVE }],
});

assertTrue(restoreAssessment.canRestore, 'paid cancelled order can restore');
assertEqual(restoreAssessment.restoredStatus, ProcurementOrderStatus.PAID, 'restores to PAID');
assertTrue(restoreAssessment.hasConfirmedFinancialActivity, 'detects confirmed financial activity');

const archivedAssessment = assessProcurementRestore({
  status: ProcurementOrderStatus.CANCELLED,
  deletedAt: new Date(),
  previousStatusBeforeCancellation: ProcurementOrderStatus.PAID,
  inferredPreviousStatus: ProcurementOrderStatus.PAID,
  supplierPaymentStatus: ProcurementSupplierPaymentLedgerStatus.PAID,
  totalPaidKgs: 6000000,
  totalPaidYuan: 500000,
  supplierPayments: [{ status: ProcurementSupplierPaymentStatus.ACTIVE }],
});

assertFalse(archivedAssessment.canRestore, 'archived cancelled order cannot restore');

assertFalse(
  canCancelProcurementOrderStatus(ProcurementOrderStatus.RECEIVED_TO_HQ_WAREHOUSE),
  'received orders cannot be cancelled',
);
assertTrue(
  canCancelProcurementOrderStatus(ProcurementOrderStatus.PAID),
  'paid orders can still be cancelled accidentally',
);

console.log('procurement-order-restore.util.test.ts passed');
