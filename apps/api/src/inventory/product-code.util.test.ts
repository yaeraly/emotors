import assert from 'node:assert/strict';
import {
  extractProductCodeSequence,
  getCategoryCodePrefix,
  isValidCategoryCodePrefix,
  isValidProductCode,
  nextProductBarcode,
  nextProductCode,
  normalizeCategoryCodePrefix,
  normalizeProductCode,
  resolveCategoryProductCodePrefix,
} from './product-code.util';

assert.equal(normalizeCategoryCodePrefix(' ct '), 'CT');
assert.equal(normalizeProductCode(' mt001 '), 'MT001');
assert.equal(isValidCategoryCodePrefix('CT'), true);
assert.equal(isValidCategoryCodePrefix('CT01'), false);
assert.equal(isValidCategoryCodePrefix('CTRL'), false);
assert.equal(isValidProductCode('MT001'), true);
assert.equal(isValidProductCode('mt001'), true);
assert.equal(isValidProductCode('MT 001'), true);
assert.equal(isValidProductCode('MT-001'), false);
assert.equal(isValidProductCode('TOOLONGPRODUCTCODE'), false);

assert.equal(resolveCategoryProductCodePrefix({ code: 'MOTORS', nameEn: 'Motors' }), 'MT');
assert.equal(resolveCategoryProductCodePrefix({ code: 'CONTROLLERS', nameEn: 'Controllers' }), 'CTR');
assert.equal(resolveCategoryProductCodePrefix({ code: 'BATTERIES', nameEn: 'Batteries' }), 'BAT');
assert.equal(resolveCategoryProductCodePrefix({ code: 'BRAKE_SYSTEM', nameEn: 'Brake System' }), 'BRK');
assert.equal(resolveCategoryProductCodePrefix({ code: 'WHEELS', nameEn: 'Wheels' }), 'WHL');
assert.equal(resolveCategoryProductCodePrefix({ code: 'AXLES', nameEn: 'Axles' }), 'AXL');
assert.equal(getCategoryCodePrefix({ code: 'bt' }), 'BT');

assert.equal(nextProductCode('MT', []), 'MT001');
assert.equal(nextProductCode('MT', ['MT001']), 'MT002');
assert.equal(nextProductCode('MT', ['MT001', 'MT003']), 'MT004');
assert.equal(nextProductCode('MT', ['MT001', 'mt002', 'ENG-000042']), 'MT003');
assert.equal(nextProductCode('CTR', []), 'CTR001');
assert.equal(nextProductCode('BAT', ['BAT001']), 'BAT002');
assert.equal(extractProductCodeSequence('MT', 'MT002'), 2);
assert.equal(nextProductBarcode('CT001'), 'CT001');

console.log('product-code.util.test.ts: all tests passed');
