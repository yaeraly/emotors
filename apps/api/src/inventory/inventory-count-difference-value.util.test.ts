import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { WarehouseType } from '@prisma/client';
import type { PricingFifoService } from '../pricing/pricing-fifo.service';
import {
  assertInventoryCountLinesMatchAuthoritativeValuation,
  recomputeInventoryCountLineValuation,
  resolveInventoryCountDifferenceValueKgs,
} from './inventory-authoritative-value.util';

type MockFifo = Pick<PricingFifoService, 'previewFifoAllocation' | 'getOldestActiveHqFifoCost'>;

function mockFifoService(
  unitCostPerUnit: number,
  allocationQtys: number[] = [],
  layers?: Array<{ qty: number; unitCost: number }>,
): MockFifo {
  return {
    getOldestActiveHqFifoCost: async () => ({
      costPriceKgs: unitCostPerUnit,
      available: true,
      source: 'HQ_FIFO_ACTIVE_LAYER',
      batchId: 'batch-1',
      receivedAt: new Date(),
      warehouseId: 'wh-1',
    }),
    previewFifoAllocation: async (_tx, input) => {
      allocationQtys.push(input.quantity);
      if (layers?.length) {
        let remaining = input.quantity;
        let totalCostKgs = 0;
        for (const layer of layers) {
          if (remaining <= 0) break;
          const take = Math.min(layer.qty, remaining);
          totalCostKgs += take * layer.unitCost;
          remaining -= take;
        }
        if (remaining > 0) {
          totalCostKgs += remaining * unitCostPerUnit;
        }
        return {
          totalCostKgs,
          unitCost: unitCostPerUnit,
          unitPrice: unitCostPerUnit,
          activeUnitCost: layers[0]?.unitCost ?? unitCostPerUnit,
          activeUnitPrice: layers[0]?.unitCost ?? unitCostPerUnit,
          totalPriceKgs: totalCostKgs,
          profitKgs: 0,
          lines: [],
          allocatedQty: input.quantity,
        };
      }
      return {
        totalCostKgs: input.quantity * unitCostPerUnit,
        unitCost: unitCostPerUnit,
        unitPrice: unitCostPerUnit,
        activeUnitCost: unitCostPerUnit,
        activeUnitPrice: unitCostPerUnit,
        totalPriceKgs: input.quantity * unitCostPerUnit,
        profitKgs: 0,
        lines: [],
        allocatedQty: input.quantity,
      };
    },
  };
}

const hqWarehouse = {
  id: 'wh-1',
  warehouseType: WarehouseType.HQ,
  branchId: null,
};

