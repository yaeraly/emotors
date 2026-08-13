import { Role } from '@prisma/client';
import {
  canUnlockProcurementOrder,
  canUserEditProcurementItems,
  computeSentToSupplierTimestamps,
  computeUnlockExpiry,
  PROCUREMENT_EDIT_WINDOW_MS,
  resolveProcurementEditState,
} from './procurement-edit-window.util';

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

const now = new Date('2026-06-30T12:00:00.000Z');
const sent = computeSentToSupplierTimestamps(now);

assertEqual(
  sent.editableUntil.getTime(),
  now.getTime() + PROCUREMENT_EDIT_WINDOW_MS,
  'editableUntil is sent + 24h',
);

const withinWindow = resolveProcurementEditState(
  {
    status: 'SENT_TO_SUPPLIER',
    sentToSupplierAt: sent.sentToSupplierAt,
    editableUntil: sent.editableUntil,
  },
  new Date('2026-06-30T18:00:00.000Z'),
);
assertEqual(withinWindow.editWindowStatus, 'EDITABLE', 'within window status');
assertEqual(withinWindow.isEditable, true, 'within window editable');

const afterWindow = resolveProcurementEditState(
  {
    status: 'SENT_TO_SUPPLIER',
    sentToSupplierAt: sent.sentToSupplierAt,
    editableUntil: sent.editableUntil,
  },
  new Date('2026-07-01T13:00:00.000Z'),
);
assertEqual(afterWindow.editWindowStatus, 'LOCKED', 'after window locked');
assertEqual(afterWindow.isEditable, false, 'after window not editable');

const unlockAt = new Date('2026-07-01T12:00:00.000Z');
const unlockExpiresAt = computeUnlockExpiry(unlockAt);
const unlocked = resolveProcurementEditState(
  {
    status: 'SENT_TO_SUPPLIER',
    sentToSupplierAt: sent.sentToSupplierAt,
    editableUntil: sent.editableUntil,
    unlockedAt: unlockAt,
    unlockExpiresAt,
  },
  new Date('2026-07-01T18:00:00.000Z'),
);
assertEqual(unlocked.editWindowStatus, 'CEO_UNLOCKED', 'ceo unlocked status');
assertEqual(unlocked.isEditable, true, 'ceo unlocked editable');

const ceo = { role: Role.CEO, roles: [Role.CEO] };
const scm = { role: Role.SUPPLY_CHAIN_MANAGER, roles: [Role.SUPPLY_CHAIN_MANAGER] };
const wm = { role: Role.WAREHOUSE_MANAGER, roles: [Role.WAREHOUSE_MANAGER] };

assertEqual(canUnlockProcurementOrder(ceo), true, 'ceo can unlock');
assertEqual(canUnlockProcurementOrder(scm), false, 'scm cannot unlock');
assertEqual(canUserEditProcurementItems(ceo, unlocked), true, 'ceo can edit when unlocked');
assertEqual(canUserEditProcurementItems(scm, unlocked), false, 'scm cannot edit ceo unlock');
assertEqual(canUserEditProcurementItems(scm, withinWindow), true, 'scm can edit within window');
assertEqual(canUserEditProcurementItems(wm, withinWindow), false, 'wm cannot edit items');

console.log('procurement-edit-window.util.test.ts passed');
