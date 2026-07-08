import { seedHqProductCatalogFromWarehouseInventory } from './hq-product-catalog.util';

describe('seedHqProductCatalogFromWarehouseInventory', () => {
  it('skips seeding when catalog already has active products', async () => {
    const prisma = {
      branch: {
        findFirst: jest.fn().mockResolvedValue({ id: 'hq-branch' }),
        create: jest.fn(),
      },
      warehouse: { findMany: jest.fn() },
      product: {
        count: jest.fn().mockResolvedValue(3),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      productCategory: { findFirst: jest.fn() },
      inventoryBalance: { findMany: jest.fn() },
    };

    const result = await seedHqProductCatalogFromWarehouseInventory(prisma as any);
    expect(result).toEqual({ seeded: false, catalogCount: 3, adoptedCount: 0, createdCount: 0 });
    expect(prisma.inventoryBalance.findMany).not.toHaveBeenCalled();
  });

  it('adopts HQ inventory products into catalog branch without duplicating SKU', async () => {
    const sourceProduct = {
      id: 'prod-1',
      branchId: 'other-branch',
      warehouseId: 'hq-wh',
      categoryId: 'cat-1',
      name: 'Motor 80H',
      sku: '80H',
      barcode: null,
      category: 'Motors',
      unit: 'pcs',
      weightKg: 1,
      isActive: true,
      deletedAt: null,
      purchasePriceYuan: 0,
      latestYuanRate: 0,
      purchaseCostKgs: 0,
      transportCostKgs: 0,
      finalCostKgs: 100,
      costPriceKgs: 100,
      sellingPriceKgs: 150,
      wholesalePriceKgs: 120,
      hqBranchWholesalePriceKgs: 120,
      recommendedRetailPriceKgs: 150,
      minimumSellingPriceKgs: 130,
      pricingMode: 'AUTO',
    };

    const prisma = {
      branch: {
        findFirst: jest.fn().mockResolvedValue({ id: 'hq-branch' }),
        create: jest.fn(),
      },
      warehouse: {
        findMany: jest.fn().mockResolvedValue([{ id: 'hq-wh' }]),
      },
      product: {
        count: jest
          .fn()
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(1),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue(sourceProduct),
      },
      productCategory: {
        findFirst: jest.fn().mockResolvedValue({ id: 'cat-1' }),
      },
      inventoryBalance: {
        findMany: jest.fn().mockResolvedValue([{ product: sourceProduct }]),
      },
    };

    const result = await seedHqProductCatalogFromWarehouseInventory(prisma as any);
    expect(result.seeded).toBe(true);
    expect(result.adoptedCount).toBe(1);
    expect(result.createdCount).toBe(0);
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 'prod-1' },
      data: { branchId: 'hq-branch' },
    });
  });
});
