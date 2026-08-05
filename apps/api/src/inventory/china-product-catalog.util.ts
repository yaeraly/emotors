/**
 * China product catalog import helpers.
 * Pure validation / matching utilities used by the idempotent import script.
 */

export type ChinaCatalogRow = {
  name: string;
  categoryRu: string;
  weightKg: string;
  purchasePriceYuan: string;
};

export type CategoryTranslation = {
  code: string;
  nameRu: string;
  nameKy: string;
  nameEn: string;
  /** Alternate Russian names that map to this existing category. */
  aliasesRu?: string[];
};

/** Approved translations + reuse of existing seed categories where present. */
export const CHINA_CATALOG_CATEGORY_TRANSLATIONS: CategoryTranslation[] = [
  {
    code: 'BATTERIES',
    nameRu: 'Аккумуляторы',
    nameKy: 'Аккумуляторлор',
    nameEn: 'Batteries',
    aliasesRu: ['аккумуляторы', 'батареи', 'батарея'],
  },
  {
    code: 'ACCESSORIES',
    nameRu: 'Аксессуары',
    nameKy: 'Аксессуарлар',
    nameEn: 'Accessories',
  },
  {
    code: 'SHAFTS',
    nameRu: 'Валы',
    nameKy: 'Валдар',
    nameEn: 'Shafts',
  },
  {
    code: 'GENERATORS',
    nameRu: 'Генераторы',
    nameKy: 'Генераторлор',
    nameEn: 'Generators',
  },
  {
    code: 'CHARGERS',
    nameRu: 'Зарядные устройства',
    nameKy: 'Кубаттагыч түзмөктөр',
    nameEn: 'Chargers',
    aliasesRu: ['зарядные устройства', 'зарядка'],
  },
  {
    code: 'TOOLS',
    nameRu: 'Инструменты',
    nameKy: 'Шаймандар',
    nameEn: 'Tools',
    aliasesRu: ['инструменты', 'куралдар'],
  },
  {
    code: 'WHEELS',
    nameRu: 'Колеса',
    nameKy: 'Дөңгөлөктөр',
    nameEn: 'Wheels',
  },
  {
    code: 'CONTROLLERS',
    nameRu: 'Контроллеры',
    nameKy: 'Контроллерлор',
    nameEn: 'Controllers',
    aliasesRu: ['контроллеры', 'контроллерлер'],
  },
  {
    code: 'FASTENERS',
    nameRu: 'Крепеж',
    nameKy: 'Бекиткичтер',
    nameEn: 'Fasteners',
  },
  {
    code: 'DISPLAYS',
    nameRu: 'Мониторы',
    nameKy: 'Мониторлор',
    nameEn: 'Displays',
    aliasesRu: ['мониторы', 'дисплеи', 'дисплейлер'],
  },
  {
    code: 'MOTORS',
    nameRu: 'Моторы',
    nameKy: 'Моторлор',
    nameEn: 'Motors',
  },
  {
    code: 'CONTROLS',
    nameRu: 'Органы управления',
    nameKy: 'Башкаруу органдары',
    nameEn: 'Controls',
  },
  {
    code: 'LIGHTING',
    nameRu: 'Освещение',
    nameKy: 'Жарыктандыруу',
    nameEn: 'Lighting',
  },
  {
    code: 'AXLES',
    nameRu: 'Оси',
    nameKy: 'Октор',
    nameEn: 'Axles',
  },
  {
    code: 'SUSPENSION',
    nameRu: 'Подвеска',
    nameKy: 'Асма бөлүктөрү',
    nameEn: 'Suspension',
  },
  {
    code: 'WIRING',
    nameRu: 'Проводка',
    nameKy: 'Электр зымдары',
    nameEn: 'Wiring',
    aliasesRu: ['проводка', 'зымдар'],
  },
  {
    code: 'SIGNALING',
    nameRu: 'Сигнализация',
    nameKy: 'Сигнал берүү системасы',
    nameEn: 'Signaling',
  },
  {
    code: 'BRAKE_SYSTEM',
    nameRu: 'Тормозная система',
    nameKy: 'Тормоз системасы',
    nameEn: 'Braking System',
    aliasesRu: ['тормозная система', 'тормозная система', 'brake system'],
  },
  {
    code: 'TRANSMISSION',
    nameRu: 'Трансмиссия',
    nameKy: 'Трансмиссия',
    nameEn: 'Transmission',
  },
  {
    code: 'ELECTRONICS',
    nameRu: 'Электроника',
    nameKy: 'Электроника',
    nameEn: 'Electronics',
  },
];

