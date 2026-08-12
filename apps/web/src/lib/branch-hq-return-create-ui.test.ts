import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

describe('branch hq return create product combobox', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const page = readFileSync(join(root, 'app/branch-hq-returns/new/page.tsx'), 'utf8');

  it('uses searchable stock combobox instead of native select', () => {
    assert.match(page, /BranchWarehouseStockProductCombobox/);
    assert.match(page, /excludedProductIds=\{addedProductIds\}/);
    assert.doesNotMatch(page, /<select[\s\S]*branchHqReturn\.selectProduct/);
  });
});
