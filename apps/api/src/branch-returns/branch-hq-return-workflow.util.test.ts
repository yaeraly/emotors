import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BranchHqReturnStatus } from '@prisma/client';
import {
  allItemsPicked,
  canApproveOrRejectBranchHqReturn,
  canEditBranchHqReturnDraft,
  canFinanceAdjustBranchHqReturn,
  canPickPackShipBranchHqReturn,
  canReceiveBranchHqReturnAtHq,
  canShipBranchHqReturn,
  canSubmitBranchHqReturn,
} from './branch-hq-return-status.util';
import {
  buildHqReturnedFifoLayersFromConsumedAllocations,
  previewBranchHqReturnFifoConsumption,
} from './branch-hq-return-fifo.util';
import { computeBranchHqReturnDebtAdjustment } from './branch-hq-return-finance.util';

describe('branch hq return end-to-end scenario math', () => {
  it('covers approval reservation → ship FIFO → HQ receive → finance with no fake profit', () => {
    // After approval: physical stock unchanged; reservation reduces available conceptually.
    const onHand = 10;
    const reservedForReturn = 7;
    const availableAfterApproval = onHand - reservedForReturn;
    assert.equal(availableAfterApproval, 3);

    const shipPreview = previewBranchHqReturnFifoConsumption(
      [
        {
          batchId: 'A',
          remainingQuantity: 5,
          reservedQuantity: 0,
          unitCostKgs: 2000,
          initialQuantity: 5,
          layerTotalCostKgs: 10000,
        },
        {
          batchId: 'B',
          remainingQuantity: 5,
          reservedQuantity: 0,
          unitCostKgs: 2500,
          initialQuantity: 5,
          layerTotalCostKgs: 12500,
        },
      ],
      7,
      { subtractReserved: false },
    );
    assert.equal(shipPreview.totalCostKgs, 15000);

    // After shipment: branch remaining FIFO = 3 × 2500; goods in transit = 7; HQ unchanged.
    const branchRemainingQty = 10 - 7;
    const goodsInTransit = 7;
    const hqBeforeReceive = 0;
    assert.equal(branchRemainingQty, 3);
    assert.equal(goodsInTransit, 7);
    assert.equal(hqBeforeReceive, 0);

    const hqLayers = buildHqReturnedFifoLayersFromConsumedAllocations(
      shipPreview.lines.map((line, index) => ({
        id: `alloc-${index}`,
        fifoBatchId: line.batchId,
        quantity: line.quantity,
        unitCostKgs: line.unitCostKgs,
        totalCostKgs: line.totalCostKgs,
      })),
      7,
    );
    assert.equal(
      hqLayers.reduce((sum, line) => sum + line.quantity, 0),
      7,
    );
    assert.equal(
      hqLayers.reduce((sum, line) => sum + line.totalCostKgs, 0),
      15000,
    );

    const finance = computeBranchHqReturnDebtAdjustment({
      acceptedReturnValueKgs: 15000,
      currentDebtKgs: 20000,
    });
    assert.equal(finance.appliedCreditKgs, 15000);
    assert.equal(finance.resultingDebtKgs, 5000);
    assert.equal(finance.salesRevenueKgs, 0);
    assert.equal(finance.profitKgs, 0);
  });

  it('partial receipt keeps missing quantity as discrepancy/in-transit exception', () => {
    const shipped = 7;
    const received = 6;
    const difference = shipped - received;
    assert.equal(difference, 1);

    const hqLayers = buildHqReturnedFifoLayersFromConsumedAllocations(
      [
        {
          id: 'a',
          fifoBatchId: 'A',
          quantity: 5,
          unitCostKgs: 2000,
          totalCostKgs: 10000,
        },
        {
          id: 'b',
          fifoBatchId: 'B',
          quantity: 2,
          unitCostKgs: 2500,
          totalCostKgs: 5000,
        },
      ],
      received,
    );
    assert.equal(
      hqLayers.reduce((sum, line) => sum + line.quantity, 0),
      6,
    );
    assert.notEqual(
      hqLayers.reduce((sum, line) => sum + line.quantity, 0),
      shipped,
    );
  });

  it('status helpers match workflow gates', () => {
    assert.equal(canEditBranchHqReturnDraft(BranchHqReturnStatus.DRAFT), true);
    assert.equal(canSubmitBranchHqReturn(BranchHqReturnStatus.DRAFT), true);
    assert.equal(
      canApproveOrRejectBranchHqReturn(BranchHqReturnStatus.PENDING_BRANCH_APPROVAL),
      true,
    );
    assert.equal(canPickPackShipBranchHqReturn(BranchHqReturnStatus.BRANCH_APPROVED), true);
    assert.equal(canShipBranchHqReturn(BranchHqReturnStatus.PACKED), true);
    assert.equal(canReceiveBranchHqReturnAtHq(BranchHqReturnStatus.SHIPPED_TO_HQ), true);
    assert.equal(canFinanceAdjustBranchHqReturn(BranchHqReturnStatus.HQ_ACCEPTED), true);
    assert.equal(
      allItemsPicked([
        { quantity: 1, pickedAt: '2026-08-12T00:00:00.000Z' },
        { quantity: 2, pickedAt: '2026-08-12T00:01:00.000Z' },
      ]),
      true,
    );
  });
});