/** Exact catalog rows from the China product list (authoritative). */
export const CHINA_PRODUCT_CATALOG_ROWS: ChinaCatalogRow[] = [
  { name: 'Chaowei Аккумулятор 58 Ач', categoryRu: 'Аккумуляторы', weightKg: '15.000', purchasePriceYuan: '260.00' },
  { name: 'Каска', categoryRu: 'Аксессуары', weightKg: '0.500', purchasePriceYuan: '10.00' },
  { name: 'Мотор стеклоочистителя 12Вольт', categoryRu: 'Аксессуары', weightKg: '0.500', purchasePriceYuan: '23.00' },
  { name: 'Желмаян вал двигателя 227 1800В', categoryRu: 'Валы', weightKg: '0.400', purchasePriceYuan: '15.12' },
  { name: 'Желмаян вал двигателя 247 2200В', categoryRu: 'Валы', weightKg: '0.500', purchasePriceYuan: '20.00' },
  { name: 'Генератор 5,5 кВт', categoryRu: 'Генераторы', weightKg: '21.750', purchasePriceYuan: '900.00' },
  { name: 'Зарядка 60В 58Ач', categoryRu: 'Зарядные устройства', weightKg: '0.944', purchasePriceYuan: '50.00' },
  { name: 'Зарядка 72В 58Ач', categoryRu: 'Зарядные устройства', weightKg: '0.850', purchasePriceYuan: '60.00' },
  { name: 'Набор съёмников для трицикла', categoryRu: 'Инструменты', weightKg: '3.000', purchasePriceYuan: '60.00' },
  { name: 'Камера 4.00-12', categoryRu: 'Колеса', weightKg: '0.505', purchasePriceYuan: '8.00' },
  { name: 'Камера 4.50-12', categoryRu: 'Колеса', weightKg: '0.574', purchasePriceYuan: '9.00' },
  { name: 'Камера 5.00-12', categoryRu: 'Колеса', weightKg: '0.732', purchasePriceYuan: '10.00' },
  { name: 'Шина 3.00–12', categoryRu: 'Колеса', weightKg: '1.700', purchasePriceYuan: '30.00' },
  { name: 'Шина 3.50–12', categoryRu: 'Колеса', weightKg: '2.136', purchasePriceYuan: '35.00' },
  { name: 'Шина 3.75–12', categoryRu: 'Колеса', weightKg: '2.650', purchasePriceYuan: '40.00' },
  { name: 'Шина 4.00–12', categoryRu: 'Колеса', weightKg: '2.800', purchasePriceYuan: '45.00' },
  { name: 'Шина 4.50–12', categoryRu: 'Колеса', weightKg: '4.250', purchasePriceYuan: '63.00' },
  { name: 'Диск 4 отверстия 4.00-12 (33×8 см)', categoryRu: 'Колеса', weightKg: '4.300', purchasePriceYuan: '20.00' },
  { name: 'Диск 4 отверстия 4.50-12 (33×10 см)', categoryRu: 'Колеса', weightKg: '4.000', purchasePriceYuan: '27.00' },
  { name: 'Диск 5 отверстия 4.50-12 (33×10 см)', categoryRu: 'Колеса', weightKg: '4.000', purchasePriceYuan: '27.00' },
  { name: 'Шина 5.00–12', categoryRu: 'Колеса', weightKg: '6.000', purchasePriceYuan: '85.00' },
  { name: 'Желмаян Контроллер 1,8 кВт 70H', categoryRu: 'Контроллеры', weightKg: '1.900', purchasePriceYuan: '175.00' },
  { name: 'Желмаян Контроллер 2,2 кВт 80H', categoryRu: 'Контроллеры', weightKg: '2.600', purchasePriceYuan: '240.00' },
  { name: 'TQ Контроллер 1,5 кВт', categoryRu: 'Контроллеры', weightKg: '1.650', purchasePriceYuan: '145.00' },
  { name: 'Желмаян Контроллер 1,5 кВт 60H', categoryRu: 'Контроллеры', weightKg: '1.500', purchasePriceYuan: '145.00' },
  { name: 'TQ Контроллер 1,2 кВт', categoryRu: 'Контроллеры', weightKg: '1.400', purchasePriceYuan: '150.00' },
  { name: 'Кронштейн 43мм 25,5 см', categoryRu: 'Крепеж', weightKg: '2.970', purchasePriceYuan: '22.00' },
  { name: 'Кронштейн 43мм 30 см', categoryRu: 'Крепеж', weightKg: '2.970', purchasePriceYuan: '33.00' },
  { name: 'Стандартный дисплей', categoryRu: 'Мониторы', weightKg: '0.340', purchasePriceYuan: '9.00' },
  { name: 'Желмаян Мотор 1.8кВт 70H', categoryRu: 'Моторы', weightKg: '7.560', purchasePriceYuan: '335.00' },
  { name: 'Желмаян Мотор 2.2кВт 80H', categoryRu: 'Моторы', weightKg: '8.410', purchasePriceYuan: '385.00' },
  { name: 'TQ Мотор 1,5 кВт', categoryRu: 'Моторы', weightKg: '6.533', purchasePriceYuan: '230.00' },
  { name: 'Желмаян Мотор 1.5кВт 60H', categoryRu: 'Моторы', weightKg: '6.000', purchasePriceYuan: '285.00' },
  { name: 'TQ Мотор 1,2 кВт', categoryRu: 'Моторы', weightKg: '5.000', purchasePriceYuan: '290.00' },
  { name: 'Ручка газа 3 скорости + задний ход', categoryRu: 'Органы управления', weightKg: '0.133', purchasePriceYuan: '5.00' },
  { name: 'Напольная педаль газа', categoryRu: 'Органы управления', weightKg: '0.415', purchasePriceYuan: '9.00' },
  { name: 'Замок зажигания с ключами', categoryRu: 'Органы управления', weightKg: '0.061', purchasePriceYuan: '2.00' },
  { name: 'Замок зажигания самосвала с ключами', categoryRu: 'Органы управления', weightKg: '0.040', purchasePriceYuan: '2.00' },
  { name: 'Переключатели на руль', categoryRu: 'Органы управления', weightKg: '0.210', purchasePriceYuan: '9.00' },
  { name: 'Руль без комплектующих', categoryRu: 'Органы управления', weightKg: '0.300', purchasePriceYuan: '6.00' },
  { name: 'Шайба переключатель переднего и заднего хода', categoryRu: 'Органы управления', weightKg: '0.060', purchasePriceYuan: '9.00' },
  { name: 'Круглая фара', categoryRu: 'Освещение', weightKg: '0.355', purchasePriceYuan: '9.00' },
  { name: 'Задний фонарь 23 см', categoryRu: 'Освещение', weightKg: '0.125', purchasePriceYuan: '4.00' },
  { name: 'Задний фонарь 28 см', categoryRu: 'Освещение', weightKg: '0.125', purchasePriceYuan: '5.00' },
  { name: 'Круглый боковой фонарь', categoryRu: 'Освещение', weightKg: '0.350', purchasePriceYuan: '13.00' },
  { name: 'Поворотник на кронштейн фары', categoryRu: 'Освещение', weightKg: '0.150', purchasePriceYuan: '4.00' },
  { name: 'Ось переднего колеса 32 см, 1,5 см', categoryRu: 'Оси', weightKg: '0.490', purchasePriceYuan: '8.00' },
  { name: 'Полуось 18зуб 9см 50см', categoryRu: 'Оси', weightKg: '0.650', purchasePriceYuan: '8.00' },
  { name: 'Полуось шляпка 6зуб 58.5см', categoryRu: 'Оси', weightKg: '0.650', purchasePriceYuan: '35.00' },
  { name: 'Полуось шляпка 18зуб 58.5см', categoryRu: 'Оси', weightKg: '0.650', purchasePriceYuan: '35.00' },
  { name: 'Ось переднего колеса 32 см, 2 см', categoryRu: 'Оси', weightKg: '0.490', purchasePriceYuan: '8.00' },
  { name: 'Ось переднего колеса 28 см, 1,5 см', categoryRu: 'Оси', weightKg: '0.490', purchasePriceYuan: '6.00' },
  { name: 'Полуось 18зуб 9см 46см', categoryRu: 'Оси', weightKg: '0.650', purchasePriceYuan: '5.00' },
  { name: 'Полуось шляпка 6зуб 60см', categoryRu: 'Оси', weightKg: '0.650', purchasePriceYuan: '6.00' },
  { name: 'Полуось 6 зуб 10см 50см', categoryRu: 'Оси', weightKg: '2.100', purchasePriceYuan: '30.00' },
  { name: 'Полуось 6 зуб 10см 60см', categoryRu: 'Оси', weightKg: '2.000', purchasePriceYuan: '20.00' },
  { name: 'Амортизатор 43×72 (Ø1,5 см)', categoryRu: 'Подвеска', weightKg: '6.440', purchasePriceYuan: '78.00' },
  { name: 'Амортизатор 43×72 (Ø2 см)', categoryRu: 'Подвеска', weightKg: '6.440', purchasePriceYuan: '78.00' },
  { name: 'Амортизатор 37×72 (Ø1,5 см)', categoryRu: 'Подвеска', weightKg: '6.692', purchasePriceYuan: '65.00' },
  { name: 'Амортизатор на дисковый тормоз 43×76 (Ø1,5 см)', categoryRu: 'Подвеска', weightKg: '6.000', purchasePriceYuan: '95.00' },
  { name: 'Основной кабель 12В', categoryRu: 'Проводка', weightKg: '0.565', purchasePriceYuan: '40.00' },
  { name: 'Сигнал 12В', categoryRu: 'Сигнализация', weightKg: '0.105', purchasePriceYuan: '4.00' },
  { name: 'Сигнал 60В', categoryRu: 'Сигнализация', weightKg: '0.105', purchasePriceYuan: '4.00' },
  { name: 'Колодки 160', categoryRu: 'Тормозная система', weightKg: '0.475', purchasePriceYuan: '5.00' },
  { name: 'Колодки 180', categoryRu: 'Тормозная система', weightKg: '0.650', purchasePriceYuan: '6.00' },
  { name: 'Ручник с тросом 50 см', categoryRu: 'Тормозная система', weightKg: '0.415', purchasePriceYuan: '5.00' },
  { name: 'Тормозной барабан 160 маленький', categoryRu: 'Тормозная система', weightKg: '0.650', purchasePriceYuan: '8.00' },
  { name: 'Тормозной барабан 180-63', categoryRu: 'Тормозная система', weightKg: '0.650', purchasePriceYuan: '30.00' },
  { name: 'Трансмиссионное масло', categoryRu: 'Трансмиссия', weightKg: '0.090', purchasePriceYuan: '2.00' },
  { name: 'Редуктор 20 зуб 5 кг', categoryRu: 'Трансмиссия', weightKg: '4.650', purchasePriceYuan: '115.00' },
  { name: 'Редуктор 22 зуб 5 кг', categoryRu: 'Трансмиссия', weightKg: '4.650', purchasePriceYuan: '185.00' },
  { name: 'Редуктор 23 зуб 5 кг', categoryRu: 'Трансмиссия', weightKg: '4.650', purchasePriceYuan: '185.00' },
  { name: 'Редуктор 18 зуб 4.3 кг', categoryRu: 'Трансмиссия', weightKg: '4.650', purchasePriceYuan: '115.00' },
  { name: 'Редуктор 6 зуб 4.3 кг (большой)', categoryRu: 'Трансмиссия', weightKg: '4.630', purchasePriceYuan: '120.00' },
  { name: 'Редуктор 6 зуб 7.4 кг (большой)', categoryRu: 'Трансмиссия', weightKg: '7.950', purchasePriceYuan: '160.00' },
  { name: 'Трос повышенной/пониженной 150см', categoryRu: 'Трансмиссия', weightKg: '0.205', purchasePriceYuan: '5.00' },
  { name: 'Редуктор 20 зуб закрытый', categoryRu: 'Трансмиссия', weightKg: '4.650', purchasePriceYuan: '115.00' },
  { name: 'Трос повышенной/пониженной 220см на кабинный трицикл', categoryRu: 'Трансмиссия', weightKg: '0.250', purchasePriceYuan: '10.00' },
  { name: 'Преобразователь 48–72В 15А', categoryRu: 'Электроника', weightKg: '0.135', purchasePriceYuan: '10.00' },
  { name: 'Реле поворотов 12В', categoryRu: 'Электроника', weightKg: '0.010', purchasePriceYuan: '2.00' },
  { name: 'Реле поворотов 48–60В', categoryRu: 'Электроника', weightKg: '0.010', purchasePriceYuan: '2.00' },
];

