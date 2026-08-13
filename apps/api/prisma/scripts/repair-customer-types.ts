/**
 * Idempotent report/repair for branch customer types.
 * Schema default is RETAIL; this script reports counts and repairs NULL types if any exist.
 */
import { CustomerType, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const nullTypeRepair = await prisma.$executeRaw`
    UPDATE "Customer"
    SET "customerType" = 'RETAIL'::"CustomerType"
    WHERE "deletedAt" IS NULL
      AND "customerType" IS NULL
  `;

  const retailCount = await prisma.customer.count({
    where: { deletedAt: null, customerType: CustomerType.RETAIL },
  });
  const wholesaleCount = await prisma.customer.count({
    where: { deletedAt: null, customerType: CustomerType.WHOLESALE },
  });

  console.log(
    JSON.stringify({
      repairedNullTypes: nullTypeRepair,
      retailCustomers: retailCount,
      wholesaleCustomers: wholesaleCount,
    }),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
