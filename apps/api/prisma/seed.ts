import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const permissionCodes = [
  'users.manage',
  'branches.manage',
  'crm.manage',
  'sales.manage',
  'inventory.manage',
  'inventory.view',
  'products.manage',
  'products.view',
  'products.archive',
  'service.manage',
  'finance.view',
  'finance.manage',
  'payments.manage',
  'payroll.manage',
  'kpi.view',
  'reports.view',
  'procurement.manage',
  'procurement.view',
  'procurement.receive',
  'distribution.manage',
  'distribution.view',
  'academy.manage',
  'marketing.manage',
  'analytics.view',
];

const rolePermissions: Record<string, string[]> = {
  CEO: permissionCodes,
  SYSTEM_ADMINISTRATOR: ['users.manage', 'reports.view'],
  OWNER: permissionCodes,
  FRANCHISE_OWNER: ['users.manage', 'crm.manage', 'sales.manage', 'inventory.manage', 'inventory.view', 'products.view', 'service.manage', 'finance.view', 'payments.manage', 'kpi.view', 'reports.view'],
  MANAGER: ['crm.manage', 'sales.manage', 'inventory.view', 'products.view'],
  MASTER: ['service.manage', 'kpi.view', 'products.view'],
  WAREHOUSE_OPERATOR: ['inventory.manage', 'distribution.manage', 'products.view'],
  WAREHOUSE_MANAGER: ['inventory.manage', 'inventory.view', 'distribution.manage', 'procurement.receive', 'products.view'],
  CASHIER: ['payments.manage', 'sales.manage'],
  ACCOUNTANT: ['finance.view', 'finance.manage', 'payments.manage', 'payroll.manage'],
  HQ_ACCOUNTANT: ['finance.view', 'finance.manage', 'payments.manage', 'payroll.manage'],
  SUPPLY_CHAIN_MANAGER: ['inventory.view', 'procurement.manage', 'procurement.view', 'distribution.view', 'products.manage'],
  HQ_SALES_MANAGER: ['distribution.manage', 'distribution.view', 'inventory.view', 'products.view'],
  HQ_CASHIER: ['distribution.view', 'payments.manage'],
  PROCUREMENT_MANAGER: ['procurement.manage', 'procurement.view'],
  SALESPERSON: ['sales.manage'],
  MARKETING_MANAGER: ['marketing.manage', 'analytics.view'],
  CONTENT_CREATOR: ['marketing.manage'],
  ACADEMY_DIRECTOR: ['academy.manage'],
  ACADEMY_MANAGER: ['academy.manage'],
  FRANCHISE_DIRECTOR: ['branches.manage', 'academy.manage', 'kpi.view', 'reports.view'],
  FINANCE_MANAGER: ['finance.view', 'finance.manage', 'payroll.manage', 'kpi.view', 'reports.view', 'products.view'],
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
  const hqCatalogBranch = await prisma.branch.upsert({
    where: { code: 'EMOTORS-HQ' },
    update: {
      name: 'EMOTORS HQ Catalog',
      city: 'Bishkek',
      branchType: 'HQ_BRANCH',
    },
    create: {
      name: 'EMOTORS HQ Catalog',
      code: 'EMOTORS-HQ',
      city: 'Bishkek',
      branchType: 'HQ_BRANCH',
    },
  });

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

  const existingHqWarehouse = await prisma.warehouse.findFirst({
    where: { code: 'HQ-MAIN', warehouseType: 'HQ' },
  });

  if (existingHqWarehouse) {
    await prisma.warehouse.update({
      where: { id: existingHqWarehouse.id },
      data: {
        branchId: null,
        warehouseType: 'HQ',
        name: 'HQ Warehouse Bishkek',
        address: 'Bishkek HQ',
        city: 'Bishkek',
        country: 'Kyrgyzstan',
        contactPerson: 'HQ Warehouse Manager',
        phone: '+996700000004',
        notes: 'Primary headquarters warehouse for China imports',
        isActive: true,
      },
    });
  } else {
    await prisma.warehouse.create({
      data: {
        branchId: null,
        warehouseType: 'HQ',
        name: 'HQ Warehouse Bishkek',
        code: 'HQ-MAIN',
        address: 'Bishkek HQ',
        city: 'Bishkek',
        country: 'Kyrgyzstan',
        contactPerson: 'HQ Warehouse Manager',
        phone: '+996700000004',
        notes: 'Primary headquarters warehouse for China imports',
        isActive: true,
      },
    });
  }

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
      email: 'sales@emotors.kg',
      username: 'sales',
      fullName: 'HQ Sales Manager',
      role: Role.HQ_SALES_MANAGER,
      employeeId: 'HQ-SALES-001',
      phone: '+996700000008',
    },
    {
      email: 'hq-cashier@emotors.kg',
      username: 'hq-cashier',
      fullName: 'HQ Cashier',
      role: Role.HQ_CASHIER,
      employeeId: 'HQ-CASHIER-001',
      phone: '+996700000009',
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
      role: Role.HQ_ACCOUNTANT,
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
  ];

  const hqStaffRecords: Array<{
    email: string;
    fullName: string;
    role: Role;
    employeeId: string;
    phone: string;
    hasLogin: boolean;
    username?: string;
  }> = [
    {
      email: 'marketing@emotors.kg',
      fullName: 'Marketing Manager',
      role: Role.MARKETING_MANAGER,
      employeeId: 'HQ-MARKETING-001',
      phone: '+996700000010',
      hasLogin: false,
    },
    {
      email: 'content@emotors.kg',
      fullName: 'Content Creator',
      role: Role.CONTENT_CREATOR,
      employeeId: 'HQ-CONTENT-001',
      phone: '+996700000011',
      hasLogin: false,
    },
    {
      email: 'academy@emotors.kg',
      fullName: 'Academy Director',
      role: Role.ACADEMY_DIRECTOR,
      employeeId: 'HQ-ACADEMY-001',
      phone: '+996700000012',
      hasLogin: false,
    },
    {
      email: 'franchise-director@emotors.kg',
      fullName: 'Franchise Director',
      role: Role.FRANCHISE_DIRECTOR,
      employeeId: 'HQ-FRANCHISE-DIR-001',
      phone: '+996700000013',
      hasLogin: false,
    },
  ];

  const hqPasswordHash = await bcrypt.hash('Emotors@2026', 12);
  const noLoginPasswordHash = await bcrypt.hash('hq-employee-no-login-seed', 12);
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
    const role = await prisma.rbacRole.findUnique({ where: { code: hqUser.role } });
    if (createdUser && role) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: createdUser.id, roleId: role.id } },
        update: {},
        create: { userId: createdUser.id, roleId: role.id },
      });
    }
  }

  for (const record of hqStaffRecords) {
    const existing = await prisma.user.findFirst({
      where: {
        OR: [{ email: record.email }, { employeeId: record.employeeId }],
      },
    });
    if (existing) {
      console.log(`HQ employee already exists: ${record.fullName}`);
      continue;
    }

    const created = await prisma.user.create({
      data: {
        email: record.email,
        passwordHash: record.hasLogin ? hqPasswordHash : noLoginPasswordHash,
        fullName: record.fullName,
        role: record.role,
        branchId: null,
        employeeId: record.employeeId,
        phone: record.phone,
        username: record.hasLogin ? record.username ?? record.email.split('@')[0] : null,
        status: 'ACTIVE',
        hasLogin: record.hasLogin,
        mustChangePassword: record.hasLogin,
      },
    });
    const role = await prisma.rbacRole.findUnique({ where: { code: record.role } });
    if (role) {
      await prisma.userRole.create({
        data: { userId: created.id, roleId: role.id },
      });
    }
    console.log(`Registered HQ employee: ${record.fullName}`);
  }

  const hqWarehouse = await prisma.warehouse.findFirst({
    where: { code: 'HQ-MAIN', warehouseType: 'HQ' },
  });
  const warehouseManager = await prisma.user.findUnique({ where: { email: 'warehouse@emotors.kg' } });
  const ceoUser = await prisma.user.findUnique({ where: { email: 'ceo@emotors.kg' } });
  if (hqWarehouse && warehouseManager) {
    await prisma.hqWarehouseManagerAssignment.upsert({
      where: {
        userId_warehouseId: {
          userId: warehouseManager.id,
          warehouseId: hqWarehouse.id,
        },
      },
      update: {
        status: 'ACTIVE',
        assignedById: ceoUser?.id ?? null,
        assignedAt: new Date(),
      },
      create: {
        userId: warehouseManager.id,
        warehouseId: hqWarehouse.id,
        assignedById: ceoUser?.id ?? null,
        status: 'ACTIVE',
      },
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
