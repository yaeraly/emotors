import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { uniqueProductsById } from '../../../api/src/inventory/product-catalog-search-where.util';

describe('Supply Manager product master catalog list', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const listComponent = readFileSync(
    join(root, 'components/product-master/ProductsListContent.tsx'),
    'utf8',
  );
  const inventoryService = readFileSync(
    join(root, '../../api/src/inventory/inventory.service.ts'),
    'utf8',
  );

  it('scopes HQ catalog listing to the HQ catalog branch instead of warehouse inventory rows', () => {
    assert.match(inventoryService, /canAccessAllInventory\(user\)/);
    assert.match(inventoryService, /branch: \{ code: HQ_CATALOG_BRANCH_CODE, deletedAt: null \}/);
    assert.doesNotMatch(
      inventoryService,
      /canAccessAllInventory\(user\)[\s\S]{0,220}\{[\s\S]*?OR:[\s\S]*?activeHqWarehouseWhere/,
    );
  });

  it('uses product.id as the table row key', () => {
    assert.match(listComponent, /key=\{product\.id\}/);
    assert.doesNotMatch(listComponent, /key=\{product\.warehouseId\}/);
    assert.doesNotMatch(listComponent, /key=\{product\.name\}/);
  });

  it('removes quantity and low-stock columns from the product master table', () => {
    assert.doesNotMatch(listComponent, /inventory\.quantity/);
    assert.doesNotMatch(listComponent, /inventory\.lowStock/);
    assert.doesNotMatch(listComponent, /StockBadge/);
    assert.match(listComponent, /inventory\.photo/);
    assert.match(listComponent, /inventory\.name/);
    assert.match(listComponent, /inventory\.category/);
    assert.match(listComponent, /inventory\.unit/);
    assert.match(listComponent, /common\.actions/);
  });

  it('keeps one row per product id when multiple inventory records exist', () => {
    const items = [
      { id: 'gas-handle', name: 'Ручка газа 3 скорости + задний ход', quantity: 150 },
      { id: 'gas-handle', name: 'Ручка газа 3 скорости + задний ход', quantity: 0 },
      { id: 'other-product', name: 'Other product' },
    ];
    const unique = uniqueProductsById(items);
    assert.equal(unique.length, 2);
    assert.equal(unique.filter((item) => item.id === 'gas-handle').length, 1);
    assert.equal(unique[0].name, 'Ручка газа 3 скорости + задний ход');
  });

  it('keeps genuinely different product ids separate', () => {
    const items = [
      { id: 'p1', name: 'Similar name' },
      { id: 'p2', name: 'Similar name' },
    ];
    const unique = uniqueProductsById(items);
    assert.equal(unique.length, 2);
  });
});
