import {
  CLEANED_TABLES,
  DELETE_STEPS,
  PRESERVED_TABLES,
} from '../../prisma/scripts/dev-database-cleanup.util';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const preserved = new Set<string>(PRESERVED_TABLES);
const cleaned = new Set<string>(CLEANED_TABLES);

assert(DELETE_STEPS.length === CLEANED_TABLES.length, 'DELETE_STEPS and CLEANED_TABLES must match');

for (const table of CLEANED_TABLES) {
  assert(!preserved.has(table), `Table ${table} must not be both preserved and cleaned`);
}

// FK order: goods receiving before distribution items
const goodsReceivingItemIdx = DELETE_STEPS.indexOf('goodsReceivingItem');
const distributionItemIdx = DELETE_STEPS.indexOf('branchDistributionOrderItem');
assert(goodsReceivingItemIdx < distributionItemIdx, 'goodsReceivingItem must delete before distribution items');

// FIFO allocations before batches
const saleFifoIdx = DELETE_STEPS.indexOf('saleFifoAllocation');
const fifoBatchIdx = DELETE_STEPS.indexOf('fifoInventoryBatch');
assert(saleFifoIdx < fifoBatchIdx, 'FIFO allocations must delete before batches');

assert(preserved.has('User'), 'Users must be preserved');
assert(preserved.has('Product'), 'Product cards must be preserved');
assert(preserved.has('ProductCategory'), 'Product categories must be preserved');
assert(preserved.has('FinanceAccount'), 'Finance accounts must be preserved');
assert(preserved.has('PricingPolicyVersion'), 'Pricing policy must be preserved');
assert(cleaned.has('customer'), 'Customers must be cleaned');
assert(cleaned.has('sale'), 'Sales must be cleaned');
assert(cleaned.has('payment'), 'Payments must be cleaned');
assert(cleaned.has('financeInvestment'), 'Investments must be cleaned');
assert(cleaned.has('financeTransfer'), 'Transfers must be cleaned');
assert(cleaned.has('financeLedgerEntry'), 'Finance transactions must be cleaned');
assert(cleaned.has('inventoryBalance'), 'Inventory balances must be cleaned');
assert(cleaned.has('stockMovement'), 'Stock movements must be cleaned');
assert(cleaned.has('fifoInventoryBatch'), 'FIFO layers must be cleaned');

console.log('dev-database-cleanup.util.test.ts passed');
