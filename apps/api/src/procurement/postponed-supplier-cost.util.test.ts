/**
 * Approved postponed Supplier Payment must be included in procurement себестоимость
 * using the full HQ Accountant-approved amount (not paid cash).
 */
import { ProcurementSupplierPaymentLedgerStatus } from '@prisma/client';
import {
  buildProcurementImportExpenseLines,
  isSupplierPaymentApprovedForLandedCost,
  reconcileSupplierLineCostTotals,
  resolveApprovedSupplierAmountKgs,
  resolveApprovedSupplierCostBaseYuan,
  resolveSupplierCostInclusionStatus,
  resolveSupplierInvoicePaymentStatusForCost,
} from './procurement-cost.util';

function assertClose(actual: number, expected: number, label: string) {
  if (Math.abs(actual - expected) > 0.02) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const approvedPostponedSupplier = {
  invoiceSentToAccountantAt: new Date(),
  supplierInvoiceNumber: 'INV-800',
  invoiceReviewStatus: 'APPROVED',
  supplierPaymentStatus: ProcurementSupplierPaymentLedgerStatus.PAYMENT_POSTPONED,
};

// 1–2. Approved postponed supplier is eligible and uses full approved amount
{
  assertEqual(
    isSupplierPaymentApprovedForLandedCost(approvedPostponedSupplier),
    true,
    '1. postponed approved supplier eligible',
  );
  assertEqual(
    resolveSupplierCostInclusionStatus(approvedPostponedSupplier),
    'INCLUDED',
    '1. cost inclusion INCLUDED',
  );
  const approvedKgs = resolveApprovedSupplierAmountKgs({
    totalYuan: 66666.67,
    estimatedYuanRate: 12,
  });
  assertClose(approvedKgs, 800000.04, '2. full approved supplier amount in KGS');
}

// 3. Zero paid does not zero supplier cost
{
  const lines = buildProcurementImportExpenseLines({
    estimatedYuanRate: 12,
    supplier: {
      ...approvedPostponedSupplier,
      totalYuan: 66666.67,
      totalPaidYuan: 0,
      estimatedSupplierCostKgs: 0,
    },
    transportExpenses: [],
  });
  const supplierLine = lines.find((row) => row.requestType === 'SUPPLIER_PAYMENT');
  if (!supplierLine) throw new Error('3. supplier line missing');
  assertClose(supplierLine.approvedAmountKgs, 800000.04, '3. approved amount shown');
  assertClose(supplierLine.paidAmountKgs, 0, '3. paid amount zero');
  assertClose(supplierLine.remainingAmountKgs, 800000.04, '4. remaining debt unchanged');
  assertEqual(supplierLine.paymentStatus, 'POSTPONED', '3. payment status POSTPONED');
  assertEqual(supplierLine.includedInLandedCost, true, '3. included in landed cost');
}

// 5–6. Partially paid and fully paid approved supplier also included once
{
  const partial = buildProcurementImportExpenseLines({
    estimatedYuanRate: 12,
    supplier: {
      ...approvedPostponedSupplier,
      supplierPaymentStatus: ProcurementSupplierPaymentLedgerStatus.PARTIALLY_PAID,
      totalYuan: 100000 / 12,
      totalPaidYuan: 30000 / 12,
      estimatedSupplierCostKgs: 100000,
    },
    transportExpenses: [],
  })[0];
  assertClose(partial.approvedAmountKgs, 100000, '6. partial uses full approved');
  assertEqual(partial.includedInLandedCost, true, '6. partial included');

  const paid = buildProcurementImportExpenseLines({
    estimatedYuanRate: 12,
    supplier: {
      ...approvedPostponedSupplier,
      supplierPaymentStatus: ProcurementSupplierPaymentLedgerStatus.PAID,
      totalYuan: 100000 / 12,
      totalPaidYuan: 100000 / 12,
      estimatedSupplierCostKgs: 100000,
    },
    transportExpenses: [],
  })[0];
  assertClose(paid.approvedAmountKgs, 100000, '7. paid uses full approved');
  assertEqual(paid.includedInLandedCost, true, '7. paid included once');
}

// 8–10. Waiting / returned / rejected excluded
{
  assertEqual(
    isSupplierPaymentApprovedForLandedCost({
      invoiceSentToAccountantAt: new Date(),
      supplierInvoiceNumber: 'INV-W',
      invoiceReviewStatus: 'UNDER_REVIEW',
      supplierPaymentStatus: 'AWAITING_ACCOUNTANT',
    }),
    false,
    '8. waiting for accountant excluded',
  );
  assertEqual(
    isSupplierPaymentApprovedForLandedCost({
      invoiceSentToAccountantAt: new Date(),
      supplierInvoiceNumber: 'INV-R',
      invoiceReviewStatus: 'RETURNED',
      supplierPaymentStatus: 'PAYMENT_POSTPONED',
    }),
    false,
    '9. returned for correction excluded',
  );
  assertEqual(
    isSupplierPaymentApprovedForLandedCost({
      invoiceSentToAccountantAt: new Date(),
      supplierInvoiceNumber: 'INV-X',
      invoiceReviewStatus: 'REJECTED',
      supplierPaymentStatus: 'PAYMENT_POSTPONED',
    }),
    false,
    '10. rejected excluded',
  );
}

// 11. Authoritative CNY base prefers requested payment when set
{
  assertClose(
    resolveApprovedSupplierCostBaseYuan({ totalYuan: 100000, requestedPaymentYuan: 80000 }),
    80000,
    '11. requested payment yuan base',
  );
}

// 12. Line reconciliation surfaces mismatch
{
  const reconciliation = reconcileSupplierLineCostTotals({
    lineCostKgs: 799000,
    approvedSupplierAmountKgs: 800000,
  });
  assertEqual(reconciliation.ok, false, '12. reconciliation fails on mismatch');
  assertClose(reconciliation.differenceKgs, -1000, '12. exact difference');
}

// 13. Payment status mapping for postponed ledger
{
  assertEqual(
    resolveSupplierInvoicePaymentStatusForCost(
      ProcurementSupplierPaymentLedgerStatus.PAYMENT_POSTPONED,
    ),
    'POSTPONED',
    '13. ledger maps to POSTPONED',
  );
}

console.log('postponed-supplier-cost.util.test.ts passed');
