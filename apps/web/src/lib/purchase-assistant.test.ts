import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  calculatePurchaseRecommendation,
  normalizePeriodDays,
} from '../../../api/src/procurement/purchase-assistant.util';
import {
  consumePurchaseAssistantDraft,
  PURCHASE_ASSISTANT_DRAFT_KEY,
  savePurchaseAssistantDraft,
} from './purchase-assistant-draft';

describe('purchase assistant frontend integration', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const page = readFileSync(join(root, 'app/procurement/purchase-assistant/page.tsx'), 'utf8');
  const hubNav = readFileSync(join(root, 'components/procurement/ProcurementHubNav.tsx'), 'utf8');
  const orderForm = readFileSync(join(root, 'components/ProcurementOrderForm.tsx'), 'utf8');
  const translations = readFileSync(join(root, 'i18n/translations.ts'), 'utf8');

  it('exposes Purchase Assistant under procurement hub navigation', () => {
    assert.match(hubNav, /purchase-assistant/);
    assert.match(hubNav, /procurement\.purchaseAssistant\.title/);
    assert.match(translations, /Помощник по закупкам/);
  });

  it('page shows required columns and actions', () => {
    assert.match(page, /procurement\.purchaseAssistant\.hqStock/);
    assert.match(page, /procurement\.purchaseAssistant\.sales/);
    assert.match(page, /procurement\.purchaseAssistant\.onTheWay/);
    assert.match(page, /procurement\.purchaseAssistant\.branchOrders/);
    assert.match(page, /procurement\.purchaseAssistant\.recommended/);
    assert.match(page, /procurement\.purchaseAssistant\.addToOrder/);
    assert.match(page, /procurement\.purchaseAssistant\.addAllRecommended/);
    assert.match(page, /procurement\.purchaseAssistant\.ignore/);
    assert.match(page, /procurement\.purchaseAssistant\.viewCalculation/);
    assert.match(page, /orderingNotRequired/);
  });

  it('supports 30/60/90 period and reserve days controls', () => {
    assert.match(page, /periodDays/);
    assert.match(page, /reserveDays/);
    assert.match(page, /period30/);
    assert.match(page, /period60/);
    assert.match(page, /period90/);
    assert.equal(normalizePeriodDays(90), 90);
  });

  it('does not auto-submit purchase orders from assistant', () => {
    assert.match(page, /\/procurement\/orders\/new/);
    assert.doesNotMatch(page, /method:\s*'POST'[\s\S]*\/procurement\/orders'/);
    assert.match(orderForm, /consumePurchaseAssistantDraft/);
  });

  it('preserves manual quantity and optional reason in draft', () => {
    const storage = new Map<string, string>();
    const originalSession = globalThis.sessionStorage;
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: {
        setItem: (key: string, value: string) => storage.set(key, value),
        getItem: (key: string) => storage.get(key) ?? null,
        removeItem: (key: string) => storage.delete(key),
      },
    });

    savePurchaseAssistantDraft([
      {
        productId: 'p1',
        quantity: 60,
        recommendedQuantity: 45,
        reason: 'Season demand',
        name: 'Test product',
        sku: 'TST001',
      },
    ]);
    const draft = consumePurchaseAssistantDraft();
    assert.ok(draft);
    assert.equal(draft!.items[0].quantity, 60);
    assert.equal(draft!.items[0].recommendedQuantity, 45);
    assert.equal(draft!.items[0].reason, 'Season demand');
    assert.equal(storage.has(PURCHASE_ASSISTANT_DRAFT_KEY), false);

    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: originalSession,
    });
  });

  it('recommendation math matches assistant rules', () => {
    const result = calculatePurchaseRecommendation({
      salesQuantity: 50,
      periodDays: 30,
      reserveDays: 10,
      hqAvailableQuantity: 10,
      onTheWayQuantity: 15,
      approvedBranchOrderQuantity: 20,
    });
    assert.equal(result.recommendedQuantity, 62);
    assert.equal(result.orderingRequired, true);

    const enough = calculatePurchaseRecommendation({
      salesQuantity: 5,
      periodDays: 30,
      reserveDays: 10,
      hqAvailableQuantity: 100,
      onTheWayQuantity: 0,
      approvedBranchOrderQuantity: 0,
    });
    assert.equal(enough.recommendedQuantity, 0);
    assert.equal(enough.orderingRequired, false);
  });
});
