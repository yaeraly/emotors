import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  shouldHideWarehouseMovementNavOnPath,
  visibleWarehouseTabs,
} from './warehouse-nav';

const hqWarehouseManager = {
  role: 'WAREHOUSE_MANAGER' as const,
  roles: ['WAREHOUSE_MANAGER' as const],
  permissions: ['inventory.manage'],
  branchId: null,
};

const ceo = {
  role: 'CEO' as const,
  roles: ['CEO' as const],
  branchId: null,
};

describe('warehouse-nav — HQ inventory continuation navigation', () => {
  it('hides Движение склада on inventory continuation page for HQ Warehouse Manager', () => {
    const pathname = '/inventory/count/session-123';
    assert.equal(shouldHideWarehouseMovementNavOnPath(hqWarehouseManager, pathname), true);

    const tabs = visibleWarehouseTabs(hqWarehouseManager, pathname);
    const labels = tabs.map((tab) => tab.labelKey);
    assert.equal(labels.includes('scm.hub.warehouse.hqWarehouses'), true);
    assert.equal(labels.includes('scm.hub.warehouse.stocktake'), true);
    assert.equal(labels.includes('scm.hub.warehouse.movements'), false);
  });

  it('keeps Движение склада on other HQ Warehouse pages', () => {
    const tabs = visibleWarehouseTabs(hqWarehouseManager, '/hq-warehouses');
    const labels = tabs.map((tab) => tab.labelKey);
    assert.equal(labels.includes('scm.hub.warehouse.movements'), true);
  });

  it('does not hide movement nav for full-access roles on inventory continuation', () => {
    const pathname = '/inventory/count/session-123';
    assert.equal(shouldHideWarehouseMovementNavOnPath(ceo, pathname), false);
    const tabs = visibleWarehouseTabs(ceo, pathname);
    assert.equal(tabs.some((tab) => tab.href === '/stock-movements'), true);
  });
});
