export type MarkupPreviewResponse = {
  productId: string;
  validationStatus: 'OK' | 'ERROR';
  validationErrors: string[];
  preview: {
    minimumPriceKgs: number;
    recommendedPriceKgs: number;
    maximumPriceKgs: number;
    effectiveMaximumMarkupPercent: number;
    inheritedMaximumMarkupPercent: number;
    maximumMarkupOverridePercent: number | null;
    maximumMarkupSource: 'INHERITED' | 'CEO_PRODUCT_OVERRIDE';
  } | null;
};

export type MarkupPriceFlash = {
  min: boolean;
  rec: boolean;
  max: boolean;
};

export type MarkupRowEditorState = {
  draftMinMarkup: number;
  draftRecommendedMarkup: number;
  displayMinPrice: number;
  displayRecPrice: number;
  displayMaxPrice: number;
  displayMaxMarkup: number;
  displayMaxSource: 'INHERITED' | 'CEO_PRODUCT_OVERRIDE';
  savedMinMarkup: number;
  savedRecMarkup: number;
  previewValidationErrors: string[];
  previewValid: boolean | null;
  flash: MarkupPriceFlash;
  isDirty: boolean;
  isPreviewing: boolean;
};

export function createMarkupRowEditorState<T extends {
  minimumRetailMarkupPercent?: number;
  minimumWholesaleMarkupPercent?: number;
  recommendedRetailMarkupPercent?: number;
  recommendedWholesaleMarkupPercent?: number;
  minimumRetailPriceKgs?: number;
  minimumWholesalePriceKgs?: number;
  recommendedRetailPriceKgs?: number;
  recommendedWholesalePriceKgs?: number;
  maximumRetailPriceKgs?: number;
  maximumWholesalePriceKgs?: number;
  effectiveMaximumRetailMarkupPercent?: number;
  effectiveMaximumWholesaleMarkupPercent?: number;
  maximumRetailMarkupSource?: 'INHERITED' | 'CEO_PRODUCT_OVERRIDE';
  maximumWholesaleMarkupSource?: 'INHERITED' | 'CEO_PRODUCT_OVERRIDE';
}>(row: T, channel: 'retail' | 'wholesale'): MarkupRowEditorState {
  const minMarkup =
    channel === 'retail'
      ? Number(row.minimumRetailMarkupPercent ?? 0)
      : Number(row.minimumWholesaleMarkupPercent ?? 0);
  const recMarkup =
    channel === 'retail'
      ? Number(row.recommendedRetailMarkupPercent ?? 0)
      : Number(row.recommendedWholesaleMarkupPercent ?? 0);
  const minPrice =
    channel === 'retail'
      ? Number(row.minimumRetailPriceKgs ?? 0)
      : Number(row.minimumWholesalePriceKgs ?? 0);
  const recPrice =
    channel === 'retail'
      ? Number(row.recommendedRetailPriceKgs ?? 0)
      : Number(row.recommendedWholesalePriceKgs ?? 0);
  const maxPrice =
    channel === 'retail'
      ? Number(row.maximumRetailPriceKgs ?? 0)
      : Number(row.maximumWholesalePriceKgs ?? 0);
  const maxMarkup =
    channel === 'retail'
      ? Number(row.effectiveMaximumRetailMarkupPercent ?? 0)
      : Number(row.effectiveMaximumWholesaleMarkupPercent ?? 0);
  const maxSource =
    channel === 'retail'
      ? (row.maximumRetailMarkupSource ?? 'INHERITED')
      : (row.maximumWholesaleMarkupSource ?? 'INHERITED');

  return {
    draftMinMarkup: minMarkup,
    draftRecommendedMarkup: recMarkup,
    displayMinPrice: minPrice,
    displayRecPrice: recPrice,
    displayMaxPrice: maxPrice,
    displayMaxMarkup: maxMarkup,
    displayMaxSource: maxSource,
    savedMinMarkup: minMarkup,
    savedRecMarkup: recMarkup,
    previewValidationErrors: [],
    previewValid: null,
    flash: { min: false, rec: false, max: false },
    isDirty: false,
    isPreviewing: false,
  };
}

export function resetMarkupRowEditorState<T extends MarkupRowEditorState>(editor: T): T {
  return {
    ...editor,
    draftMinMarkup: editor.savedMinMarkup,
    draftRecommendedMarkup: editor.savedRecMarkup,
    previewValidationErrors: [],
    previewValid: null,
    flash: { min: false, rec: false, max: false },
    isDirty: false,
    isPreviewing: false,
  };
}

export function syncMarkupRowEditorFromSaved<T extends {
  minimumRetailMarkupPercent?: number;
  minimumWholesaleMarkupPercent?: number;
  recommendedRetailMarkupPercent?: number;
  recommendedWholesaleMarkupPercent?: number;
  minimumRetailPriceKgs?: number;
  minimumWholesalePriceKgs?: number;
  recommendedRetailPriceKgs?: number;
  recommendedWholesalePriceKgs?: number;
  maximumRetailPriceKgs?: number;
  maximumWholesalePriceKgs?: number;
  effectiveMaximumRetailMarkupPercent?: number;
  effectiveMaximumWholesaleMarkupPercent?: number;
  maximumRetailMarkupSource?: 'INHERITED' | 'CEO_PRODUCT_OVERRIDE';
  maximumWholesaleMarkupSource?: 'INHERITED' | 'CEO_PRODUCT_OVERRIDE';
}>(
  row: T,
  channel: 'retail' | 'wholesale',
): MarkupRowEditorState {
  return createMarkupRowEditorState(row, channel);
}
