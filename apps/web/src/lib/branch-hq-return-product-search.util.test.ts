import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { filterBranchHqReturnStockProducts } from './branch-hq-return-product-search.util';

describe('branch hq return product search', () => {
  const items = [
    {
      productId: '1',
      productName: 'Желмаян Контроллер 1,8 кВт 70H',
      productCode: 'CTRL-70H',
      availableQuantity: 5,
    },
    {
      productId: '2',
      productName: 'Контроллер 2,2 кВт 80H',
      productCode: 'CTRL-80H',
      availableQuantity: 12,
    },
    {
      productId: '3',
      productName: 'Редуктор 23 зуб 5 кг',
      productCode: 'RED-23',
      availableQuantity: 25,
    },
  ];

  it('filters by product name case-insensitively', () => {
    const result = filterBranchHqReturnStockProducts(items, 'контрол');
    assert.equal(result.length, 2);
    assert.deepEqual(
      result.map((row) => row.productId).sort(),
      ['1', '2'],
    );
  });

  it('filters by sku/code', () => {
    const result = filterBranchHqReturnStockProducts(items, 'red-23');
    assert.equal(result.length, 1);
    assert.equal(result[0]?.productName, 'Редуктор 23 зуб 5 кг');
  });

  it('returns sorted list when query is empty', () => {
    const result = filterBranchHqReturnStockProducts(items, '');
    assert.equal(result.length, 3);
    assert.ok(result[0]!.productName.localeCompare(result[1]!.productName, 'ru') <= 0);
  });
});
