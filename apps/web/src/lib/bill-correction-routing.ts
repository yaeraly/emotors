export type BillCorrectionRouting = {
  direction: 'FROM_CASHIER' | 'TO_SUPPLY_MANAGER';
  userId?: string;
  userName?: string;
  userLogin?: string;
};

export function formatBillCorrectionRoutingAssignee(
  routing: BillCorrectionRouting,
  roleLabel: string,
): string {
  const identity = routing.userName?.trim() || routing.userLogin?.trim();
  return identity ? `${roleLabel} — ${identity}` : roleLabel;
}
