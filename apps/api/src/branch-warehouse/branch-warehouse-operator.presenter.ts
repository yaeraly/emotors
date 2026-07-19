import { BranchPurchaseRequestStatus } from '@prisma/client';
import { resolveBranchDisplayStatus } from '../operations/branch-purchase-request.presenter';

export function sanitizeBranchWarehouseRequest<T extends {
  id: string;
  requestNumber: string;
  status: BranchPurchaseRequestStatus;
  createdAt: Date | string;
  convertedOrderId?: string | null;
  items: Array<{
    quantity: number;
    approvedQuantity?: number | null;
    lineStatus?: string | null;
  }>;
  convertedOrder?: {
    orderNumber?: string;
    status?: string;
    sentAt?: Date | string | null;
    items?: Array<{ quantity: number }>;
    goodsReceivings?: Array<{ items?: Array<{ receivedQuantity: number }> }>;
  } | null;
}>(request: T) {
  const totalQuantity = request.items.reduce((sum, item) => sum + item.quantity, 0);
  const approvedQuantity = request.items.reduce(
    (sum, item) => sum + Number(item.approvedQuantity ?? 0),
    0,
  );
  const sentQuantity =
    request.convertedOrder?.items?.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0) ?? 0;
  const receivedQuantity =
    request.convertedOrder?.goodsReceivings?.reduce(
      (sum, receiving) =>
        sum +
        (receiving.items?.reduce((lineSum, line) => lineSum + Number(line.receivedQuantity ?? 0), 0) ?? 0),
      0,
    ) ?? 0;

  return {
    id: request.id,
    requestNumber: request.requestNumber,
    status: request.status,
    branchDisplayStatus: resolveBranchDisplayStatus(request.status, request.items),
    createdAt: request.createdAt,
    itemCount: request.items.length,
    totalQuantity,
    approvedQuantity,
    sentQuantity,
    receivedQuantity,
    orderNumber: request.convertedOrder?.orderNumber ?? null,
    orderId: request.convertedOrderId ?? null,
    orderStatus: request.convertedOrder?.status ?? null,
  };
}

export function sanitizeBranchWarehouseRequestDetail(request: {
  id: string;
  requestNumber: string;
  status: BranchPurchaseRequestStatus;
  createdAt: Date | string;
  convertedOrderId?: string | null;
  note?: string | null;
  items: Array<{
    id: string;
    productId: string;
    sku: string;
    productName: string;
    quantity: number;
    approvedQuantity?: number | null;
    lineStatus?: string | null;
    unit: string;
    note?: string | null;
  }>;
  convertedOrder?: {
    orderNumber?: string;
    status?: string;
    sentAt?: Date | string | null;
    items?: Array<{ quantity: number }>;
    goodsReceivings?: Array<{ items?: Array<{ receivedQuantity: number }> }>;
  } | null;
}) {
  return {
    ...sanitizeBranchWarehouseRequest(request),
    note: request.note ?? null,
    items: request.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      sku: item.sku,
      productName: item.productName,
      quantity: item.quantity,
      approvedQuantity: item.approvedQuantity ?? null,
      lineStatus: item.lineStatus ?? null,
      unit: item.unit,
      note: item.note ?? null,
    })),
  };
}

export function sanitizeBranchWarehouseStockRow(balance: {
  id: string;
  productId: string;
  quantity: number;
  reservedQuantity: number;
  lastReceivingAt: Date | null;
  product: {
    name: string;
    sku: string;
    unit: string;
    minStockLevel?: number;
    isActive?: boolean;
    productCategory?: { nameRu?: string | null } | null;
    category?: string | null;
  };
}) {
  const availableQuantity = Math.max(balance.quantity - balance.reservedQuantity, 0);
  const categoryName = balance.product.productCategory?.nameRu ?? balance.product.category ?? null;
  const minStockLevel = balance.product.minStockLevel ?? 0;
  const stockStatus =
    balance.quantity <= 0 ? 'OUT_OF_STOCK' : balance.quantity <= minStockLevel ? 'LOW_STOCK' : 'IN_STOCK';

  return {
    id: balance.id,
    productId: balance.productId,
    productCode: balance.product.sku,
    productName: balance.product.name,
    category: categoryName,
    quantityOnHand: balance.quantity,
    reservedQuantity: balance.reservedQuantity,
    availableQuantity,
    unit: balance.product.unit,
    lastReceiptDate: balance.lastReceivingAt,
    minStockLevel,
    stockStatus,
  };
}
