export const TRANSPORT_EXECUTION_RETURNED_TO_ACCOUNTANT = 'RETURNED_TO_ACCOUNTANT';

const DOMESTIC_TRANSPORT_REQUEST_TYPES = new Set([
  'CHINA_DOMESTIC_TRANSPORT',
  'KYRGYZSTAN_DOMESTIC_TRANSPORT',
]);

export function isDomesticTransportRequestType(requestType: string): boolean {
  return DOMESTIC_TRANSPORT_REQUEST_TYPES.has(requestType);
}

export function isTransportCashierReturnedToAccountant(input: {
  uiStatus: string;
  executionStatus?: string | null;
}): boolean {
  return (
    input.uiStatus === 'RETURNED' &&
    input.executionStatus === TRANSPORT_EXECUTION_RETURNED_TO_ACCOUNTANT
  );
}

export function isTransportAccountantReviewAfterCashierReturn(input: {
  uiStatus: string;
  executionStatus?: string | null;
}): boolean {
  return (
    input.uiStatus === 'UNDER_REVIEW' &&
    input.executionStatus === TRANSPORT_EXECUTION_RETURNED_TO_ACCOUNTANT
  );
}

export function canTakeTransportForAccountantReview(input: {
  requestType: string;
  uiStatus: string;
  executionStatus?: string | null;
  accountantId?: string | null;
  actorUserId?: string | null;
}): boolean {
  if (
    isDomesticTransportRequestType(input.requestType) &&
    isTransportCashierReturnedToAccountant(input)
  ) {
    return true;
  }
  if (input.uiStatus === 'AWAITING_ACCOUNTANT') {
    return true;
  }
  if (input.uiStatus === 'UNDER_REVIEW') {
    return !input.accountantId || input.accountantId === input.actorUserId;
  }
  return false;
}

export function canAccountantDecideOnTransportReview(input: {
  uiStatus: string;
  accountantId?: string | null;
  actorUserId?: string | null;
}): boolean {
  if (input.uiStatus !== 'UNDER_REVIEW') {
    return false;
  }
  return Boolean(input.accountantId && input.actorUserId && input.accountantId === input.actorUserId);
}

export function canApproveDomesticTransportBill(input: {
  requestType: string;
  uiStatus: string;
  executionStatus?: string | null;
  accountantId?: string | null;
  actorUserId?: string | null;
}): boolean {
  if (!isDomesticTransportRequestType(input.requestType)) {
    return ['AWAITING_ACCOUNTANT', 'UNDER_REVIEW', 'PAYMENT_POSTPONED'].includes(input.uiStatus);
  }
  if (
    isTransportCashierReturnedToAccountant(input) ||
    isTransportAccountantReviewAfterCashierReturn(input)
  ) {
    return canAccountantDecideOnTransportReview(input);
  }
  return ['AWAITING_ACCOUNTANT', 'UNDER_REVIEW', 'PAYMENT_POSTPONED'].includes(input.uiStatus);
}

export function canReturnOrRejectDomesticTransportBill(input: {
  requestType: string;
  uiStatus: string;
  executionStatus?: string | null;
  accountantId?: string | null;
  actorUserId?: string | null;
}): boolean {
  if (!isDomesticTransportRequestType(input.requestType)) {
    return false;
  }
  if (isTransportCashierReturnedToAccountant(input)) {
    return false;
  }
  if (input.uiStatus === 'AWAITING_ACCOUNTANT') {
    return true;
  }
  return canAccountantDecideOnTransportReview(input);
}
