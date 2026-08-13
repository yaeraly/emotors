import type { SaleCustomerOption } from '@/components/SaleCustomerSearch';
import type { SaleProductOption } from '@/components/SaleProductSearch';
import { canCreateSale, isBranchSalesManagerUser } from '@/lib/rbac';
import { applyLoyaltyMarkupToRecommendedPrice, resolvePricingChannelFromCustomerType } from '@/lib/sale-customer-pricing';
import type { Customer, Sale, User } from '@/lib/types';

export type DraftSaleItemFormSeed = {
  productId: string;
  productName: string;
  productSku: string;
  unit: string;
  quantity: string;
  listPrice: number;
  minimumPrice: number;
  recommendedPrice: number;
  maximumPrice: number | null;
  hasMaximumPrice: boolean;
  discountPercent: string;
  unitPrice: string;
  unitPriceManuallyEdited: boolean;
  unitCost: string;
  availableQty: number;
  maxDiscountPercent: number;
  hasPricingPolicy: boolean;
};

export function canEditDraftSale(
  user: Pick<User, 'role' | 'roles' | 'permissions' | 'branchId'> | null | undefined,
  sale: Pick<Sale, 'status' | 'deletedAt'> | null | undefined,
) {
  if (!user || !sale) return false;
  if (sale.deletedAt) return false;
  if (sale.status !== 'DRAFT') return false;
  return canCreateSale(user);
}

export function draftSaleEditHref(saleId: string) {
  return `/sales/new?edit=${encodeURIComponent(saleId)}`;
}

export function customerOptionFromSale(sale: Sale): SaleCustomerOption {
  const customer = sale.customer;
  const customerType =
    customer.customerType === 'WHOLESALE'
      ? 'WHOLESALE'
      : customer.customerType === 'MASTER'
        ? 'MASTER'
        : 'RETAIL';
  return {
    id: customer.id,
    fullName: customer.fullName,
    phone: customer.phone,
    whatsappPhone: customer.whatsappPhone,
    status: customer.status,
    customerType,
    loyaltyCategory: customer.loyaltyCategory ?? customer.customerCategory,
    customerCategory: customer.customerCategory ?? customer.loyaltyCategory,
    currentMarkupPercent:
      (customer as { currentMarkupPercent?: number }).currentMarkupPercent ??
      (customer as { currentAdditionalMarkup?: number }).currentAdditionalMarkup,
    currentAdditionalMarkup: (customer as { currentAdditionalMarkup?: number }).currentAdditionalMarkup,
    currentDiscountPercent: (customer as { currentDiscountPercent?: number }).currentDiscountPercent,
    totalDebtAmount: Number(customer.totalDebtAmount ?? 0),
    hasOverdueInstallment: false,
  };
}

export function resolvePaymentTypeFromSale(sale: Sale): 'FULL_PAYMENT' | 'INSTALLMENT' {
  if (sale.installmentApproval || (sale.installments?.length ?? 0) > 0) {
    return 'INSTALLMENT';
  }
  return 'FULL_PAYMENT';
}

export function resolveInstallmentFieldsFromSale(sale: Sale) {
  const approval = sale.installmentApproval;
  const installment = sale.installments?.[0];
  const downPayment = Number(
    approval?.initialPayment ?? installment?.paidAmount ?? sale.paidAmount ?? 0,
  );
  const dueDate = approval?.dueDate ?? installment?.dueDate ?? null;
  return {
    downPayment: downPayment > 0 ? String(downPayment) : '',
    finalPaymentDate: dueDate ? dueDate.slice(0, 10) : '',
  };
}

function formatPriceInput(value: number) {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

export function mapSaleItemToFormSeed(
  item: NonNullable<Sale['items']>[number],
  product?: SaleProductOption | null,
  customer?: SaleCustomerOption | null,
): DraftSaleItemFormSeed {
  if (product) {
    const baseRecommended = product.recommendedRetailPriceKgs ?? product.sellingPriceKgs;
    const minimumPrice =
      product.minimumRetailPriceKgs ?? product.minimumSellingPriceKgs ?? baseRecommended;
    const maximumPrice = product.maximumRetailPriceKgs ?? null;
    const loyaltyMarkupPercent = Number(
      customer?.currentMarkupPercent ??
        customer?.currentAdditionalMarkup ??
        customer?.currentDiscountPercent ??
        0,
    );
    const recommendedPrice = applyLoyaltyMarkupToRecommendedPrice({
      basePriceKgs: baseRecommended,
      loyaltyMarkupPercent,
      minimumPriceKgs: minimumPrice,
      maximumPriceKgs: maximumPrice,
    });
    return {
      productId: product.id,
      productName: product.name,
      productSku: product.sku,
      unit: product.unit,
      quantity: String(item.quantity),
      listPrice: recommendedPrice,
      minimumPrice,
      recommendedPrice,
      maximumPrice,
      hasMaximumPrice: Boolean(product.hasMaximumRetailPrice && maximumPrice && maximumPrice > 0),
      discountPercent: '0',
      unitPrice: formatPriceInput(item.unitPrice),
      unitPriceManuallyEdited: Boolean(item.priceChangedManually),
      unitCost: String(item.unitCost ?? 0),
      availableQty: product.availableQty,
      maxDiscountPercent: product.maximumDiscountPercent,
      hasPricingPolicy:
        product.hasRecommendedPrice !== false && baseRecommended > 0 && recommendedPrice > 0,
    };
  }

  const recommended =
    item.recommendedPriceSnapshot ?? item.resolvedPriceKgs ?? item.unitPrice;
  const minimum = item.minimumPriceSnapshot ?? recommended;
  const maximum = item.maximumPriceSnapshot ?? null;

  return {
    productId: item.productId ?? '',
    productName: item.productName,
    productSku: item.productSku ?? '',
    unit: '',
    quantity: String(item.quantity),
    listPrice: recommended,
    minimumPrice: minimum,
    recommendedPrice: recommended,
    maximumPrice: maximum,
    hasMaximumPrice: maximum != null && maximum > 0,
    discountPercent: '0',
    unitPrice: formatPriceInput(item.unitPrice),
    unitPriceManuallyEdited: Boolean(item.priceChangedManually),
    unitCost: String(item.unitCost ?? 0),
    availableQty: item.quantity,
    maxDiscountPercent: 0,
    hasPricingPolicy: recommended > 0,
  };
}

export function isDraftEditBlockedMessage(message: string) {
  return message.includes('вышла из статуса «Черновик»');
}

export function branchSalesManagerDraftEditOnly(user: Pick<User, 'role' | 'roles' | 'branchId'> | null | undefined) {
  return isBranchSalesManagerUser(user);
}

export function pricingChannelForSaleCustomer(customer: SaleCustomerOption) {
  return resolvePricingChannelFromCustomerType(customer.customerType);
}
