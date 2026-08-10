import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const detailPage = readFileSync(
  join(root, 'app/branch-purchase-requests/[id]/page.tsx'),
  'utf8',
);
const toastLib = readFileSync(join(root, 'lib/toast.ts'), 'utf8');
const toastProvider = readFileSync(join(root, 'components/ToastProvider.tsx'), 'utf8');

describe('HQ Sales line review uses global bottom-right toast', () => {
  it('detail page uses global toast API for line review feedback', () => {
    assert.match(detailPage, /from '@\/lib\/toast'/);
    assert.match(detailPage, /lineReviewApproved/);
    assert.match(detailPage, /lineReviewRejected/);
    assert.match(detailPage, /lineReviewSaveFailed/);
    assert.match(detailPage, /toast\.success/);
    assert.match(detailPage, /toast\.error/);
  });

  it('global toast container is fixed bottom-right', () => {
    assert.match(toastProvider, /fixed bottom-4 right-4/);
    assert.match(toastProvider, /bg-emerald-600/);
    assert.match(toastProvider, /bg-red-600/);
    assert.match(toastLib, /export const toast/);
  });

  it('line review success uses toast instead of inline green banner', () => {
    const submitBlock = detailPage.slice(
      detailPage.indexOf('async function submitLineReview'),
      detailPage.indexOf('function setLineAction'),
    );
    assert.match(submitBlock, /toast\.success\(lineReviewSuccessMessage/);
    assert.doesNotMatch(submitBlock, /setSuccess\(/);
  });
});
