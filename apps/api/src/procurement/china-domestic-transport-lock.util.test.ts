import assert from 'node:assert/strict';
import {
  canEditChinaDomesticTransport,
  isChinaDomesticTransportLockedByStatus,
  isChinaDomesticTransportUnlocked,
  touchesChinaDomesticTransportFields,
} from './china-domestic-transport-lock.util';

assert.equal(isChinaDomesticTransportLockedByStatus('DRAFT'), false);
assert.equal(isChinaDomesticTransportLockedByStatus('ORDERED'), false);
assert.equal(isChinaDomesticTransportLockedByStatus('SHIPPED_TO_YIWU'), true);
assert.equal(isChinaDomesticTransportLockedByStatus('IN_TRANSIT'), true);

const unlockedOrder = {
  status: 'SHIPPED_TO_YIWU',
  chinaDomesticTransportUnlockExpiresAt: new Date(Date.now() + 60_000).toISOString(),
};
assert.equal(canEditChinaDomesticTransport(unlockedOrder), true);
assert.equal(
  canEditChinaDomesticTransport({ status: 'SHIPPED_TO_YIWU', chinaDomesticTransportUnlockExpiresAt: null }),
  false,
);
assert.equal(isChinaDomesticTransportUnlocked(unlockedOrder), true);
assert.equal(touchesChinaDomesticTransportFields({ chinaDomesticTransportYuan: 10 }), true);
assert.equal(touchesChinaDomesticTransportFields({ customsCostKgs: 10 }), false);

console.log('china-domestic-transport-lock.util.test.ts passed');
