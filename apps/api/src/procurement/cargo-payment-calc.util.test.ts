import {
  assertCargoTotalsMatchServer,
  calculateCargoPaymentAmounts,
  roundMoney2,
} from './cargo-payment-calc.util';

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertThrows(fn: () => void, label: string) {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  if (!threw) throw new Error(`${label}: expected throw`);
}

const example = calculateCargoPaymentAmounts({
  totalWeightKg: 1250,
  cargoRateUsdPerKg: 1.2,
  usdExchangeRate: 87.5,
});

assertEqual(example.calculatedAmountUsd, 1500, '10. weight × tariff = USD');
assertEqual(example.calculatedAmountKgs, 131250, '11. USD × rate = KGS');

assertCargoTotalsMatchServer(example, {
  calculatedAmountUsd: 1500,
  calculatedAmountKgs: 131250,
  amount: 131250,
});

assertThrows(
  () =>
    assertCargoTotalsMatchServer(example, {
      calculatedAmountKgs: 999999,
      amount: 999999,
    }),
  '13. manipulated frontend total is rejected',
);

assertEqual(roundMoney2(131250.004), 131250, 'decimal-safe money rounding');

assertThrows(
  () =>
    calculateCargoPaymentAmounts({
      totalWeightKg: 0,
      cargoRateUsdPerKg: 1.2,
      usdExchangeRate: 87.5,
    }),
  'weight must be > 0',
);

assertThrows(
  () =>
    calculateCargoPaymentAmounts({
      totalWeightKg: 10,
      cargoRateUsdPerKg: -1,
      usdExchangeRate: 87.5,
    }),
  'rate must be > 0',
);

console.log('cargo-payment-calc.util.test.ts passed');
