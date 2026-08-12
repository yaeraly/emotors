import { roundDisplayMoney } from '../pricing/product-cost-precision.util';

export type BranchHqReturnDebtAdjustmentInput = {
  acceptedReturnValueKgs: number;
  currentDebtKgs: number;
};

export type BranchHqReturnDebtAdjustmentResult = {
  suggestedCreditKgs: number;
  appliedCreditKgs: number;
  resultingDebtKgs: number;
  remainingCreditKgs: number;
  salesRevenueKgs: number;
  profitKgs: number;
};

/**
 * Compute debt credit for an accepted Branch→HQ return.
 * Never creates sales revenue/profit. Never drives debt below zero.
 */
export function computeBranchHqReturnDebtAdjustment(
  input: BranchHqReturnDebtAdjustmentInput,
): BranchHqReturnDebtAdjustmentResult {
  const accepted = Math.max(0, roundDisplayMoney(Number(input.acceptedReturnValueKgs) || 0));
  const currentDebt = Math.max(0, roundDisplayMoney(Number(input.currentDebtKgs) || 0));
  const appliedCreditKgs = roundDisplayMoney(Math.min(accepted, currentDebt));
  const resultingDebtKgs = roundDisplayMoney(currentDebt - appliedCreditKgs);
  const remainingCreditKgs = roundDisplayMoney(accepted - appliedCreditKgs);

  return {
    suggestedCreditKgs: accepted,
    appliedCreditKgs,
    resultingDebtKgs,
    remainingCreditKgs,
    salesRevenueKgs: 0,
    profitKgs: 0,
  };
}
