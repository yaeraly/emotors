import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

describe('procurement product search uniqueness', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const searchComponent = readFileSync(join(root, 'components/ProcurementProductSearch.tsx'), 'utf8');
  const orderForm = readFileSync(join(root, 'components/ProcurementOrderForm.tsx'), 'utf8');
  const inventoryService = readFileSync(
    join(root, '../../api/src/inventory/inventory.service.ts'),
    'utf8',
  );
  const searchWhereUtil = readFileSync(
    join(root, '../../api/src/inventory/product-catalog-search-where.util.ts'),
    'utf8',
  );

  it('deduplicates search results by product.id and uses id as option key', () => {
    assert.match(searchComponent, /uniqueByProductId/);
    assert.match(searchComponent, /key=\{product\.id\}/);
    assert.match(searchComponent, /product\.name/);
    assert.match(searchComponent, /product\.sku/);
  });

  it('does not display warehouse or stock quantities in the dropdown', () => {
    assert.doesNotMatch(searchComponent, /warehouse\?\.name/);
    assert.doesNotMatch(searchComponent, /product\.quantity/);
    assert.doesNotMatch(searchComponent, /HQ склад|Kyzyl-Asker|branchStock|hqStock/);
  });

  it('merges repeated product selection into existing order line quantity', () => {
    assert.match(orderForm, /line\.productId === product\.id/);
    assert.match(orderForm, /nextQty/);
    assert.match(orderForm, /productId: product\.id/);
  });

  it('backend merges catalog scope with search without overwriting OR', () => {
    assert.match(inventoryService, /mergeProductCatalogSearchWhere/);
    assert.match(inventoryService, /uniqueProductsById/);
    assert.match(searchWhereUtil, /AND/);
    assert.match(searchWhereUtil, /catalogOr/);
  });
});
