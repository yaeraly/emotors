import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildBranchReceiveLinesFromHqAllocations } from './pricing-fifo-branch-receive.util';

describe('buildBranchReceiveLinesFromHqAllocations', () => {
  it('creates one branch line per HQ FIFO allocation', () => {
    const lines = buildBranchReceiveLinesFromHqAllocations(
      [
        { id: 'a1', fifoBatchId: 'hq-L1', quantity: 3, unitCostKgs: 5000 },
        { id: 'a2', fifoBatchId: 'hq-L2', quantity: 2, unitCostKgs: 6000 },
      ],
      5,
      0,
    );
    assert.equal(lines.length, 2);
    assert.equal(lines[0].hqFifoLayerId, 'hq-L1');
    assert.equal(lines[0].quantity, 3);
    assert.equal(lines[0].transferUnitCostKgs, 5000);
    assert.equal(lines[1].hqFifoLayerId, 'hq-L2');
    assert.equal(lines[1].quantity, 2);
    assert.equal(lines[1].transferUnitCostKgs, 6000);
  });

  it('does not merge layers with different costs', () => {
    const lines = buildBranchReceiveLinesFromHqAllocations(
      [
        { id: 'a1', fifoBatchId: 'hq-L1', quantity: 3, unitCostKgs: 5000 },
        { id: 'a2', fifoBatchId: 'hq-L2', quantity: 10, unitCostKgs: 6000 },
      ],
      5,
      0,
    );
    assert.notEqual(lines[0].transferUnitCostKgs, lines[1].transferUnitCostKgs);
  });

  it('applies transport per unit to each layer independently', () => {
    const lines = buildBranchReceiveLinesFromHqAllocations(
      [{ id: 'a1', fifoBatchId: 'hq-L1', quantity: 3, unitCostKgs: 5000 }],
      3,
      50,
    );
    assert.equal(lines[0].finalBranchUnitCostKgs, 5050);
  });

  it('preserves authoritative HQ allocation line total on partial branch receive', () => {
    const lines = buildBranchReceiveLinesFromHqAllocations(
      [{ id: 'a1', fifoBatchId: 'hq-L1', quantity: 11, unitCostKgs: 83123.45, totalCostKgs: 914369.8 }],
      11,
      0,
    );
    assert.equal(lines.length, 1);
    assert.equal(lines[0].lineTotalCostKgs, 914369.8);
    assert.notEqual(lines[0].lineTotalCostKgs, lines[0].finalBranchUnitCostKgs * lines[0].quantity);
  });

  it('omitting totalCostKgs falls back to unit×qty (production must pass totalCostKgs)', () => {
    const lines = buildBranchReceiveLinesFromHqAllocations(
      [{ id: 'a1', fifoBatchId: 'hq-L1', quantity: 11, unitCostKgs: 14756.12 }],
      11,
      0,
    );
    assert.equal(lines[0].lineTotalCostKgs, 162317.32);
    assert.notEqual(lines[0].lineTotalCostKgs, 162317.33);
  });

  it('full-layer transfer with totalCostKgs preserves exact HQ consumed value', () => {
    const lines = buildBranchReceiveLinesFromHqAllocations(
      [
        { id: 'a1', fifoBatchId: 'hq-L1', quantity: 11, unitCostKgs: 14756.12, totalCostKgs: 162317.33 },
        { id: 'a2', fifoBatchId: 'hq-L2', quantity: 11, unitCostKgs: 14756.13, totalCostKgs: 162317.41 },
      ],
      22,
      0,
    );
    assert.equal(lines[0].lineTotalCostKgs, 162317.33);
    assert.equal(lines[1].lineTotalCostKgs, 162317.41);
  });
});
