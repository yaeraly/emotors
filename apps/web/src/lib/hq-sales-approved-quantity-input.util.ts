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

export function validateApprovedQuantityForApprove(
  t: (key: string) => string,
  item: { quantity: number },
  approvedQuantity: ApprovedQuantityInput,
): string | null {
  const qty = parseApprovedQuantityInput(approvedQuantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    return t('branchProductRequest.approvedQuantityRequired');
  }
  if (qty > item.quantity) {
    return t('branchProductRequest.approvedQuantityExceedsRequested');
  }
  return null;
}
