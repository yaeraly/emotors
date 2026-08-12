import { Prisma } from '@prisma/client';
import {
  MONEY_ROUNDING,
  MONEY_SCALE_INTERNAL,
  MONEY_SCALE_KGS,
  type MoneyInput,
} from './money.types';

export { MONEY_ROUNDING, MONEY_SCALE_INTERNAL, MONEY_SCALE_KGS };
export type { MoneyInput };

const ZERO = new Prisma.Decimal(0);

export function toMoneyDecimal(value: MoneyInput | unknown): Prisma.Decimal {
  if (value == null) return ZERO;
  if (value instanceof Prisma.Decimal) {
    return value.isFinite() ? value : ZERO;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return ZERO;
    return new Prisma.Decimal(value);
  }
  const trimmed = String(value).trim();
  if (!trimmed) return ZERO;
  try {
    const decimal = new Prisma.Decimal(trimmed);
    return decimal.isFinite() ? decimal : ZERO;
  } catch {
    return ZERO;
  }
}

export function addMoney(a: MoneyInput, b: MoneyInput): Prisma.Decimal {
  return toMoneyDecimal(a).plus(toMoneyDecimal(b));
}

export function subtractMoney(a: MoneyInput, b: MoneyInput): Prisma.Decimal {
  return toMoneyDecimal(a).minus(toMoneyDecimal(b));
}

export function multiplyMoney(amount: MoneyInput, multiplier: MoneyInput): Prisma.Decimal {
  return toMoneyDecimal(amount).times(toMoneyDecimal(multiplier));
}

export function divideMoney(amount: MoneyInput, divisor: MoneyInput): Prisma.Decimal {
  const den = toMoneyDecimal(divisor);
  if (den.isZero()) return ZERO;
  return toMoneyDecimal(amount).div(den);
}

export function sumMoney(values: MoneyInput[]): Prisma.Decimal {
  let sum = ZERO;
  for (const value of values) {
    sum = sum.plus(toMoneyDecimal(value));
  }
  return sum;
}

export function compareMoney(a: MoneyInput, b: MoneyInput): number {
  return toMoneyDecimal(a).comparedTo(toMoneyDecimal(b));
}

export function isMoneyZero(value: MoneyInput): boolean {
  return toMoneyDecimal(value).isZero();
}

export function isMoneyEqual(a: MoneyInput, b: MoneyInput): boolean {
  return toMoneyDecimal(a).eq(toMoneyDecimal(b));
}

/** Final KGS storage/display boundary only (2 dp, half-up). */
export function roundMoneyKgs(value: MoneyInput): Prisma.Decimal {
  return toMoneyDecimal(value).toDecimalPlaces(MONEY_SCALE_KGS, MONEY_ROUNDING);
}

export function toStoredMoneyKgs(value: MoneyInput): number {
  return roundMoneyKgs(value).toNumber();
}

export function toInternalMoney(value: MoneyInput): Prisma.Decimal {
  return toMoneyDecimal(value).toDecimalPlaces(MONEY_SCALE_INTERNAL, MONEY_ROUNDING);
}

export function assertMoneyEqual(expected: MoneyInput, actual: MoneyInput, context: string): void {
  const left = roundMoneyKgs(expected);
  const right = roundMoneyKgs(actual);
  if (!left.eq(right)) {
    throw new Error(`${context}: expected ${left.toFixed(MONEY_SCALE_KGS)} got ${right.toFixed(MONEY_SCALE_KGS)}`);
  }
}

export function assertNonNegativeMoney(value: MoneyInput, context: string): void {
  if (toMoneyDecimal(value).isNegative()) {
    throw new Error(`${context}: money must be >= 0`);
  }
}

export function assertAllocationReconciles(
  sourceTotal: MoneyInput,
  allocated: MoneyInput[],
  context: string,
): void {
  assertMoneyEqual(sourceTotal, sumMoney(allocated), context);
}

/**
 * Distribute a 2dp target across shares; remainder lands on the last qualifying line.
 * SUM(result) === round(target) exactly.
 */
