import { SvhToHqTransportStatus } from '@prisma/client';

export const SVH_ELIGIBLE_PROCUREMENT_STATUSES = [
  'ARRIVED_IN_KYRGYZSTAN',
  'ARRIVED',
  'CUSTOMS_CLEARANCE',
  'IN_TRANSIT',
] as const;

export const SVH_TRANSPORT_NOT_COMPLETED_MESSAGE =
  'SVH to HQ Warehouse transport must be completed first';

export function isSvhEligibleProcurementStatus(status: string) {
  return SVH_ELIGIBLE_PROCUREMENT_STATUSES.includes(status as (typeof SVH_ELIGIBLE_PROCUREMENT_STATUSES)[number]);
}

export function isSvhTransportCompleted(status?: SvhToHqTransportStatus | string | null) {
  return status === SvhToHqTransportStatus.COMPLETED;
}

export function normalizeSvhTransportCostKgs(value: unknown) {
  return Math.max(0, Number(value ?? 0));
}
