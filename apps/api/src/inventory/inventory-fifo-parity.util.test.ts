import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  compareWarehouseInventoryValuation,
  inspectWarehouseFifoBalanceParity,
  reconcileWarehouseInventoryFifoParityInTx,
  sumActiveRemainingFifoLayerValues,
  syncInventoryBalanceValuationFromFifoRemainingInTx,
} from './inventory-authoritative-value.util';
import { roundDisplayMoney } from '../pricing/product-cost-precision.util';

const FIRST_SHIPMENT = 914369.8;
const SECOND_SHIPMENT = 822036.2;

type BalanceRow = {
  id: string;
  branchId: string;
  productId: string;
  quantity: number;
  totalValueKgs: number;
  averageCostKgs: number;
  landedCostKgs: number;
};

type FifoRow = {
  id: string;
  productId: string;
  remainingQuantity: number;
  initialQuantity: number;
  unitCostKgs: number;
  stockMovementId: string | null;
};

function createParityTx(state: {
  balances: BalanceRow[];
  batches: FifoRow[];
  movements?: Array<{ id: string; quantity: number; totalCostKgs: number }>;
}) {
  const audits: Array<Record<string, unknown>> = [];
  return {
    audits,
    tx: {
      inventoryBalance: {
        findMany: async ({ where }: { where: { warehouseId: string; quantity?: { gt: number } } }) => {
          let rows = state.balances;
          if (where.quantity?.gt != null) {
            rows = rows.filter((row) => row.quantity > where.quantity!.gt);
          }
          return rows.map((row) => ({
            productId: row.productId,
            quantity: row.quantity,
            totalValueKgs: row.totalValueKgs,
          }));
        },
        findUnique: async ({
          where,
        }: {
          where: {
            branchId_warehouseId_productId?: {
              branchId: string;
              warehouseId: string;
              productId: string;
            };
            id?: string;
          };
        }) => {
          if (where.id) {
            return state.balances.find((row) => row.id === where.id) ?? null;
          }
          const key = where.branchId_warehouseId_productId!;
          return (
            state.balances.find(
              (row) => row.branchId === key.branchId && row.productId === key.productId,
            ) ?? null
          );
        },
        findFirst: async ({
          where,
        }: {
          where: { warehouseId: string; productId: string };
        }) => state.balances.find((row) => row.productId === where.productId) ?? null,
        update: async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<BalanceRow>;
        }) => {
          const row = state.balances.find((item) => item.id === where.id);
          if (!row) return null;
          Object.assign(row, data);
          return row;
        },
      },
      fifoInventoryBatch: {
        findMany: async ({
          where,
        }: {
          where: { warehouseId: string; remainingQuantity?: { gt: number }; productId?: string };
        }) => {
          let rows = state.batches;
          if (where.productId) {
            rows = rows.filter((row) => row.productId === where.productId);
          }
          if (where.remainingQuantity?.gt != null) {
            rows = rows.filter((row) => row.remainingQuantity > where.remainingQuantity!.gt);
          }
          return rows;
        },
      },
      stockMovement: {
        findMany: async ({ where }: { where: { id: { in: string[] } } }) => {
          const movements = state.movements ?? [];
          return movements.filter((row) => where.id.in.includes(row.id));
        },
      },
      auditLog: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          audits.push(data);
          return data;
        },
      },
    } as never,
  };
}

