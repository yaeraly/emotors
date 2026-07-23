/**
 * Distinguish real China procurement receipts from legacy seed/test inventory.
 * Business FIFO cost must never read seed repro layers when real receipt layers exist.
 */
export const SEED_FIFO_REFERENCE_TYPE = 'SEED_REPRO';

const LEGACY_SEED_REFERENCE_IDS = new Set(['recv-1', 'recv-2']);

export function isSeedStockMovementReference(input: {
  referenceType?: string | null;
  referenceId?: string | null;
  note?: string | null;
}) {
  if (input.referenceType === SEED_FIFO_REFERENCE_TYPE) return true;
  if (input.referenceId && LEGACY_SEED_REFERENCE_IDS.has(input.referenceId)) return true;
  if (input.note?.includes('seed-sus001-repro')) return true;
  return false;
}

export function isBusinessProcurementReceiptReference(referenceType?: string | null) {
  return referenceType === 'PROCUREMENT_GOODS_RECEIVING';
}
