import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BRANCH_RECEIVING_TABLE_COLUMNS,
  BRANCH_RECEIVING_LEGACY_QUANTITY_HEADER_KEYS,
  BRANCH_RECEIVING_PRODUCT_NAME_CELL_CLASS,
  BRANCH_RECEIVING_QUANTITY_HEADER_KEYS,
  REMOVED_BRANCH_RECEIVING_TABLE_COLUMNS,
  allowsProductNameWrapping,
  buildBranchReceivingTransportPayload,
  computeDifference,
  deriveMissingQuantity,
  productNameDisplayUsesTruncation,
  shouldShowReceivingBranchField,
  shouldShowTransportCompanyField,
} from './branch-receiving-ui';

describe('branch-receiving-ui', () => {
  it('does not display Филиал in the first receiving section for branch operators', () => {
    assert.equal(shouldShowReceivingBranchField(true), false);
    assert.equal(shouldShowReceivingBranchField(false), true);
  });

  it('does not display Недостача or Статус table columns', () => {
    assert.deepEqual([...REMOVED_BRANCH_RECEIVING_TABLE_COLUMNS], ['missingQuantity', 'status']);
    for (const removed of REMOVED_BRANCH_RECEIVING_TABLE_COLUMNS) {
      assert.equal(BRANCH_RECEIVING_TABLE_COLUMNS.includes(removed as never), false);
    }
  });

  it('displays table columns in the required order', () => {
    assert.deepEqual([...BRANCH_RECEIVING_TABLE_COLUMNS], [
      'sku',
      'product',
      'sentQuantity',
      'acceptedQuantity',
      'damagedQuantity',
      'difference',
      'notes',
      'actions',
    ]);
  });

  it('uses compact quantity column header keys instead of legacy long labels', () => {
    assert.equal(BRANCH_RECEIVING_QUANTITY_HEADER_KEYS.sentQuantity, 'distribution.sentQuantityShort');
    assert.equal(BRANCH_RECEIVING_QUANTITY_HEADER_KEYS.acceptedQuantity, 'distribution.acceptedQuantityShort');
    for (const legacy of BRANCH_RECEIVING_LEGACY_QUANTITY_HEADER_KEYS) {
      assert.notEqual(BRANCH_RECEIVING_QUANTITY_HEADER_KEYS.sentQuantity, legacy);
      assert.notEqual(BRANCH_RECEIVING_QUANTITY_HEADER_KEYS.acceptedQuantity, legacy);
    }
  });

  it('renders full product names without truncation and allows wrapping', () => {
    assert.equal(productNameDisplayUsesTruncation(BRANCH_RECEIVING_PRODUCT_NAME_CELL_CLASS), false);
    assert.equal(allowsProductNameWrapping(BRANCH_RECEIVING_PRODUCT_NAME_CELL_CLASS), true);
    const longName = 'Амортизатор 43×72 (Ø1,5 см)';
    assert.equal(longName.includes('...'), false);
  });

  it('keeps difference calculation unchanged', () => {
    assert.equal(computeDifference(8, 10), -2);
    assert.equal(computeDifference(12, 10), 2);
    assert.equal(computeDifference(10, 10), 0);
  });

  it('derives missing quantity internally for discrepancy detection', () => {
    assert.equal(deriveMissingQuantity(10, 7, 1), 2);
    assert.equal(deriveMissingQuantity(10, 10, 0), 0);
    assert.equal(deriveMissingQuantity(10, 5, 3), 2);
  });

  it('does not display or submit transport company on receiving', () => {
    assert.equal(shouldShowTransportCompanyField(), false);
    const payload = buildBranchReceivingTransportPayload({
      driverName: 'Driver',
      vehicleNumber: 'ABC123',
      transportCostKgs: '5000',
      transportNotes: 'note',
    });
    assert.equal(Object.prototype.hasOwnProperty.call(payload, 'transportCompany'), false);
    assert.equal(payload.transportCostKgs, 5000);
    assert.equal(payload.driverName, 'Driver');
    assert.equal(payload.vehicleNumber, 'ABC123');
    assert.equal(payload.transportNotes, 'note');
  });

  it('allows completing receiving without transport company data', () => {
    const payload = buildBranchReceivingTransportPayload({
      driverName: '',
      vehicleNumber: '',
      transportCostKgs: '0',
      transportNotes: '',
    });
    assert.equal(payload.transportCostKgs, 0);
    assert.equal(payload.driverName, undefined);
    assert.equal(payload.vehicleNumber, undefined);
    assert.equal(payload.transportNotes, undefined);
  });
});
