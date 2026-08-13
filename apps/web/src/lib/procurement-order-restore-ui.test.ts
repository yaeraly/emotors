import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

describe('procurement order restore UI', () => {
  const pageSource = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../app/procurement/orders/[id]/page.tsx'),
    'utf8',
  );

  it('shows restore action for cancelled orders with confirmation for paid cancel', () => {
    assert.match(pageSource, /procurement\.orders\.restoreOrder/);
    assert.match(pageSource, /\/procurement\/orders\/\$\{id\}\/restore/);
    assert.match(pageSource, /procurement\.orders\.cancelWithPaymentsMessage/);
    assert.match(pageSource, /restoreEligibility\?\.canRestore/);
  });
});
