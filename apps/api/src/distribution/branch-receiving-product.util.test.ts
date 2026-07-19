import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  ensureBranchProductForReceivingInTx,
  resolveMasterProductForReceivingInTx,
} from './branch-receiving-product.util';

const masterProduct = {
  id: 'hq-product-1',
  branchId: 'hq-branch',
  warehouseId: 'hq-warehouse',
  sku: 'SKU-001',
  barcode: null,
  name: 'Motor Controller',
  unit: 'pcs',
  weightKg: { toNumber: () => 1 } as any,
  categoryId: 'cat-1',
  category: 'MOTORS',
  minStockLevel: 0,
  isActive: true,
  finalCostKgs: { toNumber: () => 100 } as any,
  purchaseCostKgs: { toNumber: () => 80 } as any,
  transportCostKgs: { toNumber: () => 0 } as any,
  sellingPriceKgs: { toNumber: () => 150 } as any,
  wholesalePriceKgs: { toNumber: () => 120 } as any,
  hqBranchWholesalePriceKgs: { toNumber: () => 110 } as any,
  defaultSupplierId: null,
  defaultFactoryId: null,
};

function createTx(overrides: Record<string, jest.Mock> = {}) {
  return {
    branch: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
    warehouse: { findFirst: jest.fn() },
    product: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn() },
    ...overrides,
  } as any;
}

describe('resolveMasterProductForReceivingInTx', () => {
  it('resolves by persisted productId without using shipment item id', async () => {
    const tx = createTx();
    tx.branch.findUnique.mockResolvedValue({ id: 'hq-branch', deletedAt: null, status: 'ACTIVE' });
    tx.product.findFirst.mockResolvedValueOnce(masterProduct);

    const result = await resolveMasterProductForReceivingInTx(tx, {
      productId: 'hq-product-1',
      sku: 'SKU-001',
    });

    expect(result.id).toBe('hq-product-1');
    expect(tx.product.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'hq-product-1' }),
      }),
    );
  });

  it('falls back to HQ catalog SKU when direct productId is missing', async () => {
    const tx = createTx();
    tx.branch.findUnique.mockResolvedValue({ id: 'hq-branch', deletedAt: null, status: 'ACTIVE' });
    tx.product.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(masterProduct);

    const result = await resolveMasterProductForReceivingInTx(tx, {
      productId: 'stale-id',
      sku: 'SKU-001',
    });

    expect(result.id).toBe('hq-product-1');
  });

  it('throws a precise error when no product relation exists', async () => {
    const tx = createTx();
    tx.branch.findUnique.mockResolvedValue({ id: 'hq-branch', deletedAt: null, status: 'ACTIVE' });
    tx.product.findFirst.mockResolvedValue(null);
    tx.product.findMany.mockResolvedValue([]);

    await expect(
      resolveMasterProductForReceivingInTx(tx, {
        productId: 'missing-product',
        sku: 'SKU-404',
      }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('ensureBranchProductForReceivingInTx', () => {
  it('creates branch product when branch stock record does not exist yet', async () => {
    const tx = createTx();
    tx.warehouse.findFirst.mockResolvedValue({ id: 'branch-wh', branchId: 'branch-1' });
    tx.branch.findUnique.mockResolvedValue({ id: 'hq-branch', deletedAt: null, status: 'ACTIVE' });
    tx.product.findFirst
      .mockResolvedValueOnce(masterProduct)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(masterProduct);
    tx.product.create.mockResolvedValue({ id: 'branch-product-1' });

    const result = await ensureBranchProductForReceivingInTx(tx, {
      branchId: 'branch-1',
      warehouseId: 'branch-wh',
      productId: 'hq-product-1',
      sku: 'SKU-001',
    });

    expect(result.created).toBe(true);
    expect(result.productId).toBe('branch-product-1');
    expect(tx.product.create).toHaveBeenCalled();
  });

  it('reuses existing branch product by branchId and sku', async () => {
    const tx = createTx();
    tx.warehouse.findFirst.mockResolvedValue({ id: 'branch-wh', branchId: 'branch-1' });
    tx.branch.findUnique.mockResolvedValue({ id: 'hq-branch', deletedAt: null, status: 'ACTIVE' });
    tx.product.findFirst
      .mockResolvedValueOnce(masterProduct)
      .mockResolvedValueOnce({ id: 'existing-branch-product', warehouseId: 'other-wh' });

    const result = await ensureBranchProductForReceivingInTx(tx, {
      branchId: 'branch-1',
      warehouseId: 'branch-wh',
      productId: 'hq-product-1',
      sku: 'SKU-001',
    });

    expect(result.created).toBe(false);
    expect(result.productId).toBe('existing-branch-product');
    expect(tx.product.create).not.toHaveBeenCalled();
  });

  it('rejects ambiguous SKU matches', async () => {
    const tx = createTx();
    tx.branch.findUnique.mockResolvedValue({ id: 'hq-branch', deletedAt: null, status: 'ACTIVE' });
    tx.product.findFirst.mockResolvedValue(null);
    tx.product.findMany.mockResolvedValue([masterProduct, { ...masterProduct, id: 'dup' }]);

    await expect(
      resolveMasterProductForReceivingInTx(tx, { sku: 'SKU-001' }),
    ).rejects.toThrow(BadRequestException);
  });
});
