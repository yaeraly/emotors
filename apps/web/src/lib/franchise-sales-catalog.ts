export type FranchiseSalesCatalogRow = {
  id: string;
  name: string;
  sku: string;
  categoryName: string;
  costPriceKgs: number | null;
  costAvailable?: boolean;
  markupConfigured?: boolean;
  configurationStatus?: 'CONFIGURED' | 'NOT_CONFIGURED';
  hqMarkupPercent: number;
  baseFranchiseMarkupPercent?: number;
  recommendedMarkupPercent?: number | null;
  branchPriceKgs: number | null;
  finalBranchPriceKgs?: number | null;
  masterBranchPriceKgs?: number | null;
  priceConfigured?: boolean;
  pricingPolicyVersionId?: string | null;
  lastUpdated: string;
};

export type FranchiseSalesCatalogListResponse = {
  items: FranchiseSalesCatalogRow[];
  total: number;
  activePricingPolicyVersionId: string | null;
  activePricingPolicyVersionNumber: number | null;
  warning: string | null;
};

/** Normalize legacy array responses and the structured catalog payload. */
export function normalizeFranchiseSalesCatalogResponse(
  payload: FranchiseSalesCatalogListResponse | FranchiseSalesCatalogRow[] | null | undefined,
): FranchiseSalesCatalogListResponse {
  if (Array.isArray(payload)) {
    return {
      items: payload,
      total: payload.length,
      activePricingPolicyVersionId: null,
      activePricingPolicyVersionNumber: null,
      warning: null,
    };
  }

  if (payload && Array.isArray(payload.items)) {
    return {
      items: payload.items,
      total: typeof payload.total === 'number' ? payload.total : payload.items.length,
      activePricingPolicyVersionId: payload.activePricingPolicyVersionId ?? null,
      activePricingPolicyVersionNumber: payload.activePricingPolicyVersionNumber ?? null,
      warning: payload.warning ?? null,
    };
  }

  return {
    items: [],
    total: 0,
    activePricingPolicyVersionId: null,
    activePricingPolicyVersionNumber: null,
    warning: null,
  };
}

export function isFranchiseSalesCostAvailable(
  row: Pick<FranchiseSalesCatalogRow, 'costAvailable' | 'costPriceKgs'>,
) {
  if (row.costAvailable === false) return false;
  if (row.costPriceKgs == null) return false;
  return Number(row.costPriceKgs) > 0;
}

export function hasFranchiseSalesActiveMarkup(markupPercent: number | null | undefined) {
  return Number.isFinite(Number(markupPercent)) && Number(markupPercent) > 0;
}

export function resolveFranchiseSalesDisplayedBranchPriceKgs(
  row: Pick<
    FranchiseSalesCatalogRow,
    | 'branchPriceKgs'
    | 'finalBranchPriceKgs'
    | 'masterBranchPriceKgs'
    | 'markupConfigured'
    | 'priceConfigured'
    | 'configurationStatus'
    | 'hqMarkupPercent'
    | 'baseFranchiseMarkupPercent'
  >,
) {
  const markupConfigured =
    row.markupConfigured === true ||
    row.priceConfigured === true ||
    row.configurationStatus === 'CONFIGURED' ||
    hasFranchiseSalesActiveMarkup(row.baseFranchiseMarkupPercent) ||
    hasFranchiseSalesActiveMarkup(row.hqMarkupPercent);

  if (!markupConfigured) return null;

  const raw = row.finalBranchPriceKgs ?? row.branchPriceKgs ?? row.masterBranchPriceKgs;
  if (raw === null || raw === undefined) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
