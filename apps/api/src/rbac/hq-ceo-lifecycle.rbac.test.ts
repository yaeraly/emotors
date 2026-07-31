import { Role } from '@prisma/client';
import { canHqCeoManageLifecycle } from '../lifecycle/hq-ceo-lifecycle.util';

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const ceo = { role: Role.CEO, roles: [Role.CEO], permissions: [] };
const accountant = { role: Role.HQ_ACCOUNTANT, roles: [Role.HQ_ACCOUNTANT], permissions: [] };

assertEqual(canHqCeoManageLifecycle(ceo), true, '20. HQ CEO allowed');
assertEqual(canHqCeoManageLifecycle(accountant), false, '20b. Other roles receive 403 at service layer');

console.log('hq-ceo-lifecycle.rbac.test.ts: all assertions passed');
