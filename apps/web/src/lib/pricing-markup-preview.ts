import { applyMarkupRoundUpPreview } from './pricing-roundup-preview';

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
  draftMinMarkup: number | null;
  draftRecommendedMarkup: number | null;
  draftMaxMarkup: number | null;
  displayMinPrice: number;
  displayRecPrice: number;
  displayMaxPrice: number;
  displayMaxMarkup: number;
  displayMaxSource: 'INHERITED' | 'CEO_PRODUCT_OVERRIDE';
  savedMinMarkup: number;
  savedRecMarkup: number;
  savedMaxMarkup: number;
  inheritedMaxMarkup: number;
  previewValidationErrors: string[];
  previewValid: boolean | null;
  flash: MarkupPriceFlash;
  isDirty: boolean;
  isPreviewing: boolean;
};

type MarkupRowSource = {
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
  inheritedMaximumRetailMarkupPercent?: number;
  inheritedMaximumWholesaleMarkupPercent?: number;
  maximumRetailMarkupSource?: 'INHERITED' | 'CEO_PRODUCT_OVERRIDE';
  maximumWholesaleMarkupSource?: 'INHERITED' | 'CEO_PRODUCT_OVERRIDE';
  effectiveBranchPriceKgs?: number;
};

function readMarkupPercents(row: MarkupRowSource, channel: 'retail' | 'wholesale') {
  const minMarkup =
    channel === 'retail'
      ? Number(row.minimumRetailMarkupPercent ?? 0)
      : Number(row.minimumWholesaleMarkupPercent ?? 0);
  const recMarkup =
    channel === 'retail'
      ? Number(row.recommendedRetailMarkupPercent ?? 0)
      : Number(row.recommendedWholesaleMarkupPercent ?? 0);
  const maxMarkup =
    channel === 'retail'
      ? Number(row.effectiveMaximumRetailMarkupPercent ?? 0)
      : Number(row.effectiveMaximumWholesaleMarkupPercent ?? 0);
  const inheritedMax =
    channel === 'retail'
      ? Number(row.inheritedMaximumRetailMarkupPercent ?? maxMarkup)
      : Number(row.inheritedMaximumWholesaleMarkupPercent ?? maxMarkup);
  return { minMarkup, recMarkup, maxMarkup, inheritedMax };
}

function readSavedPrices(row: MarkupRowSource, channel: 'retail' | 'wholesale') {
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
  const maxSource =
    channel === 'retail'
      ? (row.maximumRetailMarkupSource ?? 'INHERITED')
      : (row.maximumWholesaleMarkupSource ?? 'INHERITED');
  return { minPrice, recPrice, maxPrice, maxSource };
}

export function createMarkupRowEditorState<T extends MarkupRowSource>(
  row: T,
  channel: 'retail' | 'wholesale',
): MarkupRowEditorState {
  const { minMarkup, recMarkup, maxMarkup, inheritedMax } = readMarkupPercents(row, channel);
  const { minPrice, recPrice, maxPrice, maxSource } = readSavedPrices(row, channel);

  return {
    draftMinMarkup: minMarkup,
    draftRecommendedMarkup: recMarkup,
    draftMaxMarkup: maxMarkup,
    displayMinPrice: minPrice,
    displayRecPrice: recPrice,
    displayMaxPrice: maxPrice,
    displayMaxMarkup: maxMarkup,
    displayMaxSource: maxSource,
    savedMinMarkup: minMarkup,
    savedRecMarkup: recMarkup,
    savedMaxMarkup: maxMarkup,
    inheritedMaxMarkup: inheritedMax,
    previewValidationErrors: [],
    previewValid: null,
    flash: { min: false, rec: false, max: false },
    isDirty: false,
    isPreviewing: false,
  };
}

export function applyLocalMarkupPreview<T extends MarkupRowEditorState & { effectiveBranchPriceKgs: number }>(
  row: T,
): T {
  const branchPrice = Number(row.effectiveBranchPriceKgs ?? 0);
  const min = row.draftMinMarkup;
  const rec = row.draftRecommendedMarkup;
  const max = row.draftMaxMarkup ?? row.savedMaxMarkup;

  if (min == null || rec == null || max == null) {
    return row;
  }

  return {
    ...row,
    displayMinPrice: applyMarkupRoundUpPreview(branchPrice, min),
    displayRecPrice: applyMarkupRoundUpPreview(branchPrice, rec),
    displayMaxPrice: applyMarkupRoundUpPreview(branchPrice, max),
    displayMaxMarkup: max,
  };
}

export function isMarkupRowDirty(row: MarkupRowEditorState) {
  const minChanged = row.draftMinMarkup != null && Math.abs(row.draftMinMarkup - row.savedMinMarkup) > 0.001;
  const recChanged =
    row.draftRecommendedMarkup != null && Math.abs(row.draftRecommendedMarkup - row.savedRecMarkup) > 0.001;
  const maxChanged = row.draftMaxMarkup != null && Math.abs(row.draftMaxMarkup - row.savedMaxMarkup) > 0.001;
  return minChanged || recChanged || maxChanged;
}

export function resolveMaxOverridePayload(
  row: MarkupRowEditorState,
  channel: 'retail' | 'wholesale',
): Record<string, unknown> {
  if (row.draftMaxMarkup == null || Math.abs(row.draftMaxMarkup - row.savedMaxMarkup) <= 0.001) {
    return {};
  }

  if (Math.abs(row.draftMaxMarkup - row.inheritedMaxMarkup) <= 0.001) {
    return channel === 'retail'
      ? { restoreMaximumRetailInheritance: true }
      : { restoreMaximumWholesaleInheritance: true };
  }

  return channel === 'retail'
    ? { maximumRetailMarkupOverridePercent: row.draftMaxMarkup }
    : { maximumWholesaleMarkupOverridePercent: row.draftMaxMarkup };
}

export function canSubmitMarkupRow(row: MarkupRowEditorState) {
  return row.draftMinMarkup != null && row.draftRecommendedMarkup != null && row.draftMaxMarkup != null;
}
