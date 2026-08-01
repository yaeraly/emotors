import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CustomerLoyaltyCategory, CustomerType } from '@prisma/client';
import {
  assertSafePriceListPayload,
  buildPriceListWhatsAppMessage,
  buildWhatsAppDeepLink,
  customerTypeRuLabel,
  isBranchPriceListCustomerType,
  normalizeWhatsAppPhoneDigits,
  priceListTitleForCustomerType,
  resolvePriceListChannel,
} from './customer-price-list.util';

describe('customer price list utilities', () => {
  it('maps customer types to price-list titles and channels', () => {
    assert.equal(priceListTitleForCustomerType(CustomerType.RETAIL), 'Прайс для розничного клиента');
    assert.equal(priceListTitleForCustomerType(CustomerType.MASTER), 'Прайс для мастера');
    assert.equal(priceListTitleForCustomerType(CustomerType.WHOLESALE), 'Оптовый прайс');
    assert.equal(resolvePriceListChannel(CustomerType.RETAIL), 'RETAIL');
    assert.equal(resolvePriceListChannel(CustomerType.MASTER), 'MASTER');
    assert.equal(resolvePriceListChannel(CustomerType.WHOLESALE), 'WHOLESALE');
  });

  it('uses Russian customer type labels without raw enums', () => {
    assert.equal(customerTypeRuLabel(CustomerType.RETAIL), 'Розничный');
    assert.equal(customerTypeRuLabel(CustomerType.MASTER), 'Мастер');
    assert.equal(customerTypeRuLabel(CustomerType.WHOLESALE), 'Оптовый');
    assert.equal(isBranchPriceListCustomerType(CustomerType.DEALER), false);
  });

  it('normalizes Kyrgyzstan WhatsApp phone numbers', () => {
    assert.equal(normalizeWhatsAppPhoneDigits('+996 700 123 456'), '996700123456');
    assert.equal(normalizeWhatsAppPhoneDigits('0700123456'), '996700123456');
    assert.equal(normalizeWhatsAppPhoneDigits('700123456'), '996700123456');
    assert.equal(normalizeWhatsAppPhoneDigits('123'), null);
    assert.equal(normalizeWhatsAppPhoneDigits(null), null);
  });

  it('builds WhatsApp deep link without claiming automatic PDF send', () => {
    const message = buildPriceListWhatsAppMessage({
      customerName: 'Айбек',
      customerTypeLabel: 'Мастер',
      branchName: 'Бишкек',
      generatedAt: '01.08.2026, 12:00:00',
    });
    assert.match(message, /Айбек/);
    assert.match(message, /Мастер/);
    assert.match(message, /вручную/);
    const link = buildWhatsAppDeepLink('996700123456', message);
    assert.match(link, /^https:\/\/wa\.me\/996700123456\?text=/);
  });

  it('rejects confidential fields in safe DTO', () => {
    assert.doesNotThrow(() =>
      assertSafePriceListPayload({
        customerId: 'c1',
        products: [{ sku: 'A', customerPriceKgs: 100 }],
      }),
    );
    assert.throws(() =>
      assertSafePriceListPayload({
        customerId: 'c1',
        costPriceKgs: 50,
      }),
    );
  });

  it('keeps loyalty category labels distinct from customer type', () => {
    assert.notEqual(CustomerLoyaltyCategory.GOLD, CustomerType.MASTER);
  });
});
