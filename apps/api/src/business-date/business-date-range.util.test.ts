import assert from 'node:assert/strict';
import {
  assertBusinessDateWithinAllowedRange,
  businessDateMinimum,
  businessDateMaximum,
  BUSINESS_DATE_RANGE_ERROR_RU,
  isBusinessDateWithinAllowedRange,
} from './business-date-range.util';

const now = new Date(2026, 6, 30, 15, 0, 0); // 30 Jul 2026

console.assert(
  businessDateMinimum(now).getTime() === new Date(2026, 1, 30).getTime(),
  '1. minimum is 5 calendar months before',
);
console.assert(
  businessDateMaximum(now).getDate() === 30 && businessDateMaximum(now).getMonth() === 6,
  '2. maximum is end of current day',
);
console.assert(
  isBusinessDateWithinAllowedRange(new Date(2026, 3, 15), now) === true,
  '3. date within 5 months accepted',
);
console.assert(
  isBusinessDateWithinAllowedRange(new Date(2026, 0, 15), now) === false,
  '4. date older than 5 months rejected',
);
console.assert(
  isBusinessDateWithinAllowedRange(new Date(2026, 7, 1), now) === false,
  '5. future date rejected',
);

let threw = false;
try {
  assertBusinessDateWithinAllowedRange(new Date(2025, 0, 1), now);
} catch (error) {
  threw = true;
  const body = error as { response?: { message?: string } };
  assert.equal(body.response?.message ?? (error as Error).message, BUSINESS_DATE_RANGE_ERROR_RU);
}
console.assert(threw, '6. assert throws Russian range error');

console.log('business-date-range.util.test.ts: all assertions passed');
