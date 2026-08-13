export const CHINA_DOMESTIC_TRANSPORT_EDITABLE_STATUSES = [
  'DRAFT',
  'APPROVED',
  'ORDERED',
  'SENT_TO_SUPPLIER',
  'PAID',
  'IN_PRODUCTION',
  'PRODUCTION',
  'READY_TO_SHIP',
] as const;

export type ChinaDomesticTransportUnlockOrder = {
  status: string;
  chinaDomesticTransportUnlockExpiresAt?: string | null;
};

export function isChinaDomesticTransportLockedByStatus(status: string) {
  return !(CHINA_DOMESTIC_TRANSPORT_EDITABLE_STATUSES as readonly string[]).includes(status);
}

export function isChinaDomesticTransportUnlocked(
  order: ChinaDomesticTransportUnlockOrder,
  now = new Date(),
) {
  const expiresAt = order.chinaDomesticTransportUnlockExpiresAt
    ? new Date(order.chinaDomesticTransportUnlockExpiresAt)
    : null;
  return !!expiresAt && now.getTime() <= expiresAt.getTime();
}

export function canEditChinaDomesticTransport(order: ChinaDomesticTransportUnlockOrder, now = new Date()) {
  if (!isChinaDomesticTransportLockedByStatus(order.status)) {
    return true;
  }
  return isChinaDomesticTransportUnlocked(order, now);
}
