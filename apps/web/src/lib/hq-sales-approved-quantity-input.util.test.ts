import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  approvedQuantityInputValue,
  formatApprovedQuantityExceedsHqAvailableMessage,
  parseApprovedQuantityChange,
  parseApprovedQuantityInput,
  resolveHqAvailableForApprovalLine,
  validateApprovedQuantityForApprove,
} from './hq-sales-approved-quantity-input.util';

const t = (key: string) => key;

describe('hq sales approved quantity input', () => {
  it('keeps empty string when user clears Утв.', () => {
    assert.equal(parseApprovedQuantityChange(''), '');
    assert.equal(approvedQuantityInputValue(''), '');
    assert.equal(Number.isNaN(parseApprovedQuantityInput('')), true);
  });

  it('does not coerce empty string to 0', () => {
    assert.notEqual(parseApprovedQuantityChange(''), 0);
    assert.notEqual(approvedQuantityInputValue(''), 0);
    assert.notEqual(parseApprovedQuantityInput(''), 0);
  });

  it('parses typed quantities normally', () => {
    assert.equal(parseApprovedQuantityChange('2'), 2);
    assert.equal(parseApprovedQuantityChange('25'), 25);
    assert.equal(approvedQuantityInputValue(5), 5);
  });

  it('resolves HQ available from availableForThisRequest or fallback fields', () => {
    assert.equal(resolveHqAvailableForApprovalLine({ availableForThisRequest: 6 }), 6);
    assert.equal(
      resolveHqAvailableForApprovalLine({ hqAvailableStock: 4, bookedQuantity: 2 }),
      6,
    );
  });

  it('rejects empty on Утвердить', () => {
    assert.equal(
      validateApprovedQuantityForApprove(t, { quantity: 10 }, '', 6),
      'branchProductRequest.approvedQuantityRequired',
    );
  });

  it('rejects quantity above requested', () => {
    assert.equal(
      validateApprovedQuantityForApprove(t, { quantity: 10 }, 11, 20),
      'branchProductRequest.approvedQuantityExceedsRequested',
    );
  });

  it('rejects quantity above HQ available', () => {
    assert.equal(
      validateApprovedQuantityForApprove(t, { quantity: 10 }, 7, 6),
      'branchProductRequest.approvedQuantityExceedsHqAvailable',
    );
    assert.equal(
      formatApprovedQuantityExceedsHqAvailableMessage(
        () => 'Недостаточно товара на складе HQ. Доступно: {{hqAvailable}}.',
        6,
      ),
      'Недостаточно товара на складе HQ. Доступно: 6.',
    );
  });

  it('accepts valid approved quantity within request and HQ limits', () => {
    assert.equal(validateApprovedQuantityForApprove(t, { quantity: 10 }, 6, 6), null);
    assert.equal(validateApprovedQuantityForApprove(t, { quantity: 5 }, 5, 20), null);
  });
});
