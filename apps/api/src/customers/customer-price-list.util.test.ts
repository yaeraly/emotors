import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CustomerLoyaltyCategory, CustomerType } from '@prisma/client';
import {
  assertCustomerFacingPriceListPayload,
  assertSafePriceListPayload,
  buildPriceListWhatsAppMessage,
  buildWhatsAppDeepLink,
  customerTypeRuLabel,
  isBranchPriceListCustomerType,
  normalizeWhatsAppPhoneDigits,
  priceListTitleForCustomerType,
  resolvePriceListCategoryMarkupPercent,
  resolvePriceListChannel,
  toCustomerFacingPriceListDto,
  type InternalCustomerPriceListSnapshot,
} from './customer-price-list.util';
import {
  DEFAULT_CUSTOMER_TYPE_LOYALTY_MARKUPS,
  calculateFinalSaleUnitPrice,
} from './customer-loyalty.util';

function sampleInternalSnapshot(
  overrides: Partial<InternalCustomerPriceListSnapshot> = {},
): InternalCustomerPriceListSnapshot {
  return {
    customerId: 'c1',
    customerName: 'Айбек Тестов',
    customerPhone: '+996700000000',
    customerType: CustomerType.MASTER,
    customerTypeLabel: 'Мастер',
    loyaltyCategory: CustomerLoyaltyCategory.STANDARD,
    loyaltyCategoryLabel: 'Standard',
    categoryMarkupPercent: 5,
    loyaltyDiscountPercent: 5,
    purchaseVolume90Days: 0,
    branchId: 'b1',
    branchName: 'Филиал Бишкек',
    branchPhone: '+996312000000',
    branchAddress: 'ул. Тестовая 1',
    branchPricingPolicySource: 'BRANCH',
    title: 'Прайс для мастера',
    pricingChannel: 'MASTER',
    pricingPolicyVersionId: 'v1',
    generatedAt: '2026-08-02T12:00:00.000Z',
    currency: 'KGS',
    validityNote: 'Цены актуальны на дату формирования прайс-листа.',
    productCount: 1,
    products: [
      {
        productId: 'p1',
        sku: 'SKU-1',
        name: 'Полное название товара без обрезки',
        category: 'Двигатели',
        unit: 'шт',
        photoUrl: null,
        availabilityStatus: 'IN_STOCK',
        availabilityLabel: 'В наличии',
        customerPriceKgs: 1144,
        currency: 'KGS',
      },
    ],
    whatsappApiAvailable: false,
    ...overrides,
  };
}

