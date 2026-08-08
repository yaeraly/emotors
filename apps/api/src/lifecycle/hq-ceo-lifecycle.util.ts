import { ForbiddenException } from '@nestjs/common';
import {
  BranchStatus,
  FranchiseSupportTaskStatus,
  InventoryCountStatus,
  Prisma,
  Role,
  SaleStatus,
  UserStatus,
} from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth.types';
import { resolveUserRoles } from '../rbac/rbac';
import {
  ACTIVE_HQ_STOCK_BOOKING_STATUSES,
  ACTIVE_PICKING_TASK_STATUSES,
  BRANCH_ACTIVE_DISTRIBUTION_STATUSES,
  BRANCH_ACTIVE_FINANCE_TRANSFER_STATUSES,
  BRANCH_ACTIVE_SALE_STATUSES,
  BRANCH_ACTIVE_SERVICE_ORDER_STATUSES,
  BRANCH_DELETE_MONEY_TOLERANCE,
  OPEN_INVENTORY_COUNT_STATUSES,
  PENDING_INSTALLMENT_APPROVAL_STATUSES,
  WAREHOUSE_INCOMING_SHIPMENT_STATUSES,
  WAREHOUSE_OUTGOING_SHIPMENT_STATUSES,
} from './hq-ceo-lifecycle.constants';

type Tx = Prisma.TransactionClient;

export function canHqCeoManageLifecycle(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  const roles = resolveUserRoles(user);
  return roles.includes(Role.CEO);
}

export function assertCanHqCeoManageLifecycle(user: AuthUser) {
  if (!canHqCeoManageLifecycle(user)) {
    throw new ForbiddenException('Only HQ CEO can perform this action');
  }
}

export type BranchDeleteBlockers = {
  branchId: string;
  branchCode: string | null;
  stockQty: number;
  reservedQty: number;
  negativeStockQty: number;
  inventoryValue: number;
  accountBalance: number;
  openSales: number;
  openServiceOrders: number;
  openBranchOrders: number;
  openInstallments: number;
  unpaidReceivables: number;
  unpaidPayables: number;
  openTransfers: number;
  openInventorySessions: number;
  activeEmployees: number;
  openCashShifts: number;
  activeStockBookings: number;
  otherBlockingRecords: string[];
};

/** @deprecated Use BranchDeleteBlockers — kept for warehouse delete responses. */
export type BranchDeleteBlockingReasons = BranchDeleteBlockers;

export type WarehouseDeleteBlockingReasons = {
  productCount: number;
  availableQuantity: number;
  reservedQuantity: number;
  fifoQuantity: number;
  activeShipmentIds: string[];
  activeOrderIds: string[];
  openInventoryCountIds: string[];
  reservationIds: string[];
};

