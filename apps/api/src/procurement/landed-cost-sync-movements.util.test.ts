import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveMovementCostUpdates } from './landed-cost-sync-movements.util';

describe('resolveMovementCostUpdates — preserve per-shipment FIFO unit costs', () => {
  it('single movement uses authoritative order-line unit cost (not total÷qty)', () => {
    const updates = resolveMovementCostUpdates({
      orderLineFinalUnitCostKgs: 1944.17,
      orderLineTotalCostKgs: 19441.7,
      movements: [{ id: 'm1', quantity: 10, totalCostKgs: 19442.3, unitCostKgs: 1944.23 }],
    });
    assert.equal(updates[0]?.unitCostKgs, 1944.17);
    assert.equal(updates[0]?.totalCostKgs, 19441.7);
  });

  it('single movement uses order-line unit cost', () => {
    const updates = resolveMovementCostUpdates({
      orderLineFinalUnitCostKgs: 400,
      orderLineTotalCostKgs: 40000,
      movements: [{ id: 'm1', quantity: 100, totalCostKgs: 40000, unitCostKgs: 400 }],
    });
    assert.equal(updates.length, 1);
    assert.equal(updates[0]?.unitCostKgs, 400);
    assert.equal(updates[0]?.totalCostKgs, 40000);
  });

  it('two shipments keep distinct unit costs and reconcile to line total', () => {
    const updates = resolveMovementCostUpdates({
      orderLineFinalUnitCostKgs: 450,
      orderLineTotalCostKgs: 90000,
      movements: [
        { id: 'm1', quantity: 100, totalCostKgs: 40000, unitCostKgs: 400 },
        { id: 'm2', quantity: 100, totalCostKgs: 50000, unitCostKgs: 500 },
      ],
    });
    assert.equal(updates.length, 2);
    assert.equal(updates[0]?.unitCostKgs, 400);
    assert.equal(updates[1]?.unitCostKgs, 500);
    assert.equal(
      updates.reduce((sum, row) => sum + row.totalCostKgs, 0),
      90000,
    );
    assert.notEqual(updates[0]?.unitCostKgs, updates[1]?.unitCostKgs);
    assert.notEqual(updates[0]?.unitCostKgs, 450);
  });

  it('three shipments preserve three different unit costs', () => {
    const updates = resolveMovementCostUpdates({
      orderLineFinalUnitCostKgs: 433.33,
      orderLineTotalCostKgs: 130000,
      movements: [
        { id: 'm1', quantity: 100, totalCostKgs: 40000, unitCostKgs: 400 },
        { id: 'm2', quantity: 100, totalCostKgs: 50000, unitCostKgs: 500 },
        { id: 'm3', quantity: 100, totalCostKgs: 40000, unitCostKgs: 400 },
      ],
    });
    assert.equal(updates.length, 3);
    assert.equal(updates[0]?.unitCostKgs, 400);
    assert.equal(updates[1]?.unitCostKgs, 500);
    assert.equal(updates[2]?.unitCostKgs, 400);
  });
});
