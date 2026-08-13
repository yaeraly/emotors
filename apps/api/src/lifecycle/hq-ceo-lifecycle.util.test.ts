import { ForbiddenException } from '@nestjs/common';
import { Role, UserStatus } from '@prisma/client';
import { PrismaClient } from '@prisma/client';
import {
  canHqCeoManageLifecycle,
  assertCanHqCeoManageLifecycle,
  assessBranchDeleteBlocking,
  assessBranchWarehouseDeleteBlocking,
  formatBranchDeleteBlockMessage,
  isActiveBranchEmployee,
  isBranchDeleteBlocked,
} from './hq-ceo-lifecycle.util';
import { BRANCH_WAREHOUSE_DELETE_BLOCKED_MESSAGE } from './hq-ceo-lifecycle.constants';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function createWarehouseBlockingMock(overrides: {
  balances?: Array<{ productId: string; quantity: number; reservedQuantity: number }>;
  fifoRemaining?: number;
  outgoing?: string[];
  incoming?: string[];
  activeOrders?: string[];
  openCounts?: string[];
  bookings?: string[];
  fifoReservations?: string[];
}) {
  const balances = overrides.balances ?? [];
  return {
    inventoryBalance: {
      findMany: async () => balances,
    },
    fifoInventoryBatch: {
      aggregate: async () => ({ _sum: { remainingQuantity: overrides.fifoRemaining ?? 0 } }),
    },
    branchDistributionOrder: {
      findMany: async (args: {
        where: { sourceWarehouseId?: string; destinationWarehouseId?: string; status?: unknown };
      }) => {
        if (args.where.sourceWarehouseId) {
          return (overrides.outgoing ?? []).map((id) => ({ id }));
        }
        if (args.where.destinationWarehouseId) {
          return (overrides.incoming ?? []).map((id) => ({ id }));
        }
        if (args.where.status) {
          return (overrides.activeOrders ?? []).map((id) => ({ id }));
        }
        return [];
      },
    },
    inventoryCountSession: {
      findMany: async () => (overrides.openCounts ?? []).map((id) => ({ id })),
    },
    hqStockBooking: {
      findMany: async () => (overrides.bookings ?? []).map((id) => ({ id })),
    },
    distributionFifoAllocation: {
      findMany: async () => (overrides.fifoReservations ?? []).map((id) => ({ id })),
    },
  } as unknown as import('@prisma/client').Prisma.TransactionClient;
}

function createBranchBlockingMock(overrides: {
  branchCode?: string;
  balances?: Array<{ quantity: number; reservedQuantity: number; totalValueKgs?: number }>;
  activeEmployees?: number;
  openBranchOrders?: number;
  openSales?: number;
  openServiceOrders?: number;
  openInventorySessions?: number;
  activeStockBookings?: number;
  accountBalance?: number;
  invoiceDebt?: number;
  openInstallments?: number;
  openTransfers?: number;
  openCashShifts?: number;
  saleDebt?: number;
}) {
  const balances = overrides.balances ?? [];
  return {
    branch: {
      findFirst: async () => ({ code: overrides.branchCode ?? 'BR-001' }),
    },
    warehouse: {
      findMany: async () => [{ id: 'wh-branch' }],
    },
    inventoryBalance: {
      findMany: async () => balances,
      updateMany: async () => ({ count: 0 }),
    },
    user: {
      count: async () => overrides.activeEmployees ?? 0,
    },
    branchDistributionOrder: {
      count: async () => overrides.openBranchOrders ?? 0,
    },
    sale: {
      count: async () => overrides.openSales ?? 0,
      aggregate: async () => ({ _sum: { debtAmount: overrides.saleDebt ?? 0 } }),
    },
    serviceOrder: {
      count: async () => overrides.openServiceOrders ?? 0,
    },
    inventoryCountSession: {
      count: async () => overrides.openInventorySessions ?? 0,
    },
    hqStockBooking: {
      count: async () => overrides.activeStockBookings ?? 0,
    },
    financeAccount: {
      findMany: async () =>
        overrides.accountBalance
          ? [{ currentBalance: overrides.accountBalance }]
          : [],
    },
    branchInvoice: {
      findMany: async () =>
        overrides.invoiceDebt
          ? [{ debtAmount: overrides.invoiceDebt }]
          : [],
    },
    branchOrderInstallment: {
      count: async () => overrides.openInstallments ?? 0,
    },
    financeTransfer: {
      count: async () => overrides.openTransfers ?? 0,
    },
    cashierShift: {
      count: async () => overrides.openCashShifts ?? 0,
    },
  } as unknown as import('@prisma/client').Prisma.TransactionClient;
}

