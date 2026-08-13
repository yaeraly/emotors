export function roundBranchOrderMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function computeBranchOrderRemainingDebt(totalAmount: number, firstPaymentAmount: number) {
  return roundBranchOrderMoney(Math.max(totalAmount - firstPaymentAmount, 0));
}

export function buildBranchOrderInstallmentSchedulePreview(
  remainingDebt: number,
  termMonths: number,
) {
  const months = Math.max(1, Math.floor(termMonths));
  const debt = roundBranchOrderMoney(remainingDebt);
  if (debt <= 0) return [];

  const perPayment = roundBranchOrderMoney(debt / months);
  const schedule: Array<{ installmentNumber: number; amount: number }> = [];
  let assigned = 0;

  for (let index = 0; index < months; index += 1) {
    const isLast = index === months - 1;
    const amount = isLast ? roundBranchOrderMoney(debt - assigned) : perPayment;
    assigned = roundBranchOrderMoney(assigned + amount);
    schedule.push({ installmentNumber: index + 1, amount });
  }

  return schedule;
}