export async function assessBranchWarehouseDeleteBlocking(tx: Tx, warehouseId: string) {
  const balances = await tx.inventoryBalance.findMany({
    where: { warehouseId },
    select: { productId: true, quantity: true, reservedQuantity: true },
  });

  const totalQuantity = balances.reduce((sum, row) => sum + row.quantity, 0);
  const reservedQuantity = balances.reduce((sum, row) => sum + row.reservedQuantity, 0);
  const availableQuantity = Math.max(totalQuantity - reservedQuantity, 0);
  const productCount = new Set(balances.filter((row) => row.quantity > 0).map((row) => row.productId)).size;

  const fifoAggregate = await tx.fifoInventoryBatch.aggregate({
    where: { warehouseId },
    _sum: { remainingQuantity: true },
  });
  const fifoQuantity = fifoAggregate._sum.remainingQuantity ?? 0;

  const outgoingShipments = await tx.branchDistributionOrder.findMany({
    where: {
      deletedAt: null,
      sourceWarehouseId: warehouseId,
      status: { in: WAREHOUSE_OUTGOING_SHIPMENT_STATUSES },
    },
    select: { id: true },
    take: 50,
  });

  const incomingShipments = await tx.branchDistributionOrder.findMany({
    where: {
      deletedAt: null,
      destinationWarehouseId: warehouseId,
      status: { in: WAREHOUSE_INCOMING_SHIPMENT_STATUSES },
    },
    select: { id: true },
    take: 50,
  });

  const openInventoryCounts = await tx.inventoryCountSession.findMany({
    where: {
      warehouseId,
      deletedAt: null,
      status: { in: OPEN_INVENTORY_COUNT_STATUSES },
    },
    select: { id: true },
    take: 50,
  });

  const stockBookings = await tx.hqStockBooking.findMany({
    where: {
      warehouseId,
      status: { in: ACTIVE_HQ_STOCK_BOOKING_STATUSES },
    },
    select: { id: true },
    take: 50,
  });

  const fifoReservations = await tx.distributionFifoAllocation.findMany({
    where: {
      status: 'RESERVED',
      fifoBatch: { warehouseId },
    },
    select: { id: true },
    take: 50,
  });

  const activeBranchOrders = await tx.branchDistributionOrder.findMany({
    where: {
      deletedAt: null,
      OR: [{ sourceWarehouseId: warehouseId }, { destinationWarehouseId: warehouseId }],
      status: { in: BRANCH_ACTIVE_DISTRIBUTION_STATUSES },
    },
    select: { id: true },
    take: 50,
  });

  const activeShipmentIds = [
    ...new Set([...outgoingShipments, ...incomingShipments].map((row) => row.id)),
  ];

  const activeOrderIds = [
    ...new Set([
      ...activeBranchOrders.map((row) => row.id),
      ...activeShipmentIds,
    ]),
  ];

  const reservationIds = [...new Set([...stockBookings, ...fifoReservations].map((row) => row.id))];

  const reasons: WarehouseDeleteBlockingReasons = {
    productCount,
    availableQuantity,
    reservedQuantity,
    fifoQuantity,
    activeShipmentIds,
    activeOrderIds,
    openInventoryCountIds: openInventoryCounts.map((row) => row.id),
    reservationIds,
  };

  const blocked =
    productCount > 0 ||
    totalQuantity > 0 ||
    reservedQuantity > 0 ||
    activeOrderIds.length > 0 ||
    openInventoryCounts.length > 0 ||
    reservationIds.length > 0;

  return { blocked, reasons };
}

export async function branchWarehouseHasDeleteHistory(tx: Tx, warehouseId: string) {
  const [
    stockMovements,
    distributionOrders,
    goodsReceivings,
    inventorySessions,
    fifoBatches,
  ] = await Promise.all([
    tx.stockMovement.count({ where: { warehouseId } }),
    tx.branchDistributionOrder.count({
      where: {
        deletedAt: null,
        OR: [{ sourceWarehouseId: warehouseId }, { destinationWarehouseId: warehouseId }],
      },
    }),
    tx.goodsReceiving.count({ where: { warehouseId } }),
    tx.inventoryCountSession.count({ where: { warehouseId } }),
    tx.fifoInventoryBatch.count({ where: { warehouseId } }),
  ]);

  return (
    stockMovements > 0 ||
    distributionOrders > 0 ||
    goodsReceivings > 0 ||
    inventorySessions > 0 ||
    fifoBatches > 0
  );
}

