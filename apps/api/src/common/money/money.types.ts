import { Prisma } from '@prisma/client';

export type MoneyInput = number | string | Prisma.Decimal | null | undefined;

/** Paid KGS currency / UI display only. Never rebuild authoritative totals from this scale. */
export const MONEY_SCALE_KGS = 2;
/** CNY settlement and FX internals. */
export const MONEY_SCALE_INTERNAL = 8;
/**
 * High-precision exactUnitCost / remaining layer money.
 * Preserves values such as 2458.548675180060 through DECIMAL(30,15) storage.
 */
export const MONEY_SCALE_EXACT_UNIT = 15;
export const MONEY_ROUNDING = Prisma.Decimal.ROUND_HALF_UP;
