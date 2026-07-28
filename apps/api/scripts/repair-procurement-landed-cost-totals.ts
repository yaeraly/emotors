/**
 * Recalculate landed costs for procurement orders where product line totals
 * do not match order totalCostKgs (authoritative full landed cost).
 *
 * Usage:
 *   cd apps/api && node --import tsx scripts/repair-procurement-landed-cost-totals.ts [--order-id=...] [--apply]
 */
import { PrismaClient } from '@prisma/client';
import { LandedCostService } from '../src/procurement/landed-cost.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { sumRoundedMoney } from '../src/procurement/landed-cost-money.util';

type Args = { orderId?: string; apply: boolean };

function parseArgs(argv: string[]): Args {
  const orderArg = argv.find((a) => a.startsWith('--order-id='));
  return {
    orderId: orderArg ? orderArg.slice('--order-id='.length) : undefined,
    apply: argv.includes('--apply'),
  };
}

function n(v: unknown) {
  return Number(v ?? 0);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  const prismaService = Object.assign(new PrismaService(), prisma);
  const landedCostService = new LandedCostService(prismaService);

  const orders = await prisma.procurementOrder.findMany({
    where: {
      deletedAt: null,
      ...(args.orderId ? { id: args.orderId } : {}),
    },
    select: {
      id: true,
      orderNumber: true,
      totalCostKgs: true,
      items: {
        where: { status: 'ACTIVE' },
        select: { id: true, sku: true, totalCostKgs: true },
      },
    },
    take: args.orderId ? 1 : 500,
  });

  const repairs: Array<Record<string, unknown>> = [];

  for (const order of orders) {
    const lineSum = sumRoundedMoney(order.items.map((item) => n(item.totalCostKgs)));
    const orderTotal = n(order.totalCostKgs);
    if (Math.abs(lineSum - orderTotal) < 0.009) continue;

    const repairRow: Record<string, unknown> = {
      orderNumber: order.orderNumber,
      orderId: order.id,
      beforeOrderTotal: orderTotal,
      beforeLineSum: lineSum,
      driftKgs: sumRoundedMoney([orderTotal - lineSum]),
    };
    repairs.push(repairRow);

    if (args.apply) {
      await landedCostService.recalculateProcurementOrder(order.id, {
        reason: 'repair-procurement-landed-cost-totals',
        triggerReason: 'BACKFILL_LINE_TOTAL_PARITY',
      });
      const refreshed = await prisma.procurementOrder.findUnique({
        where: { id: order.id },
        select: {
          totalCostKgs: true,
          items: { where: { status: 'ACTIVE' }, select: { totalCostKgs: true } },
        },
      });
      if (refreshed) {
        repairRow.afterOrderTotal = n(refreshed.totalCostKgs);
        repairRow.afterLineSum = sumRoundedMoney(refreshed.items.map((item) => n(item.totalCostKgs)));
      }
    }
  }

  console.log(JSON.stringify({ dryRun: !args.apply, repairCount: repairs.length, repairs }, null, 2));
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
