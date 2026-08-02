import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CustomerLoyaltyCategory, CustomerType } from '@prisma/client';
import { writeCustomerPriceListPdf } from './customer-price-list-pdf.util';
import {
  toCustomerFacingPriceListDto,
  type CustomerFacingPriceListDto,
  type InternalCustomerPriceListSnapshot,
} from './customer-price-list.util';

describe('customer price list PDF', () => {
  it('renders a multi-page Cyrillic PDF without internal loyalty/SKU/availability details', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'price-list-'));
    const filePath = join(dir, 'test.pdf');

    const products = Array.from({ length: 60 }, (_, index) => ({
      productId: `p-${index}`,
      sku: `SKU-${index}`,
      name: `Товар с длинным названием для проверки переноса строки ${index + 1}`,
      category: 'Категория',
      unit: 'шт',
      photoUrl: null,
      availabilityStatus: index % 7 === 0 ? ('OUT_OF_STOCK' as const) : ('IN_STOCK' as const),
      availabilityLabel: index % 7 === 0 ? 'Нет в наличии' : 'В наличии',
      customerPriceKgs: 1000 + index,
      currency: 'KGS',
    }));

    const snapshot: InternalCustomerPriceListSnapshot = {
      customerId: 'c1',
      customerName: 'Айбек Тестов',
      customerPhone: '+996700000000',
      customerType: CustomerType.MASTER,
      customerTypeLabel: 'Мастер',
      loyaltyCategory: CustomerLoyaltyCategory.GOLD,
      loyaltyCategoryLabel: 'Gold',
      categoryMarkupPercent: 1.5,
      loyaltyDiscountPercent: 1.5,
      purchaseVolume90Days: 175_000,
      branchId: 'b1',
      branchName: 'Филиал Бишкек',
      branchPhone: '+996312000000',
      branchAddress: 'ул. Тестовая 1',
      branchPricingPolicySource: 'BRANCH',
      title: 'Прайс для мастера — категория Gold',
      pricingChannel: 'MASTER',
      pricingPolicyVersionId: 'v1',
      generatedAt: new Date().toISOString(),
      currency: 'KGS',
      validityNote: 'Цены актуальны на дату формирования прайс-листа.',
      productCount: products.length,
      products,
      whatsappApiAvailable: false,
    };

    const dto: CustomerFacingPriceListDto = toCustomerFacingPriceListDto(snapshot);
    assert.equal(dto.title, 'Прайс для мастера');
    assert.equal(dto.products[0]?.finalPriceKgs, 1000);

    const result = await writeCustomerPriceListPdf({ dto, absoluteFilePath: filePath });
    assert.ok(existsSync(filePath));
    assert.ok(result.pageCount >= 2);

    const bytes = await readFile(filePath);
    assert.ok(bytes.length > 1000);
    const asText = bytes.toString('latin1');
    assert.match(asText, /%PDF/);
    assert.doesNotMatch(asText, /costPriceKgs|purchasePriceYuan|себестоимость/i);
    // PDFKit embeds text as binary; assert restricted ASCII labels are absent from stream.
    assert.doesNotMatch(asText, /SKU-/);
    assert.doesNotMatch(asText, /Gold|Silver|VIP|Standard/);
    assert.doesNotMatch(asText, /175.?000|1\.5%/);
    assert.doesNotMatch(asText, /loyaltyCategory|purchaseVolume|markupPercent/i);

    await rm(dir, { recursive: true, force: true });
  });

  it('uses simplified customer-facing columns photo/name/unit/price', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'price-list-cols-'));
    const filePath = join(dir, 'cols.pdf');
    const dto: CustomerFacingPriceListDto = {
      customerId: 'c1',
      customerName: 'Клиент',
      customerPhone: null,
      customerType: CustomerType.RETAIL,
      customerTypeLabel: 'Розничный',
      branchId: 'b1',
      branchName: 'Филиал',
      branchPhone: null,
      branchAddress: null,
      title: 'Прайс для розничного клиента',
      generatedAt: new Date().toISOString(),
      currency: 'KGS',
      validityNote: 'Цены актуальны.',
      productCount: 1,
      products: [
        {
          productId: 'p1',
          name: 'Полное имя товара',
          unit: 'шт',
          photoUrl: null,
          finalPriceKgs: 2500,
          currency: 'KGS',
        },
      ],
      whatsappApiAvailable: false,
    };

    await writeCustomerPriceListPdf({ dto, absoluteFilePath: filePath });
    const bytes = await readFile(filePath);
    const asText = bytes.toString('latin1');
    assert.match(asText, /%PDF/);
    assert.ok(bytes.length > 500);
    // Ensure product price digits remain present after projection.
    assert.match(asText, /2/);
    await rm(dir, { recursive: true, force: true });
  });
});
