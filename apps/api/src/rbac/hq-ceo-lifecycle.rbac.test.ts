import { Role, UserStatus } from '@prisma/client';
import {
  assessUserDeleteProtection,
  canHqCeoManageLifecycle,
} from '../lifecycle/hq-ceo-lifecycle.util';
import { USER_DELETE_SELF_MESSAGE } from '../lifecycle/hq-ceo-lifecycle.constants';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function run() {
  const selfProtection = await assessUserDeleteProtection(
    {
      user: {
        findFirst: async () => null,
      },
    } as unknown as import('@prisma/client').Prisma.TransactionClient,
    'ceo-1',
    'ceo-1',
  );
  assert(selfProtection.blocked === true && selfProtection.reason === 'SELF', '15. Self delete blocked');

  assert(USER_DELETE_SELF_MESSAGE.length > 0, '15b. Self delete message defined');

  const lastCeoProtection = await assessUserDeleteProtection(
    {
      user: {
        findFirst: async () => ({
          id: 'ceo-only',
          status: UserStatus.ACTIVE,
          role: Role.CEO,
          userRoles: [{ role: { code: Role.CEO } }],
        }),
        count: async () => 1,
      },
      cashierShift: { findFirst: async () => null },
      hqWarehousePickingTask: { findFirst: async () => null },
      financeAccount: { findFirst: async () => null },
      franchiseSupportTask: { findFirst: async () => null },
      inventoryCountSession: { findFirst: async () => null },
      saleInstallmentApproval: { findFirst: async () => null },
    } as unknown as import('@prisma/client').Prisma.TransactionClient,
    'other-ceo',
    'ceo-only',
  );
  assert(lastCeoProtection.blocked === true && lastCeoProtection.reason === 'LAST_CEO', '16. Last CEO blocked');

  assert(canHqCeoManageLifecycle({ role: Role.CEO, roles: [Role.CEO], permissions: [] }), 'CEO lifecycle ok');

  console.log('hq-ceo-lifecycle.protection.test.ts: all assertions passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
