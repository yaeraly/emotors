import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildHqDispatchSendPayload,
  HQ_DISPATCH_TRANSPORT_FIELD_KEYS,
  shouldShowHqDispatchTransportFields,
} from './hq-dispatch-form';

describe('hq-dispatch-form', () => {
  it('does not show transport company, driver, vehicle number, or notes on PACKED form', () => {
    assert.equal(shouldShowHqDispatchTransportFields(), false);
    assert.deepEqual(
      [...HQ_DISPATCH_TRANSPORT_FIELD_KEYS],
      ['transportCompany', 'driverName', 'vehicleNumber', 'transportNotes'],
    );
  });

  it('ships without transport fields in the submit payload', () => {
    const payload = buildHqDispatchSendPayload();
    assert.deepEqual(payload, {});
    for (const key of HQ_DISPATCH_TRANSPORT_FIELD_KEYS) {
      assert.equal(Object.prototype.hasOwnProperty.call(payload, key), false);
    }
  });
});
