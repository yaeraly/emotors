import type { ModuleSectionLink } from '@/components/ModuleSectionNav';

export const warehouseHubSections: ModuleSectionLink[] = [
  { href: '/hq-warehouses', labelKey: 'scm.hub.warehouse.hqWarehouses' },
  { href: '/branch-warehouses', labelKey: 'scm.hub.warehouse.branchWarehouses' },
  { href: '/product-master', labelKey: 'scm.hub.warehouse.productMaster' },
  { href: '/inventory/count', labelKey: 'scm.hub.warehouse.stocktake' },
  { href: '/stock-movements', labelKey: 'scm.hub.warehouse.movements' },
];

export const hqWarehouseHubSections: ModuleSectionLink[] = [
  { href: '/hq-warehouses', labelKey: 'scm.hub.hqWarehouses.list' },
  { href: '/procurement/orders', labelKey: 'scm.hub.hqWarehouses.receiving' },
  { href: '/hq-warehouses', labelKey: 'scm.hub.hqWarehouses.balances' },
  { href: '/supply-chain/transfers', labelKey: 'scm.hub.hqWarehouses.transfers' },
  { href: '/hq-warehouses', labelKey: 'scm.hub.hqWarehouses.history' },
];

export const distributionHubSections: ModuleSectionLink[] = [
  { href: '/branch-purchase-requests', labelKey: 'scm.hub.distribution.branchOrders' },
  { href: '/distribution/orders', labelKey: 'scm.hub.distribution.shipmentOrders' },
  { href: '/distribution/picking-tasks', labelKey: 'distribution.pickingTasks' },
  { href: '/distribution/invoices', labelKey: 'distribution.invoices' },
  { href: '/distribution/receivings', labelKey: 'scm.hub.distribution.branchReceiving' },
  { href: '/distribution/shortage-reports', labelKey: 'scm.hub.distribution.shortageActs' },
];

export const scmDistributionHubSections: ModuleSectionLink[] = [
  { href: '/distribution/orders', labelKey: 'scm.hub.distribution.shipmentOrders' },
  { href: '/distribution/invoices', labelKey: 'distribution.invoices' },
  { href: '/distribution/receivings', labelKey: 'scm.hub.distribution.branchReceiving' },
  { href: '/distribution/shortage-reports', labelKey: 'scm.hub.distribution.shortageActs' },
];

export const hqSalesDistributionHubSections: ModuleSectionLink[] = [
  { href: '/branch-purchase-requests', labelKey: 'scm.hub.distribution.branchOrders' },
  { href: '/distribution/orders', labelKey: 'scm.hub.distribution.shipmentOrders' },
  { href: '/distribution/invoices', labelKey: 'distribution.invoices' },
  { href: '/distribution/receivings', labelKey: 'scm.hub.distribution.branchReceiving' },
  { href: '/distribution/shortage-reports', labelKey: 'scm.hub.distribution.shortageActs' },
];

export const hqCashierDistributionHubSections: ModuleSectionLink[] = [
  { href: '/distribution/invoices', labelKey: 'distribution.invoices' },
  { href: '/distribution/branch-balances', labelKey: 'distribution.branchBalances' },
  { href: '/distribution/orders', labelKey: 'distribution.orders' },
];

export const warehouseManagerHqHubSections: ModuleSectionLink[] = [
  { href: '/procurement/orders', labelKey: 'scm.hub.hqWarehouses.receiving' },
  { href: '/hq-warehouses', labelKey: 'scm.hub.hqWarehouses.balances' },
  { href: '/distribution/orders', labelKey: 'scm.hub.hqWarehouses.transfers' },
  { href: '/hq-warehouses', labelKey: 'scm.hub.hqWarehouses.history' },
];

export const warehouseManagerDistributionHubSections: ModuleSectionLink[] = [
  { href: '/distribution/picking-tasks', labelKey: 'wm.hub.distribution.pickingTasks' },
  { href: '/distribution/picking-tasks', labelKey: 'wm.hub.distribution.packing' },
  { href: '/distribution/orders', labelKey: 'wm.hub.distribution.shipping' },
  { href: '/distribution/orders', labelKey: 'wm.hub.distribution.shippedOrders' },
  { href: '/distribution/shortage-reports', labelKey: 'scm.hub.distribution.shortageActs' },
];

export const supplyChainHubSections: ModuleSectionLink[] = [
  { href: '/procurement/shipments', labelKey: 'scm.hub.supplyChain.logistics' },
  { href: '/procurement/orders', labelKey: 'scm.hub.supplyChain.statuses' },
  { href: '/procurement/suppliers', labelKey: 'scm.hub.supplyChain.suppliers' },
  { href: '/procurement/factories', labelKey: 'scm.hub.supplyChain.factories' },
  { href: '/procurement/transport-companies', labelKey: 'scm.hub.supplyChain.transportCompanies' },
  { href: '/supply-chain/forecast', labelKey: 'scm.hub.supplyChain.deadlines' },
];

export const alertsHubSections: ModuleSectionLink[] = [
  { href: '/notifications', labelKey: 'scm.hub.alerts.all' },
  { href: '/notifications?status=UNREAD', labelKey: 'scm.hub.alerts.unread' },
  { href: '/procurement/orders', labelKey: 'scm.hub.alerts.overdueOrders' },
  { href: '/inventory', labelKey: 'scm.hub.alerts.lowStock' },
  { href: '/supply-chain', labelKey: 'scm.hub.alerts.deliveryDelay' },
];
