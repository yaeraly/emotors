function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function computeRemainingDebt(totalAmount: number, downPayment: number) {
  return Math.max(roundMoney(totalAmount - downPayment), 0);
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

assertEqual(computeRemainingDebt(100_000, 20_000), 80_000, 'standard remaining debt');
assertEqual(computeRemainingDebt(100_000, 0), 100_000, 'zero down payment');
assertEqual(computeRemainingDebt(100_000, 100_000), 0, 'full down payment');
assertEqual(computeRemainingDebt(100_000, 150_000), 0, 'down payment cannot make debt negative');
assertEqual(computeRemainingDebt(99.99, 33.33), 66.66, 'rounding');

function validatePaymentAmount(remainingDebt: number, paymentAmount: number) {
  if (paymentAmount <= 0) {
    return 'Payment amount must be greater than zero';
  }
  if (paymentAmount > remainingDebt + 0.009) {
    return `Maximum payment amount is ${remainingDebt.toFixed(2)}.`;
  }
  return null;
}

assertEqual(validatePaymentAmount(12_000, 15_000), 'Maximum payment amount is 12000.00.', 'overpayment rejected');
assertEqual(validatePaymentAmount(60_000, 60_000), null, 'full early repayment allowed');
assertEqual(validatePaymentAmount(80_000, 5_000), null, 'partial payment allowed');

console.log('sale-installment.util.test.ts passed');
