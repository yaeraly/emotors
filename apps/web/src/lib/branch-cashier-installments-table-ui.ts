/** Minimum column widths for Branch Cashier → Рассрочка table (px). */
export const BRANCH_CASHIER_INSTALLMENTS_INVOICE_NO_WIDTH_PX = 100;
export const BRANCH_CASHIER_INSTALLMENTS_RECEIPT_WIDTH_PX = 160;

/** Standard receipt format that should fit without truncation on desktop. */
export const BRANCH_CASHIER_INSTALLMENTS_STANDARD_RECEIPT = 'EM-20260803-00003';

/** Typical invoice number that should fit without truncation on desktop. */
export const BRANCH_CASHIER_INSTALLMENTS_STANDARD_INVOICE_NO = 'INV-000123';

export const branchCashierInstallmentsTruncatedCellClass =
  'max-w-0 overflow-hidden text-ellipsis whitespace-nowrap';

export function branchCashierInstallmentsColumnWidthClass(
  column: 'invoiceNo' | 'receipt',
): string {
  return column === 'invoiceNo'
    ? `w-[${BRANCH_CASHIER_INSTALLMENTS_INVOICE_NO_WIDTH_PX}px]`
    : `w-[${BRANCH_CASHIER_INSTALLMENTS_RECEIPT_WIDTH_PX}px]`;
}

export function branchCashierInstallmentsTruncatedTooltip(
  value: string | null | undefined,
): string | undefined {
  const normalized = value?.trim();
  if (!normalized || normalized === '—') return undefined;
  return normalized;
}

export function branchCashierInstallmentsTruncatedCellProps(value: string) {
  const tooltip = branchCashierInstallmentsTruncatedTooltip(value);
  return {
    className: branchCashierInstallmentsTruncatedCellClass,
    title: tooltip,
    tabIndex: tooltip ? 0 : undefined,
  } as const;
}
