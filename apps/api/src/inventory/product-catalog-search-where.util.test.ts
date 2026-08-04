import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  mergeProductCatalogSearchWhere,
  uniqueProductsById,
} from './product-catalog-search-where.util';

describe('mergeProductCatalogSearchWhere', () => {
  it('preserves HQ catalog OR when search OR is applied', () => {
    const merged = mergeProductCatalogSearchWhere(
      {
        deletedAt: null,
        OR: [
          { branch: { code: 'EMOTORS-HQ', deletedAt: null } },
          { warehouse: { warehouseType: 'HQ', branchId: null } },
        ],
      },
      'Желмаян Контроллер',
    );

    assert.ok(Array.isArray(merged.AND));
    assert.equal(merged.OR, undefined);
    const and = merged.AND as Array<Record<string, unknown>>;
    assert.equal(and.length, 2);
    assert.deepEqual(and[0], {
      OR: [
        { branch: { code: 'EMOTORS-HQ', deletedAt: null } },
        { warehouse: { warehouseType: 'HQ', branchId: null } },
      ],
    });
    const searchOr = (and[1] as { OR: Array<{ name?: { contains: string } }> }).OR;
    assert.equal(searchOr[0].name?.contains, 'Желмаян Контроллер');
  });

  it('applies search OR alone when catalog has no OR', () => {
    const merged = mergeProductCatalogSearchWhere(
      { deletedAt: null, branchId: 'branch-1' },
      'CTR-80H',
    );
    assert.equal((merged as { branchId: string }).branchId, 'branch-1');
    assert.ok(Array.isArray(merged.AND));
    const searchClause = (merged.AND as Array<{ OR: Array<{ sku?: { contains: string } }> }>)[0];
    assert.ok(searchClause.OR.some((row) => row.sku?.contains === 'CTR-80H'));
  });

  it('trims search and skips empty search', () => {
    const base = { deletedAt: null, branchId: 'b1' };
    assert.deepEqual(mergeProductCatalogSearchWhere(base, '   '), base);
    const merged = mergeProductCatalogSearchWhere(base, '  motor  ');
    const searchClause = (merged.AND as Array<{ OR: Array<{ name?: { contains: string } }> }>)[0];
    assert.equal(searchClause.OR[0].name?.contains, 'motor');
  });
});

describe('uniqueProductsById', () => {
  it('returns one entry per product id even if inventory rows duplicated the list', () => {
    const items = [
      { id: 'p1', name: 'Желмаян Контроллер 1,8 кВт 70H', warehouse: 'HQ' },
      { id: 'p1', name: 'Желмаян Контроллер 1,8 кВт 70H', warehouse: 'Kyzyl-Asker' },
      { id: 'p1', name: 'Желмаян Контроллер 1,8 кВт 70H', warehouse: 'Osh' },
      { id: 'p2', name: 'Other' },
    ];
    const unique = uniqueProductsById(items);
    assert.equal(unique.length, 2);
    assert.equal(unique[0].id, 'p1');
    assert.equal(unique[1].id, 'p2');
  });
});
