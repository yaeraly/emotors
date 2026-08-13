import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

describe('distribution order picking ui', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const detailPage = readFileSync(join(root, 'app/distribution/orders/[id]/page.tsx'), 'utf8');

  it('uses presentation-only picking sort when picked column is visible', () => {
    assert.match(detailPage, /sortDistributionOrderItemsForPickingDisplay/);
    assert.match(detailPage, /pickingDisplayItems = useMemo/);
    assert.match(detailPage, /showPickedColumn/);
    assert.match(detailPage, /pickingDisplayItems\?\.map/);
    assert.doesNotMatch(detailPage, /order\.items\?\.map\(\(item\) => \{/);
  });

  it('blurs active element after successful pick to avoid viewport jump', () => {
    assert.match(detailPage, /document\.activeElement instanceof HTMLElement/);
    assert.match(detailPage, /\.blur\(\)/);
  });
});