describe('customer price list utilities', () => {
  it('maps customer types to price-list titles without loyalty category suffix', () => {
    assert.equal(priceListTitleForCustomerType(CustomerType.RETAIL), 'Прайс для розничного клиента');
    assert.equal(priceListTitleForCustomerType(CustomerType.MASTER), 'Прайс для мастера');
    assert.equal(priceListTitleForCustomerType(CustomerType.WHOLESALE), 'Оптовый прайс');
    assert.doesNotMatch(priceListTitleForCustomerType(CustomerType.MASTER), /Standard|Silver|Gold|VIP|категория/i);
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

  it('builds WhatsApp message without loyalty category, volume, or markup', () => {
    const message = buildPriceListWhatsAppMessage({
      customerName: 'Айбек',
      branchName: 'Бишкек',
      generatedAt: '01.08.2026, 12:00:00',
    });
    assert.match(message, /Айбек/);
    assert.match(message, /Бишкек/);
    assert.match(message, /01\.08\.2026/);
    assert.match(message, /менеджеру филиала/);
    assert.doesNotMatch(message, /Категория/i);
    assert.doesNotMatch(message, /Standard|Silver|Gold|VIP/);
    assert.doesNotMatch(message, /Покупки за 90 дней/i);
    assert.doesNotMatch(message, /наценк/i);
    assert.doesNotMatch(message, /Markup|Loyalty/i);
    const link = buildWhatsAppDeepLink('996700123456', message);
    assert.match(link, /^https:\/\/wa\.me\/996700123456\?text=/);
  });

  it('applies category markup only when branch customization is enabled', () => {
    assert.equal(
      resolvePriceListCategoryMarkupPercent(
        { ...DEFAULT_CUSTOMER_TYPE_LOYALTY_MARKUPS, branchCustomizationEnabled: true },
        CustomerLoyaltyCategory.SILVER,
        CustomerType.WHOLESALE,
      ),
      3,
    );
    assert.equal(
      resolvePriceListCategoryMarkupPercent(
        { ...DEFAULT_CUSTOMER_TYPE_LOYALTY_MARKUPS, branchCustomizationEnabled: false },
        CustomerLoyaltyCategory.SILVER,
        CustomerType.WHOLESALE,
      ),
      0,
    );
    assert.equal(
      resolvePriceListCategoryMarkupPercent(
        { ...DEFAULT_CUSTOMER_TYPE_LOYALTY_MARKUPS, branchCustomizationEnabled: true },
        CustomerLoyaltyCategory.GOLD,
        CustomerType.MASTER,
      ),
      2,
    );
  });

  it('rejects confidential cost fields in internal safe DTO', () => {
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

  it('projects customer-facing DTO without restricted fields and keeps final prices', () => {
    const snapshot = sampleInternalSnapshot();
    const dto = toCustomerFacingPriceListDto(snapshot);

    assert.equal(dto.customerName, 'Айбек Тестов');
    assert.equal(dto.customerTypeLabel, 'Мастер');
    assert.equal(dto.title, 'Прайс для мастера');
    assert.equal(dto.products.length, 1);
    assert.equal(dto.products[0]?.name, 'Полное название товара без обрезки');
    assert.equal(dto.products[0]?.unit, 'шт');
    assert.equal(dto.products[0]?.finalPriceKgs, 1144);
    assert.equal(dto.products[0]?.currency, 'KGS');

    assert.equal('sku' in (dto.products[0] as object), false);
    assert.equal('category' in (dto.products[0] as object), false);
    assert.equal('availabilityLabel' in (dto.products[0] as object), false);
    assert.equal('loyaltyCategory' in dto, false);
    assert.equal('loyaltyCategoryLabel' in dto, false);
    assert.equal('purchaseVolume90Days' in dto, false);
    assert.equal('categoryMarkupPercent' in dto, false);
    assert.equal('loyaltyDiscountPercent' in dto, false);

    assert.doesNotThrow(() =>
      assertCustomerFacingPriceListPayload(dto as unknown as Record<string, unknown>),
    );
    assert.throws(() =>
      assertCustomerFacingPriceListPayload({
        ...dto,
        loyaltyCategory: 'STANDARD',
      } as unknown as Record<string, unknown>),
    );
    assert.throws(() =>
      assertCustomerFacingPriceListPayload({
        products: [{ sku: 'X', name: 'A', finalPriceKgs: 1, currency: 'KGS' }],
      }),
    );
  });

  it('retains internal audit metadata on the snapshot while projecting customer output', () => {
    const snapshot = sampleInternalSnapshot({
      loyaltyCategory: CustomerLoyaltyCategory.GOLD,
      loyaltyCategoryLabel: 'Gold',
      purchaseVolume90Days: 175_000,
      categoryMarkupPercent: 1.5,
    });
    assert.equal(snapshot.loyaltyCategory, CustomerLoyaltyCategory.GOLD);
    assert.equal(snapshot.purchaseVolume90Days, 175_000);
    assert.equal(snapshot.categoryMarkupPercent, 1.5);
    assert.equal(snapshot.products[0]?.sku, 'SKU-1');

    const dto = toCustomerFacingPriceListDto(snapshot);
    assert.equal(dto.products[0]?.finalPriceKgs, snapshot.products[0]?.customerPriceKgs);
    assert.doesNotMatch(JSON.stringify(dto), /Gold|SKU-1|Двигатели|В наличии|1\.5|175000|purchaseVolume/i);
  });

  it('calculates master silver final customer price from HQ base and category markup', () => {
    const markup = resolvePriceListCategoryMarkupPercent(
      { ...DEFAULT_CUSTOMER_TYPE_LOYALTY_MARKUPS, branchCustomizationEnabled: true },
      CustomerLoyaltyCategory.SILVER,
      CustomerType.MASTER,
    );
    const priced = calculateFinalSaleUnitPrice({
      basePriceKgs: 1100,
      loyaltyMarkupPercent: markup,
      minimumPriceKgs: 0,
    });
    assert.equal(markup, 4);
    assert.equal(priced.finalPriceKgs, 1144);
  });

  it('keeps loyalty category labels distinct from customer type', () => {
    assert.notEqual(CustomerLoyaltyCategory.GOLD, CustomerType.MASTER);
  });
});
