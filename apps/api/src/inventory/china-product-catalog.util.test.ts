import {
  catalogFieldsNeedUpdate,
  CHINA_PRODUCT_CATALOG_ROWS,
  findCategoryTranslation,
  findExactProductMatch,
  matchExistingCategory,
  normalizeProductNameForMatch,
  parseDecimalString,
  validateChinaCatalogRows,
} from './china-product-catalog.util';

function assert(condition: boolean, label: string) {
  if (!condition) throw new Error(label);
}

function assertEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

// Dataset integrity
{
  const { valid, errors } = validateChinaCatalogRows(CHINA_PRODUCT_CATALOG_ROWS);
  assertEqual(errors.length, 0, 'catalog rows validate without errors');
  assertEqual(valid.length, CHINA_PRODUCT_CATALOG_ROWS.length, 'all catalog rows valid');
}

// 1. Missing category translation lookup creates mapping for all supplied Russian names
{
  const categories = new Set(CHINA_PRODUCT_CATALOG_ROWS.map((row) => row.categoryRu));
  for (const categoryRu of categories) {
    assert(
      findCategoryTranslation(categoryRu) != null,
      `1. translation exists for ${categoryRu}`,
    );
  }
}

// 2. Existing category is reused by code / alias (Batteries ↔ Аккумуляторы / Батареи)
{
  const translation = findCategoryTranslation('Аккумуляторы');
  assert(translation != null, '2. batteries translation');
  const existing = [
    {
      id: 'c1',
      code: 'BATTERIES',
      nameRu: 'Батареи',
      nameEn: 'Batteries',
      nameKy: 'Батареялар',
    },
  ];
  const matched = matchExistingCategory(existing, translation!);
  assertEqual(matched?.code, 'BATTERIES', '2. existing batteries category reused');
}

// Displays / Мониторы alias reuse
{
  const translation = findCategoryTranslation('Мониторы');
  const existing = [
    {
      id: 'd1',
      code: 'DISPLAYS',
      nameRu: 'Дисплеи',
      nameEn: 'Displays',
      nameKy: 'Дисплейлер',
    },
  ];
  assertEqual(matchExistingCategory(existing, translation!)?.code, 'DISPLAYS', 'displays reused');
}

// 3. Existing product is not duplicated
{
  const products = [
    {
      id: 'p1',
      name: 'Желмаян Контроллер 1,8 кВт 70H',
      sku: 'CTR001',
      categoryId: 'cat',
      weightKg: '1.900',
      purchasePriceYuan: '175.00',
      sellingPriceKgs: '500.00',
    },
  ];
  const found = findExactProductMatch(products, 'Желмаян Контроллер 1,8 кВт 70H');
  assert(found.match != null, '3. existing product matched');
  assertEqual(found.ambiguous.length, 0, '3. not ambiguous');
}

// 4. Different specifications remain separate
{
  const a = normalizeProductNameForMatch('Желмаян Контроллер 1,8 кВт 70H');
  const b = normalizeProductNameForMatch('Желмаян Контроллер 2,2 кВт 80H');
  assert(a !== b, '4. controller variants stay separate');
  const c = normalizeProductNameForMatch('Амортизатор 43×72 (Ø1,5 см)');
  const d = normalizeProductNameForMatch('Амортизатор 43×72 (Ø2 см)');
  assert(c !== d, '4. shock variants stay separate');
  const e = normalizeProductNameForMatch('Диск 4 отверстия 4.50-12');
  const f = normalizeProductNameForMatch('Диск 5 отверстия 4.50-12');
  assert(e !== f, '4. disk hole variants stay separate');
}

// 5–6. Weight kg + CNY price parse
{
  const weight = parseDecimalString('15.000', 'weightKg');
  assert(weight.ok && weight.text === '15.000', '5. weight stored as kg string');
  const price = parseDecimalString('260.00', 'purchasePriceYuan');
  assert(price.ok && price.text === '260.00', '6. CNY price parsed');
}

// 7. Decimal 15.12 remains exact
{
  const price = parseDecimalString('15.12', 'purchasePriceYuan');
  assert(price.ok, '7. 15.12 parses');
  assertEqual(price.ok ? price.text : '', '15.12', '7. 15.12 exact text preserved');
}

// Update detection does not touch selling price
{
  const existing = {
    id: 'p1',
    name: 'Каска',
    sku: 'ACC001',
    categoryId: 'cat-a',
    weightKg: '0.500',
    purchasePriceYuan: '10.00',
    sellingPriceKgs: '999.00',
  };
  assert(
    !catalogFieldsNeedUpdate(existing, {
      categoryId: 'cat-a',
      weightKg: '0.500',
      purchasePriceYuan: '10.00',
    }),
    'unchanged skip',
  );
  assert(
    catalogFieldsNeedUpdate(existing, {
      categoryId: 'cat-a',
      weightKg: '0.600',
      purchasePriceYuan: '10.00',
    }),
    'weight update detected',
  );
}

// Normalization collapses spaces / dash / comma variants for match only
{
  const left = normalizeProductNameForMatch('Шина 4.00–12');
  const right = normalizeProductNameForMatch('Шина 4.00-12');
  assertEqual(left, right, 'en-dash normalized for comparison');
  const comma = normalizeProductNameForMatch('Генератор 5,5 кВт');
  const dot = normalizeProductNameForMatch('Генератор 5.5 кВт');
  assertEqual(comma, dot, 'decimal comma normalized for comparison');
}

// Reject negatives / empty
{
  const { errors } = validateChinaCatalogRows([
    { name: '', categoryRu: 'Моторы', weightKg: '1', purchasePriceYuan: '1' },
    { name: 'X', categoryRu: '', weightKg: '1', purchasePriceYuan: '1' },
    { name: 'Y', categoryRu: 'Моторы', weightKg: '-1', purchasePriceYuan: '1' },
    { name: 'Z', categoryRu: 'Моторы', weightKg: '1', purchasePriceYuan: '-2' },
    { name: 'W', categoryRu: 'Unknown Cat', weightKg: '1', purchasePriceYuan: '1' },
  ]);
  assert(errors.length >= 5, 'validation rejects bad rows');
}

console.log('china-product-catalog.util.test.ts passed');
