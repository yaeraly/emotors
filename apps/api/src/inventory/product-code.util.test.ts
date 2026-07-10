import assert from 'node:assert/strict';
import {
  getCategoryCodePrefix,
  isValidCategoryCodePrefix,
  nextProductBarcode,
  nextProductCode,
  normalizeCategoryCodePrefix,
} from './product-code.util';

assert.equal(normalizeCategoryCodePrefix(' ct '), 'CT');
assert.equal(isValidCategoryCodePrefix('CT'), true);
assert.equal(isValidCategoryCodePrefix('CT01'), false);
assert.equal(isValidCategoryCodePrefix('CTRL'), false);
assert.equal(getCategoryCodePrefix({ code: 'bt' }), 'BT');

assert.equal(nextProductCode('CT', []), 'CT001');
assert.equal(nextProductCode('CT', ['CT001', 'CT002', 'ENG-000042']), 'CT003');
assert.equal(nextProductCode('BT', ['BT001']), 'BT002');
assert.equal(nextProductBarcode('CT001'), 'CT001');

console.log('product-code.util.test.ts: all tests passed');