async function run() {
  const ceo = { role: Role.CEO, roles: [Role.CEO], permissions: [] };
  const scm = { role: Role.SUPPLY_CHAIN_MANAGER, roles: [Role.SUPPLY_CHAIN_MANAGER], permissions: [] };
  const owner = { role: Role.OWNER, roles: [Role.OWNER], permissions: [] };

  assert(canHqCeoManageLifecycle(ceo) === true, '1. CEO can manage lifecycle');
  assert(canHqCeoManageLifecycle(scm) === false, '2. SCM cannot manage lifecycle');
  assert(canHqCeoManageLifecycle(owner) === false, '3. Owner cannot manage lifecycle (CEO only)');

  try {
    assertCanHqCeoManageLifecycle({
      id: '1',
      email: 'x',
      fullName: 'X',
      role: Role.SUPPLY_CHAIN_MANAGER,
      roles: [Role.SUPPLY_CHAIN_MANAGER],
      branchId: '',
      permissions: [],
    });
    throw new Error('4. SCM should be forbidden');
  } catch (err) {
    assert(err instanceof ForbiddenException, '4. SCM receives ForbiddenException');
  }

  const emptyWarehouse = await assessBranchWarehouseDeleteBlocking(createWarehouseBlockingMock({}), 'wh-1');
  assert(emptyWarehouse.blocked === false, '5. Empty warehouse is not blocked');

  const stockedWarehouse = await assessBranchWarehouseDeleteBlocking(
    createWarehouseBlockingMock({
      balances: [{ productId: 'p1', quantity: 5, reservedQuantity: 0 }],
    }),
    'wh-2',
  );
  assert(stockedWarehouse.blocked === true, '6. Warehouse with stock is blocked');
  assert(stockedWarehouse.reasons.productCount === 1, '6b. Product count reported');

  const reservedWarehouse = await assessBranchWarehouseDeleteBlocking(
    createWarehouseBlockingMock({
      balances: [{ productId: 'p1', quantity: 5, reservedQuantity: 2 }],
    }),
    'wh-3',
  );
  assert(reservedWarehouse.blocked === true, '7. Warehouse with reserved stock is blocked');

  const fifoOnlyWarehouse = await assessBranchWarehouseDeleteBlocking(
    createWarehouseBlockingMock({ fifoRemaining: 3 }),
    'wh-4',
  );
  assert(fifoOnlyWarehouse.blocked === false, '8. Warehouse with only historical FIFO is not blocked');

  const shipmentWarehouse = await assessBranchWarehouseDeleteBlocking(
    createWarehouseBlockingMock({ outgoing: ['order-1'] }),
    'wh-5',
  );
  assert(shipmentWarehouse.blocked === true, '9. Warehouse with active shipment is blocked');

  const countWarehouse = await assessBranchWarehouseDeleteBlocking(
    createWarehouseBlockingMock({ openCounts: ['count-1'] }),
    'wh-6',
  );
  assert(countWarehouse.blocked === true, '10. Warehouse with open inventory count is blocked');

  const activeOrderWarehouse = await assessBranchWarehouseDeleteBlocking(
    createWarehouseBlockingMock({ activeOrders: ['order-pending-1'] }),
    'wh-7',
  );
  assert(activeOrderWarehouse.blocked === true, '10b. Warehouse with active branch orders is blocked');

  const emptyBranch = await assessBranchDeleteBlocking(
    createBranchBlockingMock({ balances: [] }),
    'branch-empty',
  );
  assert(emptyBranch.blocked === false, '11. Empty branch with zero stock can be deleted');
  assert(emptyBranch.blockers.stockQty === 0, '11b. stockQty is zero');

  const zeroQtyInventoryBranch = await assessBranchDeleteBlocking(
    createBranchBlockingMock({
      balances: [{ quantity: 0, reservedQuantity: 0, totalValueKgs: 1500 }],
    }),
    'branch-zero-qty',
  );
  assert(zeroQtyInventoryBranch.blocked === false, '12. Zero-quantity inventory records do not block');

  const activeEmployeesBranch = await assessBranchDeleteBlocking(
    createBranchBlockingMock({ activeEmployees: 2 }),
    'branch-users',
  );
  assert(activeEmployeesBranch.blocked === true, '13. Branch with active employees is blocked');
  assert(activeEmployeesBranch.blockers.activeEmployees === 2, '13b. activeEmployees reported');
  assert(
    formatBranchDeleteBlockMessage(activeEmployeesBranch.blockers).includes('активные сотрудники (2)'),
    '13c. Specific employee blocker message with count',
  );

  assert(
    isActiveBranchEmployee(
      {
        branchId: 'branch-users',
        deletedAt: null,
        status: UserStatus.ACTIVE,
        role: Role.MANAGER,
      },
      'branch-users',
    ) === true,
    '13d. Active branch manager counts as active employee',
  );
  assert(
    isActiveBranchEmployee(
      {
        branchId: 'branch-users',
        deletedAt: null,
        status: UserStatus.ACTIVE,
        role: Role.OWNER,
      },
      'branch-users',
    ) === false,
    '13e. Global OWNER linked to branch is not an active branch employee',
  );
  assert(
    isActiveBranchEmployee(
      {
        branchId: 'branch-users',
        deletedAt: null,
        status: UserStatus.INACTIVE,
        role: Role.MANAGER,
      },
      'branch-users',
    ) === false,
    '13f. Inactive branch employee does not block',
  );
  assert(
    isActiveBranchEmployee(
      {
        branchId: 'branch-users',
        deletedAt: new Date(),
        status: UserStatus.ACTIVE,
        role: Role.MANAGER,
      },
      'branch-users',
    ) === false,
    '13g. Soft-deleted branch employee does not block',
  );
  assert(
    isActiveBranchEmployee(
      {
        branchId: null,
        deletedAt: null,
        status: UserStatus.ACTIVE,
        role: Role.MANAGER,
      },
      'branch-users',
    ) === false,
    '13h. Removed branch assignment does not block',
  );

  const stockedBranch = await assessBranchDeleteBlocking(
    createBranchBlockingMock({
      balances: [{ quantity: 12, reservedQuantity: 0, totalValueKgs: 1000 }],
    }),
    'branch-stock',
  );
  assert(stockedBranch.blocked === true, '14. Positive stock blocks deletion');
  assert(
    formatBranchDeleteBlockMessage(stockedBranch.blockers).includes('Остаток на складе: 12'),
    '14b. Specific stock blocker message',
  );

  const reservedBranch = await assessBranchDeleteBlocking(
    createBranchBlockingMock({
      balances: [{ quantity: 0, reservedQuantity: 3, totalValueKgs: 0 }],
    }),
    'branch-reserved',
  );
  assert(reservedBranch.blocked === true, '15. Reserved stock blocks deletion');

  const cashBranch = await assessBranchDeleteBlocking(
    createBranchBlockingMock({ accountBalance: 15000 }),
    'branch-cash',
  );
  assert(cashBranch.blocked === true, '16. Non-zero account balance blocks');
  assert(
    formatBranchDeleteBlockMessage(cashBranch.blockers).includes('15'),
    '16b. Specific cash blocker message',
  );

  const debtBranch = await assessBranchDeleteBlocking(
    createBranchBlockingMock({ invoiceDebt: 5000, saleDebt: 0 }),
    'branch-debt',
  );
  assert(debtBranch.blocked === true, '17. Outstanding debt blocks');

  const openOrderBranch = await assessBranchDeleteBlocking(
    createBranchBlockingMock({ openBranchOrders: 2 }),
    'branch-orders',
  );
  assert(openOrderBranch.blocked === true, '18. Active branch order blocks');

  const serviceBranch = await assessBranchDeleteBlocking(
    createBranchBlockingMock({ openServiceOrders: 1 }),
    'branch-service',
  );
  assert(serviceBranch.blocked === true, '19. Active service order blocks');

  const transferBranch = await assessBranchDeleteBlocking(
    createBranchBlockingMock({ openTransfers: 1 }),
    'branch-transfer',
  );
  assert(transferBranch.blocked === true, '20. In-flight transfer blocks');

  const negativeStockBranch = await assessBranchDeleteBlocking(
    createBranchBlockingMock({
      balances: [{ quantity: -2, reservedQuantity: 0, totalValueKgs: 0 }],
    }),
    'branch-negative',
  );
  assert(negativeStockBranch.blocked === true, '21. Negative stock blocks as data inconsistency');

  const allClearBlockers = {
    branchId: 'branch-1',
    branchCode: 'BR-001',
    stockQty: 0,
    reservedQty: 0,
    negativeStockQty: 0,
    inventoryValue: 0,
    accountBalance: 0,
    openSales: 0,
    openServiceOrders: 0,
    openBranchOrders: 0,
    openInstallments: 0,
    unpaidReceivables: 0,
    unpaidPayables: 0,
    openTransfers: 0,
    openInventorySessions: 0,
    activeEmployees: 0,
    openCashShifts: 0,
    activeStockBookings: 0,
    otherBlockingRecords: [],
  };
  assert(isBranchDeleteBlocked(allClearBlockers) === false, '22. All-zero blockers allow deletion');

  assert(
    BRANCH_WAREHOUSE_DELETE_BLOCKED_MESSAGE.includes('Складды'),
    '23. Warehouse blocked message is in Kyrgyz',
  );

  const prisma = new PrismaClient();
  try {
    const bishkek = await prisma.branch.findFirst({
      where: { code: 'BISHKEK' },
      select: { id: true, name: true },
    });
    if (bishkek) {
      const linkedUsers = await prisma.user.findMany({
        where: { branchId: bishkek.id },
        include: { userRoles: { include: { role: true } } },
      });
      const activeBranchEmployees = linkedUsers.filter((user) =>
        isActiveBranchEmployee(user, bishkek.id),
      );
      assert(
        activeBranchEmployees.length === 0,
        '24. Bishkek Main Branch has zero active branch employees',
      );

      const assessment = await prisma.$transaction((tx) => assessBranchDeleteBlocking(tx, bishkek.id));
      assert(
        assessment.blockers.activeEmployees === 0,
        '24b. Bishkek employee validation passes in delete guard',
      );
      assert(
        !formatBranchDeleteBlockMessage(assessment.blockers).includes('активные сотрудники'),
        '24c. Bishkek does not get false employee blocker message',
      );
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log('hq-ceo-lifecycle.util.test.ts: all assertions passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
