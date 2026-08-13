/**
 * Diagnose/repair branch invoices marked paid/closed without account posting.
 * Dry-run by default — pass --apply to post missing ledger entries.
 *
 * Usage:
 *   cd apps/api
 *   node --import tsx scripts/repair-closed-invoice-missing-account-posting.ts --invoice-id=<uuid>
 *   node --import tsx scripts/repair-closed-invoice-missing-account-posting.ts --invoice-number=BI-...
 *   node --import tsx scripts/repair-closed-invoice-missing-account-posting.ts --sale-number=EM-... --apply
 */
import { PrismaClient } from '@prisma/client';
import {
  applyMissingPostingRepair,
  loadSalePaymentPostingTrace,
} from '../src/finance/branch-payment-posting.repair.util';

type Args = {
  invoiceId?: string;
  invoiceNumber?: string;
  saleNumber?: string;
  accountId?: string;
  apply: boolean;
};

function parseArgs(argv: string[]): Args {
  const read = (prefix: string) => {
    const arg = argv.find((row) => row.startsWith(prefix));
    return arg ? arg.slice(prefix.length) : undefined;
  };
  return {
    invoiceId: read('--invoice-id='),
    invoiceNumber: read('--invoice-number='),
    saleNumber: read('--sale-number='),
    accountId: read('--account-id='),
    apply: argv.includes('--apply'),
  };
}

async function resolveSaleNumber(
  prisma: PrismaClient,
  args: Args,
): Promise<string | null> {
  if (args.saleNumber?.trim()) return args.saleNumber.trim();
  if (!args.invoiceId?.trim() && !args.invoiceNumber?.trim()) return null;

  const invoice = await prisma.branchInvoice.findFirst({
    where: {
      deletedAt: null,
      ...(args.invoiceId ? { id: args.invoiceId.trim() } : {}),
      ...(args.invoiceNumber ? { invoiceNumber: args.invoiceNumber.trim() } : {}),
    },
    select: {
      id: true,
      invoiceNumber: true,
      sale: { select: { receiptNumber: true } },
    },
  });
  return invoice?.sale?.receiptNumber ?? null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  try {
    const saleNumber = await resolveSaleNumber(prisma, args);
    if (!saleNumber) {
      throw new Error('Provide --invoice-id, --invoice-number, or --sale-number');
    }

    const trace = await loadSalePaymentPostingTrace(prisma, saleNumber);
    if (!trace) {
      console.log(
        JSON.stringify({ mode: args.apply ? 'apply' : 'dry-run', found: false, saleNumber }, null, 2),
      );
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
        where: { deletedAt: null, branchId: trace.branchId, role: 'CASHIER' },
        select: { id: true, role: true },
        orderBy: { createdAt: 'asc' },
      })) ??
      (await prisma.user.findFirst({
        where: { deletedAt: null },
        select: { id: true, role: true },
        orderBy: { createdAt: 'asc' },
      }));

    const repairResults = [];
    if (args.apply && actor) {
      for (const row of trace.repairRows) {
        if (row.repairAction !== 'post_missing_ledger_entry') continue;
        repairResults.push(
          await applyMissingPostingRepair(prisma, {
            actorUserId: actor.id,
            actorRole: actor.role,
            row,
          }),
        );
      }
    }

    console.log(
      JSON.stringify(
        {
          mode: args.apply ? 'apply' : 'dry-run',
          saleNumber,
          trace,
          repairResults,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