export function distributeMoneyToTarget(rawAmounts: MoneyInput[], targetTotal: MoneyInput): Prisma.Decimal[] {
  if (rawAmounts.length === 0) return [];
  const target = roundMoneyKgs(targetTotal);
  const rounded = rawAmounts.map((amount) => roundMoneyKgs(amount));
  const remainder = target.minus(sumMoney(rounded));
  if (remainder.isZero()) return rounded;

  const result = [...rounded];
  for (let index = result.length - 1; index >= 0; index -= 1) {
    if (!result[index]!.isZero() || !toMoneyDecimal(rawAmounts[index]).isZero()) {
      result[index] = roundMoneyKgs(result[index]!.plus(remainder));
      break;
    }
  }
  return result;
}

/**
 * FIFO remaining-cost consume.
 * When take covers the last remaining units, consumedCost = exact remainingLayerCost.
 * Never reconstructs from rounded unit × qty.
 */
export function consumeFifoLayerMoney(input: {
  originalLayerCost: MoneyInput;
  layerBaseQuantity: number;
  remainingQuantity: number;
  takeQuantity: number;
  remainingLayerCost?: MoneyInput;
}): {
  consumedCost: Prisma.Decimal;
  remainingCost: Prisma.Decimal;
  remainingQuantity: number;
} {
  const take = Math.max(0, Math.floor(Number(input.takeQuantity) || 0));
  const remainingQty = Math.max(0, Math.floor(Number(input.remainingQuantity) || 0));
  const baseQty = Math.max(0, Math.floor(Number(input.layerBaseQuantity) || 0));
  const original = roundMoneyKgs(input.originalLayerCost);

  if (take <= 0 || remainingQty <= 0 || baseQty <= 0 || original.lte(0)) {
    return {
      consumedCost: ZERO,
      remainingCost: remainingQty <= 0 ? ZERO : original,
      remainingQuantity: remainingQty,
    };
  }

  const remainingCost = roundMoneyKgs(
    input.remainingLayerCost != null
      ? input.remainingLayerCost
      : remainingFifoLayerMoney({
          originalLayerCost: original,
          layerBaseQuantity: baseQty,
          remainingQuantity: remainingQty,
        }),
  );

  if (take >= remainingQty) {
    return {
      consumedCost: remainingCost,
      remainingCost: ZERO,
      remainingQuantity: 0,
    };
  }

  const consumedCost = roundMoneyKgs(remainingCost.mul(take).div(remainingQty));
  return {
    consumedCost,
    remainingCost: roundMoneyKgs(remainingCost.minus(consumedCost)),
    remainingQuantity: remainingQty - take,
  };
}

/** Remaining layer money: original − rounded cost of already consumed qty. */
export function remainingFifoLayerMoney(input: {
  originalLayerCost: MoneyInput;
  layerBaseQuantity: number;
  remainingQuantity: number;
}): Prisma.Decimal {
  const remainingQty = Math.max(0, Math.floor(Number(input.remainingQuantity) || 0));
  const baseQty = Math.max(0, Math.floor(Number(input.layerBaseQuantity) || 0));
  const original = roundMoneyKgs(input.originalLayerCost);
  if (remainingQty <= 0 || baseQty <= 0 || original.lte(0)) return ZERO;
  if (remainingQty >= baseQty) return original;
  const consumedQty = baseQty - remainingQty;
  const consumedCost = roundMoneyKgs(original.mul(consumedQty).div(baseQty));
  return roundMoneyKgs(original.minus(consumedCost));
}

/** Sequential consume of a layer; SUM(consumed) + final remaining === original. */
export function consumeFifoLayerSequence(
  originalLayerCost: MoneyInput,
  layerBaseQuantity: number,
  takes: number[],
): {
  consumed: Prisma.Decimal[];
  remainingCost: Prisma.Decimal;
  remainingQuantity: number;
} {
  const original = roundMoneyKgs(originalLayerCost);
  const consumed: Prisma.Decimal[] = [];
  let remainingCost = original;
  let remainingQuantity = Math.max(0, Math.floor(layerBaseQuantity));
  for (const take of takes) {
    const step = consumeFifoLayerMoney({
      originalLayerCost: original,
      layerBaseQuantity,
      remainingQuantity,
      takeQuantity: take,
      remainingLayerCost: remainingCost,
    });
    consumed.push(step.consumedCost);
    remainingCost = step.remainingCost;
    remainingQuantity = step.remainingQuantity;
  }
  return { consumed, remainingCost, remainingQuantity };
}

export function multiplyCnyByRate(cny: MoneyInput, rate: MoneyInput): Prisma.Decimal {
  return roundMoneyKgs(multiplyMoney(cny, rate));
}