export type ParsedChinaCatalogRow = {
  name: string;
  categoryRu: string;
  weightKg: string;
  purchasePriceYuan: string;
  categoryTranslation: CategoryTranslation;
};

export type ChinaCatalogValidationError = {
  name: string;
  reason: string;
};

/** Normalize product name for duplicate comparison only — never mutate stored display name. */
export function normalizeProductNameForMatch(name: string): string {
  return String(name ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/кВт/gi, 'кВт')
    .replace(/\s*кВт/gi, ' кВт')
    .replace(/\s+/g, ' ')
    .replace(/[–—−]/g, '-')
    .replace(/(\d),(\d)/g, '$1.$2')
    .toLowerCase();
}

export function normalizeCategoryKey(value: string): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function findCategoryTranslation(categoryRu: string): CategoryTranslation | null {
  const key = normalizeCategoryKey(categoryRu);
  if (!key) return null;
  for (const row of CHINA_CATALOG_CATEGORY_TRANSLATIONS) {
    if (normalizeCategoryKey(row.nameRu) === key) return row;
    if (normalizeCategoryKey(row.nameEn) === key) return row;
    if (normalizeCategoryKey(row.code.replace(/_/g, ' ')) === key) return row;
    if ((row.aliasesRu ?? []).some((alias) => normalizeCategoryKey(alias) === key)) {
      return row;
    }
  }
  return null;
}

