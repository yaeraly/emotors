/** Customer-facing preview payload returned by the price-list API. */
export type CustomerPriceListPreview = {
  priceListId?: string;
  customerId: string;
  branchName: string;
  branchPhone?: string | null;
  branchAddress?: string | null;
  title: string;
  generatedAt: string;
  productCount: number;
  fileUrl?: string | null;
  fileName?: string | null;
  whatsappApiAvailable: boolean;
  whatsappRequiresManualPdfAttachment?: boolean;
  products: Array<{
    productId: string;
    name: string;
    unitLabelRu: string;
    finalPriceKgs: number;
    currency: string;
  }>;
};

export type CustomerPriceListPreviewHeader = {
  brand: string;
  branchName: string;
  branchPhone: string | null;
  branchAddress: string | null;
  title: string;
  generatedAtLabel: string;
};

const FORBIDDEN_PREVIEW_METADATA_KEYS = [
  'customerName',
  'customerType',
  'customerTypeLabel',
  'currency',
  'currencyLabel',
  'validityNote',
  'priceValidityNote',
] as const;

export function buildCustomerPriceListPreviewHeader(
  preview: CustomerPriceListPreview,
): CustomerPriceListPreviewHeader {
  return {
    brand: 'EMOTORS',
    branchName: preview.branchName,
    branchPhone: preview.branchPhone ?? null,
    branchAddress: preview.branchAddress ?? null,
    title: preview.title,
    generatedAtLabel: new Date(preview.generatedAt).toLocaleString('ru-RU'),
  };
}

export function collectCustomerPriceListPreviewHeaderText(
  header: CustomerPriceListPreviewHeader,
): string {
  return [
    header.brand,
    header.branchName,
    header.branchPhone ? `Тел: ${header.branchPhone}` : '',
    header.branchAddress ?? '',
    header.title,
    `Дата формирования: ${header.generatedAtLabel}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function assertCustomerPriceListPreviewHasNoForbiddenMetadata(
  preview: Record<string, unknown>,
) {
  for (const key of FORBIDDEN_PREVIEW_METADATA_KEYS) {
    if (key in preview) {
      throw new Error(`Customer price list preview must not expose field: ${key}`);
    }
  }
}
