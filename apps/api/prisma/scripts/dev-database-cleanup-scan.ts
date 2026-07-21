import { PrismaClient } from '@prisma/client';
import { DELETE_STEPS } from './dev-database-cleanup.util';

const prisma = new PrismaClient();

async function main() {
  const remaining: Record<string, number> = {};
  for (const model of DELETE_STEPS) {
    const delegate = (prisma as unknown as Record<string, { count: () => Promise<number> }>)[model];
    if (!delegate?.count) continue;
    const count = await delegate.count();
    if (count > 0) remaining[model] = count;
  }
  console.log(JSON.stringify(remaining, null, 2));
  console.log(`Operational models with data: ${Object.keys(remaining).length}`);
}

main()
  .finally(() => prisma.$disconnect());
