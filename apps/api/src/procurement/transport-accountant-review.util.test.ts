import { TransportExpenseStatus, TransportExpenseType } from '@prisma/client';
import {
  canAccountantDecideOnTransportReview,
  canAccountantRejectDomesticTransportDuringReview,
  canAccountantReturnDomesticTransportDuringReview,
  canApproveTransportInAccountantReview,
  canTakeTransportForAccountantReview,
  isTransportAccountantReviewAfterCashierReturn,
  isTransportCashierReturnedToAccountant,
  resolveTransportCashierReturnReason,
} from './transport-accountant-review.util';

function assert(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
}

const actorUserId = 'accountant-1';
const otherAccountantId = 'accountant-2';

assert(
  isTransportCashierReturnedToAccountant({
    status: TransportExpenseStatus.RETURNED,
    executionStatus: 'RETURNED_TO_ACCOUNTANT',
  }),
  '1. cashier returned state',
);

assert(
  canTakeTransportForAccountantReview({
    expenseType: TransportExpenseType.DOMESTIC_CHINA_TRANSPORT,
    status: TransportExpenseStatus.RETURNED,
    executionStatus: 'RETURNED_TO_ACCOUNTANT',
    actorUserId,
  }),
  '3. take review from cashier return',
);

assert(
  !canAccountantReturnDomesticTransportDuringReview({
    expenseType: TransportExpenseType.DOMESTIC_CHINA_TRANSPORT,
    status: TransportExpenseStatus.RETURNED,
    executionStatus: 'RETURNED_TO_ACCOUNTANT',
    actorUserId,
    paidAmountKgs: 0,
  }),
  '5. cannot return to supply manager before take review',
);

assert(
  canAccountantDecideOnTransportReview({
    status: TransportExpenseStatus.UNDER_REVIEW,
    accountantId: actorUserId,
    actorUserId,
  }),
  '4. assigned accountant can decide',
);

assert(
  isTransportAccountantReviewAfterCashierReturn({
    status: TransportExpenseStatus.UNDER_REVIEW,
    executionStatus: 'RETURNED_TO_ACCOUNTANT',
  }),
  '4b. review after cashier return',
);

assert(
  canApproveTransportInAccountantReview({
    expenseType: TransportExpenseType.LOCAL_DELIVERY,
    status: TransportExpenseStatus.UNDER_REVIEW,
    executionStatus: 'RETURNED_TO_ACCOUNTANT',
    accountantId: actorUserId,
    actorUserId,
  }),
  '8. re-approve after take review',
);

assert(
  !canApproveTransportInAccountantReview({
    expenseType: TransportExpenseType.LOCAL_DELIVERY,
    status: TransportExpenseStatus.RETURNED,
    executionStatus: 'RETURNED_TO_ACCOUNTANT',
    actorUserId,
  }),
  '8b. cannot approve before take review',
);

assert(
  canAccountantReturnDomesticTransportDuringReview({
    expenseType: TransportExpenseType.LOCAL_DELIVERY,
    status: TransportExpenseStatus.UNDER_REVIEW,
    executionStatus: 'RETURNED_TO_ACCOUNTANT',
    accountantId: actorUserId,
    actorUserId,
    paidAmountKgs: 0,
  }),
  '10. return to supply manager after take review',
);

assert(
  !canAccountantRejectDomesticTransportDuringReview({
    expenseType: TransportExpenseType.DOMESTIC_CHINA_TRANSPORT,
    status: TransportExpenseStatus.UNDER_REVIEW,
    executionStatus: 'RETURNED_TO_ACCOUNTANT',
    accountantId: otherAccountantId,
    actorUserId,
    paidAmountKgs: 0,
  }),
  '13. other accountant cannot reject',
);

const cashierReason = resolveTransportCashierReturnReason({
  status: TransportExpenseStatus.RETURNED,
  executionStatus: 'RETURNED_TO_ACCOUNTANT',
  returnReason: 'Неверные реквизиты',
});
assert(cashierReason === 'Неверные реквизиты', '14. cashier return reason preserved');

console.log('transport-accountant-review.util.test.ts: all assertions passed');
