/**
 * Repair confirmed branch cashier payments that closed invoices/sales without ledger posting.
 *
 * Usage (dry-run default):
 *   cd apps/api
 *   node --import tsx scripts/repair-missing-branch-payment-posting.ts \
 *     --sale-number=EM-20260803-00003
 *
 * Apply:
 *   node --import tsx scripts/repair-missing-branch-payment-posting.ts \
 *     --sale-number=EM-20260803-00003 \
 *     --apply
 *
 * Optional account override when payment.financeAccountId is missing:
 *   --account-id=<financeAccountId>
 */
import { PrismaClient } from '@prisma/client';
import {
  applyMissingPostingRepair,
  loadSalePaymentPostingTrace,
} from '../src/finance/branch-payment-posting.repair.util';

type Args = {
  saleNumber?: string;
  accountId?: string;
  apply: boolean;
};

function parseArgs(argv: string[]): Args {
  const saleNumberArg = argv.find((arg) => arg.startsWith('--sale-number='));
  const accountIdArg = argv.find((arg) => arg.startsWith('--account-id='));
  return {
    saleNumber: saleNumberArg ? saleNumberArg.slice('--sale-number='.length) : undefined,
    accountId: accountIdArg ? accountIdArg.slice('--account-id='.length) : undefined,
    apply: argv.includes('--apply'),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.saleNumber?.trim()) {
    throw new Error('Provide --sale-number');
  }

  const prisma = new PrismaClient();
  const trace = await loadSalePaymentPostingTrace(prisma, args.saleNumber.trim());
  if (!trace) {
    console.log(JSON.stringify({ mode: args.apply ? 'apply' : 'dry-run', found: false }, null, 2));
    await prisma.$disconnect();
    return;
  }

  if (args.accountId) {
    for (const row of trace.repairRows) {
      if (row.repairAction === 'post_missing_ledger_entry') {
        row.accountId = args.accountId;
      }
    }
  }

  const actor =
    (await prisma.user.findFirst({
      where: {
        deletedAt: null,
        branchId: trace.branchId,
        role: 'CASHIER',
      },
      select: { id: true, role: true },
      orderBy: { createdAt: 'asc' },
    })) ??
    (await prisma.user.findFirst({
      where: { deletedAt: null },
      select: { id: true, role: true },
      orderBy: { createdAt: 'asc' },
    }));

  const repairResults = [];
  if (args.apply) {
    for (const row of trace.repairRows) {
      if (row.repairAction !== 'post_missing_ledger_entry') {
        repairResults.push({ paymentId: row.paymentId, applied: false, reason: row.repairAction });
        continue;
      }
      const result = await prisma.$transaction((tx) =>
        applyMissingPostingRepair(tx, row, actor?.id ?? 'system', actor?.role ?? 'SYSTEM'),
      );
      repairResults.push({ paymentId: row.paymentId, ...result });
    }
  }

  console.log('=== investigation ===');
  console.log(JSON.stringify(trace, null, 2));
  console.log('=== dry-run rows ===');
  for (const row of trace.repairRows) {
    console.log(
      [
        row.saleId,
        row.saleNumber,
        row.invoiceId,
        row.paymentId,
        row.branchId,
        row.paymentMethod,
        row.saleTotal,
        row.confirmedPaymentTotal,
        row.accountId,
        row.accountType,
        row.existingAccountTransactionId,
        row.existingLedgerEntryId,
        row.existingBalanceEffect,
        row.expectedBalanceEffect,
        row.difference,
        row.repairAction,
      ].join('\t'),
    );
  }
  if (args.apply) {
    console.log('=== apply results ===');
    console.log(JSON.stringify(repairResults, null, 2));
  } else {
    console.log('Dry-run only. Re-run with --apply to post missing ledger entries.');
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
