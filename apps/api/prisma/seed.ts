import { FinanceAccountScope, PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/** Capability-style codes without a dot (e.g. cashier) map explicitly; others use module.action. */
function parsePermissionCode(code: string): { module: string; action: string } {
  const overrides: Record<string, { module: string; action: string }> = {
    cashier: { module: 'finance', action: 'cashier' },
  };
  if (overrides[code]) return overrides[code];
  const [module, action] = code.split('.');
  return { module, action };
}

type SeedUserInput = {
  email: string;
  fullName: string;
  role: Role;
  employeeId: string;
  phone: string;
  passwordHash: string;
  username?: string | null;
  branchId?: string | null;
  hasLogin?: boolean;
  mustChangePassword?: boolean;
  /** When true, refresh passwordHash for known demo/seed accounts. */
  resetPassword?: boolean;
};

function assertUniqueSeedEmployeeIds(records: Array<{ employeeId: string; email: string }>) {
  const employeeIds = records.map((record) => record.employeeId);
  const duplicateEmployeeIds = employeeIds.filter((id, index) => employeeIds.indexOf(id) !== index);
  if (duplicateEmployeeIds.length > 0) {
    throw new Error(
      `Duplicate employee IDs in seed configuration: ${[...new Set(duplicateEmployeeIds)].join(', ')}`,
    );
  }
}

/**
 * Idempotent seed user upsert that reconciles email / username / employeeId collisions
 * without overwriting another user's unique employeeId.
 */
async function ensureSeedUser(input: SeedUserInput) {
  const existingByEmail = await prisma.user.findUnique({ where: { email: input.email } });
  const existingByUsername =
    input.username != null && input.username !== ''
      ? await prisma.user.findUnique({ where: { username: input.username } })
      : null;
  const existingByEmployeeId = await prisma.user.findUnique({
    where: { employeeId: input.employeeId },
  });
  const existingByPhone = await prisma.user.findUnique({ where: { phone: input.phone } });

  // Prefer the email match as the canonical seeded identity.
  let target = existingByEmail ?? existingByUsername ?? null;

  if (existingByUsername && existingByEmail && existingByUsername.id !== existingByEmail.id) {
    console.warn(
      `[seed] username ${input.username} belongs to ${existingByUsername.email}, not ${input.email}; keeping email identity`,
    );
    target = existingByEmail;
  }

  if (existingByEmployeeId && target && existingByEmployeeId.id !== target.id) {
    console.warn(
      `[seed] employeeId ${input.employeeId} already owned by ${existingByEmployeeId.email}; preserving ${target.email}'s current employeeId`,
    );
  } else if (existingByEmployeeId && !target) {
    target = existingByEmployeeId;
  }

  if (existingByPhone && target && existingByPhone.id !== target.id) {
    console.warn(
      `[seed] phone ${input.phone} already owned by ${existingByPhone.email}; preserving ${target.email}'s current phone`,
    );
  } else if (existingByPhone && !target) {
    target = existingByPhone;
  }

  const employeeIdAvailable =
    !existingByEmployeeId || (target != null && existingByEmployeeId.id === target.id);
  const phoneAvailable = !existingByPhone || (target != null && existingByPhone.id === target.id);

  const employeeId = employeeIdAvailable
    ? input.employeeId
    : target?.employeeId && target.employeeId.length > 0
      ? target.employeeId
      : `${input.employeeId}-SEED`;

  const phone = phoneAvailable
    ? input.phone
    : target?.phone && target.phone.length > 0
      ? target.phone
      : `${input.phone}-S`;

  if (employeeId !== input.employeeId) {
    console.warn(`[seed] Using employeeId ${employeeId} for ${input.email}`);
  }
  if (phone !== input.phone) {
    console.warn(`[seed] Using phone ${phone} for ${input.email}`);
  }

  const data = {
    email: input.email,
    fullName: input.fullName,
    role: input.role,
    branchId: input.branchId === undefined ? null : input.branchId,
    employeeId,
    phone,
    username: input.username ?? null,
    status: 'ACTIVE' as const,
    hasLogin: input.hasLogin ?? true,
    mustChangePassword: input.mustChangePassword ?? false,
  };

  if (target) {
    return prisma.user.update({
      where: { id: target.id },
      data: {
        ...data,
        // Avoid stealing another user's username.
        username:
          existingByUsername && existingByUsername.id !== target.id
            ? target.username
            : data.username,
        ...(input.resetPassword ? { passwordHash: input.passwordHash } : {}),
      },
    });
  }

  return prisma.user.create({
    data: {
      ...data,
      passwordHash: input.passwordHash,
    },
  });
}

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
  'cashier',
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
  SYSTEM_ADMINISTRATOR: [
    'users.manage',
    'reports.view',
    'data.permanent_delete',
    'businessDate.update.hqAdmin',
  ],
  OWNER: permissionCodes,
  FRANCHISE_OWNER: ['users.manage', 'crm.manage', 'sales.manage', 'inventory.manage', 'inventory.view', 'products.view', 'service.manage', 'finance.view', 'payments.manage', 'kpi.view', 'reports.view'],
  MANAGER: ['crm.manage', 'sales.manage', 'inventory.view', 'products.view'],
  MASTER: ['service.manage', 'kpi.view', 'products.view'],
  WAREHOUSE_OPERATOR: ['inventory.manage', 'distribution.manage', 'products.view'],
  WAREHOUSE_MANAGER: ['inventory.manage', 'inventory.view', 'distribution.manage', 'procurement.receive', 'products.view'],
  CASHIER: ['payments.manage', 'sales.manage', 'cashier'],
  ACCOUNTANT: ['finance.view', 'finance.manage', 'payments.manage', 'payroll.manage'],
  HQ_ACCOUNTANT: ['finance.view', 'finance.manage', 'payments.manage', 'payroll.manage'],
  SUPPLY_CHAIN_MANAGER: ['inventory.view', 'procurement.manage', 'procurement.view', 'distribution.view', 'products.manage'],
  HQ_SALES_MANAGER: ['distribution.manage', 'distribution.view', 'inventory.view', 'products.view'],
  HQ_CASHIER: ['distribution.view', 'payments.manage', 'finance.view'],
  PROCUREMENT_MANAGER: ['procurement.manage', 'procurement.view'],
  SALESPERSON: ['sales.manage'],
  MARKETING_MANAGER: ['marketing.manage', 'analytics.view'],
  CONTENT_CREATOR: ['marketing.manage'],
  ACADEMY_DIRECTOR: ['academy.manage'],
  ACADEMY_MANAGER: ['academy.manage'],
  FRANCHISE_DIRECTOR: ['branches.manage', 'academy.manage', 'kpi.view', 'reports.view', 'analytics.view'],
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

  await ensureSeedUser({
    email: 'owner@emotors.kg',
    passwordHash,
    fullName: 'EMOTORS Owner',
    role: Role.OWNER,
    branchId: branch.id,
    employeeId: 'HQ-OWNER-001',
    phone: '+996700000001',
    username: 'owner001',
    mustChangePassword: false,
    resetPassword: true,
  });

  for (const code of permissionCodes) {
    const { module, action } = parsePermissionCode(code);
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
  await ensureSeedUser({
    email: 'ceo@emotors.kg',
    passwordHash: ceoPasswordHash,
    fullName: 'EMOTORS CEO',
    role: Role.CEO,
    branchId: null,
    employeeId: 'HQ-CEO-001',
    phone: '+996700000002',
    username: 'ceo',
    mustChangePassword: false,
    resetPassword: true,
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

  assertUniqueSeedEmployeeIds([
    { email: 'owner@emotors.kg', employeeId: 'HQ-OWNER-001' },
    { email: 'ceo@emotors.kg', employeeId: 'HQ-CEO-001' },
    ...hqTestUsers,
    ...hqStaffRecords,
  ]);

  for (const hqUser of hqTestUsers) {
    const createdUser = await ensureSeedUser({
      email: hqUser.email,
      passwordHash: hqPasswordHash,
      fullName: hqUser.fullName,
      role: hqUser.role,
      branchId: null,
      employeeId: hqUser.employeeId,
      phone: hqUser.phone,
      username: hqUser.username,
      mustChangePassword: false,
      resetPassword: true,
    });
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
    const created = await ensureSeedUser({
      email: record.email,
      passwordHash: record.hasLogin ? hqPasswordHash : noLoginPasswordHash,
      fullName: record.fullName,
      role: record.role,
      branchId: null,
      employeeId: record.employeeId,
      phone: record.phone,
      username: record.hasLogin ? record.username ?? record.email.split('@')[0] : null,
      hasLogin: record.hasLogin,
      mustChangePassword: record.hasLogin,
      resetPassword: false,
    });
    const role = await prisma.rbacRole.findUnique({ where: { code: record.role } });
    if (created && role) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: created.id, roleId: role.id } },
        update: {},
        create: { userId: created.id, roleId: role.id },
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

  const financeAccounts = [
    {
      accountNumber: 'FAC-SEED-HQ-CASH',
      name: 'HQ Cash Account',
      scope: FinanceAccountScope.HQ,
      branchId: null as string | null,
      typeCode: 'CASH',
    },
    {
      accountNumber: 'FAC-SEED-HQ-BANK',
      name: 'HQ Bank Account',
      scope: FinanceAccountScope.HQ,
      branchId: null,
      typeCode: 'BANK',
    },
    {
      accountNumber: 'FAC-SEED-BISHKEK-CASH',
      name: 'Bishkek Branch Cash',
      scope: FinanceAccountScope.BRANCH,
      branchId: branch.id,
      typeCode: 'CASH',
    },
  ];

  for (const account of financeAccounts) {
    await prisma.financeAccount.upsert({
      where: { accountNumber: account.accountNumber },
      update: {
        name: account.name,
        scope: account.scope,
        branchId: account.branchId,
        typeCode: account.typeCode,
        status: 'ACTIVE',
        openingBalance: 0,
        currentBalance: 0,
        availableBalance: 0,
        pendingBalance: 0,
        deletedAt: null,
      },
      create: {
        accountNumber: account.accountNumber,
        name: account.name,
        scope: account.scope,
        branchId: account.branchId,
        typeCode: account.typeCode,
        currency: 'KGS',
        status: 'ACTIVE',
        createdById: ceoUser?.id ?? null,
      },
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
