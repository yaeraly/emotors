import { readFileSync } from 'fs';
import { join } from 'path';
import {
  calculateReconciliationDifference,
  formatEditableDecimal,
  parseEditableDecimal,
  sanitizeEditableDecimalInput,
} from './finance-decimal-input.util';

function assert(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const page = readFileSync(
  join(__dirname, '../app/finance/accounts/page.tsx'),
  'utf8',
);
const service = readFileSync(
  join(__dirname, '../../../api/src/finance/finance-reconciliation.service.ts'),
  'utf8',
);

assert(page.includes('actualBalanceInput'), '1. actual balance uses dedicated input state');
assert(page.includes('setActualBalanceInput'), '1. actual balance input is editable');
assert(!page.includes('readOnly'), '1. reconciliation input is not readOnly');
assert(page.includes('finance.systemBalance'), '2. system balance label shown read-only');
assert(page.includes('inputMode="decimal"'), '6. decimal text input mode');
assert(!page.includes('type="number"'), '1. number input removed from reconciliation dialog');

const openBlock = page.slice(
  page.indexOf('function openReconciliation(account: CashierAccountRow)'),
  page.indexOf('  useEffect(() => {', page.indexOf('function openReconciliation(account: CashierAccountRow)')),
);
assert(openBlock.includes('setReconTarget'), '3. open sets selected account');
assert(!openBlock.includes('setActualBalanceInput'), '4. open does not overwrite input each click');

const initEffect = page.slice(
  page.indexOf('}, [reconTarget?.id]);') - 400,
  page.indexOf('}, [reconTarget?.id]);') + 20,
);
assert(initEffect.includes('setActualBalanceInput'), '3. initial actual balance populated on open');
assert(initEffect.includes('reconTarget?.id'), '3. initialize only when selected account changes');

assertEqual(parseEditableDecimal('0'), 0, '5. zero accepted');
assertEqual(parseEditableDecimal('98500.25'), 98500.25, '6. decimal accepted');
assertEqual(parseEditableDecimal('abc'), null, '7. invalid rejected');
assertEqual(calculateReconciliationDifference(98500, 100000), -1500, '10. negative difference');
assertEqual(calculateReconciliationDifference(102000, 100000), 2000, '9. positive difference');
assertEqual(sanitizeEditableDecimalInput('98500.12abc'), '98500.12', '7. sanitize invalid chars');

assert(service.includes('resolveReconciliationSystemBalance'), '11. backend recalculates system balance');
assert(service.includes('calculateReconciliationDifference'), '11. backend recalculates difference');
assert(!service.includes('currentBalance: actualBalance'), '13. account balance not overwritten');
assert(!service.includes('availableBalance: actualBalance'), '13. account balance not overwritten');
assert(service.includes('HQ_ACCOUNT_RECONCILIATION_CREATED'), '12. reconciliation audit created');
assert(service.includes('Role.HQ_CASHIER'), '14. HQ cashier allowed');

console.log('finance-reconciliation-dialog.util.test.ts passed');
