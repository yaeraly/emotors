import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { getErrorMessage, subscribeToast, toast } from './toast';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('global toast system', () => {
  it('root layout mounts ToastProvider once', () => {
    const layout = readFileSync(join(root, 'app/layout.tsx'), 'utf8');
    assert.match(layout, /import \{ ToastProvider \} from '@\/components\/ToastProvider'/);
    assert.match(layout, /<ToastProvider\s*\/>/);
    assert.equal((layout.match(/<ToastProvider/g) || []).length, 1);
  });

  it('ToastProvider is fixed bottom-right with high z-index', () => {
    const provider = readFileSync(join(root, 'components/ToastProvider.tsx'), 'utf8');
    assert.match(provider, /fixed bottom-4 right-4/);
    assert.match(provider, /sm:bottom-6 sm:right-6/);
    assert.match(provider, /z-\[100\]/);
    assert.match(provider, /success/);
    assert.match(provider, /error/);
    assert.match(provider, /warning/);
    assert.match(provider, /info/);
  });

  it('emits success/error/warning/info to subscribers once each', () => {
    const seen: Array<{ variant: string; message: string }> = [];
    const unsubscribe = subscribeToast((payload) => {
      seen.push({ variant: payload.variant, message: payload.message });
    });
    toast.success('OK');
    toast.error('FAIL');
    toast.warning('WARN');
    toast.info('INFO');
    unsubscribe();
    assert.deepEqual(seen, [
      { variant: 'success', message: 'OK' },
      { variant: 'error', message: 'FAIL' },
      { variant: 'warning', message: 'WARN' },
      { variant: 'info', message: 'INFO' },
    ]);
  });

  it('ignores empty toast messages', () => {
    const seen: string[] = [];
    const unsubscribe = subscribeToast((payload) => seen.push(payload.message));
    toast.success('   ');
    toast.error('');
    unsubscribe();
    assert.deepEqual(seen, []);
  });

  it('getErrorMessage prefers backend Error text', () => {
    assert.equal(getErrorMessage(new Error('Данные заказа изменились'), 'fallback'), 'Данные заказа изменились');
    assert.equal(getErrorMessage('NetworkError', 'fallback'), 'NetworkError');
    assert.equal(getErrorMessage(null, 'fallback'), 'fallback');
  });

  it('HQ Sales detail uses global toast for line review results', () => {
    const detail = readFileSync(join(root, 'app/branch-purchase-requests/[id]/page.tsx'), 'utf8');
    assert.match(detail, /from '@\/lib\/toast'/);
    assert.match(detail, /toast\.success\(lineReviewSuccessMessage/);
    assert.match(detail, /toast\.error\(/);
    assert.doesNotMatch(detail, /useBottomRightToast/);
    assert.doesNotMatch(detail, /<BottomRightToast/);
  });

  it('no user-facing alert\\(\\) / window.alert\\(\\) remain', () => {
    // Structural guard: migration scripts and sources should not introduce alerts.
    const provider = readFileSync(join(root, 'components/ToastProvider.tsx'), 'utf8');
    assert.doesNotMatch(provider, /window\.alert|[^.]alert\(/);
  });
});
