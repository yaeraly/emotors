import { TransportCompanyStatus } from '@prisma/client';
import { isSvhTransportCompleted } from './svh-to-hq-transport.util';

export const CARGO_RECEIPT_INCOMPLETE_MESSAGE =
  'Fill cargo receipt before receiving to HQ warehouse';

export const CARGO_RECEIPT_ATTACHMENT_REQUIRED_MESSAGE =
  'Attach the cargo receipt before receiving goods into the HQ warehouse.';

export const SVH_TRANSPORT_INCOMPLETE_MESSAGE =
  'Complete SVH to HQ transport before receiving';

export type CargoReceiptSnapshot = {
  cargoTotalWeightKg?: number | string | null;
  cargoRateUsdPerKg?: number | string | null;
  defaultUsdRate?: number | string | null;
  cargoReceiptNumber?: string | null;
  cargoReceiptDate?: string | Date | null;
  cargoAttachmentCount?: number;
};

export type SvhTransportSnapshot = {
  transportCompanyId?: string | null;
  transportCostKgs?: number | string | null;
  dispatchDate?: string | Date | null;
  arrivalDate?: string | Date | null;
  status?: string | null;
  transportCompanyStatus?: string | null;
} | null | undefined;

export type HqReceivingValidationResult = {
  valid: boolean;
  errors: string[];
};

/** Full Import Logistics cargo form completeness (informational; does not block HQ receive). */
export function validateCargoReceiptComplete(snapshot: CargoReceiptSnapshot): HqReceivingValidationResult {
  const errors: string[] = [];
  if (Number(snapshot.cargoTotalWeightKg ?? 0) <= 0) {
    errors.push('cargoTotalWeightKg');
  }
  if (Number(snapshot.cargoRateUsdPerKg ?? 0) <= 0) {
    errors.push('cargoRateUsdPerKg');
  }
  if (Number(snapshot.defaultUsdRate ?? 0) <= 0) {
    errors.push('defaultUsdRate');
  }
  if (!snapshot.cargoReceiptNumber?.trim()) {
    errors.push('cargoReceiptNumber');
  }
  if (!snapshot.cargoReceiptDate) {
    errors.push('cargoReceiptDate');
  }
  if ((snapshot.cargoAttachmentCount ?? 0) < 1) {
    errors.push('cargoAttachment');
  }
  return { valid: errors.length === 0, errors };
}

/** Whether a cargo receipt file exists on the order or linked freight payment request. */
export function hasCargoReceiptAttachment(snapshot: CargoReceiptSnapshot): boolean {
  return (snapshot.cargoAttachmentCount ?? 0) >= 1;
}

export function validateSvhToHqTransportComplete(snapshot: SvhTransportSnapshot): HqReceivingValidationResult {
  const errors: string[] = [];
  if (!snapshot) {
    return { valid: false, errors: ['svhTransportMissing'] };
  }
  if (!snapshot.transportCompanyId) {
    errors.push('transportCompanyId');
  }
  if (Number(snapshot.transportCostKgs ?? -1) < 0) {
    errors.push('transportCostKgs');
  }
  if (!snapshot.dispatchDate) {
    errors.push('dispatchDate');
  }
  if (!snapshot.arrivalDate) {
    errors.push('arrivalDate');
  }
  if (!isSvhTransportCompleted(snapshot.status)) {
    errors.push('status');
  }
  if (
    snapshot.transportCompanyId &&
    snapshot.transportCompanyStatus &&
    snapshot.transportCompanyStatus !== TransportCompanyStatus.ACTIVE
  ) {
    errors.push('transportCompanyInactive');
  }
  return { valid: errors.length === 0, errors };
}

export function buildHqReceivingValidationResult(params: {
  cargo: CargoReceiptSnapshot;
  svh: SvhTransportSnapshot;
}) {
  const cargoForm = validateCargoReceiptComplete(params.cargo);
  const svhTransport = validateSvhToHqTransportComplete(params.svh);
  const receiptAttached = hasCargoReceiptAttachment(params.cargo);
  const cargoReceipt: HqReceivingValidationResult = receiptAttached
    ? { valid: true, errors: [] }
    : { valid: false, errors: ['cargoAttachment'] };

  return {
    /** True when a cargo receipt file already exists (payment request / order). */
    cargoReceiptCompleted: receiptAttached,
    /** Informational only — does not gate HQ warehouse receiving. */
    svhToHqTransportCompleted: svhTransport.valid,
    /**
     * HQ China receiving must not be blocked by Import Logistics cargo form fields
     * or SVH→HQ transport completion. Physical receiving uses its own workflow.
     */
    canReceiveToHq: true,
    cargoReceipt,
    cargoForm,
    svhTransport,
  };
}

export function hqReceivingBlockedMessage(
  _validation: ReturnType<typeof buildHqReceivingValidationResult>,
): string | null {
  // Cargo form fill and SVH→HQ completion must not block HQ warehouse receiving.
  return null;
}
