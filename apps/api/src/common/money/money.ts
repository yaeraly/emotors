import { Prisma } from '@prisma/client';
import {
  MONEY_ROUNDING,
  MONEY_SCALE_EXACT_UNIT,
  MONEY_SCALE_INTERNAL,
  MONEY_SCALE_KGS,
  type MoneyInput,
} from './money.types';

export {
  MONEY_ROUNDING,
  MONEY_SCALE_EXACT_UNIT,
  MONEY_SCALE_INTERNAL,
  MONEY_SCALE_KGS,
};
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

/** Spec alias: coerce any money input to Prisma.Decimal without JS float math. */
export const toDecimal = toMoneyDecimal;

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

/** Spec alias: exact Decimal equality. No epsilon. */
export const moneyEquals = isMoneyEqual;

/** High-precision money stored on exactUnitCost / layer cost fields (scale 15). */
export function toExactMoney(value: MoneyInput | unknown): Prisma.Decimal {
  return toMoneyDecimal(value).toDecimalPlaces(MONEY_SCALE_EXACT_UNIT, MONEY_ROUNDING);
}

/**
 * exactUnitCost = authoritativeLineTotal / quantity.
 * Never rounds to 2 decimals. Never used to rebuild the line total.
 */
export function toExactUnitCost(authoritativeLineTotal: MoneyInput, quantity: MoneyInput): Prisma.Decimal {
  const qty = toMoneyDecimal(quantity);
  const total = toMoneyDecimal(authoritativeLineTotal);
  if (qty.lte(0) || total.lte(0)) return ZERO;
  return toExactMoney(total.div(qty));
}

/** JSON / API wire format: decimal string, never a JSON number. */
export function serializeMoney(value: MoneyInput | unknown): string {
  return toMoneyDecimal(value).toFixed();
}

export function serializeExactUnitCost(value: MoneyInput): string {
  return toExactMoney(value).toFixed(MONEY_SCALE_EXACT_UNIT);
}

/** Final KGS display / paid-currency boundary only (2 dp, half-up). */
export function roundMoneyKgs(value: MoneyInput): Prisma.Decimal {
  return toMoneyDecimal(value).toDecimalPlaces(MONEY_SCALE_KGS, MONEY_ROUNDING);
}

export function toStoredMoneyKgs(value: MoneyInput): number {
  return roundMoneyKgs(value).toNumber();
}

export function toInternalMoney(value: MoneyInput): Prisma.Decimal {
  return toMoneyDecimal(value).toDecimalPlaces(MONEY_SCALE_INTERNAL, MONEY_ROUNDING);
}

/**
 * Fail-closed: exact Decimal equality.
 * Do not ignore 0.01 / 0.001 differences. Display rounding is not accounting truth.
 */
export function assertMoneyEqual(expected: MoneyInput, actual: MoneyInput, context: string): void {
  const left = toMoneyDecimal(expected);
  const right = toMoneyDecimal(actual);
  if (!left.eq(right)) {
    throw new Error(`${context}: expected ${left.toFixed()} got ${right.toFixed()}`);
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

function toWholeQuantity(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

/**
 * Distribute a target across shares with last-line remainder.
 * SUM(result) === target exactly. No 2dp rounding — inventory/allocation path.
 */
export function distributeExactMoney(rawAmounts: MoneyInput[], targetTotal: MoneyInput): Prisma.Decimal[] {
  if (rawAmounts.length === 0) return [];
  const target = toMoneyDecimal(targetTotal);
  if (rawAmounts.length === 1) return [target];
  const head = rawAmounts.slice(0, -1).map((amount) => toExactMoney(amount));
  const last = toExactMoney(target.minus(sumMoney(head)));
  return [...head, last];
}

/**
 * Distribute a 2dp paid-currency target across shares; remainder lands on the last qualifying line.
 * SUM(result) === round(target) exactly. Display/payment boundary only.
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
 * Never reconstructs from rounded unit × qty. Never rounds to 2dp internally.
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
  const take = toWholeQuantity(input.takeQuantity);
  const remainingQty = toWholeQuantity(input.remainingQuantity);
  const baseQty = toWholeQuantity(input.layerBaseQuantity);
  const original = toMoneyDecimal(input.originalLayerCost);

  if (take <= 0 || remainingQty <= 0 || baseQty <= 0 || original.lte(0)) {
    return {
      consumedCost: ZERO,
      remainingCost: remainingQty <= 0 ? ZERO : toExactMoney(original),
      remainingQuantity: remainingQty,
    };
  }

  const remainingCost = toExactMoney(
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

  const consumedCost = toExactMoney(remainingCost.mul(take).div(remainingQty));
  return {
    consumedCost,
    remainingCost: toExactMoney(remainingCost.minus(consumedCost)),
    remainingQuantity: remainingQty - take,
  };
}

/** Remaining layer money: original − cost of already consumed qty. High precision. */
export function remainingFifoLayerMoney(input: {
  originalLayerCost: MoneyInput;
  layerBaseQuantity: number;
  remainingQuantity: number;
}): Prisma.Decimal {
  const remainingQty = toWholeQuantity(input.remainingQuantity);
  const baseQty = toWholeQuantity(input.layerBaseQuantity);
  const original = toMoneyDecimal(input.originalLayerCost);
  if (remainingQty <= 0 || baseQty <= 0 || original.lte(0)) return ZERO;
  if (remainingQty >= baseQty) return toExactMoney(original);
  const consumedQty = baseQty - remainingQty;
  const consumedCost = toExactMoney(original.mul(consumedQty).div(baseQty));
  return toExactMoney(original.minus(consumedCost));
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
  const original = toMoneyDecimal(originalLayerCost);
  const consumed: Prisma.Decimal[] = [];
  let remainingCost = toExactMoney(original);
  let remainingQuantity = toWholeQuantity(layerBaseQuantity);
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

/** Paid KGS from CNY × rate. Round only at the KGS payment boundary. */
export function multiplyCnyByRate(cny: MoneyInput, rate: MoneyInput): Prisma.Decimal {
  return roundMoneyKgs(multiplyMoney(cny, rate));
}

/** 2dp remainder-safe FIFO consume for display/legacy number APIs only. */
export function consumeFifoLayerMoneyKgs(input: {
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
  const take = toWholeQuantity(input.takeQuantity);
  const remainingQty = toWholeQuantity(input.remainingQuantity);
  const baseQty = toWholeQuantity(input.layerBaseQuantity);
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
      : remainingFifoLayerMoneyKgs({
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

export function remainingFifoLayerMoneyKgs(input: {
  originalLayerCost: MoneyInput;
  layerBaseQuantity: number;
  remainingQuantity: number;
}): Prisma.Decimal {
  const remainingQty = toWholeQuantity(input.remainingQuantity);
  const baseQty = toWholeQuantity(input.layerBaseQuantity);
  const original = roundMoneyKgs(input.originalLayerCost);
  if (remainingQty <= 0 || baseQty <= 0 || original.lte(0)) return ZERO;
  if (remainingQty >= baseQty) return original;
  const consumedQty = baseQty - remainingQty;
  const consumedCost = roundMoneyKgs(original.mul(consumedQty).div(baseQty));
  return roundMoneyKgs(original.minus(consumedCost));
}
