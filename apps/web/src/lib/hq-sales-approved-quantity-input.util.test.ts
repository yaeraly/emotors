import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  approvedQuantityInputValue,
  parseApprovedQuantityChange,
  parseApprovedQuantityInput,
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

  it('rejects empty on Утвердить', () => {
    assert.equal(
      validateApprovedQuantityForApprove(t, { quantity: 10 }, ''),
      'branchProductRequest.approvedQuantityRequired',
    );
  });

  it('rejects quantity above requested', () => {
    assert.equal(
      validateApprovedQuantityForApprove(t, { quantity: 10 }, 11),
      'branchProductRequest.approvedQuantityExceedsRequested',
    );
  });

  it('accepts valid approved quantity', () => {
    assert.equal(validateApprovedQuantityForApprove(t, { quantity: 10 }, 2), null);
  });
});
