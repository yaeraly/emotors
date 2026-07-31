import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PricingFifoService } from '../pricing/pricing-fifo.service';
import {
  resolveInventoryCountDifferenceValueKgs,
} from './inventory-authoritative-value.util';

type MockFifo = Pick<PricingFifoService, 'previewFifoAllocation'>;

function mockFifoService(unitCostPerUnit: number, allocationQtys: number[] = []): MockFifo {
  return {
    previewFifoAllocation: async (_tx, input) => {
      allocationQtys.push(input.quantity);
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
});
