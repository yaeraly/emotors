import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

describe('china receiving editable table product column', () => {
  const source = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../components/china-receiving/ChinaReceivingWorkspace.tsx'),
    'utf8',
  );

  it('uses auto table layout with wrapping product names instead of truncate', () => {
    const editableTableStart = source.indexOf('table className="w-full min-w-[720px] table-auto');
    assert.ok(editableTableStart >= 0, 'editable table-auto block missing');

    const editableTableEnd = source.indexOf('</table>', editableTableStart);
    assert.ok(editableTableEnd > editableTableStart);
    const editableTable = source.slice(editableTableStart, editableTableEnd);

    assert.match(editableTable, /whitespace-normal break-words font-medium text-slate-900/);
    assert.doesNotMatch(editableTable, /truncate font-medium text-slate-900/);
    assert.doesNotMatch(editableTable, /table-fixed/);
  });

  it('keeps quantity and discrepancy columns compact', () => {
    const editableTableStart = source.indexOf('table className="w-full min-w-[720px] table-auto');
    const editableTableEnd = source.indexOf('</table>', editableTableStart);
    const editableTable = source.slice(editableTableStart, editableTableEnd);

    assert.match(editableTable, /w-px whitespace-nowrap px-2 py-2 text-center/);
    assert.match(editableTable, /chinaReceiving\.col\.expectedShort/);
    assert.match(editableTable, /chinaReceiving\.col\.shortageShort/);
  });
});
