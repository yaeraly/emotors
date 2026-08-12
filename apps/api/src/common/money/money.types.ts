import { Prisma } from '@prisma/client';

export type MoneyInput = number | string | Prisma.Decimal | null | undefined;

export const MONEY_SCALE_KGS = 2;
export const MONEY_SCALE_INTERNAL = 8;
export const MONEY_ROUNDING = Prisma.Decimal.ROUND_HALF_UP;