/** Match an existing DB category by code / RU / EN / KY / aliases. */
export function matchExistingCategory<T extends {
  code: string;
  nameRu: string;
  nameEn: string;
  nameKy: string;
}>(
  existing: T[],
  translation: CategoryTranslation,
): T | null {
  const byCode = existing.find(
    (row) => row.code.trim().toUpperCase() === translation.code.trim().toUpperCase(),
  );
  if (byCode) return byCode;

  const keys = new Set<string>([
    normalizeCategoryKey(translation.nameRu),
    normalizeCategoryKey(translation.nameEn),
    normalizeCategoryKey(translation.nameKy),
    ...(translation.aliasesRu ?? []).map(normalizeCategoryKey),
  ]);

  for (const row of existing) {
    const candidates = [
      normalizeCategoryKey(row.nameRu),
      normalizeCategoryKey(row.nameEn),
      normalizeCategoryKey(row.nameKy),
      normalizeCategoryKey(row.code.replace(/_/g, ' ')),
    ];
    if (candidates.some((value) => keys.has(value))) {
      return row;
    }
  }
  return null;
}

export function parseDecimalString(value: string, field: string): { ok: true; text: string } | { ok: false; reason: string } {
  const raw = String(value ?? '').trim().replace(',', '.');
  if (!raw) return { ok: false, reason: `${field} is empty` };
  if (!/^-?\d+(\.\d+)?$/.test(raw)) {
    return { ok: false, reason: `${field} is not a valid number: ${value}` };
  }
  const num = Number(raw);
  if (!Number.isFinite(num)) {
    return { ok: false, reason: `${field} cannot be parsed: ${value}` };
  }
  if (num < 0) {
    return { ok: false, reason: `${field} cannot be negative: ${value}` };
  }
  return { ok: true, text: raw };
}

