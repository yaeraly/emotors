import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

describe('service order new page ui', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const newPage = readFileSync(join(root, 'app/service/new/page.tsx'), 'utf8');
  const productSearch = readFileSync(join(root, 'components/ServiceProductSearch.tsx'), 'utf8');

  it('shows add product action and product table', () => {
    assert.match(newPage, /Добавить товар/);
    assert.match(newPage, /productItems/);
    assert.match(newPage, /workItems/);
  });

  it('supports zero-day warranty label', () => {
    assert.match(newPage, /Без гарантии/);
    assert.match(newPage, /value: 0/);
  });

  it('shows separate work, product, and grand totals', () => {
    assert.match(newPage, /Работы:/);
    assert.match(newPage, /Товары:/);
    assert.match(newPage, /Общая сумма:/);
  });

  it('uses branch stock aware product search with customer pricing', () => {
    assert.match(productSearch, /customerId/);
    assert.match(productSearch, /availableQty/);
    assert.match(productSearch, /service-orders\/product-search/);
  });
});
