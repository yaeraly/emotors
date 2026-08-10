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
const toastComponent = readFileSync(join(root, 'components/BottomRightToast.tsx'), 'utf8');

describe('HQ Sales line review bottom-right toast', () => {
  it('detail page uses shared bottom-right toast for line review feedback', () => {
    assert.match(detailPage, /useBottomRightToast/);
    assert.match(detailPage, /<BottomRightToast/);
    assert.match(detailPage, /lineReviewApproved/);
    assert.match(detailPage, /lineReviewRejected/);
    assert.match(detailPage, /lineReviewSaveFailed/);
    assert.match(detailPage, /showLineReviewSuccess/);
    assert.match(detailPage, /showLineReviewError/);
  });

  it('toast container is fixed bottom-right', () => {
    assert.match(toastComponent, /fixed bottom-6 right-6/);
    assert.match(toastComponent, /bg-emerald-600/);
    assert.match(toastComponent, /bg-red-600/);
  });

  it('line review success uses toast for HQ Sales instead of inline banner', () => {
    const submitBlock = detailPage.slice(
      detailPage.indexOf('async function submitLineReview'),
      detailPage.indexOf('function setLineAction'),
    );
    assert.match(submitBlock, /if \(hqSalesView\) \{[\s\S]*showLineReviewSuccess/);
    assert.match(submitBlock, /else \{[\s\S]*setSuccess\(t\('branchProductRequest\.lineReviewSaved'\)\)/);
  });
});
