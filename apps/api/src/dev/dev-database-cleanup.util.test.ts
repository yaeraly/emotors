import { CLEANED_TABLES, PRESERVED_TABLES } from '../../prisma/scripts/dev-database-cleanup.util';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const preserved = new Set<string>(PRESERVED_TABLES);
const cleaned = new Set<string>(CLEANED_TABLES);

for (const table of CLEANED_TABLES) {
  assert(!preserved.has(table), `Table ${table} must not be both preserved and cleaned`);
}

assert(preserved.has('User'), 'Users must be preserved');
assert(preserved.has('Product'), 'Product cards must be preserved');
assert(preserved.has('ProductCategory'), 'Product categories must be preserved');
assert(preserved.has('FinanceAccount'), 'Finance accounts must be preserved');
assert(preserved.has('PricingPolicyVersion'), 'Pricing policy must be preserved');
assert(cleaned.has('Customer'), 'Customers must be cleaned');
assert(cleaned.has('Sale'), 'Sales must be cleaned');
assert(cleaned.has('Payment'), 'Payments must be cleaned');
assert(cleaned.has('FinanceInvestment'), 'Investments must be cleaned');
assert(cleaned.has('FinanceTransfer'), 'Transfers must be cleaned');
assert(cleaned.has('FinanceLedgerEntry'), 'Finance transactions must be cleaned');
assert(cleaned.has('InventoryBalance'), 'Inventory balances must be cleaned');

console.log('dev-database-cleanup.util.test.ts passed');
