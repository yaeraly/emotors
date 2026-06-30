import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const permissionCodes = [
  'users.manage',
  'roles.manage',
  'branches.manage',
  'crm.manage',
  'sales.manage',
  'inventory.manage',
  'inventory.view',
  'service.manage',
  'finance.view',
  'payments.manage',
  'payroll.manage',
  'kpi.view',
  'reports.view',
  'procurement.manage',
  'procurement.landed_cost.view',
  'distribution.manage',
  'academy.manage',
  'marketing.manage',
  'marketing.content',
  'analytics.view',
  'audit.view',
  'settings.manage',
  'products.view',
  'products.manage',
  'products.archive',
];

const rolePermissions: Record<string, string[]> = {
  CEO: permissionCodes,
  OWNER: permissionCodes,
  SYSTEM_ADMINISTRATOR: ['users.manage', 'roles.manage', 'audit.view', 'settings.manage'],
  FRANCHISE_DIRECTOR: ['branches.manage', 'academy.manage', 'kpi.view', 'audit.view', 'analytics.view'],
  SUPPLY_CHAIN_MANAGER: ['procurement.manage', 'distribution.manage', 'inventory.manage', 'inventory.view', 'products.view', 'products.manage', 'products.archive'],
  WAREHOUSE_MANAGER: ['inventory.manage', 'inventory.view', 'distribution.manage', 'products.view', 'products.manage'],
  FINANCE_MANAGER: ['finance.view', 'payroll.manage', 'reports.view', 'analytics.view', 'procurement.landed_cost.view', 'products.view'],
  ACCOUNTANT: ['finance.view', 'payments.manage', 'payroll.manage'],
  MARKETING_MANAGER: ['marketing.manage'],
  CONTENT_CREATOR: ['marketing.content'],
  ACADEMY_DIRECTOR: ['academy.manage'],
  FRANCHISE_OWNER: ['users.manage', 'crm.manage', 'sales.manage', 'inventory.manage', 'inventory.view', 'products.view', 'service.manage', 'finance.view', 'payments.manage', 'kpi.view', 'reports.view'],
  MANAGER: ['crm.manage', 'sales.manage', 'inventory.view', 'products.view'],
  MASTER: ['service.manage', 'kpi.view', 'products.view'],
  WAREHOUSE_OPERATOR: ['inventory.manage', 'distribution.manage', 'products.view'],
  CASHIER: ['payments.manage', 'sales.manage', 'products.view'],
  PROCUREMENT_MANAGER: ['procurement.manage'],
  SALESPERSON: ['sales.manage', 'products.view'],
  ACADEMY_MANAGER: ['academy.manage'],
  INVESTMENT_MANAGER: ['analytics.view', 'branches.manage'],
  EXPANSION_MANAGER: ['analytics.view', 'branches.manage'],
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

  const ceoPasswordHash = await bcrypt.hash('Emotors@2026', 12);
  await prisma.user.upsert({
    where: { email: 'ceo@emotors.kg' },
    update: {
      passwordHash: ceoPasswordHash,
      fullName: 'EMOTORS CEO',
      role: Role.CEO,
      branchId: null,
      employeeId: 'HQ-CEO-001',
      phone: '+996700000002',
      username: 'ceo',
      status: 'ACTIVE',
      mustChangePassword: false,
    },
    create: {
      email: 'ceo@emotors.kg',
      passwordHash: ceoPasswordHash,
      fullName: 'EMOTORS CEO',
      role: Role.CEO,
      branchId: null,
      employeeId: 'HQ-CEO-001',
      phone: '+996700000002',
      username: 'ceo',
      status: 'ACTIVE',
      mustChangePassword: false,
    },
  });

  const ceo = await prisma.user.findUnique({ where: { email: 'ceo@emotors.kg' } });
  const ceoRole = await prisma.rbacRole.findUnique({ where: { code: 'CEO' } });
  if (ceo && ceoRole) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: ceo.id, roleId: ceoRole.id } },
      update: {},
      create: { userId: ceo.id, roleId: ceoRole.id },
    });
  }

  console.log('\nCEO LOGIN');
  console.log('Email: ceo@emotors.kg');
  console.log('Username: ceo');
  console.log('Password: Emotors@2026\n');

  const hqTestUsers: Array<{
    email: string;
    username: string;
    fullName: string;
    role: Role;
    employeeId: string;
    phone: string;
    extraRoles?: Role[];
  }> = [
    {
      email: 'supply@emotors.kg',
      username: 'supply',
      fullName: 'Supply Chain Manager',
      role: Role.SUPPLY_CHAIN_MANAGER,
      employeeId: 'HQ-SUPPLY-001',
      phone: '+996700000003',
    },
    {
      email: 'warehouse@emotors.kg',
      username: 'warehouse',
      fullName: 'HQ Warehouse Manager',
      role: Role.WAREHOUSE_MANAGER,
      employeeId: 'HQ-WAREHOUSE-001',
      phone: '+996700000004',
    },
    {
      email: 'finance@emotors.kg',
      username: 'finance',
      fullName: 'Finance Manager',
      role: Role.FINANCE_MANAGER,
      employeeId: 'HQ-FINANCE-001',
      phone: '+996700000005',
    },
    {
      email: 'accountant@emotors.kg',
      username: 'accountant',
      fullName: 'HQ Accountant',
      role: Role.ACCOUNTANT,
      employeeId: 'HQ-ACCOUNTANT-001',
      phone: '+996700000006',
    },
    {
      email: 'sysadmin@emotors.kg',
      username: 'sysadmin',
      fullName: 'System Administrator',
      role: Role.SYSTEM_ADMINISTRATOR,
      employeeId: 'HQ-SYSADMIN-001',
      phone: '+996700000007',
    },
    {
      email: 'franchise.director@emotors.kg',
      username: 'franchise',
      fullName: 'Franchise Director',
      role: Role.FRANCHISE_DIRECTOR,
      employeeId: 'HQ-FRANCHISE-001',
      phone: '+996700000008',
    },
    {
      email: 'marketing@emotors.kg',
      username: 'marketing',
      fullName: 'Marketing Manager',
      role: Role.MARKETING_MANAGER,
      employeeId: 'HQ-MARKETING-001',
      phone: '+996700000009',
    },
    {
      email: 'content@emotors.kg',
      username: 'content',
      fullName: 'Content Creator',
      role: Role.CONTENT_CREATOR,
      employeeId: 'HQ-CONTENT-001',
      phone: '+996700000010',
    },
    {
      email: 'academy@emotors.kg',
      username: 'academy',
      fullName: 'Academy Director',
      role: Role.ACADEMY_DIRECTOR,
      employeeId: 'HQ-ACADEMY-001',
      phone: '+996700000011',
    },
    {
      email: 'multirole@emotors.kg',
      username: 'multirole',
      fullName: 'Multi Role HQ Employee',
      role: Role.SUPPLY_CHAIN_MANAGER,
      employeeId: 'HQ-MULTI-001',
      phone: '+996700000012',
      extraRoles: [Role.WAREHOUSE_MANAGER, Role.FINANCE_MANAGER],
    },
  ];

  const hqPasswordHash = await bcrypt.hash('Emotors@2026', 12);
  for (const hqUser of hqTestUsers) {
    await prisma.user.upsert({
      where: { email: hqUser.email },
      update: {
        passwordHash: hqPasswordHash,
        fullName: hqUser.fullName,
        role: hqUser.role,
        branchId: null,
        employeeId: hqUser.employeeId,
        phone: hqUser.phone,
        username: hqUser.username,
        status: 'ACTIVE',
        mustChangePassword: false,
      },
      create: {
        email: hqUser.email,
        passwordHash: hqPasswordHash,
        fullName: hqUser.fullName,
        role: hqUser.role,
        branchId: null,
        employeeId: hqUser.employeeId,
        phone: hqUser.phone,
        username: hqUser.username,
        status: 'ACTIVE',
        mustChangePassword: false,
      },
    });
    const createdUser = await prisma.user.findUnique({ where: { email: hqUser.email } });
    const roleCodes = [hqUser.role, ...(hqUser.extraRoles ?? [])];
    for (const roleCode of roleCodes) {
      const role = await prisma.rbacRole.findUnique({ where: { code: roleCode } });
      if (createdUser && role) {
        await prisma.userRole.upsert({
          where: { userId_roleId: { userId: createdUser.id, roleId: role.id } },
          update: {},
          create: { userId: createdUser.id, roleId: role.id },
        });
      }
    }
  }

  console.log('\nHQ TEST LOGINS (password: Emotors@2026)');
  console.log('ceo, supply, warehouse, finance, accountant, sysadmin, franchise, marketing, content, academy, multirole');

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
