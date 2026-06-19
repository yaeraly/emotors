import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const branch = await prisma.branch.upsert({
    where: { code: 'BISHKEK' },
    update: { name: 'Bishkek Main Branch' },
    create: {
      name: 'Bishkek Main Branch',
      code: 'BISHKEK',
    },
  });

  const passwordHash = await bcrypt.hash('password123', 12);

  await prisma.user.upsert({
    where: { email: 'owner@emotors.kg' },
    update: {
      passwordHash,
      role: Role.OWNER,
      branchId: branch.id,
      isActive: true,
    },
    create: {
      email: 'owner@emotors.kg',
      passwordHash,
      fullName: 'EMOTORS Owner',
      role: Role.OWNER,
      branchId: branch.id,
      isActive: true,
    },
  });

  await prisma.warehouse.upsert({
    where: {
      branchId_code: {
        branchId: branch.id,
        code: 'MAIN',
      },
    },
    update: { name: 'Main Warehouse' },
    create: {
      branchId: branch.id,
      name: 'Main Warehouse',
      code: 'MAIN',
    },
  });

  await prisma.cashbox.createMany({
    data: [
      {
        branchId: branch.id,
        name: 'Main Cashbox',
      },
    ],
    skipDuplicates: true,
  });

  console.log('Seed completed');
  console.log('Default branch: Bishkek Main Branch (BISHKEK)');
  console.log('Default owner: owner@emotors.kg / password123');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
