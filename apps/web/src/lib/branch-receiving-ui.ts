import { computeDifference } from './branch-receiving-draft';

/** i18n keys for compact quantity column headers on the receiving table. */
export const BRANCH_RECEIVING_QUANTITY_HEADER_KEYS = {
  sentQuantity: 'distribution.sentQuantityShort',
  acceptedQuantity: 'distribution.acceptedQuantityShort',
} as const;

/** Legacy long labels that must not be used on the receiving table. */
export const BRANCH_RECEIVING_LEGACY_QUANTITY_HEADER_KEYS = [
  'distribution.sentQuantity',
  'distribution.acceptedQuantity',
] as const;

export const BRANCH_RECEIVING_PRODUCT_NAME_CELL_CLASS =
  'break-words whitespace-normal font-medium text-slate-900';

export function productNameDisplayUsesTruncation(className: string): boolean {
  return /\btruncate\b/.test(className) || /\bline-clamp-\d+\b/.test(className);
}

export function allowsProductNameWrapping(className: string): boolean {
  return /\bbreak-words\b/.test(className) && /\bwhitespace-normal\b/.test(className);
}

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
