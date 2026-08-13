import { roundDisplayMoney } from '../pricing/product-cost-precision.util';

export type BranchOrderInstallmentScheduleItem = {
  installmentNumber: number;
  dueDate: string;
  amount: number;
};

export function roundBranchOrderMoney(value: number) {
  return roundDisplayMoney(value);
}

export function computeBranchOrderRemainingDebt(totalAmount: number, firstPaymentAmount: number) {
  return roundBranchOrderMoney(Math.max(totalAmount - firstPaymentAmount, 0));
}

export function validateBranchOrderInstallmentAmounts(totalAmount: number, firstPaymentAmount: number) {
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    return 'ORDER_TOTAL_REQUIRED';
  }
  if (!Number.isFinite(firstPaymentAmount)) {
    return 'INVALID_INITIAL_PAYMENT';
  }
  if (firstPaymentAmount < 0) {
    return 'NEGATIVE_INITIAL_PAYMENT';
  }
  if (firstPaymentAmount > totalAmount + 0.009) {
    return 'INITIAL_PAYMENT_EXCEEDS_TOTAL';
  }
  return null;
}

export function isZeroInitialPayment(firstPaymentAmount: number) {
  return roundBranchOrderMoney(firstPaymentAmount) <= 0;
}

export function buildBranchOrderInstallmentSchedule(
  remainingDebt: number,
  termMonths: number,
  startDate?: Date | null,
): BranchOrderInstallmentScheduleItem[] {
  const months = Math.max(1, Math.floor(termMonths));
  const debt = roundBranchOrderMoney(remainingDebt);
  if (debt <= 0) return [];

  const perPayment = roundBranchOrderMoney(debt / months);
  const schedule: BranchOrderInstallmentScheduleItem[] = [];
  let assigned = 0;
  const anchor = startDate ? new Date(startDate) : new Date();

  for (let index = 0; index < months; index += 1) {
    const due = new Date(anchor);
    due.setMonth(due.getMonth() + index + 1);
    const isLast = index === months - 1;
    const amount = isLast ? roundBranchOrderMoney(debt - assigned) : perPayment;
    assigned = roundBranchOrderMoney(assigned + amount);
    schedule.push({
      installmentNumber: index + 1,
      dueDate: due.toISOString(),
      amount,
    });
  }

  return schedule;
}

export function sumBranchOrderInstallmentSchedule(schedule: BranchOrderInstallmentScheduleItem[]) {
  return roundBranchOrderMoney(schedule.reduce((sum, row) => sum + row.amount, 0));
}
