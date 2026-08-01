import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseReceivingTransportCostInput,
  responseContainsConfidentialTransportFields,
  toBranchWarehouseTransportAllocationResult,
  TRANSPORT_COST_EMPTY_MESSAGE,
} from './branch-receiving-transport.presenter';

describe('branch-receiving-transport.presenter', () => {
  it('rejects empty transport cost with guided message', () => {
    const result = parseReceivingTransportCostInput('');
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.message, TRANSPORT_COST_EMPTY_MESSAGE);
    }
  });

  it('accepts zero transport cost', () => {
    const result = parseReceivingTransportCostInput(0);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.transportCostKgs, 0);
  });

  it('rejects negative transport cost', () => {
    const result = parseReceivingTransportCostInput(-1);
    assert.equal(result.ok, false);
  });

  it('returns branch-safe allocation result without confidential fields', () => {
    const safe = toBranchWarehouseTransportAllocationResult({
      transportCostKgs: 1000,
      totalShipmentWeightKg: 250,
      allocatedAt: '2026-08-01T00:00:00.000Z',
    });
    assert.equal(safe.status, 'ALLOCATED');
    assert.equal(responseContainsConfidentialTransportFields(safe), false);
    assert.equal(safe.transportCostKgs, 1000);
    assert.equal(safe.totalShipmentWeightKg, 250);
  });

  it('detects confidential transport allocation fields in payloads', () => {
    assert.equal(
      responseContainsConfidentialTransportFields({ hqTransferUnitCost: 10 }),
      true,
    );
    assert.equal(
      responseContainsConfidentialTransportFields({ allocations: [] }),
      true,
    );
  });
});
