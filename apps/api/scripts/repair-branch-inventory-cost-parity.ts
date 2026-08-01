/**
 * Idempotent repair: realign Branch receipt/FIFO/balance values to exact HQ FIFO
 * consumed allocation totals (fixes unit×qty drift such as 914369.26 vs 914369.80).
 *
 * Dry-run by default.
 *
 * Usage:
 *   cd apps/api
 *   node --import tsx scripts/repair-branch-inventory-cost-parity.ts \
 *     --distribution-order-number=<ACTUAL_DISTRIBUTION_ORDER_NUMBER>
 *   node --import tsx scripts/repair-branch-inventory-cost-parity.ts \
 *     --branch-request-number=BPR-...
 *   node --import tsx scripts/repair-branch-inventory-cost-parity.ts \
 *     --distribution-order-id=...
 *   node --import tsx scripts/repair-branch-inventory-cost-parity.ts \
 *     --distribution-order-number=<...> --apply
 */
import { PrismaClient } from '@prisma/client';
import {
  parseRepairBranchInventoryCostParityArgs,
  runBranchInventoryCostParityRepair,
} from '../src/pricing/repair-branch-inventory-cost-parity.util';

async function main() {
  const args = parseRepairBranchInventoryCostParityArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  try {
    const result = await runBranchInventoryCostParityRepair(prisma, args);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
