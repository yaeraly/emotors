import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const permissionCodes = [
  'users.manage',
  'branches.manage',
  'crm.manage',
  'sales.manage',
  'inventory.manage',
  'service.manage',
  'finance.view',
  'payroll.manage',
  'procurement.manage',
  'distribution.manage',
  'academy.manage',
  'marketing.manage',
  'analytics.view',
];

const rolePermissions: Record<string, string[]> = {
  CEO: permissionCodes,
  SYSTEM_ADMINISTRATOR: permissionCodes,
  OWNER: permissionCodes,
  FRANCHISE_OWNER: ['users.manage', 'crm.manage', 'sales.manage', 'inventory.manage', 'service.manage', 'finance.view'],
  MANAGER: ['crm.manage', 'sales.manage', 'inventory.manage'],
  MASTER: ['service.manage'],
  WAREHOUSE_OPERATOR: ['inventory.manage', 'distribution.manage'],
  WAREHOUSE_MANAGER: ['inventory.manage', 'distribution.manage'],
  CASHIER: ['sales.manage'],
  ACCOUNTANT: ['finance.view', 'payroll.manage'],
  SUPPLY_CHAIN_MANAGER: ['inventory.manage', 'procurement.manage', 'distribution.manage'],
  PROCUREMENT_MANAGER: ['procurement.manage'],
  SALESPERSON: ['sales.manage'],
  MARKETING_MANAGER: ['marketing.manage'],
  CONTENT_CREATOR: ['marketing.manage'],
  ACADEMY_DIRECTOR: ['academy.manage'],
  ACADEMY_MANAGER: ['academy.manage'],
  FRANCHISE_DIRECTOR: ['branches.manage', 'academy.manage', 'analytics.view'],
  FINANCE_MANAGER: ['finance.view', 'payroll.manage', 'analytics.view'],
  INVESTMENT_MANAGER: ['analytics.view'],
  EXPANSION_MANAGER: ['analytics.view'],
};

const productCategories = [
  ['CONTROLLERS', 'Контроллерлер', 'Контроллеры', 'Controllers'],
  ['MOTORS', 'Моторлор', 'Моторы', 'Motors'],
  ['BATTERIES', 'Батареялар', 'Батареи', 'Batteries'],
  ['CHARGERS', 'Заряддагычтар', 'Зарядные устройства', 'Chargers'],
  ['TRANSMISSION', 'Трансмиссия', 'Трансмиссия', 'Transmission'],
  ['BRAKE_SYSTEM', 'Тормоз системасы', 'Тормозная система', 'Brake System'],
  ['ELECTRICAL_SYSTEM', 'Электр системасы', 'Электрическая система', 'Electrical System'],
  ['WIRING', 'Зымдар', 'Проводка', 'Wiring'],
  ['LIGHTING', 'Жарыктандыруу', 'Освещение', 'Lighting'],
  ['WHEELS', 'Дөңгөлөктөр', 'Колеса', 'Wheels'],
  ['SUSPENSION', 'Подвеска', 'Подвеска', 'Suspension'],
  ['BODY_PARTS', 'Кузов бөлүктөрү', 'Кузовные детали', 'Body Parts'],
  ['TOOLS', 'Куралдар', 'Инструменты', 'Tools'],
  ['CONSUMABLES', 'Керектелүүчү материалдар', 'Расходники', 'Consumables'],
  ['ACCESSORIES', 'Аксессуарлар', 'Аксессуары', 'Accessories'],
  ['WIPERS', 'Айнек тазалагычтар', 'Дворники', 'Wipers'],
  ['DISPLAYS', 'Дисплейлер', 'Дисплеи', 'Displays'],
  ['SEALS', 'Сальниктер', 'Уплотнители', 'Seals'],
  ['SHAFTS', 'Валдар', 'Валы', 'Shafts'],
  ['FASTENERS', 'Бекиткичтер', 'Крепеж', 'Fasteners'],
  ['GENERATORS', 'Генераторлор', 'Генераторы', 'Generators'],
  ['ELECTRONICS', 'Электроника', 'Электроника', 'Electronics'],
  ['BEARINGS', 'Подшипниктер', 'Подшипники', 'Bearings'],
  ['AXLES', 'Октор', 'Оси', 'Axles'],
  ['OTHER', 'Башка', 'Другое', 'Other'],
] as const;

async function main() {
  const branch = await prisma.branch.upsert({
    where: { code: 'BISHKEK' },
    update: {
      name: 'Bishkek Main Branch',
    },
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
      fullName: 'EMOTORS Owner',
      role: Role.OWNER,
      branchId: branch.id,
      employeeId: 'HQ-OWNER-001',
      phone: '+996700000001',
      username: 'owner001',
      status: 'ACTIVE',
      mustChangePassword: false,
    },
    create: {
      email: 'owner@emotors.kg',
      passwordHash,
      fullName: 'EMOTORS Owner',
      role: Role.OWNER,
      branchId: branch.id,
      employeeId: 'HQ-OWNER-001',
      phone: '+996700000001',
      username: 'owner001',
      status: 'ACTIVE',
      mustChangePassword: false,
    },
  });

  for (const code of permissionCodes) {
    const [module, action] = code.split('.');
    await prisma.permission.upsert({
      where: { code },
      update: { module, action },
      create: { code, module, action },
    });
  }

  for (const [roleCode, permissions] of Object.entries(rolePermissions)) {
    const role = await prisma.rbacRole.upsert({
      where: { code: roleCode },
      update: { name: roleCode.replaceAll('_', ' '), isActive: true },
      create: { code: roleCode, name: roleCode.replaceAll('_', ' ') },
    });

    for (const permissionCode of permissions) {
      const permission = await prisma.permission.findUnique({
        where: { code: permissionCode },
      });
      if (!permission) continue;
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }

  const owner = await prisma.user.findUnique({ where: { email: 'owner@emotors.kg' } });
  const ownerRole = await prisma.rbacRole.findUnique({ where: { code: 'OWNER' } });
  if (owner && ownerRole) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: owner.id, roleId: ownerRole.id } },
      update: {},
      create: { userId: owner.id, roleId: ownerRole.id },
    });
  }

  for (const [code, nameKy, nameRu, nameEn] of productCategories) {
    await prisma.productCategory.upsert({
      where: { code },
      update: {
        nameKy,
        nameRu,
        nameEn,
        isActive: true,
      },
      create: {
        code,
        nameKy,
        nameRu,
        nameEn,
      },
    });
  }

  const branches = [
    {
      code: 'OSH',
      name: 'Osh Branch',
      city: 'Osh',
      address: 'Osh',
      ownerName: 'Franchise Owner',
    },
    {
      code: 'KARAKOL',
      name: 'Karakol Branch',
      city: 'Karakol',
      address: 'Karakol',
      ownerName: 'Franchise Owner',
    },
    {
      code: 'JALAL_ABAD',
      name: 'Jalal-Abad Branch',
      city: 'Jalal-Abad',
      address: 'Jalal-Abad',
      ownerName: 'Franchise Owner',
    },
  ];

  for (const item of branches) {
    await prisma.branch.upsert({
      where: { code: item.code },
      update: item,
      create: item,
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
