/** Editable Утв. value; empty string while the user clears/types (never auto-coerced to 0). */
export type ApprovedQuantityInput = number | '';

/** Parse editable Утв. input; empty string is not coerced to 0. */
export function parseApprovedQuantityInput(value: ApprovedQuantityInput | null | undefined): number {
  if (value === '' || value == null) return Number.NaN;
  return Number(value);
}

export function approvedQuantityInputValue(value: ApprovedQuantityInput): string | number {
  return value === '' ? '' : value;
}

export function parseApprovedQuantityChange(raw: string): ApprovedQuantityInput {
  if (raw === '') return '';
  const qty = Number(raw);
  return Number.isFinite(qty) ? qty : '';
}

/** Same limit as backend approval: general HQ available + active booking for this line. */
export function resolveHqAvailableForApprovalLine(item: {
  availableForThisRequest?: number | null;
  hqAvailableStock?: number | null;
  bookedQuantity?: number | null;
}): number {
  return item.availableForThisRequest ?? (item.hqAvailableStock ?? 0) + (item.bookedQuantity ?? 0);
}

export function formatApprovedQuantityExceedsHqAvailableMessage(
  t: (key: string) => string,
  hqAvailable: number,
): string {
  return t('branchProductRequest.approvedQuantityExceedsHqAvailable').replace(
    '{{hqAvailable}}',
    String(hqAvailable),
  );
}

export function validateApprovedQuantityForApprove(
  t: (key: string) => string,
  item: { quantity: number },
  approvedQuantity: ApprovedQuantityInput,
  hqAvailable: number,
): string | null {
  const qty = parseApprovedQuantityInput(approvedQuantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    return t('branchProductRequest.approvedQuantityRequired');
  }
  if (qty > item.quantity) {
    return t('branchProductRequest.approvedQuantityExceedsRequested');
  }
  if (qty > hqAvailable) {
    return formatApprovedQuantityExceedsHqAvailableMessage(t, hqAvailable);
  }
  return null;
}
