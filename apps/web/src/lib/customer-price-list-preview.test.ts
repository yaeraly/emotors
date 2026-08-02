import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertCustomerPriceListPreviewHasNoForbiddenMetadata,
  buildCustomerPriceListPreviewHeader,
  collectCustomerPriceListPreviewHeaderText,
  type CustomerPriceListPreview,
} from './customer-price-list-preview';

function samplePreview(overrides: Partial<CustomerPriceListPreview> = {}): CustomerPriceListPreview {
  return {
    customerId: 'c1',
    branchName: 'Филиал Бишкек',
    branchPhone: '+996312000000',
    branchAddress: 'ул. Тестовая 1',
    title: 'Прайс для мастера',
    generatedAt: '2026-08-02T12:00:00.000Z',
    productCount: 1,
    whatsappApiAvailable: false,
    products: [
      {
        productId: 'p1',
        name: 'Полное название товара',
        unitLabelRu: 'шт.',
        finalPriceKgs: 1500,
        currency: 'KGS',
      },
    ],
    ...overrides,
  };
}

describe('customer price list preview header', () => {
  it('does not include customer name, type, currency, or validity note fields', () => {
    const preview = samplePreview();
    assertCustomerPriceListPreviewHasNoForbiddenMetadata(
      preview as unknown as Record<string, unknown>,
    );

    const header = buildCustomerPriceListPreviewHeader(preview);
    const text = collectCustomerPriceListPreviewHeaderText(header);

    assert.doesNotMatch(text, /Клиент:/i);
    assert.doesNotMatch(text, /Айбек/i);
    assert.doesNotMatch(text, /Тип клиента:/i);
    assert.doesNotMatch(text, /Мастер|Розничный|Оптовый/);
    assert.doesNotMatch(text, /Валюта:\s*KGS/i);
    assert.doesNotMatch(text, /Наличие и цены могут измениться/i);
    assert.doesNotMatch(text, /менеджеру филиала/i);
  });

  it('keeps only branch, title, and generated date in the preview header', () => {
    const preview = samplePreview();
    const header = buildCustomerPriceListPreviewHeader(preview);
    const text = collectCustomerPriceListPreviewHeaderText(header);

    assert.match(text, /EMOTORS/);
    assert.match(text, /Филиал Бишкек/);
    assert.match(text, /Тел: \+996312000000/);
    assert.match(text, /ул\. Тестовая 1/);
    assert.match(text, /Прайс для мастера/);
    assert.match(text, /Дата формирования:/);
  });

  it('keeps product table columns and formatted KGS prices', () => {
    const preview = samplePreview();
    const product = preview.products[0];
    assert.equal(product?.name, 'Полное название товара');
    assert.equal(product?.unitLabelRu, 'шт.');
    assert.equal(product?.finalPriceKgs, 1500);
    assert.equal(product?.currency, 'KGS');
    assert.equal(
      `${product?.finalPriceKgs.toLocaleString('ru-RU')} ${product?.currency}`,
      '1\u00a0500 KGS',
    );
  });

  it('rejects preview payloads that reintroduce removed metadata fields', () => {
    assert.throws(() =>
      assertCustomerPriceListPreviewHasNoForbiddenMetadata({
        customerName: 'Айбек',
      }),
    );
    assert.throws(() =>
      assertCustomerPriceListPreviewHasNoForbiddenMetadata({
        validityNote: 'Наличие и цены могут измениться.',
      }),
    );
  });
});
