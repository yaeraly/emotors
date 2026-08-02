import { CustomerLoyaltyCategory, CustomerType } from '@prisma/client';
import { formatProductUnitRu } from '../common/product-unit.util';
import {
  getLoyaltyMarkupPercent,
  type CustomerTypeLoyaltyMarkupMatrix,
  type LoyaltyMarkupConfig,
} from './customer-loyalty.util';
import {
  resolvePricingChannelFromCustomerType,
  type SalePricingChannel,
} from '../sales/sale-customer-pricing.util';

/** Internal product row used for calculation, audit, and history snapshots. */
export type InternalPriceListProduct = {
  productId: string;
  sku: string;
  name: string;
  category: string | null;
  unit: string | null;
  photoUrl: string | null;
  availabilityStatus: 'IN_STOCK' | 'OUT_OF_STOCK';
  availabilityLabel: string;
  customerPriceKgs: number;
  currency: string;
};

/** Customer-facing product row — only fields needed for the final document. */
export type CustomerFacingPriceListProduct = {
  productId: string;
  name: string;
  unitLabelRu: string;
  finalPriceKgs: number;
  currency: string;
};

/** @deprecated Prefer InternalPriceListProduct / CustomerFacingPriceListProduct */
export type SafePriceListProduct = InternalPriceListProduct;

/** Full internal snapshot retained for audit / history. */
export type InternalCustomerPriceListSnapshot = {
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  customerType: CustomerType;
  customerTypeLabel: string;
  loyaltyCategory: CustomerLoyaltyCategory;
  loyaltyCategoryLabel: string;
  categoryMarkupPercent: number;
  loyaltyDiscountPercent: number;
  purchaseVolume90Days: number;
  branchId: string;
  branchName: string;
  branchPhone: string | null;
  branchAddress: string | null;
  branchPricingPolicySource: 'BRANCH' | 'HQ_DEFAULT';
  title: string;
  pricingChannel: SalePricingChannel;
  pricingPolicyVersionId: string | null;
  generatedAt: string;
  currency: string;
  validityNote: string;
  productCount: number;
  products: InternalPriceListProduct[];
  whatsappApiAvailable: boolean;
};

/** Customer-facing API / PDF / WhatsApp document payload. */
export type CustomerFacingPriceListDto = {
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  customerType: CustomerType;
  customerTypeLabel: string;
  branchId: string;
  branchName: string;
  branchPhone: string | null;
  branchAddress: string | null;
  title: string;
  generatedAt: string;
  currency: string;
  validityNote: string;
  productCount: number;
  products: CustomerFacingPriceListProduct[];
  whatsappApiAvailable: boolean;
};

/** @deprecated Prefer InternalCustomerPriceListSnapshot / CustomerFacingPriceListDto */
export type SafeCustomerPriceListDto = InternalCustomerPriceListSnapshot;

export const PRICE_LIST_VALIDITY_NOTE =
  'Цены актуальны на дату формирования прайс-листа.\n\nНаличие и цены могут измениться. Уточняйте информацию у менеджера филиала.';

const BRANCH_CUSTOMER_TYPES = new Set<CustomerType>([
  CustomerType.RETAIL,
  CustomerType.MASTER,
  CustomerType.WHOLESALE,
]);

export function isBranchPriceListCustomerType(
  customerType: CustomerType | string | null | undefined,
): customerType is CustomerType {
  return (
    customerType === CustomerType.RETAIL ||
    customerType === CustomerType.MASTER ||
    customerType === CustomerType.WHOLESALE
  );
}

export function priceListTitleForCustomerType(customerType: CustomerType): string {
  switch (customerType) {
    case CustomerType.MASTER:
      return 'Прайс для мастера';
    case CustomerType.WHOLESALE:
      return 'Оптовый прайс';
    case CustomerType.RETAIL:
    default:
      return 'Прайс для розничного клиента';
  }
}

export function customerTypeRuLabel(customerType: CustomerType): string {
  switch (customerType) {
    case CustomerType.MASTER:
      return 'Мастер';
    case CustomerType.WHOLESALE:
      return 'Оптовый';
    case CustomerType.RETAIL:
    default:
      return 'Розничный';
  }
}

export function loyaltyCategoryRuLabel(category: CustomerLoyaltyCategory): string {
  switch (category) {
    case CustomerLoyaltyCategory.SILVER:
      return 'Silver';
    case CustomerLoyaltyCategory.GOLD:
      return 'Gold';
    case CustomerLoyaltyCategory.VIP:
      return 'VIP';
    case CustomerLoyaltyCategory.STANDARD:
    default:
      return 'Standard';
  }
}

/**
 * Normalize a Kyrgyzstan phone for WhatsApp deep links.
 * Does not mutate stored customer phones — returns digits only for URL use.
 */
export function normalizeWhatsAppPhoneDigits(rawPhone: string | null | undefined): string | null {
  if (!rawPhone?.trim()) return null;
  let digits = rawPhone.replace(/\D/g, '');
  if (!digits) return null;

  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  // Local Kyrgyzstan mobile: 0XXXXXXXXX → 996XXXXXXXXX
  if (digits.length === 10 && digits.startsWith('0')) {
    digits = `996${digits.slice(1)}`;
  }

  // 9-digit local without leading 0 (e.g. 700XXXXXX)
  if (digits.length === 9 && /^[57]/.test(digits)) {
    digits = `996${digits}`;
  }

  // Already 996XXXXXXXXX (12 digits)
  if (digits.length === 12 && digits.startsWith('996')) {
    return digits;
  }

  // International without country code but 12+ starting elsewhere — require 996 for KG
  if (digits.length >= 11 && digits.startsWith('996')) {
    return digits.slice(0, 12);
  }

  return null;
}

