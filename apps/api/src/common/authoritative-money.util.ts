import { Prisma } from '@prisma/client';
import { roundDisplayMoney, sumDisplayMoneyTotals } from '../pricing/product-cost-precision.util';
import { serializeExactUnitCost, serializeMoney, toMoneyDecimal } from './money/money';

/** Coerce Prisma Decimal / string / number to authoritative 2dp KGS number for JSON display APIs. */
export function toApiMoneyKgs(value: unknown): number {
  if (value == null) return 0;
  return roundDisplayMoney(toMoneyDecimal(value));
}

export function sumApiMoneyKgs(values: unknown[]): number {
  return sumDisplayMoneyTotals(values.map((value) => toApiMoneyKgs(value)));
}

/** High-precision money as a decimal string for accounting JSON contracts. */
export function toApiExactMoneyString(value: unknown): string {
  return serializeMoney(value);
}

export function toApiExactUnitCostString(value: unknown): string {
  return serializeExactUnitCost(toMoneyDecimal(value));
}
