import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  canHqCeoManageLifecycle,
  assertCanHqCeoManageLifecycle,
  assessBranchDeleteBlocking,
  assessBranchWarehouseDeleteBlocking,
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

  const fifoWarehouse = await assessBranchWarehouseDeleteBlocking(
    createWarehouseBlockingMock({ fifoRemaining: 3 }),
    'wh-4',
  );
  assert(fifoWarehouse.blocked === true, '8. Warehouse with FIFO quantity is blocked');

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

  const usersOnBranch = await assessBranchDeleteBlocking(
    {
      warehouse: {
        findMany: async () => [{ id: 'wh-branch' }],
        count: async () => 1,
      },
      inventoryBalance: {
        findMany: async () => [],
      },
      fifoInventoryBatch: {
        aggregate: async () => ({ _sum: { remainingQuantity: 0 } }),
      },
      user: {
        count: async () => 2,
      },
      branchDistributionOrder: {
        findMany: async () => [],
      },
      sale: {
        findMany: async () => [],
      },
      inventoryCountSession: {
        findMany: async () => [],
      },
      hqStockBooking: {
        findMany: async () => [],
      },
    } as unknown as import('@prisma/client').Prisma.TransactionClient,
    'branch-1',
  );
  assert(usersOnBranch.blocked === true, '12. Branch with users is blocked from permanent delete');
  assert(usersOnBranch.reasons.userCount === 2, '12b. User count in blocking reasons');

  assert(
    BRANCH_WAREHOUSE_DELETE_BLOCKED_MESSAGE.includes('Складды'),
    '11. Warehouse blocked message is in Kyrgyz',
  );

  console.log('hq-ceo-lifecycle.util.test.ts: all assertions passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