export function validateChinaCatalogRows(rows: ChinaCatalogRow[]): {
  valid: ParsedChinaCatalogRow[];
  errors: ChinaCatalogValidationError[];
} {
  const valid: ParsedChinaCatalogRow[] = [];
  const errors: ChinaCatalogValidationError[] = [];
  const seenNames = new Map<string, string>();

  rows.forEach((row, index) => {
    const name = String(row.name ?? '').trim();
    const categoryRu = String(row.categoryRu ?? '').trim();
    const label = name || `(row ${index + 1})`;

    if (!name) {
      errors.push({ name: label, reason: 'product name is empty' });
      return;
    }
    if (!categoryRu) {
      errors.push({ name: label, reason: 'category is empty' });
      return;
    }

    const translation = findCategoryTranslation(categoryRu);
    if (!translation) {
      errors.push({ name: label, reason: `category translation is missing for "${categoryRu}"` });
      return;
    }

    const weight = parseDecimalString(row.weightKg, 'weightKg');
    if (!weight.ok) {
      errors.push({ name: label, reason: weight.reason });
      return;
    }
    if (Number(weight.text) <= 0) {
      errors.push({ name: label, reason: `weightKg must be greater than zero: ${row.weightKg}` });
      return;
    }

    const price = parseDecimalString(row.purchasePriceYuan, 'purchasePriceYuan');
    if (!price.ok) {
      errors.push({ name: label, reason: price.reason });
      return;
    }

    const normalized = normalizeProductNameForMatch(name);
    const previous = seenNames.get(normalized);
    if (previous) {
      errors.push({
        name: label,
        reason: `duplicate product mapping is ambiguous with "${previous}"`,
      });
      return;
    }
    seenNames.set(normalized, name);

    valid.push({
      name,
      categoryRu,
      weightKg: weight.text,
      purchasePriceYuan: price.text,
      categoryTranslation: translation,
    });
  });

  return { valid, errors };
}

