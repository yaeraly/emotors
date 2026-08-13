import { Role } from '@prisma/client';
import { sanitizeDistributionOrderForBranchCeo } from './branch-ceo-distribution.presenter';

describe('sanitizeDistributionOrderForBranchCeo', () => {
  it('removes HQ cost and margin fields while keeping branch transfer price', () => {
    const sanitized = sanitizeDistributionOrderForBranchCeo({
      id: 'order-1',
      orderNumber: 'DO-001',
      totalAmount: 1000,
      totalCost: 700,
      totalProfit: 300,
      deliveryCostSummary: { landedCostTotal: 700 },
      items: [
        {
          id: 'line-1',
          productId: 'product-1',
          sku: 'SKU-1',
          productName: 'Battery',
          quantity: 2,
          unitPrice: 500,
          totalPrice: 1000,
          unitCost: 350,
          profit: 300,
          landedUnitCostKgs: 360,
        },
      ],
    });

    expect(sanitized.totalCost).toBeUndefined();
    expect(sanitized.totalProfit).toBeUndefined();
    expect(sanitized.deliveryCostSummary).toBeUndefined();
    expect(sanitized.totalAmount).toBe(1000);
    expect(sanitized.items?.[0]).toMatchObject({
      unitPrice: 500,
      totalPrice: 1000,
    });
    expect((sanitized.items?.[0] as Record<string, unknown>).unitCost).toBeUndefined();
    expect((sanitized.items?.[0] as Record<string, unknown>).profit).toBeUndefined();
  });
});
