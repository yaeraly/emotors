import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CustomerLoyaltyCategory, CustomerType } from '@prisma/client';
import { writeCustomerPriceListPdf } from './customer-price-list-pdf.util';
import type { SafeCustomerPriceListDto } from './customer-price-list.util';

describe('customer price list PDF', () => {
  it('renders a multi-page Cyrillic PDF without confidential fields', async () => {
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

    const dto: SafeCustomerPriceListDto = {
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

    const result = await writeCustomerPriceListPdf({ dto, absoluteFilePath: filePath });
    assert.ok(existsSync(filePath));
    assert.ok(result.pageCount >= 2);

    const bytes = await readFile(filePath);
    assert.ok(bytes.length > 1000);
    const asText = bytes.toString('latin1');
    assert.match(asText, /%PDF/);
    assert.doesNotMatch(asText, /costPriceKgs|purchasePriceYuan|себестоимость/i);

    await rm(dir, { recursive: true, force: true });
  });
});