export type ExistingProductMatch = {
  id: string;
  name: string;
  sku: string;
  categoryId: string;
  weightKg: string | number;
  purchasePriceYuan: string | number;
  sellingPriceKgs?: string | number;
};

/**
 * Find exact product match by normalized name within the same catalog scope.
 * Returns ambiguous when multiple products normalize to the same key.
 */
export function findExactProductMatch(
  products: ExistingProductMatch[],
  name: string,
): { match: ExistingProductMatch | null; ambiguous: ExistingProductMatch[] } {
  const key = normalizeProductNameForMatch(name);
  const hits = products.filter((row) => normalizeProductNameForMatch(row.name) === key);
  if (hits.length === 1) return { match: hits[0], ambiguous: [] };
  if (hits.length > 1) return { match: null, ambiguous: hits };
  return { match: null, ambiguous: [] };
}

export function catalogFieldsNeedUpdate(
  existing: ExistingProductMatch,
  next: { categoryId: string; weightKg: string; purchasePriceYuan: string },
): boolean {
  const weightChanged = Number(existing.weightKg).toFixed(3) !== Number(next.weightKg).toFixed(3);
  const priceChanged =
    Number(existing.purchasePriceYuan).toFixed(2) !== Number(next.purchasePriceYuan).toFixed(2);
  const categoryChanged = existing.categoryId !== next.categoryId;
  return weightChanged || priceChanged || categoryChanged;
}

export type ChinaCatalogImportSummary = {
  totalRows: number;
  categoriesCreated: number;
  categoriesReused: number;
  productsCreated: number;
  productsUpdated: number;
  productsSkippedUnchanged: number;
  ambiguousDuplicates: number;
  validationErrors: number;
  failedRows: ChinaCatalogValidationError[];
  createdCategoryCodes: string[];
  reusedCategoryCodes: string[];
  createdProductNames: string[];
  updatedProductNames: string[];
  skippedProductNames: string[];
};

export function emptyImportSummary(totalRows = 0): ChinaCatalogImportSummary {
  return {
    totalRows,
    categoriesCreated: 0,
    categoriesReused: 0,
    productsCreated: 0,
    productsUpdated: 0,
    productsSkippedUnchanged: 0,
    ambiguousDuplicates: 0,
    validationErrors: 0,
    failedRows: [],
    createdCategoryCodes: [],
    reusedCategoryCodes: [],
    createdProductNames: [],
    updatedProductNames: [],
    skippedProductNames: [],
  };
}

export function formatImportSummary(summary: ChinaCatalogImportSummary): string {
  const lines = [
    `Total rows: ${summary.totalRows}`,
    `Categories created: ${summary.categoriesCreated}`,
    `Categories reused: ${summary.categoriesReused}`,
    `Products created: ${summary.productsCreated}`,
    `Products updated: ${summary.productsUpdated}`,
    `Products skipped as unchanged: ${summary.productsSkippedUnchanged}`,
    `Ambiguous duplicates: ${summary.ambiguousDuplicates}`,
    `Validation errors: ${summary.validationErrors}`,
  ];
  if (summary.failedRows.length > 0) {
    lines.push('Failed rows:');
    for (const row of summary.failedRows) {
      lines.push(`  - ${row.name}: ${row.reason}`);
    }
  }
  return lines.join('\n');
}
