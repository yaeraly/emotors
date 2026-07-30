import { Prisma } from '@prisma/client';
import { roundDisplayMoney, sumDisplayMoneyTotals } from '../pricing/product-cost-precision.util';

/** Coerce Prisma Decimal / string / number to authoritative 2dp KGS number for JSON APIs. */
export function toApiMoneyKgs(value: unknown): number {
  if (value == null) return 0;
  if (value instanceof Prisma.Decimal) {
    return roundDisplayMoney(value);
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return roundDisplayMoney(numeric);
}

export function sumApiMoneyKgs(values: unknown[]): number {
  return sumDisplayMoneyTotals(values.map((value) => toApiMoneyKgs(value)));
}
