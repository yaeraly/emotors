import assert from 'node:assert/strict';
import { buildProductCodeMigrationPreview } from './product-code-migration.util';

const categories = [
  { id: 'cat-ct', code: 'CT', nameEn: 'Controllers', nameRu: 'Контроллеры' },
  { id: 'cat-bt', code: 'BT', nameEn: 'Batteries', nameRu: 'Батареи' },
];

const products = [
  {
    id: 'p1',
    name: 'Controller A',
    sku: 'CONTROLLERS-0001',
    categoryId: 'cat-ct',
    createdAt: new Date('2026-01-01'),
  },
  {
    id: 'p2',
    name: 'Controller B',
    sku: 'CONTROLLERS-0002',
    categoryId: 'cat-ct',
    createdAt: new Date('2026-01-02'),
  },
  {
    id: 'p3',
    name: 'Battery A',
    sku: 'BATTERY-0001',
    categoryId: 'cat-bt',
    createdAt: new Date('2026-01-03'),
  },
];

const preview = buildProductCodeMigrationPreview(products, categories);
assert.equal(preview.canApply, true);
assert.equal(preview.rows.length, 3);
assert.deepEqual(
  preview.rows.map((row) => row.newCode),
  ['CT001', 'CT002', 'BT001'],
);

const blocked = buildProductCodeMigrationPreview(
  [{ ...products[0], categoryId: 'missing' }],
  categories,
);
assert.equal(blocked.canApply, false);

console.log('product-code-migration.util.test.ts passed');
