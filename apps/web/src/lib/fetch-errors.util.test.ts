import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  isNetworkFetchError,
  mapFetchError,
  mapReceiptUploadError,
} from './fetch-errors.util';

describe('fetch-errors.util', () => {
  it('detects browser network failures', () => {
    assert.equal(isNetworkFetchError(new Error('Failed to fetch')), true);
    assert.equal(isNetworkFetchError(new Error('NetworkError when attempting to fetch resource.')), true);
    assert.equal(isNetworkFetchError(new Error('Payment is already completed')), false);
  });

  it('maps network errors to a user-friendly Russian message', () => {
    assert.equal(
      mapFetchError(new Error('Failed to fetch')),
      'Не удалось подключиться к серверу. Проверьте соединение и повторите попытку.',
    );
  });

  it('maps already-processed backend errors', () => {
    assert.equal(
      mapFetchError(new Error('Payment is already completed')),
      'Счет уже был обработан.',
    );
  });

  it('preserves backend validation messages', () => {
    assert.equal(mapFetchError(new Error('Payment receipt attachment is required')), 'Payment receipt attachment is required');
  });

  it('maps receipt upload failures', () => {
    assert.equal(mapReceiptUploadError(new Error('Failed to fetch')), 'Не удалось подключиться к серверу. Проверьте соединение и повторите попытку.');
    assert.equal(mapReceiptUploadError(new Error('Invalid file format')), 'Invalid file format');
    assert.equal(mapReceiptUploadError(null), 'Квитанция не была загружена.');
  });
});

describe('api upload wiring', () => {
  const api = readFileSync(join(__dirname, './api.ts'), 'utf8');
  const cashierPage = readFileSync(
    join(__dirname, '../app/finance/cashier-bills/page.tsx'),
    'utf8',
  );

  it('exposes authenticated multipart upload helper without manual Content-Type', () => {
    assert.match(api, /export async function apiUpload/);
    assert.match(api, /UPLOAD_TIMEOUT_MS/);
    assert.doesNotMatch(api, /headers\.set\('Content-Type', 'multipart\/form-data'\)/);
  });

  it('cashier close flow uses apiUpload and relative endpoints', () => {
    assert.match(cashierPage, /apiUpload\(/);
    assert.match(cashierPage, /form\.append\('file', file\)/);
    assert.match(cashierPage, /\/procurement\/cashier-bills\/\$\{row\.source\}\/\$\{row\.id\}\/confirm/);
    assert.match(cashierPage, /\/procurement\/transport-expenses\/\$\{row\.id\}\/attachments\/receipt/);
    assert.match(cashierPage, /\/procurement\/orders\/\$\{orderId\}\/supplier-payments\/\$\{row\.id\}\/attachments/);
    assert.doesNotMatch(cashierPage, /fetch\(url/);
    assert.doesNotMatch(cashierPage, /JSON\.stringify\(form/);
  });

  it('keeps confirm dialog open and maps fetch errors', () => {
    assert.match(cashierPage, /mapFetchError/);
    assert.match(cashierPage, /setConfirmError\(message\)/);
    const confirmPaymentBlock = cashierPage.match(/async function confirmPayment[\s\S]*?^  \}/m)?.[0] ?? '';
    assert.match(confirmPaymentBlock, /setConfirmModal\(null\)/);
    assert.doesNotMatch(confirmPaymentBlock, /catch[\s\S]*setConfirmModal\(null\)/);
  });
});