export function isMoneyBlocking(value: number): boolean {
  return Math.abs(value) > BRANCH_DELETE_MONEY_TOLERANCE;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

export function isBranchDeleteBlocked(blockers: BranchDeleteBlockers): boolean {
  return (
    blockers.stockQty > 0 ||
    blockers.reservedQty > 0 ||
    blockers.negativeStockQty < 0 ||
    isMoneyBlocking(blockers.accountBalance) ||
    isMoneyBlocking(blockers.unpaidReceivables) ||
    isMoneyBlocking(blockers.unpaidPayables) ||
    blockers.openBranchOrders > 0 ||
    blockers.openSales > 0 ||
    blockers.openServiceOrders > 0 ||
    blockers.openTransfers > 0 ||
    blockers.openInventorySessions > 0 ||
    blockers.activeEmployees > 0 ||
    blockers.openCashShifts > 0 ||
    blockers.activeStockBookings > 0 ||
    blockers.otherBlockingRecords.length > 0
  );
}

export function formatBranchDeleteBlockMessage(blockers: BranchDeleteBlockers): string {
  if (
    blockers.activeEmployees > 0 &&
    blockers.stockQty === 0 &&
    blockers.reservedQty === 0 &&
    blockers.negativeStockQty >= 0 &&
    !isMoneyBlocking(blockers.accountBalance) &&
    blockers.openBranchOrders === 0 &&
    blockers.openSales === 0 &&
    blockers.openServiceOrders === 0 &&
    blockers.openInstallments === 0 &&
    !isMoneyBlocking(blockers.unpaidReceivables) &&
    !isMoneyBlocking(blockers.unpaidPayables) &&
    blockers.openTransfers === 0 &&
    blockers.openInventorySessions === 0 &&
    blockers.openCashShifts === 0 &&
    blockers.activeStockBookings === 0 &&
    blockers.otherBlockingRecords.length === 0
  ) {
    return 'Нельзя удалить филиал: есть активные сотрудники.';
  }

  const lines: string[] = ['Филиал не может быть удалён:'];
  if (blockers.negativeStockQty < 0) {
    lines.push(
      `- Обнаружен отрицательный остаток на складе: ${Math.abs(blockers.negativeStockQty)} шт. (несогласованность данных).`,
    );
  }
  if (blockers.stockQty > 0) {
    lines.push(`- Остаток на складе: ${blockers.stockQty} шт.`);
  }
  if (blockers.reservedQty > 0) {
    lines.push(`- Зарезервировано: ${blockers.reservedQty} шт.`);
  }
  if (isMoneyBlocking(blockers.accountBalance)) {
    lines.push(`- Остаток на кассе/счёте: ${formatMoney(blockers.accountBalance)} сом.`);
  }
  if (blockers.openBranchOrders > 0) {
    lines.push(`- Активных заказов: ${blockers.openBranchOrders}.`);
  }
  if (blockers.openSales > 0) {
    lines.push(`- Незавершённых продаж: ${blockers.openSales}.`);
  }
  if (blockers.openServiceOrders > 0) {
    lines.push(`- Активных сервисных заказов: ${blockers.openServiceOrders}.`);
  }
  if (blockers.openInstallments > 0 || isMoneyBlocking(blockers.unpaidReceivables)) {
    const debt = Math.max(blockers.unpaidReceivables, 0);
    if (debt > 0) {
      lines.push(`- Непогашенная задолженность: ${formatMoney(debt)} сом.`);
    } else if (blockers.openInstallments > 0) {
      lines.push(`- Активных рассрочек: ${blockers.openInstallments}.`);
    }
  }
  if (isMoneyBlocking(blockers.unpaidPayables)) {
    lines.push(`- Неоплаченные обязательства: ${formatMoney(blockers.unpaidPayables)} сом.`);
  }
  if (blockers.openTransfers > 0) {
    lines.push(`- Переводы в процессе: ${blockers.openTransfers}.`);
  }
  if (blockers.openInventorySessions > 0) {
    lines.push(`- Активных инвентаризаций: ${blockers.openInventorySessions}.`);
  }
  if (blockers.activeEmployees > 0) {
    lines.push(`- Активных сотрудников: ${blockers.activeEmployees}.`);
  }
  if (blockers.openCashShifts > 0) {
    lines.push(`- Открытых кассовых смен: ${blockers.openCashShifts}.`);
  }
  if (blockers.activeStockBookings > 0) {
    lines.push(`- Активных резервирований HQ: ${blockers.activeStockBookings}.`);
  }
  for (const record of blockers.otherBlockingRecords) {
    lines.push(`- ${record}`);
  }
  return lines.join('\n');
}

async function repairStaleBranchInventoryValues(tx: Tx, branchId: string) {
  await tx.inventoryBalance.updateMany({
    where: {
      branchId,
      quantity: 0,
      totalValueKgs: { not: 0 },
    },
    data: { totalValueKgs: 0 },
  });
}

export async function assessBranchDeleteBlocking(tx: Tx, branchId: string) {
  const branch = await tx.branch.findFirst({
    where: { id: branchId },
    select: { code: true },
  });

  await repairStaleBranchInventoryValues(tx, branchId);

  const warehouseIds = (
    await tx.warehouse.findMany({
      where: { branchId, deletedAt: null },
      select: { id: true },
    })
  ).map((row) => row.id);

  const balances = await tx.inventoryBalance.findMany({
    where: { branchId },
    select: { quantity: true, reservedQuantity: true, totalValueKgs: true },
  });

  const stockQty = balances.reduce((sum, row) => sum + Math.max(row.quantity, 0), 0);
  const reservedQty = balances.reduce((sum, row) => sum + row.reservedQuantity, 0);
  const negativeStockQty = balances.reduce(
    (sum, row) => (row.quantity < 0 ? sum + row.quantity : sum),
    0,
  );
  const inventoryValue = balances.reduce((sum, row) => sum + Number(row.totalValueKgs), 0);

  const [
    activeEmployees,
    openBranchOrders,
    openSales,
    openServiceOrders,
    openInventorySessions,
    activeStockBookings,
    financeAccounts,
    branchInvoices,
    openInstallments,
    openTransfers,
    openCashShifts,
    saleDebtAggregate,
  ] = await Promise.all([
    tx.user.count({
      where: { branchId, deletedAt: null, status: UserStatus.ACTIVE },
    }),
    tx.branchDistributionOrder.count({
      where: {
        branchId,
        deletedAt: null,
        status: { in: BRANCH_ACTIVE_DISTRIBUTION_STATUSES },
      },
    }),
    tx.sale.count({
      where: {
        branchId,
        deletedAt: null,
        status: { in: BRANCH_ACTIVE_SALE_STATUSES },
      },
    }),
    tx.serviceOrder.count({
      where: {
        branchId,
        deletedAt: null,
        status: { in: [...BRANCH_ACTIVE_SERVICE_ORDER_STATUSES] },
      },
    }),
    tx.inventoryCountSession.count({
      where: {
        warehouseId: { in: warehouseIds },
        deletedAt: null,
        status: { in: OPEN_INVENTORY_COUNT_STATUSES },
      },
    }),
    tx.hqStockBooking.count({
      where: {
        branchId,
        status: { in: ACTIVE_HQ_STOCK_BOOKING_STATUSES },
      },
    }),
    tx.financeAccount.findMany({
      where: { branchId, deletedAt: null, status: 'ACTIVE' },
      select: { currentBalance: true },
    }),
    tx.branchInvoice.findMany({
      where: {
        branchId,
        deletedAt: null,
        status: { notIn: ['PAID', 'CANCELLED'] },
        debtAmount: { gt: BRANCH_DELETE_MONEY_TOLERANCE },
      },
      select: { debtAmount: true },
    }),
    tx.branchOrderInstallment.count({
      where: {
        branchId,
        status: 'APPROVED',
        invoice: {
          deletedAt: null,
          debtAmount: { gt: BRANCH_DELETE_MONEY_TOLERANCE },
        },
      },
    }),
    tx.financeTransfer.count({
      where: {
        branchId,
        status: { in: [...BRANCH_ACTIVE_FINANCE_TRANSFER_STATUSES] },
      },
    }),
    tx.cashierShift.count({
      where: { branchId, status: 'OPEN' },
    }),
    tx.sale.aggregate({
      where: {
        branchId,
        deletedAt: null,
        status: { not: SaleStatus.CANCELLED },
        debtAmount: { gt: BRANCH_DELETE_MONEY_TOLERANCE },
      },
      _sum: { debtAmount: true },
    }),
  ]);

  const accountBalance = financeAccounts.reduce((sum, row) => sum + Number(row.currentBalance), 0);
  const invoiceDebt = branchInvoices.reduce((sum, row) => sum + Number(row.debtAmount), 0);
  const saleDebt = Number(saleDebtAggregate._sum.debtAmount ?? 0);
  const unpaidReceivables = invoiceDebt + saleDebt;

  const blockers: BranchDeleteBlockers = {
    branchId,
    branchCode: branch?.code ?? null,
    stockQty,
    reservedQty,
    negativeStockQty,
    inventoryValue: stockQty === 0 ? 0 : inventoryValue,
    accountBalance,
    openSales,
    openServiceOrders,
    openBranchOrders,
    openInstallments,
    unpaidReceivables,
    unpaidPayables: 0,
    openTransfers,
    openInventorySessions,
    activeEmployees,
    openCashShifts,
    activeStockBookings,
    otherBlockingRecords: [],
  };

  const blocked = isBranchDeleteBlocked(blockers);
  return { blocked, reasons: blockers, blockers };
}

export async function branchHasBusinessHistory(tx: Tx, branchId: string) {
  const warehouseIds = (
    await tx.warehouse.findMany({
      where: { branchId },
      select: { id: true },
    })
  ).map((row) => row.id);

  const [
    users,
    customers,
    sales,
    payments,
    stockMovements,
    warehouses,
    auditLogs,
    financeLedger,
    branchInvoices,
    branchPayments,
    installments,
  ] = await Promise.all([
    tx.user.count({ where: { branchId } }),
    tx.customer.count({ where: { branchId } }),
    tx.sale.count({ where: { branchId } }),
    tx.payment.count({ where: { branchId } }),
    tx.stockMovement.count({ where: { branchId } }),
    tx.warehouse.count({ where: { branchId } }),
    tx.auditLog.count({ where: { entity: 'Branch', entityId: branchId } }),
    tx.financeLedgerEntry.count({ where: { branchId } }),
    tx.branchInvoice.count({ where: { branchId } }),
    tx.branchPayment.count({ where: { branchId } }),
    tx.branchOrderInstallment.count({ where: { branchId } }),
  ]);

  const warehouseHistory =
    warehouseIds.length > 0
      ? await Promise.all(warehouseIds.map((id) => branchWarehouseHasDeleteHistory(tx, id))).then(
          (rows) => rows.some(Boolean),
        )
      : false;

  return (
    users > 0 ||
    customers > 0 ||
    sales > 0 ||
    payments > 0 ||
    stockMovements > 0 ||
    warehouses > 0 ||
    auditLogs > 0 ||
    financeLedger > 0 ||
    branchInvoices > 0 ||
    branchPayments > 0 ||
    installments > 0 ||
    warehouseHistory
  );
}

export async function userHasBusinessHistory(tx: Tx, userId: string) {
  const [
    sales,
    payments,
    stockMovements,
    auditLogs,
    managerAssignments,
    procurementOrders,
    distributionOrders,
    goodsReceivings,
    branchInvoices,
    inventoryCounts,
    serviceOrders,
    financeExpenses,
    saleInstallments,
  ] = await Promise.all([
    tx.sale.count({ where: { sellerId: userId } }),
    tx.payment.count({ where: { createdById: userId } }),
    tx.stockMovement.count({ where: { createdById: userId } }),
    tx.auditLog.count({ where: { userId } }),
    tx.hqWarehouseManagerAssignment.count({ where: { userId } }),
    tx.procurementOrder.count({ where: { createdById: userId } }),
    tx.branchDistributionOrder.count({ where: { createdById: userId } }),
    tx.goodsReceiving.count({ where: { receivedById: userId } }),
    tx.branchInvoice.count({ where: { createdById: userId } }),
    tx.inventoryCountSession.count({ where: { createdById: userId } }),
    tx.serviceOrder.count({ where: { OR: [{ masterId: userId }, { createdById: userId }] } }),
    tx.financeExpense.count({ where: { createdById: userId } }),
    tx.saleInstallmentApproval.count({ where: { submittedById: userId } }),
  ]);

  return (
    sales > 0 ||
    payments > 0 ||
    stockMovements > 0 ||
    auditLogs > 0 ||
    managerAssignments > 0 ||
    procurementOrders > 0 ||
    distributionOrders > 0 ||
    goodsReceivings > 0 ||
    branchInvoices > 0 ||
    inventoryCounts > 0 ||
    serviceOrders > 0 ||
    financeExpenses > 0 ||
    saleInstallments > 0
  );
}

export async function assessUserDeleteProtection(tx: Tx, actorUserId: string, targetUserId: string) {
  if (actorUserId === targetUserId) {
    return { blocked: true, reason: 'SELF' as const };
  }

  const target = await tx.user.findFirst({
    where: { id: targetUserId, deletedAt: null },
    include: { userRoles: { include: { role: true } } },
  });
  if (!target) {
    return { blocked: true, reason: 'NOT_FOUND' as const };
  }

  const targetRoles = target.userRoles.map((row) => row.role.code as Role);
  const roles = targetRoles.length ? targetRoles : [target.role];
  if (roles.includes(Role.CEO) && target.status === UserStatus.ACTIVE) {
    const activeCeoCount = await tx.user.count({
      where: {
        deletedAt: null,
        status: UserStatus.ACTIVE,
        OR: [{ role: Role.CEO }, { userRoles: { some: { role: { code: Role.CEO } } } }],
      },
    });
    if (activeCeoCount <= 1) {
      return { blocked: true, reason: 'LAST_CEO' as const };
    }
  }

  const openCashShift = await tx.cashierShift.findFirst({
    where: { cashierId: targetUserId, status: 'OPEN' },
    select: { id: true },
  });
  if (openCashShift) {
    return { blocked: true, reason: 'OPEN_CASH_SHIFT' as const, cashShiftId: openCashShift.id };
  }

  const activeOperations = await hasUserActiveOperations(tx, targetUserId);
  if (activeOperations) {
    return { blocked: true, reason: 'ACTIVE_OPERATIONS' as const, details: activeOperations };
  }

  return { blocked: false, target };
}

async function hasUserActiveOperations(tx: Tx, userId: string) {
  const [
    pickingTask,
    responsibleAccount,
    supportTask,
    openInventoryCount,
    pendingInstallment,
  ] = await Promise.all([
    tx.hqWarehousePickingTask.findFirst({
      where: {
        assignedWarehouseManagerId: userId,
        status: { in: ACTIVE_PICKING_TASK_STATUSES },
      },
      select: { id: true },
    }),
    tx.financeAccount.findFirst({
      where: { responsibleEmployeeId: userId, status: 'ACTIVE', deletedAt: null },
      select: { id: true },
    }),
    tx.franchiseSupportTask.findFirst({
      where: {
        assigneeUserId: userId,
        status: {
          in: [
            FranchiseSupportTaskStatus.OPEN,
            FranchiseSupportTaskStatus.IN_PROGRESS,
            FranchiseSupportTaskStatus.OVERDUE,
          ],
        },
      },
      select: { id: true },
    }),
    tx.inventoryCountSession.findFirst({
      where: {
        createdById: userId,
        deletedAt: null,
        status: { in: [InventoryCountStatus.COUNTING, InventoryCountStatus.SUBMITTED] },
      },
      select: { id: true },
    }),
    tx.saleInstallmentApproval.findFirst({
      where: {
        submittedById: userId,
        status: { in: PENDING_INSTALLMENT_APPROVAL_STATUSES },
      },
      select: { id: true },
    }),
  ]);

  if (pickingTask) return { pickingTaskId: pickingTask.id };
  if (responsibleAccount) return { financeAccountId: responsibleAccount.id };
  if (supportTask) return { supportTaskId: supportTask.id };
  if (openInventoryCount) return { inventoryCountId: openInventoryCount.id };
  if (pendingInstallment) return { installmentApprovalId: pendingInstallment.id };
  return null;
}

export async function revokeUserSessions(
  client: Tx | PrismaService,
  userId: string,
  actorUserId: string,
  actorRole: string,
) {
  await client.loginHistory.updateMany({
    where: { userId, success: true, logoutAt: null },
    data: { logoutAt: new Date() },
  });

  await client.auditLog.create({
    data: {
      userId: actorUserId,
      role: actorRole,
      action: 'USER_SESSIONS_REVOKED',
      entity: 'User',
      entityId: userId,
      metadata: {
        actorUserId,
        targetUserId: userId,
        timestamp: new Date().toISOString(),
      },
    },
  });
}

export async function hardDeleteBranchWarehouse(tx: Tx, warehouseId: string) {
  await tx.inventoryBalance.deleteMany({ where: { warehouseId } });
  await tx.warehouse.delete({ where: { id: warehouseId } });
}

export async function archiveBranchWarehouse(tx: Tx, warehouseId: string) {
  return tx.warehouse.update({
    where: { id: warehouseId },
    data: { isActive: false, deletedAt: new Date() },
  });
}

export async function archiveBranch(tx: Tx, branchId: string) {
  return tx.branch.update({
    where: { id: branchId },
    data: { status: BranchStatus.INACTIVE, deletedAt: new Date() },
  });
}
