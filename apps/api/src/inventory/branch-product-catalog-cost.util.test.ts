import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { roundDisplayMoney } from '../pricing/product-cost-precision.util';
import { resolveBranchProductCatalogCostsForProducts } from './branch-product-catalog-cost.util';

type BatchRow = {
  id: string;
  productId: string;
  warehouseId: string;
  referenceType: string | null;
  referenceId: string | null;
  unitCostKgs: number;
  stockMovementId: string | null;
  remainingQuantity: number;
  receivedAt: Date;
  createdAt: Date;
};

function createMockClient(input: {
  batches: BatchRow[];
  movements?: Array<{
    id: string;
    quantity: number;
    unitCostKgs: number;
    totalCostKgs: number;
    referenceType?: string | null;
    referenceId?: string | null;
    note?: string | null;
  }>;
}) {
  return {
    fifoInventoryBatch: {
      findMany: async () => input.batches,
    },
    stockMovement: {
      findMany: async () => input.movements ?? [],
    },
    procurementGoodsReceivingItem: { findFirst: async () => null },
    procurementLandedCostSnapshot: { findUnique: async () => null },
    procurementOrderItem: { findUnique: async () => null },
  } as never;
}

describe('resolveBranchProductCatalogCostsForProducts', () => {
  const warehouseId = 'wh-branch-1';
  const productA = 'prod-a';
  const productB = 'prod-b';

  it('returns oldest active Branch FIFO layer unit cost', async () => {
    const batches: BatchRow[] = [
      {
        id: 'layer-1',
        productId: productA,
        warehouseId,
        referenceType: 'DISTRIBUTION_FIFO_ALLOCATION',
        referenceId: 'alloc-1',
        unitCostKgs: 100,
        stockMovementId: 'mov-1',
        remainingQuantity: 5,
        receivedAt: new Date('2026-01-01'),
        createdAt: new Date('2026-01-01'),
      },
      {
        id: 'layer-2',
        productId: productA,
        warehouseId,
        referenceType: 'DISTRIBUTION_FIFO_ALLOCATION',
        referenceId: 'alloc-2',
        unitCostKgs: 200,
        stockMovementId: 'mov-2',
        remainingQuantity: 3,
        receivedAt: new Date('2026-02-01'),
        createdAt: new Date('2026-02-01'),
      },
    ];
    const client = createMockClient({
      batches,
      movements: [
        {
          id: 'mov-1',
          quantity: 5,
          unitCostKgs: 100,
          totalCostKgs: 500,
        },
        {
          id: 'mov-2',
          quantity: 3,
          unitCostKgs: 200,
          totalCostKgs: 600,
        },
      ],
    });

    const costs = await resolveBranchProductCatalogCostsForProducts(client, {
      productIds: [productA],
      warehouseId,
    });
    const row = costs.get(productA);
    assert.equal(row?.branchInventoryCostAvailable, true);
    assert.equal(row?.currentBranchInventoryCost, 100);
    assert.equal(row?.branchFifoLayerId, 'layer-1');
  });

  it('includes branch transport in movement-based layer cost', async () => {
    const client = createMockClient({
      batches: [
        {
          id: 'layer-transport',
          productId: productA,
          warehouseId,
          referenceType: 'DISTRIBUTION_FIFO_ALLOCATION',
          referenceId: 'alloc-3',
          unitCostKgs: 5085.33,
          stockMovementId: 'mov-3',
          remainingQuantity: 11,
          receivedAt: new Date('2026-01-01'),
          createdAt: new Date('2026-01-01'),
        },
      ],
      movements: [
        {
          id: 'mov-3',
          quantity: 11,
          unitCostKgs: 5085.33,
          totalCostKgs: 55938.63,
        },
      ],
    });

    const costs = await resolveBranchProductCatalogCostsForProducts(client, {
      productIds: [productA],
      warehouseId,
    });
    assert.equal(costs.get(productA)?.currentBranchInventoryCost, 5085.33);
  });

  it('returns unavailable cost when product has no active branch stock', async () => {
    const client = createMockClient({ batches: [] });
    const costs = await resolveBranchProductCatalogCostsForProducts(client, {
      productIds: [productA],
      warehouseId,
    });
    const row = costs.get(productA);
    assert.equal(row?.branchInventoryCostAvailable, false);
    assert.equal(row?.currentBranchInventoryCost, null);
  });

  it('skips exhausted layers and uses next active layer', async () => {
    const client = createMockClient({
      batches: [
        {
          id: 'layer-next',
          productId: productA,
          warehouseId,
          referenceType: 'DISTRIBUTION_FIFO_ALLOCATION',
          referenceId: 'alloc-4',
          unitCostKgs: 14756.12,
          stockMovementId: 'mov-4',
          remainingQuantity: 8,
          receivedAt: new Date('2026-03-01'),
          createdAt: new Date('2026-03-01'),
        },
      ],
      movements: [
        {
          id: 'mov-4',
          quantity: 8,
          unitCostKgs: 14756.12,
          totalCostKgs: 118048.96,
        },
      ],
    });

    const costs = await resolveBranchProductCatalogCostsForProducts(client, {
      productIds: [productA],
      warehouseId,
    });
    assert.equal(costs.get(productA)?.currentBranchInventoryCost, 14756.12);
  });

  it('resolves costs per product in the same warehouse only', async () => {
    const client = createMockClient({
      batches: [
        {
          id: 'layer-a',
          productId: productA,
          warehouseId,
          referenceType: 'DISTRIBUTION_FIFO_ALLOCATION',
          referenceId: 'alloc-a',
          unitCostKgs: 300,
          stockMovementId: 'mov-a',
          remainingQuantity: 2,
          receivedAt: new Date('2026-01-01'),
          createdAt: new Date('2026-01-01'),
        },
        {
          id: 'layer-b',
          productId: productB,
          warehouseId,
          referenceType: 'DISTRIBUTION_FIFO_ALLOCATION',
          referenceId: 'alloc-b',
          unitCostKgs: 400,
          stockMovementId: 'mov-b',
          remainingQuantity: 1,
          receivedAt: new Date('2026-01-01'),
          createdAt: new Date('2026-01-01'),
        },
      ],
      movements: [
        { id: 'mov-a', quantity: 2, unitCostKgs: 300, totalCostKgs: 600 },
        { id: 'mov-b', quantity: 1, unitCostKgs: 400, totalCostKgs: 400 },
      ],
    });

    const costs = await resolveBranchProductCatalogCostsForProducts(client, {
      productIds: [productA, productB],
      warehouseId,
    });
    assert.equal(costs.get(productA)?.currentBranchInventoryCost, 300);
    assert.equal(costs.get(productB)?.currentBranchInventoryCost, 400);
    assert.equal(
      roundDisplayMoney(
        Number(costs.get(productA)?.currentBranchInventoryCost) +
          Number(costs.get(productB)?.currentBranchInventoryCost),
      ),
      700,
    );
  });
});