export function buildPriceListWhatsAppMessage(input: {
  customerName: string;
  branchName: string;
  generatedAt: Date | string;
}): string {
  const generatedAt =
    typeof input.generatedAt === 'string'
      ? input.generatedAt
      : input.generatedAt.toLocaleString('ru-RU');

  return [
    `Здравствуйте, ${input.customerName}!`,
    '',
    'Отправляем актуальный прайс EMOTORS.',
    '',
    `Филиал: ${input.branchName}`,
    `Дата формирования: ${generatedAt}`,
    '',
    'По вопросам наличия и заказа обращайтесь к менеджеру филиала.',
    '',
    'PDF-файл прайс-листа прикрепите вручную из скачанного документа.',
  ].join('\n');
}

export function resolvePriceListCategoryMarkupPercent(
  branchPolicy: (LoyaltyMarkupConfig | CustomerTypeLoyaltyMarkupMatrix) & {
    branchCustomizationEnabled: boolean;
  },
  loyaltyCategory: CustomerLoyaltyCategory,
  customerType: CustomerType,
): number {
  if (!branchPolicy.branchCustomizationEnabled) {
    return 0;
  }
  return getLoyaltyMarkupPercent(loyaltyCategory, branchPolicy, customerType);
}

export function buildWhatsAppDeepLink(phoneDigits: string, message: string): string {
  return `https://wa.me/${phoneDigits}?text=${encodeURIComponent(message)}`;
}

export function resolvePriceListChannel(customerType: CustomerType): SalePricingChannel {
  if (!BRANCH_CUSTOMER_TYPES.has(customerType)) {
    throw new Error('У клиента не указан поддерживаемый тип клиента для прайс-листа.');
  }
  return resolvePricingChannelFromCustomerType(customerType);
}

const FORBIDDEN_COST_KEYS = new Set([
  'costpricekgs',
  'finalcostkgs',
  'fifocost',
  'purchasepriceyuan',
  'supplier',
  'factory',
  'margin',
  'marginamount',
  'marginpercent',
  'profit',
  'profitamount',
  'markup',
  'minimumsellingpricekgs',
  'unitcost',
  'себестоимость',
]);

/** Fields that must never appear in customer-facing API/PDF payloads. */
const FORBIDDEN_CUSTOMER_FACING_KEYS = new Set([
  ...FORBIDDEN_COST_KEYS,
  'sku',
  'productcategory',
  'category',
  'stockquantity',
  'availability',
  'availabilitystatus',
  'availabilitylabel',
  'loyaltycategory',
  'loyaltycategorylabel',
  'customercategory',
  'purchasevolume90days',
  'purchasevolume',
  'categorymarkuppercent',
  'loyaltydiscountpercent',
  'markuppercent',
  'markupamount',
  'markupamountkgs',
  'baseprice',
  'basepricekgs',
  'pricingchannel',
  'branchpricingpolicysource',
  'photourl',
  'photo',
  'unit',
]);

export function assertSafePriceListPayload(payload: Record<string, unknown>) {
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_COST_KEYS.has(key.toLowerCase())) {
        throw new Error(`Price list payload must not expose confidential field: ${key}`);
      }
      visit(nested);
    }
  };
  visit(payload);
}

export function assertCustomerFacingPriceListPayload(payload: Record<string, unknown>) {
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_CUSTOMER_FACING_KEYS.has(key.toLowerCase())) {
        throw new Error(`Customer-facing price list must not expose field: ${key}`);
      }
      visit(nested);
    }
  };
  visit(payload);
}

export function toCustomerFacingProduct(
  product: InternalPriceListProduct,
): CustomerFacingPriceListProduct {
  return {
    productId: product.productId,
    name: product.name,
    unitLabelRu: formatProductUnitRu(product.unit),
    finalPriceKgs: product.customerPriceKgs,
    currency: product.currency,
  };
}

export function toCustomerFacingPriceListDto(
  snapshot: InternalCustomerPriceListSnapshot,
): CustomerFacingPriceListDto {
  const dto: CustomerFacingPriceListDto = {
    customerId: snapshot.customerId,
    customerName: snapshot.customerName,
    customerPhone: snapshot.customerPhone,
    customerType: snapshot.customerType,
    customerTypeLabel: snapshot.customerTypeLabel,
    branchId: snapshot.branchId,
    branchName: snapshot.branchName,
    branchPhone: snapshot.branchPhone,
    branchAddress: snapshot.branchAddress,
    title: priceListTitleForCustomerType(snapshot.customerType),
    generatedAt: snapshot.generatedAt,
    currency: snapshot.currency,
    validityNote: snapshot.validityNote,
    productCount: snapshot.productCount,
    products: snapshot.products.map(toCustomerFacingProduct),
    whatsappApiAvailable: snapshot.whatsappApiAvailable,
  };
  assertCustomerFacingPriceListPayload(dto as unknown as Record<string, unknown>);
  return dto;
}

export function formatAvailabilityLabel(availableQty: number): {
  availabilityStatus: 'IN_STOCK' | 'OUT_OF_STOCK';
  availabilityLabel: string;
} {
  if (availableQty > 0) {
    return { availabilityStatus: 'IN_STOCK', availabilityLabel: 'В наличии' };
  }
  return { availabilityStatus: 'OUT_OF_STOCK', availabilityLabel: 'Нет в наличии' };
}
