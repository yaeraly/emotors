export const TRANSPORT_CORRECTION_REQUEST_TYPES = new Set([
  'CHINA_DOMESTIC_TRANSPORT',
  'CARGO_PAYMENT',
  'KYRGYZSTAN_DOMESTIC_TRANSPORT',
]);

export function shouldHideSubmissionSummaryOnCorrection(
  requestType: string,
  isAwaitingSupplyManagerCorrection: boolean,
): boolean {
  return (
    isAwaitingSupplyManagerCorrection &&
    TRANSPORT_CORRECTION_REQUEST_TYPES.has(requestType)
  );
}

type SubmissionSummaryExpense = {
  submittedAt?: string | null;
  status: string;
};

export function shouldShowSubmissionSummary(
  primaryExpense: SubmissionSummaryExpense | null,
  requestType: string,
  isAwaitingSupplyManagerCorrection: boolean,
): boolean {
  if (!primaryExpense) return false;
  if (shouldHideSubmissionSummaryOnCorrection(requestType, isAwaitingSupplyManagerCorrection)) {
    return false;
  }
  return Boolean(primaryExpense.submittedAt || primaryExpense.status !== 'DRAFT');
}
