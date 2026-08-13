import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

describe('branch hq return create product combobox', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const page = readFileSync(join(root, 'app/branch-hq-returns/new/page.tsx'), 'utf8');
  const combobox = readFileSync(
    join(root, 'components/BranchWarehouseStockProductCombobox.tsx'),
    'utf8',
  );

  it('uses searchable stock combobox instead of native select', () => {
    assert.match(page, /BranchWarehouseStockProductCombobox/);
    assert.match(page, /excludedProductIds=\{addedProductIds\}/);
    assert.doesNotMatch(page, /<select[\s\S]*branchHqReturn\.selectProduct/);
  });

  it('adds product on Enter via combobox without a separate add button', () => {
    assert.match(page, /onEnterAdd=\{addLineFromOption\}/);
    assert.match(page, /onDuplicateAttempt/);
    assert.match(page, /branchHqReturn\.alreadyAdded/);
    assert.doesNotMatch(page, /branchHqReturn\.addItem/);
    assert.doesNotMatch(page, /onClick=\{addLine/);
  });

  it('prevents Enter from submitting the return form', () => {
    assert.match(combobox, /event\.key === 'Enter'/);
    assert.match(combobox, /event\.preventDefault\(\)/);
    assert.match(combobox, /onEnterAdd\(option\)/);
    assert.match(combobox, /onChange\(''\)/);
    assert.match(combobox, /inputRef\.current\?\.focus\(\)/);
  });
});
