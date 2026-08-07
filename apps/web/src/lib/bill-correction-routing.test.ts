import { formatBillCorrectionRoutingAssignee } from './bill-correction-routing';

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

assertEqual(
  formatBillCorrectionRoutingAssignee(
    { direction: 'FROM_HQ_CASHIER', employeeName: 'Айбек' },
    'HQ Cashier',
  ),
  'HQ Cashier — Айбек',
  'cashier assignee with name',
);

assertEqual(
  formatBillCorrectionRoutingAssignee({ direction: 'TO_SUPPLY_MANAGER' }, 'Supply Manager'),
  'Supply Manager',
  'supply manager role-only',
);

console.log('bill-correction-routing.test.ts passed');
