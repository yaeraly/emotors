import {
  BranchDistributionOrderStatus,
  CashierShiftStatus,
  HqStockBookingStatus,
  HqWarehousePickingTaskStatus,
  InventoryCountStatus,
  SaleInstallmentApprovalStatus,
  SaleStatus,
} from '@prisma/client';

export const BRANCH_ACTIVE_DISTRIBUTION_STATUSES: BranchDistributionOrderStatus[] = [
  BranchDistributionOrderStatus.DRAFT,
  BranchDistributionOrderStatus.SUBMITTED,
  BranchDistributionOrderStatus.ACCEPTED_BY_SUPPLY_CHAIN,
  BranchDistributionOrderStatus.APPROVED,
  BranchDistributionOrderStatus.INVOICED,
  BranchDistributionOrderStatus.PAYMENT_PENDING,
  BranchDistributionOrderStatus.PAID,
  BranchDistributionOrderStatus.SENT_TO_WAREHOUSE,
  BranchDistributionOrderStatus.PICKING,
  BranchDistributionOrderStatus.PACKED,
  BranchDistributionOrderStatus.SHIPPED,
  BranchDistributionOrderStatus.DELIVERED,
  BranchDistributionOrderStatus.SENT,
  BranchDistributionOrderStatus.RECEIVED,
  BranchDistributionOrderStatus.RECEIVED_BY_BRANCH,
  BranchDistributionOrderStatus.RECEIVED_WITH_DIFFERENCE,
];

export const BRANCH_ACTIVE_SALE_STATUSES: SaleStatus[] = [
  SaleStatus.DRAFT,
  SaleStatus.SENT_TO_CUSTOMER,
  SaleStatus.APPROVED_BY_CUSTOMER,
];

export const WAREHOUSE_OUTGOING_SHIPMENT_STATUSES: BranchDistributionOrderStatus[] = [
  BranchDistributionOrderStatus.SENT_TO_WAREHOUSE,
  BranchDistributionOrderStatus.PICKING,
  BranchDistributionOrderStatus.PACKED,
  BranchDistributionOrderStatus.SHIPPED,
  BranchDistributionOrderStatus.DELIVERED,
  BranchDistributionOrderStatus.SENT,
];

export const WAREHOUSE_INCOMING_SHIPMENT_STATUSES: BranchDistributionOrderStatus[] = [
  BranchDistributionOrderStatus.SHIPPED,
  BranchDistributionOrderStatus.DELIVERED,
  BranchDistributionOrderStatus.SENT,
  BranchDistributionOrderStatus.RECEIVED,
  BranchDistributionOrderStatus.RECEIVED_BY_BRANCH,
  BranchDistributionOrderStatus.RECEIVED_WITH_DIFFERENCE,
];

export const OPEN_INVENTORY_COUNT_STATUSES: InventoryCountStatus[] = [
  InventoryCountStatus.DRAFT,
  InventoryCountStatus.COUNTING,
  InventoryCountStatus.SUBMITTED,
];

export const ACTIVE_HQ_STOCK_BOOKING_STATUSES: HqStockBookingStatus[] = [
  HqStockBookingStatus.ACTIVE,
  HqStockBookingStatus.CONFIRMED,
];

export const ACTIVE_PICKING_TASK_STATUSES: HqWarehousePickingTaskStatus[] = [
  HqWarehousePickingTaskStatus.ASSIGNED,
  HqWarehousePickingTaskStatus.PICKING,
  HqWarehousePickingTaskStatus.PACKED,
];

export const PENDING_INSTALLMENT_APPROVAL_STATUSES: SaleInstallmentApprovalStatus[] = [
  SaleInstallmentApprovalStatus.PENDING_APPROVAL,
];

export const USER_INACTIVE_LOGIN_MESSAGE = 'Аккаунт деактивирован. Вход недоступен.';

export const BRANCH_WAREHOUSE_DELETE_BLOCKED_MESSAGE =
  'Складды өчүрүүгө болбойт. Складда товар же активдүү операциялар бар.';

export const USER_DELETE_SELF_MESSAGE = 'Өзүңүздүн активдүү аккаунтуңузду өчүрүүгө болбойт.';

export const USER_DELETE_LAST_CEO_MESSAGE =
  'Системада жок дегенде бир активдүү HQ CEO калышы керек.';

export const USER_DELETE_ACTIVE_OPERATIONS_MESSAGE =
  'Колдонуучуда активдүү операциялар бар. Адегенде аларды башка кызматкерге өткөрүңүз.';
