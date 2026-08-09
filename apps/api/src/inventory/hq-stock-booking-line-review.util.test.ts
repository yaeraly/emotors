import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveBookingQuantityDelta } from './hq-stock-booking-line-review.util';

describe('resolveBookingQuantityDelta', () => {
  it('reserves additional quantity when HQ Sales increases approved qty on re-review', () => {
    assert.deepEqual(resolveBookingQuantityDelta(6, 10), {
      reserveAdditional: 4,
      releaseExcess: 0,
    });
  });

  it('releases excess when HQ Sales decreases approved qty on re-review', () => {
    assert.deepEqual(resolveBookingQuantityDelta(10, 6), {
      reserveAdditional: 0,
      releaseExcess: 4,
    });
  });

  it('leaves booking unchanged when approved qty matches current booking', () => {
    assert.deepEqual(resolveBookingQuantityDelta(8, 8), {
      reserveAdditional: 0,
      releaseExcess: 0,
    });
  });

  it('supports re-approval after rejection when booking was fully released', () => {
    assert.deepEqual(resolveBookingQuantityDelta(0, 5), {
      reserveAdditional: 5,
      releaseExcess: 0,
    });
  });
});
