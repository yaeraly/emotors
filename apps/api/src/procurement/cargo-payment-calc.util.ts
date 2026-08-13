/**
 * Decimal-safe cargo payment calculation helpers.
 * Frontend values are never trusted — backend recalculates and validates.
 */

function toFiniteNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : NaN;
}

/** Round money to 2 decimal places using integer cents. */
export function roundMoney2(value: number): number {
  if (!Number.isFinite(value)) return NaN;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Round weight to 3 decimal places. */
export function roundWeight3(value: number): number {
  if (!Number.isFinite(value)) return NaN;
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

/** Round FX / tariff rates to 4 decimal places. */
export function roundRate4(value: number): number {
  if (!Number.isFinite(value)) return NaN;
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

export type CargoCalcInput = {
  totalWeightKg: number;
  cargoRateUsdPerKg: number;
  usdExchangeRate: number;
};

export type CargoCalcResult = {
  totalWeightKg: number;
  cargoRateUsdPerKg: number;
  usdExchangeRate: number;
  calculatedAmountUsd: number;
  calculatedAmountKgs: number;
};

export function calculateCargoPaymentAmounts(input: CargoCalcInput): CargoCalcResult {
  const totalWeightKg = roundWeight3(toFiniteNumber(input.totalWeightKg));
  const cargoRateUsdPerKg = roundRate4(toFiniteNumber(input.cargoRateUsdPerKg));
  const usdExchangeRate = roundRate4(toFiniteNumber(input.usdExchangeRate));

  if (!(totalWeightKg > 0)) {
    throw new Error('Cargo weight must be greater than zero');
  }
  if (!(cargoRateUsdPerKg > 0)) {
    throw new Error('Cargo rate must be greater than zero');
  }
  if (!(usdExchangeRate > 0)) {
    throw new Error('USD exchange rate must be greater than zero');
  }

  // Use integer milligram / micro-rate style scaling to reduce float drift.
  const weightMillis = Math.round(totalWeightKg * 1000);
  const rateMicros = Math.round(cargoRateUsdPerKg * 10000);
  const usdMicros = weightMillis * rateMicros; // weight*1000 * rate*10000 = usd * 10_000_000
  const calculatedAmountUsd = roundMoney2(usdMicros / 10_000_000);

  const usdCents = Math.round(calculatedAmountUsd * 100);
  const fxMicros = Math.round(usdExchangeRate * 10000);
  const kgsMicros = usdCents * fxMicros; // (usd*100) * (fx*10000) = kgs * 1_000_000
  const calculatedAmountKgs = roundMoney2(kgsMicros / 1_000_000);

  if (!(calculatedAmountUsd > 0) || !(calculatedAmountKgs > 0)) {
    throw new Error('Calculated cargo amounts must be greater than zero');
  }
  if (!Number.isFinite(calculatedAmountUsd) || !Number.isFinite(calculatedAmountKgs)) {
    throw new Error('Calculated cargo amounts are invalid');
  }

  return {
    totalWeightKg,
    cargoRateUsdPerKg,
    usdExchangeRate,
    calculatedAmountUsd,
    calculatedAmountKgs,
  };
}

/**
 * Reject manipulated frontend totals. Tolerates 0.01 money rounding.
 */
export function assertCargoTotalsMatchServer(
  server: CargoCalcResult,
  submitted?: {
    calculatedAmountUsd?: number | null;
    calculatedAmountKgs?: number | null;
    amount?: number | null;
  },
): void {
  if (submitted?.calculatedAmountUsd != null) {
    const clientUsd = roundMoney2(toFiniteNumber(submitted.calculatedAmountUsd));
    if (Math.abs(clientUsd - server.calculatedAmountUsd) > 0.009) {
      throw new Error('Calculated USD amount does not match server calculation');
    }
  }
  if (submitted?.calculatedAmountKgs != null) {
    const clientKgs = roundMoney2(toFiniteNumber(submitted.calculatedAmountKgs));
    if (Math.abs(clientKgs - server.calculatedAmountKgs) > 0.009) {
      throw new Error('Calculated KGS amount does not match server calculation');
    }
  }
  if (submitted?.amount != null) {
    const clientAmount = roundMoney2(toFiniteNumber(submitted.amount));
    if (Math.abs(clientAmount - server.calculatedAmountKgs) > 0.009) {
      throw new Error('Request amount must equal calculated cargo amount in KGS');
    }
  }
}
