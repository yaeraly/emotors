import { Prisma } from '@prisma/client';

/** Internal CNY settlement scale — never truncate settlement CNY to display 2dp. */
export const SUPPLIER_CNY_SETTLEMENT_SCALE = 8;

export function toMoneyDecimal(value: number | Prisma.Decimal | string): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

/** Final currency round (2 dp, half-up) — only at allocation/storage boundaries. */
export function roundMoneyDecimal(value: number | Prisma.Decimal): number {
  return toMoneyDecimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toNumber();
}

/** Preserve high-precision CNY for settlement math (display may still show 2dp). */
export function roundCnySettlementDecimal(value: number | Prisma.Decimal | string): number {
  return toMoneyDecimal(value)
    .toDecimalPlaces(SUPPLIER_CNY_SETTLEMENT_SCALE, Prisma.Decimal.ROUND_HALF_UP)
    .toNumber();
}

export function toCnySettlementDecimal(value: number | Prisma.Decimal | string): Prisma.Decimal {
  return toMoneyDecimal(value).toDecimalPlaces(
    SUPPLIER_CNY_SETTLEMENT_SCALE,
    Prisma.Decimal.ROUND_HALF_UP,
  );
}

export function sumMoneyDecimals(values: Array<number | Prisma.Decimal>): Prisma.Decimal {
  let sum = new Prisma.Decimal(0);
  for (const value of values) {
    sum = sum.plus(toMoneyDecimal(value));
  }
  return sum;
}

export function sumRoundedMoney(values: number[]): number {
  return roundMoneyDecimal(sumMoneyDecimals(values));
}

/**
 * Distribute a target monetary total across shares with remainder on the last qualifying line.
 */
export function distributeRoundedMoneyAmounts(rawAmounts: number[], targetTotal: number): number[] {
  if (rawAmounts.length === 0) return [];
  const target = toMoneyDecimal(targetTotal).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const rounded = rawAmounts.map((amount) =>
    toMoneyDecimal(amount).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
  );
  let sum = sumMoneyDecimals(rounded).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const remainder = target.minus(sum).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  if (remainder.isZero()) {
    return rounded.map((value) => roundMoneyDecimal(value));
  }

  const result = [...rounded];
  for (let index = result.length - 1; index >= 0; index -= 1) {
    if (rawAmounts[index] > 0 || result[index].greaterThan(0)) {
      result[index] = result[index].plus(remainder).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      break;
    }
  }

  return result.map((value) => roundMoneyDecimal(value));
}
