import { ProcurementOrderStatus } from '@prisma/client';
import { computeUnlockExpiry } from './procurement-edit-window.util';

export const CHINA_DOMESTIC_TRANSPORT_EDITABLE_STATUSES: ProcurementOrderStatus[] = [
  ProcurementOrderStatus.DRAFT,
  ProcurementOrderStatus.APPROVED,
  ProcurementOrderStatus.ORDERED,
  ProcurementOrderStatus.SENT_TO_SUPPLIER,
  ProcurementOrderStatus.PAID,
  ProcurementOrderStatus.IN_PRODUCTION,
  ProcurementOrderStatus.PRODUCTION,
  ProcurementOrderStatus.READY_TO_SHIP,
];

export const CHINA_DOMESTIC_TRANSPORT_LOCK_TRIGGER_STATUS = ProcurementOrderStatus.SHIPPED_TO_YIWU;

export type ChinaDomesticTransportUnlockOrder = {
  status: ProcurementOrderStatus | string;
  chinaDomesticTransportUnlockedAt?: Date | string | null;
  chinaDomesticTransportUnlockExpiresAt?: Date | string | null;
  chinaDomesticTransportUnlockReason?: string | null;
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

export function touchesChinaDomesticTransportFields(dto: Record<string, unknown>) {
  return dto.chinaDomesticTransportYuan !== undefined
    || dto.chinaDomesticTransportCompanyId !== undefined;
}

export function computeChinaDomesticTransportUnlockExpiry(now = new Date()) {
  return computeUnlockExpiry(now);
}

export const CHINA_DOMESTIC_TRANSPORT_LOCKED_MESSAGE =
  'China Domestic Transport cost is locked after goods leave Yiwu';
