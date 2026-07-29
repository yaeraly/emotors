export function assertBranchPurchaseBranchContext(branchId: string | null | undefined) {
  if (!branchId) {
    throw new Error('Branch context is required for branch product orders');
  }
  return branchId;
}

export function assertBranchPurchaseRequestItems(items: unknown) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('At least one product line is required');
  }
  for (const item of items) {
    if (!item?.productId) {
      throw new Error('Заявка должна ссылаться на существующий товар');
    }
    const quantity = Number(item.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error('Quantity must be a positive number');
    }
  }
}
