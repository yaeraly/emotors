import { AlertType, NotificationModule, Role } from '@prisma/client';

export type NotificationRouting = {
  module: NotificationModule;
  roles: Role[];
};

export const NOTIFICATION_ROUTING: Partial<Record<AlertType, NotificationRouting>> = {
  INVENTORY_SUBMITTED: { module: NotificationModule.INVENTORY, roles: [Role.FRANCHISE_OWNER, Role.CEO, Role.OWNER] },
  INVENTORY_APPROVED: { module: NotificationModule.INVENTORY, roles: [Role.WAREHOUSE_MANAGER, Role.WAREHOUSE_OPERATOR] },
  INVENTORY_REJECTED: { module: NotificationModule.INVENTORY, roles: [Role.WAREHOUSE_MANAGER, Role.WAREHOUSE_OPERATOR] },
  BRANCH_ORDER_SUBMITTED: { module: NotificationModule.BRANCH_ORDERS, roles: [Role.HQ_SALES_MANAGER, Role.SUPPLY_CHAIN_MANAGER] },
  BRANCH_ORDER_APPROVED: { module: NotificationModule.BRANCH_ORDERS, roles: [Role.MANAGER, Role.FRANCHISE_OWNER] },
  BRANCH_ORDER_PARTIALLY_APPROVED: { module: NotificationModule.BRANCH_ORDERS, roles: [Role.MANAGER, Role.FRANCHISE_OWNER] },
  BRANCH_ORDER_REJECTED: { module: NotificationModule.BRANCH_ORDERS, roles: [Role.MANAGER, Role.FRANCHISE_OWNER] },
  PROCUREMENT_CREATED: { module: NotificationModule.PROCUREMENT, roles: [Role.CEO, Role.OWNER, Role.SUPPLY_CHAIN_MANAGER] },
  PROCUREMENT_WAITING_APPROVAL: { module: NotificationModule.PROCUREMENT, roles: [Role.CEO, Role.OWNER] },
  PROCUREMENT_STATUS_CHANGED: { module: NotificationModule.PROCUREMENT, roles: [Role.SUPPLY_CHAIN_MANAGER] },
  GOODS_ARRIVED_FROM_CHINA: { module: NotificationModule.PROCUREMENT, roles: [Role.SUPPLY_CHAIN_MANAGER, Role.WAREHOUSE_MANAGER] },
  GOODS_RECEIVED_HQ: { module: NotificationModule.WAREHOUSE, roles: [Role.CEO, Role.OWNER, Role.SUPPLY_CHAIN_MANAGER] },
  ORDER_SENT_TO_WAREHOUSE: { module: NotificationModule.WAREHOUSE, roles: [Role.WAREHOUSE_MANAGER] },
  PICKING_TASK_ASSIGNED: { module: NotificationModule.WAREHOUSE, roles: [Role.WAREHOUSE_MANAGER] },
  GOODS_SHIPPED: { module: NotificationModule.DISTRIBUTION, roles: [Role.WAREHOUSE_OPERATOR] },
  BRANCH_GOODS_RECEIVED: { module: NotificationModule.DISTRIBUTION, roles: [Role.SUPPLY_CHAIN_MANAGER] },
  DIFFERENCE_ACT_CREATED: { module: NotificationModule.DISTRIBUTION, roles: [Role.SUPPLY_CHAIN_MANAGER, Role.CEO, Role.OWNER, Role.HQ_SALES_MANAGER] },
  SHORTAGE_NEEDS_RESOLUTION: { module: NotificationModule.DISTRIBUTION, roles: [Role.SUPPLY_CHAIN_MANAGER] },
  REPLACEMENT_GOODS_SHIPPED: { module: NotificationModule.DISTRIBUTION, roles: [Role.WAREHOUSE_OPERATOR] },
  LOW_STOCK: { module: NotificationModule.WAREHOUSE, roles: [Role.SUPPLY_CHAIN_MANAGER, Role.CEO, Role.OWNER, Role.FRANCHISE_DIRECTOR] },
  OUT_OF_STOCK: { module: NotificationModule.WAREHOUSE, roles: [Role.SUPPLY_CHAIN_MANAGER, Role.CEO, Role.OWNER, Role.FRANCHISE_DIRECTOR] },
  SUPPLIER_PAYMENT_DUE: { module: NotificationModule.SUPPLIER_PAYMENT, roles: [Role.SUPPLY_CHAIN_MANAGER, Role.HQ_ACCOUNTANT, Role.FINANCE_MANAGER, Role.CEO, Role.OWNER] },
  SUPPLIER_PAYMENT_COMPLETED: { module: NotificationModule.SUPPLIER_PAYMENT, roles: [Role.SUPPLY_CHAIN_MANAGER, Role.HQ_ACCOUNTANT, Role.CEO, Role.OWNER, Role.FINANCE_MANAGER] },
  SUPPLIER_INVOICE_SENT_TO_ACCOUNTANT: { module: NotificationModule.SUPPLIER_PAYMENT, roles: [Role.HQ_ACCOUNTANT, Role.FINANCE_MANAGER, Role.CEO, Role.OWNER] },
  SUPPLIER_PAYMENT_SENT_TO_CASHIER: { module: NotificationModule.SUPPLIER_PAYMENT, roles: [Role.HQ_CASHIER, Role.SUPPLY_CHAIN_MANAGER, Role.FINANCE_MANAGER] },
  SUPPLIER_PAYMENT_RETURNED_TO_ACCOUNTANT: { module: NotificationModule.SUPPLIER_PAYMENT, roles: [Role.HQ_ACCOUNTANT, Role.FINANCE_MANAGER, Role.SUPPLY_CHAIN_MANAGER] },
  SUPPLIER_PAYMENT_PARTIALLY_PAID: { module: NotificationModule.SUPPLIER_PAYMENT, roles: [Role.SUPPLY_CHAIN_MANAGER, Role.HQ_ACCOUNTANT, Role.FINANCE_MANAGER] },
  SUPPLIER_PAYMENT_OVERPAYMENT_ATTEMPT: { module: NotificationModule.SUPPLIER_PAYMENT, roles: [Role.CEO, Role.OWNER, Role.FINANCE_MANAGER] },
  SUPPLIER_PAYMENT_REVERSAL_REQUESTED: { module: NotificationModule.SUPPLIER_PAYMENT, roles: [Role.CEO, Role.OWNER, Role.FINANCE_MANAGER, Role.HQ_ACCOUNTANT, Role.SUPPLY_CHAIN_MANAGER] },
  TRANSPORT_EXPENSE_SUBMITTED: {
    module: NotificationModule.SUPPLIER_PAYMENT,
    roles: [Role.HQ_ACCOUNTANT, Role.FINANCE_MANAGER],
  },
  TRANSPORT_EXPENSE_RETURNED: {
    module: NotificationModule.SUPPLIER_PAYMENT,
    roles: [Role.SUPPLY_CHAIN_MANAGER, Role.PROCUREMENT_MANAGER],
  },
  TRANSPORT_EXPENSE_SENT_TO_CASHIER: {
    module: NotificationModule.SUPPLIER_PAYMENT,
    roles: [Role.HQ_CASHIER, Role.FINANCE_MANAGER],
  },
  TRANSPORT_EXPENSE_PAID: {
    module: NotificationModule.SUPPLIER_PAYMENT,
    roles: [Role.SUPPLY_CHAIN_MANAGER, Role.HQ_ACCOUNTANT, Role.FINANCE_MANAGER],
  },
  CASHIER_PAYMENT_STARTED: {
    module: NotificationModule.SUPPLIER_PAYMENT,
    roles: [Role.HQ_ACCOUNTANT, Role.FINANCE_MANAGER],
  },
  CASHIER_PAYMENT_FAILED: {
    module: NotificationModule.SUPPLIER_PAYMENT,
    roles: [Role.HQ_ACCOUNTANT, Role.FINANCE_MANAGER],
  },
  PAYABLE_REQUEST_UNDER_REVIEW: {
    module: NotificationModule.SUPPLIER_PAYMENT,
    roles: [Role.SUPPLY_CHAIN_MANAGER, Role.PROCUREMENT_MANAGER, Role.FINANCE_MANAGER],
  },
  PAYABLE_REQUEST_REJECTED: {
    module: NotificationModule.SUPPLIER_PAYMENT,
    roles: [Role.SUPPLY_CHAIN_MANAGER, Role.PROCUREMENT_MANAGER, Role.FINANCE_MANAGER],
  },
  PAYABLE_REQUEST_APPROVED: {
    module: NotificationModule.SUPPLIER_PAYMENT,
    roles: [Role.SUPPLY_CHAIN_MANAGER, Role.PROCUREMENT_MANAGER, Role.FINANCE_MANAGER],
  },
  PAYMENT_RECEIVED: { module: NotificationModule.FINANCE, roles: [Role.FINANCE_MANAGER, Role.CEO, Role.OWNER] },
  BRANCH_INVOICE_CREATED: { module: NotificationModule.FINANCE, roles: [Role.SUPPLY_CHAIN_MANAGER, Role.FINANCE_MANAGER] },
  FINANCE_TRANSFER_PENDING: { module: NotificationModule.FINANCE, roles: [Role.FRANCHISE_OWNER, Role.FINANCE_MANAGER, Role.HQ_ACCOUNTANT] },
  FINANCE_TRANSFER_APPROVED: { module: NotificationModule.FINANCE, roles: [Role.ACCOUNTANT, Role.FINANCE_MANAGER] },
  FINANCE_TRANSFER_REJECTED: { module: NotificationModule.FINANCE, roles: [Role.ACCOUNTANT, Role.FINANCE_MANAGER] },
  FINANCE_TRANSFER_SENT_TO_CASHIER: {
    module: NotificationModule.FINANCE,
    roles: [Role.HQ_CASHIER, Role.FINANCE_MANAGER],
  },
  FINANCE_TRANSFER_RETURNED: {
    module: NotificationModule.FINANCE,
    roles: [Role.HQ_ACCOUNTANT, Role.FINANCE_MANAGER],
  },
  FINANCE_TRANSFER_COMPLETED: {
    module: NotificationModule.FINANCE,
    roles: [Role.HQ_ACCOUNTANT, Role.FINANCE_MANAGER, Role.CEO, Role.OWNER],
  },
  FINANCE_TRANSFER_REVERSED: {
    module: NotificationModule.FINANCE,
    roles: [Role.CEO, Role.OWNER, Role.FINANCE_MANAGER, Role.HQ_ACCOUNTANT],
  },
  FINANCE_TRANSFER_LARGE: {
    module: NotificationModule.FINANCE,
    roles: [Role.CEO, Role.OWNER, Role.FINANCE_MANAGER],
  },
  FINANCE_ACCOUNT_ASSIGNED: { module: NotificationModule.FINANCE, roles: [Role.CASHIER] },
  FINANCE_ACCOUNT_UNASSIGNED: { module: NotificationModule.FINANCE, roles: [Role.CASHIER] },
  FINANCE_INVESTMENT_RECORDED: { module: NotificationModule.FINANCE, roles: [Role.ACCOUNTANT, Role.FRANCHISE_OWNER] },
  FINANCE_SHIFT_DIFFERENCE: { module: NotificationModule.FINANCE, roles: [Role.ACCOUNTANT, Role.FRANCHISE_OWNER] },
  FINANCE_RECONCILIATION_DIFFERENCE: { module: NotificationModule.FINANCE, roles: [Role.ACCOUNTANT, Role.FRANCHISE_OWNER] },
  FINANCE_EXPENSE_PENDING: { module: NotificationModule.FINANCE, roles: [Role.FRANCHISE_OWNER, Role.FINANCE_MANAGER] },
  FINANCE_PAYMENT_ACCEPTED: { module: NotificationModule.FINANCE, roles: [Role.ACCOUNTANT, Role.FRANCHISE_OWNER] },
  BRANCH_REQUEST_NO_PRICING_POLICY: { module: NotificationModule.BRANCH_ORDERS, roles: [Role.CEO, Role.OWNER] },
  BRANCH_REQUEST_OUT_OF_STOCK: { module: NotificationModule.BRANCH_ORDERS, roles: [Role.CEO, Role.OWNER] },
  FRANCHISE_APPLICATION_NEW: { module: NotificationModule.FRANCHISE, roles: [Role.FRANCHISE_DIRECTOR, Role.CEO, Role.OWNER] },
  FRANCHISE_KPI_BELOW_TARGET: { module: NotificationModule.FRANCHISE, roles: [Role.FRANCHISE_DIRECTOR, Role.CEO, Role.OWNER] },
  FRANCHISE_BRANCH_INACTIVE: { module: NotificationModule.FRANCHISE, roles: [Role.FRANCHISE_DIRECTOR, Role.CEO, Role.OWNER] },
  FRANCHISE_REPORT_MISSING: { module: NotificationModule.FRANCHISE, roles: [Role.FRANCHISE_DIRECTOR] },
  FRANCHISE_TASK_OVERDUE: { module: NotificationModule.FRANCHISE, roles: [Role.FRANCHISE_DIRECTOR] },
  FRANCHISE_CERTIFICATE_EXPIRED: { module: NotificationModule.FRANCHISE, roles: [Role.FRANCHISE_DIRECTOR, Role.ACADEMY_DIRECTOR, Role.ACADEMY_MANAGER] },
  FRANCHISE_CRITICAL_SHORTAGE: { module: NotificationModule.FRANCHISE, roles: [Role.FRANCHISE_DIRECTOR, Role.SUPPLY_CHAIN_MANAGER] },
  HQ_B2B_SALE_SUBMITTED: { module: NotificationModule.BRANCH_ORDERS, roles: [Role.HQ_ACCOUNTANT, Role.CEO, Role.OWNER] },
  HQ_B2B_PAYMENT_CONFIRMED: { module: NotificationModule.BRANCH_ORDERS, roles: [Role.HQ_SALES_MANAGER] },
  HQ_B2B_PAYMENT_REJECTED: { module: NotificationModule.BRANCH_ORDERS, roles: [Role.HQ_SALES_MANAGER] },
  HQ_B2B_INSTALLMENT_CEO_APPROVED: { module: NotificationModule.BRANCH_ORDERS, roles: [Role.HQ_ACCOUNTANT, Role.HQ_SALES_MANAGER] },
  HQ_B2B_INSTALLMENT_CEO_REJECTED: { module: NotificationModule.BRANCH_ORDERS, roles: [Role.HQ_SALES_MANAGER] },
  HQ_B2B_SALE_WAREHOUSE_READY: { module: NotificationModule.WAREHOUSE, roles: [Role.WAREHOUSE_MANAGER] },
  HQ_B2B_PAYMENT_CORRECTION_REQUESTED: { module: NotificationModule.BRANCH_ORDERS, roles: [Role.HQ_SALES_MANAGER] },
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
    title: 'Новый заказ филиала',
    message: 'Филиал отправил новый заказ на проверку.',
  },
  BRANCH_ORDER_APPROVED: {
    title: 'Заказ подтверждён',
    message: 'Ваш заказ товаров подтверждён.',
  },
  BRANCH_ORDER_PARTIALLY_APPROVED: {
    title: 'Заказ частично подтверждён',
    message: 'Ваш заказ товаров частично подтверждён. Проверьте позиции и причины отклонения.',
  },
  BRANCH_ORDER_REJECTED: {
    title: 'Заказ отклонён',
    message: 'Ваш заказ товаров отклонён.',
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
    title: 'Заказ передан на склад HQ',
    message: 'Заказ филиала передан на склад HQ для отгрузки.',
  },
  PICKING_TASK_ASSIGNED: {
    title: 'Заказ готов к сборке',
    message: 'Поступил заказ филиала, готовый к сборке на складе HQ.',
  },
  GOODS_SHIPPED: {
    title: 'Товар отгружен филиалу',
    message: 'Товар по заказу филиала отгружен.',
  },
  BRANCH_GOODS_RECEIVED: {
    title: 'Филиал подтвердил приёмку',
    message: 'Филиал подтвердил получение товара по заказу.',
  },
  DIFFERENCE_ACT_CREATED: {
    title: 'Создан акт расхождения',
    message: 'По заказу филиала создан акт расхождения при приёмке.',
  },
  SHORTAGE_NEEDS_RESOLUTION: {
    title: 'Требуется решение по недостаче',
    message: 'По заказу филиала требуется решение по недостаче.',
  },
  REPLACEMENT_GOODS_SHIPPED: {
    title: 'Отправлена замена',
    message: 'По заказу филиала отправлена замена товара.',
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
  SUPPLIER_INVOICE_SENT_TO_ACCOUNTANT: {
    title: 'Счёт отправлен бухгалтеру',
    message: 'Supply Manager отправил счёт поставщика на решение HQ бухгалтера.',
  },
  SUPPLIER_PAYMENT_SENT_TO_CASHIER: {
    title: 'Платёж отправлен кассиру',
    message: 'HQ бухгалтер отправил платёж по закупке из Китая кассиру HQ.',
  },
  CASHIER_PAYMENT_STARTED: {
    title: 'Кассир начал оплату',
    message: 'HQ кассир начал обработку платежа.',
  },
  CASHIER_PAYMENT_FAILED: {
    title: 'Ошибка оплаты кассира',
    message: 'HQ кассир сообщил об ошибке оплаты.',
  },
  SUPPLIER_PAYMENT_RETURNED_TO_ACCOUNTANT: {
    title: 'Платёж возвращён бухгалтеру',
    message: 'HQ кассир вернул платёж бухгалтеру на исправление.',
  },
  SUPPLIER_PAYMENT_PARTIALLY_PAID: {
    title: 'Закупка частично оплачена',
    message: 'По закупке из Китая выполнена частичная оплата.',
  },
  SUPPLIER_PAYMENT_OVERPAYMENT_ATTEMPT: {
    title: 'Попытка переплаты',
    message: 'Обнаружена попытка оплатить больше утверждённой суммы.',
  },
  SUPPLIER_PAYMENT_REVERSAL_REQUESTED: {
    title: 'Сторно платежа',
    message: 'Выполнено сторнирование платежа по закупке из Китая.',
  },
  TRANSPORT_EXPENSE_SUBMITTED: {
    title: 'Transport expense awaiting accountant',
    message: 'Supply Manager submitted a transport expense for review.',
  },
  TRANSPORT_EXPENSE_RETURNED: {
    title: 'Transport expense returned',
    message: 'A transport expense was returned for correction.',
  },
  TRANSPORT_EXPENSE_SENT_TO_CASHIER: {
    title: 'Transport expense awaiting cashier',
    message: 'HQ Accountant sent a transport expense payment to cashier.',
  },
  TRANSPORT_EXPENSE_PAID: {
    title: 'Transport expense paid',
    message: 'A transport expense payment was completed.',
  },
  PAYABLE_REQUEST_UNDER_REVIEW: {
    title: 'Счёт на проверке',
    message: 'Бухгалтер HQ взял счёт на проверку.',
  },
  PAYABLE_REQUEST_REJECTED: {
    title: 'Счёт отклонён',
    message: 'Бухгалтер HQ отклонил счёт.',
  },
  PAYABLE_REQUEST_APPROVED: {
    title: 'Счёт одобрен',
    message: 'Бухгалтер HQ одобрил счёт.',
  },
  BRANCH_REQUEST_NO_PRICING_POLICY: {
    title: 'Требуется ценовая политика',
    message: 'Филиал заказал товар, для которого отсутствует ценовая политика.',
  },
  BRANCH_REQUEST_OUT_OF_STOCK: {
    title: 'Недостаточно товара на складе HQ',
    message: 'Филиал заказал товар, но на складе HQ недостаточно остатков.',
  },
  FINANCE_TRANSFER_PENDING: {
    title: 'Transfer awaiting approval',
    message: 'A finance transfer requires your approval.',
  },
  FINANCE_TRANSFER_APPROVED: {
    title: 'Transfer approved',
    message: 'A finance transfer was approved and completed.',
  },
  FINANCE_TRANSFER_REJECTED: {
    title: 'Transfer rejected',
    message: 'A finance transfer was rejected.',
  },
  FINANCE_TRANSFER_SENT_TO_CASHIER: {
    title: 'Transfer awaiting cashier',
    message: 'HQ Accountant submitted a finance account transfer for confirmation.',
  },
  FINANCE_TRANSFER_RETURNED: {
    title: 'Transfer returned',
    message: 'HQ Cashier returned a finance transfer to the accountant.',
  },
  FINANCE_TRANSFER_COMPLETED: {
    title: 'Transfer completed',
    message: 'A finance account transfer was completed.',
  },
  FINANCE_TRANSFER_REVERSED: {
    title: 'Transfer reversed',
    message: 'A completed finance transfer was reversed.',
  },
  FINANCE_TRANSFER_LARGE: {
    title: 'Large finance transfer',
    message: 'A large finance account transfer requires your attention.',
  },
  FINANCE_ACCOUNT_ASSIGNED: {
    title: 'Account assigned',
    message: 'A cash account was assigned to you.',
  },
  FINANCE_ACCOUNT_UNASSIGNED: {
    title: 'Account unassigned',
    message: 'A cash account assignment was removed.',
  },
  FINANCE_INVESTMENT_RECORDED: {
    title: 'Investment recorded',
    message: 'An owner investment was recorded.',
  },
  FINANCE_SHIFT_DIFFERENCE: {
    title: 'Cashier shift difference',
    message: 'A cashier shift closed with a cash difference.',
  },
  FINANCE_RECONCILIATION_DIFFERENCE: {
    title: 'Reconciliation difference',
    message: 'A reconciliation was completed with a balance difference.',
  },
  FINANCE_EXPENSE_PENDING: {
    title: 'Expense awaiting approval',
    message: 'An expense is waiting for approval.',
  },
  FINANCE_PAYMENT_ACCEPTED: {
    title: 'Payment accepted',
    message: 'A customer payment was accepted.',
  },
  FRANCHISE_APPLICATION_NEW: {
    title: 'New franchise application',
    message: 'A new franchise lead was submitted.',
  },
  FRANCHISE_KPI_BELOW_TARGET: {
    title: 'Branch KPI below target',
    message: 'A franchise branch KPI is below target.',
  },
  FRANCHISE_BRANCH_INACTIVE: {
    title: 'Branch inactive',
    message: 'A franchise branch has no recent activity.',
  },
  FRANCHISE_REPORT_MISSING: {
    title: 'Missing franchise report',
    message: 'A required franchise report is overdue.',
  },
  FRANCHISE_TASK_OVERDUE: {
    title: 'Franchise task overdue',
    message: 'A franchise support task is overdue.',
  },
  FRANCHISE_CERTIFICATE_EXPIRED: {
    title: 'Academy certificate expired',
    message: 'An employee academy certificate has expired.',
  },
  FRANCHISE_CRITICAL_SHORTAGE: {
    title: 'Critical franchise shortage',
    message: 'A franchise branch has critical inventory shortages.',
  },
};

export function moduleForAlertType(type: AlertType): NotificationModule {
  return NOTIFICATION_ROUTING[type]?.module ?? NotificationModule.SYSTEM;
}

export function rolesForAlertType(type: AlertType): Role[] {
  return NOTIFICATION_ROUTING[type]?.roles ?? [];
}
