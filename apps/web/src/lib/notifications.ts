export type NotificationItem = {
  id: string;
  type: string;
  module?: string | null;
  title: string;
  message: string;
  status: 'UNREAD' | 'READ' | 'RESOLVED' | 'ARCHIVED';
  entityType?: string | null;
  entityId?: string | null;
  referenceNumber?: string | null;
  createdAt: string;
};

export function notificationHref(alert: NotificationItem): string | null {
  if (alert.entityType === 'InventoryCountSession' && alert.entityId) {
    return `/inventory/count/${alert.entityId}`;
  }
  if (alert.entityType === 'BranchDistributionOrder' && alert.entityId) {
    return `/distribution/orders/${alert.entityId}`;
  }
  if (alert.entityType === 'BranchInvoice' && alert.entityId) {
    return `/distribution/invoices/${alert.entityId}`;
  }
  if (alert.entityType === 'ShortageReport' && alert.entityId) {
    return `/distribution/shortage-reports/${alert.entityId}`;
  }
  if (alert.entityType === 'BranchPurchaseRequest' && alert.entityId) {
    return `/branch-purchase-requests/${alert.entityId}`;
  }
  if (alert.entityType === 'BranchRequestIssue' && alert.entityId) {
    if (alert.type === 'BRANCH_REQUEST_NO_PRICING_POLICY') {
      return '/branch-request-issues';
    }
    return '/branch-request-issues';
  }
  if (alert.entityType === 'SupplyInquiry' && alert.entityId) {
    return '/supply-inquiries';
  }
  if (alert.entityType === 'ProcurementOrder' && alert.entityId) {
    return `/procurement/orders/${alert.entityId}`;
  }
  if (alert.entityType === 'Product' && alert.entityId) {
    return `/products/${alert.entityId}`;
  }
  if (alert.type === 'BRANCH_REQUEST_NO_PRICING_POLICY') {
    return '/branch-request-issues';
  }
  if (alert.type === 'BRANCH_REQUEST_OUT_OF_STOCK') {
    return '/branch-request-issues';
  }
  if (alert.type === 'SUPPLY_INQUIRY_CREATED') {
    return '/supply-inquiries';
  }
  if (alert.type === 'SUPPLY_INQUIRY_RESPONDED') {
    return '/branch-request-issues';
  }
  if (alert.type === 'LOW_STOCK' || alert.type === 'OUT_OF_STOCK') {
    return '/inventory';
  }
  return null;
}

export function notificationModuleIcon(module?: string | null) {
  switch (module) {
    case 'INVENTORY':
      return '📋';
    case 'PROCUREMENT':
      return '🛒';
    case 'WAREHOUSE':
      return '🏭';
    case 'DISTRIBUTION':
      return '🚚';
    case 'FINANCE':
      return '💰';
    case 'SUPPLIER_PAYMENT':
      return '💳';
    case 'BRANCH_ORDERS':
      return '🏪';
    default:
      return '🔔';
  }
}
