import {
  BranchDistributionOrderStatus,
  CashierShiftStatus,
  HqStockBookingStatus,
  HqWarehousePickingTaskStatus,
  InventoryCountStatus,
  SaleInstallmentApprovalStatus,
  SaleStatus,
} from '@prisma/client';

/** Genuinely open branch distribution orders — excludes completed/received/cancelled history. */
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
];

export const BRANCH_ACTIVE_SALE_STATUSES: SaleStatus[] = [
  SaleStatus.DRAFT,
  SaleStatus.SENT_TO_CUSTOMER,
  SaleStatus.WAITING_FOR_CASHIER_PAYMENT,
];

export const BRANCH_DELETE_MONEY_TOLERANCE = 0.01;

export const BRANCH_ACTIVE_SERVICE_ORDER_STATUSES = [
  'NEW',
  'DRAFT',
  'DIAGNOSIS',
  'IN_REPAIR',
  'IN_PROGRESS',
  'WAITING_PARTS',
  'READY_FOR_PAYMENT',
] as const;

export const BRANCH_ACTIVE_FINANCE_TRANSFER_STATUSES = [
  'DRAFT',
  'PENDING',
  'PENDING_CASHIER',
  'RETURNED',
  'APPROVED',
] as const;

export const WAREHOUSE_OUTGOING_SHIPMENT_STATUSES: BranchDistributionOrderStatus[] = [
  BranchDistributionOrderStatus.SENT_TO_WAREHOUSE,
  BranchDistributionOrderStatus.PICKING,
  BranchDistributionOrderStatus.PACKED,
  BranchDistributionOrderStatus.SHIPPED,
  BranchDistributionOrderStatus.DELIVERED,
  BranchDistributionOrderStatus.SENT,
];

/** In-flight incoming shipments — excludes received/completed branch-side history. */
export const WAREHOUSE_INCOMING_SHIPMENT_STATUSES: BranchDistributionOrderStatus[] = [
  BranchDistributionOrderStatus.SHIPPED,
  BranchDistributionOrderStatus.DELIVERED,
  BranchDistributionOrderStatus.SENT,
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
  'Складды өчүрүүгө болбойт. Складда товар калдыгы же бүтө элек операциялар бар.';

export const BRANCH_WAREHOUSE_DELETE_SUCCESS_MESSAGE = 'Филиалдын склады ийгиликтүү өчүрүлдү.';

export const USER_DELETE_SELF_MESSAGE = 'Өзүңүздүн активдүү аккаунтуңузду өчүрүүгө болбойт.';

export const USER_DELETE_LAST_CEO_MESSAGE =
  'Системада жок дегенде бир активдүү HQ CEO калышы керек.';

export const USER_DELETE_ACTIVE_OPERATIONS_MESSAGE =
  'Колдонуучуда активдүү операциялар бар. Адегенде аларды башка кызматкерге өткөрүңүз.';

export const BRANCH_PERMANENT_DELETE_HISTORY_MESSAGE =
  'Постоянное удаление филиала невозможно: есть связанные бизнес-данные. Сначала завершите или перенесите операции.';

export const WAREHOUSE_PERMANENT_DELETE_HISTORY_MESSAGE =
  'Постоянное удаление склада невозможно: есть история складских операций.';

export const BRANCH_PERMANENT_DELETE_USERS_MESSAGE =
  'Постоянное удаление филиала невозможно: в филиале есть пользователи. Сначала удалите или перенесите их.';

export const USER_PERMANENT_DELETE_HISTORY_MESSAGE =
  'Постоянное удаление пользователя невозможно: есть история операций. Пользователь будет деактивирован.';