describe('resolveInventoryCountDifferenceValueKgs', () => {
  it('surplus uses difference quantity only (physical > system)', async () => {
    const allocationQtys: number[] = [];
    const fifo = mockFifoService(500, allocationQtys);
    const surplus = await resolveInventoryCountDifferenceValueKgs(
      {} as never,
      fifo as PricingFifoService,
      {
        warehouseId: 'wh-1',
        productId: 'prod-a',
        systemQuantity: 10,
        actualQuantity: 20,
        unitCostKgs: 500,
        isHqWarehouse: true,
      },
    );
    assert.equal(surplus, 5000);
    assert.deepEqual(allocationQtys, [10]);
  });

  it('surplus is not physical quantity × unit cost', async () => {
    const fifo = mockFifoService(500);
    const surplus = await resolveInventoryCountDifferenceValueKgs(
      {} as never,
      fifo as PricingFifoService,
      {
        warehouseId: 'wh-1',
        productId: 'prod-a',
        systemQuantity: 10,
        actualQuantity: 20,
        unitCostKgs: 500,
        isHqWarehouse: true,
      },
    );
    assert.equal(surplus, 5000);
    assert.notEqual(surplus, 20 * 500);
  });

  it('shortage uses missing quantity only (physical < system)', async () => {
    const allocationQtys: number[] = [];
    const fifo = mockFifoService(500, allocationQtys);
    const shortage = await resolveInventoryCountDifferenceValueKgs(
      {} as never,
      fifo as PricingFifoService,
      {
        warehouseId: 'wh-1',
        productId: 'prod-a',
        systemQuantity: 10,
        actualQuantity: 0,
        unitCostKgs: 500,
        isHqWarehouse: true,
      },
    );
    assert.equal(shortage, -5000);
    assert.deepEqual(allocationQtys, [10]);
  });

  it('partial surplus does not reuse full system stock value', async () => {
    const fifo = mockFifoService(100);
    const surplus = await resolveInventoryCountDifferenceValueKgs(
      {} as never,
      fifo as PricingFifoService,
      {
        warehouseId: 'wh-1',
        productId: 'prod-a',
        systemQuantity: 100,
        actualQuantity: 110,
        unitCostKgs: 100,
        isHqWarehouse: true,
      },
    );
    assert.equal(surplus, 1000);
    assert.notEqual(surplus, 110 * 100);
    assert.notEqual(surplus, 100 * 100);
  });

  it('matched quantities produce zero difference value', async () => {
    const fifo = mockFifoService(500);
    const value = await resolveInventoryCountDifferenceValueKgs(
      {} as never,
      fifo as PricingFifoService,
      {
        warehouseId: 'wh-1',
        productId: 'prod-a',
        systemQuantity: 10,
        actualQuantity: 10,
        unitCostKgs: 500,
        isHqWarehouse: true,
      },
    );
    assert.equal(value, 0);
  });

  it('multiple products surplus sums difference allocations not warehouse total', async () => {
    const fifo = mockFifoService(500);
    const products = [
      { systemQuantity: 10, actualQuantity: 20 },
      { systemQuantity: 50, actualQuantity: 60 },
      { systemQuantity: 5, actualQuantity: 15 },
    ];
    let totalSurplus = 0;
    for (const row of products) {
      totalSurplus += await resolveInventoryCountDifferenceValueKgs(
        {} as never,
        fifo as PricingFifoService,
        {
          warehouseId: 'wh-1',
          productId: 'prod',
          systemQuantity: row.systemQuantity,
          actualQuantity: row.actualQuantity,
          unitCostKgs: 500,
          isHqWarehouse: true,
        },
      );
    }
    const warehouseTotalIfWrong = (20 + 60 + 15) * 500;
    assert.equal(totalSurplus, (10 + 10 + 10) * 500);
    assert.notEqual(totalSurplus, warehouseTotalIfWrong);
  });

  it('multi-layer FIFO shortage uses layer costs for difference quantity only', async () => {
    const fifo = mockFifoService(400, [], [
      { qty: 5, unitCost: 400 },
      { qty: 5, unitCost: 600 },
    ]);
    const shortage = await resolveInventoryCountDifferenceValueKgs(
      {} as never,
      fifo as PricingFifoService,
      {
        warehouseId: 'wh-1',
        productId: 'prod-a',
        systemQuantity: 10,
        actualQuantity: 3,
        unitCostKgs: 400,
        isHqWarehouse: true,
      },
    );
    assert.equal(shortage, -3200);
    assert.notEqual(shortage, -7000);
  });

  it('complete shortage does not equal warehouse total for partial stock lines', async () => {
    const fifo = mockFifoService(100);
    const shortage = await resolveInventoryCountDifferenceValueKgs(
      {} as never,
      fifo as PricingFifoService,
      {
        warehouseId: 'wh-1',
        productId: 'prod-a',
        systemQuantity: 10,
        actualQuantity: 0,
        unitCostKgs: 100,
        isHqWarehouse: true,
      },
    );
    assert.equal(shortage, -1000);
    assert.notEqual(shortage, -1736406);
  });
});

const mockTx = {
  fifoInventoryBatch: { findMany: async () => [] },
  stockMovement: { findMany: async () => [] },
} as never;

describe('recomputeInventoryCountLineValuation', () => {
  it('preview path matches stored line valuation for surplus', async () => {
    const fifo = mockFifoService(500);
    const line = await recomputeInventoryCountLineValuation(
      mockTx,
      fifo as PricingFifoService,
      hqWarehouse,
      {
        productId: 'prod-a',
        systemQuantity: 10,
        actualQuantity: 20,
      },
      true,
    );
    assert.equal(line.unitCostKgs, 500);
    assert.equal(line.differenceQuantity, 10);
    assert.equal(line.differenceValueKgs, 5000);
  });

  it('assertInventoryCountLinesMatchAuthoritativeValuation detects stale stored values', async () => {
    const fifo = mockFifoService(500);
    const check = await assertInventoryCountLinesMatchAuthoritativeValuation(
      mockTx,
      fifo as PricingFifoService,
      hqWarehouse,
      [
        {
          id: 'item-1',
          productId: 'prod-a',
          systemQuantity: 10,
          actualQuantity: 20,
          differenceQuantity: 10,
          differenceValueKgs: 1736406,
          unitCostKgs: 500,
        },
      ],
      true,
    );
    assert.equal(check.ok, false);
    assert.equal(check.mismatches[0]?.expected, 5000);
    assert.equal(check.mismatches[0]?.actual, 1736406);
  });
});
