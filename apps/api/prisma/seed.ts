import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

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
    },
    create: {
      email: 'owner@emotors.kg',
      passwordHash,
      fullName: 'EMOTORS Owner',
      role: Role.OWNER,
      branchId: branch.id,
    },
  });

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
