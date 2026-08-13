import {
  canApproveDomesticTransportBill,
  canReturnOrRejectDomesticTransportBill,
  canTakeTransportForAccountantReview,
  isTransportCashierReturnedToAccountant,
} from './transport-accountant-review';

function assert(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
}

const actorUserId = 'accountant-1';

assert(
  isTransportCashierReturnedToAccountant({
    uiStatus: 'RETURNED',
    executionStatus: 'RETURNED_TO_ACCOUNTANT',
  }),
  'cashier returned ui state',
);

assert(
  canTakeTransportForAccountantReview({
    requestType: 'CHINA_DOMESTIC_TRANSPORT',
    uiStatus: 'RETURNED',
    executionStatus: 'RETURNED_TO_ACCOUNTANT',
    actorUserId,
  }),
  'take review button for china transport',
);

assert(
  !canReturnOrRejectDomesticTransportBill({
    requestType: 'KYRGYZSTAN_DOMESTIC_TRANSPORT',
    uiStatus: 'RETURNED',
    executionStatus: 'RETURNED_TO_ACCOUNTANT',
    actorUserId,
  }),
  'no return/reject before take review',
);

assert(
  canApproveDomesticTransportBill({
    requestType: 'KYRGYZSTAN_DOMESTIC_TRANSPORT',
    uiStatus: 'UNDER_REVIEW',
    executionStatus: 'RETURNED_TO_ACCOUNTANT',
    accountantId: actorUserId,
    actorUserId,
  }),
  'approve after take review',
);

console.log('transport-accountant-review.test.ts: all assertions passed');
