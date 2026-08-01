import { computeDifference } from './branch-receiving-draft';

/** Visible columns on Branch Warehouse receiving product table (in order). */
export const BRANCH_RECEIVING_TABLE_COLUMNS = [
  'sku',
  'product',
  'sentQuantity',
  'acceptedQuantity',
  'damagedQuantity',
  'difference',
  'notes',
  'actions',
] as const;

/** Columns removed from the receiving table UI (logic may remain internal). */
export const REMOVED_BRANCH_RECEIVING_TABLE_COLUMNS = ['missingQuantity', 'status'] as const;

export function shouldShowReceivingBranchField(isOperatorView: boolean): boolean {
  return !isOperatorView;
}

export function shouldShowTransportCompanyField(): boolean {
  return false;
}

export type BranchReceivingTransportFormState = {
  driverName: string;
  vehicleNumber: string;
  transportCostKgs: string;
  transportNotes: string;
};

export function buildBranchReceivingTransportPayload(form: BranchReceivingTransportFormState) {
  const transportCostKgs = Number(form.transportCostKgs);
  return {
    driverName: form.driverName.trim() || undefined,
    vehicleNumber: form.vehicleNumber.trim() || undefined,
    transportNotes: form.transportNotes.trim() || undefined,
    transportCostKgs,
  };
}

/** Derive shortage quantity when the missing-quantity column is hidden. */
export function deriveMissingQuantity(expected: number, accepted: number, damaged: number) {
  return Math.max(expected - accepted - damaged, 0);
}

export { computeDifference };
