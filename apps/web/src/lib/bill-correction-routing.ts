export type BillCorrectionRouting = {
  direction: 'FROM_HQ_CASHIER' | 'TO_SUPPLY_MANAGER';
  employeeName?: string;
  employeeLogin?: string;
};

export function formatBillCorrectionRoutingAssignee(
  routing: BillCorrectionRouting,
  roleLabel: string,
): string {
  const identity = routing.employeeName?.trim() || routing.employeeLogin?.trim();
  return identity ? `${roleLabel} — ${identity}` : roleLabel;
}
