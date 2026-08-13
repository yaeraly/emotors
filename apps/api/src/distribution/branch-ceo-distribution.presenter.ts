/** Strip HQ-internal cost and margin fields from distribution payloads for Branch CEO. */
export function sanitizeDistributionOrderForBranchCeo(order: Record<string, unknown>) {
  const items = Array.isArray(order.items)
    ? order.items.map((item: Record<string, unknown>) => ({
        id: item.id,
        orderId: item.orderId,
        productId: item.productId,
        sku: item.sku,
        productName: item.productName,
        quantity: item.quantity,
        dispatchedQuantity: item.dispatchedQuantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        unitWeightKg: item.unitWeightKg,
        lineWeightKg: item.lineWeightKg,
        product: item.product,
      }))
    : order.items;

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    branchId: order.branchId,
    branch: order.branch,
    sourceWarehouseId: order.sourceWarehouseId,
    sourceWarehouse: order.sourceWarehouse,
    destinationWarehouseId: order.destinationWarehouseId,
    destinationWarehouse: order.destinationWarehouse,
    status: order.status,
    note: order.note,
    sentAt: order.sentAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    transportCompany: order.transportCompany,
    driverName: order.driverName,
    vehicleNumber: order.vehicleNumber,
    transportNotes: order.transportNotes,
    transportCostKgs: order.transportCostKgs,
    totalShipmentWeightKg: order.totalShipmentWeightKg,
    shipmentWeightSummary: order.shipmentWeightSummary,
    totalAmount: order.totalAmount,
    items,
    branchInvoice: order.branchInvoice,
    goodsReceivings: order.goodsReceivings,
    pickingTask: order.pickingTask,
  };
}
