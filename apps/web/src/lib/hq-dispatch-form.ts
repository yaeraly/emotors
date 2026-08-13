/**
 * HQ Warehouse dispatch (PACKED → SHIPPED) must not collect branch delivery
 * transport identity fields. Those are entered by Branch Warehouse on receipt.
 */
export type HqDispatchTransportFormState = {
  transportCompany: string;
  driverName: string;
  vehicleNumber: string;
  transportNotes: string;
};

export const HQ_DISPATCH_TRANSPORT_FIELD_KEYS = [
  'transportCompany',
  'driverName',
  'vehicleNumber',
  'transportNotes',
] as const;

export function shouldShowHqDispatchTransportFields(): boolean {
  return false;
}

/** Payload for POST /distribution/orders/:id/send — no transport fields. */
export function buildHqDispatchSendPayload(): Record<string, never> {
  return {};
}
