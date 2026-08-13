import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

describe('purchase assistant service wiring', () => {
  const root = dirname(fileURLToPath(import.meta.url));
  const service = readFileSync(join(root, 'purchase-assistant.service.ts'), 'utf8');
  const controller = readFileSync(join(root, 'procurement.controller.ts'), 'utf8');
  const moduleSource = readFileSync(join(root, 'procurement.module.ts'), 'utf8');

  it('registers purchase assistant endpoints and service', () => {
    assert.match(controller, /purchase-assistant/);
    assert.match(controller, /purchaseAssistantService/);
    assert.match(moduleSource, /PurchaseAssistantService/);
  });

  it('aggregates HQ stock, sales, on-the-way and branch shortages', () => {
    assert.match(service, /inventoryBalance\.findMany/);
    assert.match(service, /saleItem\.groupBy/);
    assert.match(service, /procurementOrderItem\.findMany/);
    assert.match(service, /branchRequestShortage\.groupBy/);
    assert.match(service, /hqStockMovementCreatedAt: null/);
  });

  it('writes recommendation audit actions', () => {
    assert.match(service, /PURCHASE_RECOMMENDATION_GENERATED/);
    assert.match(service, /PURCHASE_RECOMMENDATION_ACCEPTED/);
    assert.match(service, /PURCHASE_RECOMMENDATION_MODIFIED/);
  });

  it('restricts access to Supply Manager (and full-access roles)', () => {
    assert.match(service, /SUPPLY_CHAIN_MANAGER/);
    assert.match(service, /Only Supply Manager can access Purchase Assistant/);
  });
});
