import { sanitizeBranchCeoStockRow } from './branch-ceo-warehouse.presenter';

describe('sanitizeBranchCeoStockRow', () => {
  it('keeps branch inventory value and removes cost composition fields', () => {
    const sanitized = sanitizeBranchCeoStockRow({
      id: 'balance-1',
      sku: 'SKU-1',
      product: { name: 'Battery', minStockLevel: 2 },
      categoryName: 'Parts',
      quantity: 1,
      reservedQuantity: 0,
      availableQuantity: 1,
      totalValueKgs: 1500,
      averageCostKgs: 900,
      landedCostKgs: 1000,
      supplierName: 'China Supplier',
      lastMovementAt: '2026-01-01',
      status: 'ACTIVE',
    });

    expect(sanitized.totalValueKgs).toBe(1500);
    expect(sanitized.stockStatus).toBe('LOW_STOCK');
    expect((sanitized as Record<string, unknown>).averageCostKgs).toBeUndefined();
    expect((sanitized as Record<string, unknown>).landedCostKgs).toBeUndefined();
    expect((sanitized as Record<string, unknown>).supplierName).toBeUndefined();
  });
});
