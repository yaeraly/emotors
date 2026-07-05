import { AlertType, NotificationModule, Role } from '@prisma/client';

export type NotificationRouting = {
  module: NotificationModule;
  roles: Role[];
};

export const NOTIFICATION_ROUTING: Partial<Record<AlertType, NotificationRouting>> = {
  INVENTORY_SUBMITTED: { module: NotificationModule.INVENTORY, roles: [Role.CEO, Role.OWNER] },
  INVENTORY_APPROVED: { module: NotificationModule.INVENTORY, roles: [Role.WAREHOUSE_MANAGER] },
  INVENTORY_REJECTED: { module: NotificationModule.INVENTORY, roles: [Role.WAREHOUSE_MANAGER] },
  BRANCH_ORDER_SUBMITTED: { module: NotificationModule.BRANCH_ORDERS, roles: [Role.SUPPLY_CHAIN_MANAGER] },
  PROCUREMENT_CREATED: { module: NotificationModule.PROCUREMENT, roles: [Role.CEO, Role.OWNER, Role.SUPPLY_CHAIN_MANAGER] },
  PROCUREMENT_WAITING_APPROVAL: { module: NotificationModule.PROCUREMENT, roles: [Role.CEO, Role.OWNER] },
  PROCUREMENT_STATUS_CHANGED: { module: NotificationModule.PROCUREMENT, roles: [Role.SUPPLY_CHAIN_MANAGER] },
  GOODS_ARRIVED_FROM_CHINA: { module: NotificationModule.PROCUREMENT, roles: [Role.SUPPLY_CHAIN_MANAGER, Role.WAREHOUSE_MANAGER] },
  GOODS_RECEIVED_HQ: { module: NotificationModule.WAREHOUSE, roles: [Role.CEO, Role.OWNER, Role.SUPPLY_CHAIN_MANAGER] },
  ORDER_SENT_TO_WAREHOUSE: { module: NotificationModule.WAREHOUSE, roles: [Role.WAREHOUSE_MANAGER] },
  PICKING_TASK_ASSIGNED: { module: NotificationModule.WAREHOUSE, roles: [Role.WAREHOUSE_MANAGER] },
  GOODS_SHIPPED: { module: NotificationModule.DISTRIBUTION, roles: [Role.WAREHOUSE_OPERATOR] },
  BRANCH_GOODS_RECEIVED: { module: NotificationModule.DISTRIBUTION, roles: [Role.SUPPLY_CHAIN_MANAGER] },
  DIFFERENCE_ACT_CREATED: { module: NotificationModule.DISTRIBUTION, roles: [Role.SUPPLY_CHAIN_MANAGER, Role.CEO, Role.OWNER] },
  SHORTAGE_NEEDS_RESOLUTION: { module: NotificationModule.DISTRIBUTION, roles: [Role.SUPPLY_CHAIN_MANAGER] },
  REPLACEMENT_GOODS_SHIPPED: { module: NotificationModule.DISTRIBUTION, roles: [Role.WAREHOUSE_OPERATOR] },
  LOW_STOCK: { module: NotificationModule.WAREHOUSE, roles: [Role.SUPPLY_CHAIN_MANAGER, Role.CEO, Role.OWNER] },
  OUT_OF_STOCK: { module: NotificationModule.WAREHOUSE, roles: [Role.SUPPLY_CHAIN_MANAGER, Role.CEO, Role.OWNER] },
  SUPPLIER_PAYMENT_DUE: { module: NotificationModule.SUPPLIER_PAYMENT, roles: [Role.SUPPLY_CHAIN_MANAGER, Role.FINANCE_MANAGER, Role.CEO, Role.OWNER] },
  SUPPLIER_PAYMENT_COMPLETED: { module: NotificationModule.SUPPLIER_PAYMENT, roles: [Role.CEO, Role.OWNER, Role.FINANCE_MANAGER] },
  PAYMENT_RECEIVED: { module: NotificationModule.FINANCE, roles: [Role.FINANCE_MANAGER, Role.CEO, Role.OWNER] },
  BRANCH_INVOICE_CREATED: { module: NotificationModule.FINANCE, roles: [Role.SUPPLY_CHAIN_MANAGER, Role.FINANCE_MANAGER] },
};

export const DEFAULT_NOTIFICATION_COPY: Partial<Record<AlertType, { title: string; message: string }>> = {
  INVENTORY_SUBMITTED: {
    title: 'Inventory Waiting for Approval',
    message: 'Warehouse Manager submitted a new inventory for approval.',
  },
  INVENTORY_APPROVED: {
    title: 'Inventory Approved',
    message: 'CEO approved the inventory count session.',
  },
  INVENTORY_REJECTED: {
    title: 'Inventory Rejected',
    message: 'CEO rejected the inventory count session.',
  },
  BRANCH_ORDER_SUBMITTED: {
    title: 'New Branch Order',
    message: 'A branch submitted a new purchase request.',
  },
  PROCUREMENT_CREATED: {
    title: 'Procurement Order Created',
    message: 'A new China procurement order was created.',
  },
  PROCUREMENT_WAITING_APPROVAL: {
    title: 'Procurement Waiting Approval',
    message: 'A procurement order is waiting for CEO approval.',
  },
  PROCUREMENT_STATUS_CHANGED: {
    title: 'Procurement Status Changed',
    message: 'A procurement order status was updated.',
  },
  GOODS_ARRIVED_FROM_CHINA: {
    title: 'Goods Arrived from China',
    message: 'Procurement goods arrived and are ready for processing.',
  },
  GOODS_RECEIVED_HQ: {
    title: 'Goods Received at HQ',
    message: 'Goods were received into the HQ warehouse.',
  },
  ORDER_SENT_TO_WAREHOUSE: {
    title: 'Order Sent to Warehouse',
    message: 'A branch distribution order was assigned to the warehouse.',
  },
  PICKING_TASK_ASSIGNED: {
    title: 'Picking Task Assigned',
    message: 'A new picking task is ready in the warehouse.',
  },
  GOODS_SHIPPED: {
    title: 'Goods Shipped to Branch',
    message: 'Goods were shipped to a branch.',
  },
  BRANCH_GOODS_RECEIVED: {
    title: 'Branch Confirmed Receiving',
    message: 'A branch confirmed goods receiving.',
  },
  DIFFERENCE_ACT_CREATED: {
    title: 'Difference Act Created',
    message: 'A difference act was created for a shipment.',
  },
  SHORTAGE_NEEDS_RESOLUTION: {
    title: 'Shortage Detected',
    message: 'A shortage report needs resolution.',
  },
  REPLACEMENT_GOODS_SHIPPED: {
    title: 'Replacement Shipment Created',
    message: 'Replacement goods were shipped to a branch.',
  },
  LOW_STOCK: {
    title: 'Low Stock Alert',
    message: 'Product stock fell below the minimum level.',
  },
  SUPPLIER_PAYMENT_DUE: {
    title: 'Supplier Payment Due',
    message: 'A supplier payment is due for a procurement order.',
  },
  SUPPLIER_PAYMENT_COMPLETED: {
    title: 'Supplier Payment Completed',
    message: 'A supplier payment was completed.',
  },
};

export function moduleForAlertType(type: AlertType): NotificationModule {
  return NOTIFICATION_ROUTING[type]?.module ?? NotificationModule.SYSTEM;
}

export function rolesForAlertType(type: AlertType): Role[] {
  return NOTIFICATION_ROUTING[type]?.roles ?? [];
}
