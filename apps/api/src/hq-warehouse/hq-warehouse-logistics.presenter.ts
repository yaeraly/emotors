export function sanitizeHqWarehouseDashboard(stats: Record<string, unknown>) {
  const {
    totalInventoryValueKgs: _totalInventoryValueKgs,
    ...rest
  } = stats;
  return rest;
}

export function sanitizeHqWarehouseInventoryRow(row: {
  id: string;
  warehouseId: string;
  productId: string;
  product: { id: string; name: string; sku: string; unit: string; isActive: boolean };
  sku: string;
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  lastReceivingAt: Date | null;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    warehouseId: row.warehouseId,
    productId: row.productId,
    product: row.product,
    sku: row.sku,
    quantity: row.quantity,
    reservedQuantity: row.reservedQuantity,
    availableQuantity: row.availableQuantity,
    lastReceivingAt: row.lastReceivingAt,
    updatedAt: row.updatedAt,
  };
}

export function sanitizeHqWarehouseTransferOrder(order: any) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    branchId: order.branchId,
    branch: order.branch ? { id: order.branch.id, name: order.branch.name, code: order.branch.code } : order.branch,
    sourceWarehouseId: order.sourceWarehouseId,
    destinationWarehouseId: order.destinationWarehouseId,
    destinationWarehouse: order.destinationWarehouse,
    status: order.status,
    sentAt: order.sentAt,
    createdAt: order.createdAt,
    transportCompany: order.transportCompany,
    driverName: order.driverName,
    vehicleNumber: order.vehicleNumber,
    transportNotes: order.transportNotes,
    totalShipmentWeightKg: order.totalShipmentWeightKg != null ? Number(order.totalShipmentWeightKg) : null,
    items: (order.items ?? []).map((item: any) => ({
      id: item.id,
      productId: item.productId,
      sku: item.sku,
      productName: item.productName,
      quantity: item.quantity,
      dispatchedQuantity: item.dispatchedQuantity ?? item.quantity,
      unitWeightKg: item.unitWeightKgSnapshot != null ? Number(item.unitWeightKgSnapshot) : null,
      lineWeightKg: item.lineWeightKgSnapshot != null ? Number(item.lineWeightKgSnapshot) : null,
    })),
  };
}
