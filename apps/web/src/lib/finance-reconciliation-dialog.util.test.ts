import { readFileSync } from 'fs';
import { join } from 'path';
import {
  calculateReconciliationDifference,
  isCompleteMoneyDecimal,
  normalizeMoneyInput,
  parseMoneyDecimal,
  previewReconciliationDifference,
  toEditableMoney,
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
assert(page.includes('useState(\'\')'), '8. input state is initialized as string');
assert(!page.includes('readOnly'), '1. reconciliation input is not readOnly');
assert(page.includes('finance.systemBalance'), '2. system balance label shown read-only');
assert(page.includes('inputMode="decimal"'), '6. decimal text input mode');
assert(!page.includes('type="number"'), '7. number input removed from reconciliation dialog');
assert(!page.includes('max={1}'), '7. input is not clamped to max 1');
assert(page.includes('normalizeMoneyInput'), 'uses normalizeMoneyInput while typing');
assert(page.includes('parseMoneyDecimal'), 'submit parses with parseMoneyDecimal');
assert(page.includes('previewReconciliationDifference'), '11. difference preview uses safe parser');

const openBlock = page.slice(
  page.indexOf('function openReconciliation(account: CashierAccountRow)'),
  page.indexOf('  const reconOpen = Boolean(reconTarget);'),
);
assert(openBlock.includes('setReconTarget'), '3. open sets selected account');
assert(!openBlock.includes('setActualBalanceInput'), '4. open does not overwrite input each click');

const initEffect = page.slice(
  page.indexOf('const reconOpen = Boolean(reconTarget);'),
  page.indexOf('  async function submitReconciliation'),
);
assert(initEffect.includes('setActualBalanceInput'), '3. initial actual balance populated on open');
assert(initEffect.includes('reconOpen'), '9. initialize when dialog opens');
assert(initEffect.includes('reconAccountId'), '3. initialize when selected account changes');
assert(!initEffect.includes('actualBalanceInput'), '9. init effect does not depend on live input');

assertEqual(normalizeMoneyInput('0'), '0', '1. zero can be entered');
assertEqual(normalizeMoneyInput('1'), '1', '2. one can be entered');
assertEqual(normalizeMoneyInput('25'), '25', '3. twenty-five can be entered');
assertEqual(normalizeMoneyInput('1500'), '1500', '4. fifteen hundred can be entered');
assertEqual(normalizeMoneyInput('98500'), '98500', '5. large amount can be entered');
assertEqual(parseMoneyDecimal('100000.50'), 100000.5, '6. supported decimal value');
assertEqual(normalizeMoneyInput('2'), '2', '7. input is not limited to 0-1');
assert(typeof normalizeMoneyInput('1500') === 'string', '8. input state stays string while editing');
assertEqual(normalizeMoneyInput('1.'), '1.', '10. trailing decimal preserved while typing');
assertEqual(previewReconciliationDifference('98500', 100000), -1500, '11. difference preview correct');
assertEqual(previewReconciliationDifference('', 100000), null, '12. empty input does not become zero');
assertEqual(parseMoneyDecimal('1500'), 1500, '13. submit parses full entered amount');
assertEqual(parseMoneyDecimal(''), null, '12. empty submit input rejected');

assert(service.includes('resolveReconciliationSystemBalance'), '14. backend recalculates system balance');
assert(service.includes('calculateReconciliationDifference'), '14. backend recalculates difference');
assert(service.includes('actualBalance'), '14. backend receives actual balance');
assert(!service.includes('currentBalance: actualBalance'), '16. account balance not overwritten');
assert(!service.includes('availableBalance: actualBalance'), '16. account balance not overwritten');
assert(service.includes('HQ_ACCOUNT_RECONCILIATION_CREATED'), '15. reconciliation audit created');
assert(service.includes('Role.HQ_CASHIER'), '14. HQ cashier allowed');

assertEqual(toEditableMoney(null), '', '17. no undefined/null in editable value');
assertEqual(isCompleteMoneyDecimal('1.'), false, '11. incomplete decimal skipped in preview');

console.log('finance-reconciliation-dialog.util.test.ts passed');