describe('HQ inventory FIFO parity after China shipment transfer', () => {
  it('detects stale balance value when first shipment was fully transferred', async () => {
    const { tx } = createParityTx({
      balances: [
        {
          id: 'bal-1',
          branchId: 'hq-branch',
          productId: 'prod-a',
          quantity: 80,
          // Blended average leftover — false HQ value after transfer.
          totalValueKgs: roundDisplayMoney((FIRST_SHIPMENT + SECOND_SHIPMENT) * (80 / 180)),
          averageCostKgs: roundDisplayMoney((FIRST_SHIPMENT + SECOND_SHIPMENT) / 180),
          landedCostKgs: 1,
        },
      ],
      batches: [
        {
          id: 'fifo-1',
          productId: 'prod-a',
          remainingQuantity: 0,
          initialQuantity: 100,
          unitCostKgs: deriveUnit(FIRST_SHIPMENT, 100),
          stockMovementId: 'mov-1',
        },
        {
          id: 'fifo-2',
          productId: 'prod-a',
          remainingQuantity: 80,
          initialQuantity: 80,
          unitCostKgs: deriveUnit(SECOND_SHIPMENT, 80),
          stockMovementId: 'mov-2',
        },
      ],
      movements: [
        { id: 'mov-1', quantity: 100, totalCostKgs: FIRST_SHIPMENT },
        { id: 'mov-2', quantity: 80, totalCostKgs: SECOND_SHIPMENT },
      ],
    });

    const inspection = await inspectWarehouseFifoBalanceParity(tx, 'hq-wh');
    assert.equal(inspection.fifoTotalKgs, SECOND_SHIPMENT);
    assert.notEqual(inspection.balanceTotalKgs, SECOND_SHIPMENT);
    assert.equal(inspection.ok, false);
    assert.equal(inspection.issues[0]?.reason, 'STALE_BALANCE_VALUE');
  });

  it('repairs stale balance to remaining active FIFO and allows reconciliation', async () => {
    const state = {
      balances: [
        {
          id: 'bal-1',
          branchId: 'hq-branch',
          productId: 'prod-a',
          quantity: 80,
          totalValueKgs: roundDisplayMoney((FIRST_SHIPMENT + SECOND_SHIPMENT) * (80 / 180)),
          averageCostKgs: roundDisplayMoney((FIRST_SHIPMENT + SECOND_SHIPMENT) / 180),
          landedCostKgs: 1,
        },
      ],
      batches: [
        {
          id: 'fifo-1',
          productId: 'prod-a',
          remainingQuantity: 0,
          initialQuantity: 100,
          unitCostKgs: deriveUnit(FIRST_SHIPMENT, 100),
          stockMovementId: 'mov-1',
        },
        {
          id: 'fifo-2',
          productId: 'prod-a',
          remainingQuantity: 80,
          initialQuantity: 80,
          unitCostKgs: deriveUnit(SECOND_SHIPMENT, 80),
          stockMovementId: 'mov-2',
        },
      ],
      movements: [
        { id: 'mov-1', quantity: 100, totalCostKgs: FIRST_SHIPMENT },
        { id: 'mov-2', quantity: 80, totalCostKgs: SECOND_SHIPMENT },
      ],
    };
    const { tx, audits } = createParityTx(state);

    const result = await reconcileWarehouseInventoryFifoParityInTx(tx, {
      warehouseId: 'hq-wh',
      userId: 'user-1',
      userRole: 'WAREHOUSE_MANAGER',
      entity: 'InventoryCountSession',
      entityId: 'count-1',
    });

    assert.equal(result.ok, true);
    assert.equal(result.fifoTotalKgs, SECOND_SHIPMENT);
    assert.equal(result.balanceTotalKgs, SECOND_SHIPMENT);
    assert.equal(result.differenceKgs, 0);
    assert.equal(state.balances[0]!.totalValueKgs, SECOND_SHIPMENT);
    assert.equal(state.balances[0]!.quantity, 80);
    assert.ok(audits.some((row) => row.action === 'FIFO_REMAINING_VALUE_RECONCILED'));
    assert.ok(audits.some((row) => row.action === 'HQ_INVENTORY_FIFO_PARITY_REPAIRED'));

    const after = await compareWarehouseInventoryValuation(tx, 'hq-wh');
    assert.equal(after.ok, true);
  });

  it('blocks real inventory without FIFO mismatch', async () => {
    const { tx } = createParityTx({
      balances: [
        {
          id: 'bal-1',
          branchId: 'hq-branch',
          productId: 'prod-a',
          quantity: 5,
          totalValueKgs: 500,
          averageCostKgs: 100,
          landedCostKgs: 100,
        },
      ],
      batches: [],
      movements: [],
    });
    const result = await reconcileWarehouseInventoryFifoParityInTx(tx, {
      warehouseId: 'hq-wh',
      userId: 'user-1',
    });
    assert.equal(result.ok, false);
    assert.equal(result.blockingIssues[0]?.reason, 'INVENTORY_WITHOUT_FIFO');
  });

  it('sync does not change quantities', async () => {
    const state = {
      balances: [
        {
          id: 'bal-1',
          branchId: 'hq-branch',
          productId: 'prod-a',
          quantity: 80,
          totalValueKgs: 900000,
          averageCostKgs: 10000,
          landedCostKgs: 10000,
        },
      ],
      batches: [
        {
          id: 'fifo-2',
          productId: 'prod-a',
          remainingQuantity: 80,
          initialQuantity: 80,
          unitCostKgs: deriveUnit(SECOND_SHIPMENT, 80),
          stockMovementId: 'mov-2',
        },
      ],
      movements: [{ id: 'mov-2', quantity: 80, totalCostKgs: SECOND_SHIPMENT }],
    };
    const { tx } = createParityTx(state);
    const synced = await syncInventoryBalanceValuationFromFifoRemainingInTx(tx, {
      warehouseId: 'hq-wh',
      productId: 'prod-a',
      branchId: 'hq-branch',
    });
    assert.equal(synced?.quantity, 80);
    assert.equal(state.balances[0]!.quantity, 80);
    assert.equal(synced?.newTotalValueKgs, SECOND_SHIPMENT);
  });

  it('fully consumed layers are excluded from active remaining sum', () => {
    assert.equal(
      sumActiveRemainingFifoLayerValues([
        {
          remainingQuantity: 0,
          originalLayerValueKgs: FIRST_SHIPMENT,
          layerBaseQuantity: 100,
        },
        {
          remainingQuantity: 80,
          originalLayerValueKgs: SECOND_SHIPMENT,
          layerBaseQuantity: 80,
        },
      ]),
      SECOND_SHIPMENT,
    );
  });
});

function deriveUnit(total: number, qty: number) {
  return roundDisplayMoney(total / qty);
}
