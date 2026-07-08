import { allocateBranchReceivingTransportCost } from './branch-receiving-transport.util';

describe('allocateBranchReceivingTransportCost', () => {
  it('allocates by weight when weights exist', () => {
    const rows = allocateBranchReceivingTransportCost(
      [
        { productId: 'a', receivedQuantity: 2, weightKg: 1, unitCostKgs: 100 },
        { productId: 'b', receivedQuantity: 1, weightKg: 2, unitCostKgs: 200 },
      ],
      300,
    );

    expect(rows).toHaveLength(2);
    const totalAllocated = rows.reduce((sum, row) => sum + row.transportExpenseAllocation, 0);
    expect(totalAllocated).toBe(300);
    expect(rows.find((row) => row.productId === 'a')?.finalUnitCostKgs).toBe(150);
    expect(rows.find((row) => row.productId === 'b')?.finalUnitCostKgs).toBe(300);
  });

  it('allocates by quantity when weights are missing', () => {
    const rows = allocateBranchReceivingTransportCost(
      [
        { productId: 'a', receivedQuantity: 1, weightKg: 0, unitCostKgs: 50 },
        { productId: 'b', receivedQuantity: 3, weightKg: 0, unitCostKgs: 70 },
      ],
      100,
    );

    expect(rows.find((row) => row.productId === 'a')?.transportExpenseAllocation).toBe(25);
    expect(rows.find((row) => row.productId === 'b')?.transportExpenseAllocation).toBe(75);
  });
});
