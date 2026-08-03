import { Prisma } from '@prisma/client';
import { roundDisplayMoney } from '../pricing/product-cost-precision.util';

export type SalePriceRangeInput = {
  requestedSalePrice: number | string | null | undefined;
  authoritativeMinimumPrice: number;
  authoritativeMaximumPrice: number | null | undefined;
  allowZeroPrice?: boolean;
};

export type SalePriceRangeRejection =
  | 'EMPTY'
  | 'INVALID_NUMBER'
  | 'NEGATIVE'
  | 'ZERO_NOT_ALLOWED'
  | 'BELOW_MINIMUM'
  | 'ABOVE_MAXIMUM';

export type SalePriceRangeResult =
  | { ok: true; salePrice: number }
  | {
      ok: false;
      reason: SalePriceRangeRejection;
      salePrice: number | null;
      minimumPrice: number;
      maximumPrice: number | null;
      message: string;
    };

function toDecimal(value: number | string | Prisma.Decimal) {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

export function multiplyMoney(unitPrice: number | string | Prisma.Decimal, quantity: number) {
  return roundDisplayMoney(toDecimal(unitPrice).mul(quantity));
}

export function sumMoney(amounts: Array<number | string | Prisma.Decimal>) {
  return roundDisplayMoney(
    amounts.reduce<Prisma.Decimal>((sum, amount) => sum.plus(toDecimal(amount)), new Prisma.Decimal(0)),
  );
}

export function formatSalePriceRangeMessage(
  reason: SalePriceRangeRejection,
  minimumPrice: number,
  maximumPrice: number | null,
): string {
  switch (reason) {
    case 'EMPTY':
      return 'Цена продажи обязательна.';
    case 'INVALID_NUMBER':
      return 'Некорректное числовое значение цены продажи.';
    case 'NEGATIVE':
      return 'Цена продажи не может быть отрицательной.';
    case 'ZERO_NOT_ALLOWED':
      return 'Цена продажи не может быть равна нулю.';
    case 'BELOW_MINIMUM':
      return `Цена продажи не может быть ниже минимальной цены: ${roundDisplayMoney(minimumPrice)}.`;
    case 'ABOVE_MAXIMUM':
      return `Цена продажи не может быть выше максимальной цены: ${roundDisplayMoney(maximumPrice ?? 0)}.`;
    default:
      return 'Цена продажи вне разрешённого диапазона.';
  }
}

export function parseRequestedSalePrice(
  value: number | string | null | undefined,
): { ok: true; value: number } | { ok: false; reason: SalePriceRangeRejection } {
  if (value === null || value === undefined || value === '') {
    return { ok: false, reason: 'EMPTY' };
  }
  if (typeof value === 'string' && value.trim() === '') {
    return { ok: false, reason: 'EMPTY' };
  }
  let decimal: Prisma.Decimal;
  try {
    decimal = toDecimal(typeof value === 'string' ? value.trim().replace(',', '.') : value);
  } catch {
    return { ok: false, reason: 'INVALID_NUMBER' };
  }
  if (!decimal.isFinite()) {
    return { ok: false, reason: 'INVALID_NUMBER' };
  }
  const salePrice = roundDisplayMoney(decimal);
  if (Number.isNaN(salePrice)) {
    return { ok: false, reason: 'INVALID_NUMBER' };
  }
  if (decimal.lt(0)) {
    return { ok: false, reason: 'NEGATIVE' };
  }
  return { ok: true, value: salePrice };
}

/**
 * Authoritative range check:
 * authoritativeMinimumPrice ≤ requestedSalePrice ≤ authoritativeMaximumPrice
 * Maximum is enforced only when configured (> 0).
 */
export function validateSalePriceRange(input: SalePriceRangeInput): SalePriceRangeResult {
  const minimumPrice = roundDisplayMoney(Math.max(0, Number(input.authoritativeMinimumPrice || 0)));
  const maximumPrice =
    input.authoritativeMaximumPrice != null && Number(input.authoritativeMaximumPrice) > 0
      ? roundDisplayMoney(Number(input.authoritativeMaximumPrice))
      : null;

  const parsed = parseRequestedSalePrice(input.requestedSalePrice);
  if (!parsed.ok) {
    return {
      ok: false,
      reason: parsed.reason,
      salePrice: null,
      minimumPrice,
      maximumPrice,
      message: formatSalePriceRangeMessage(parsed.reason, minimumPrice, maximumPrice),
    };
  }

  const salePrice = parsed.value;
  if (salePrice === 0 && !input.allowZeroPrice) {
    return {
      ok: false,
      reason: 'ZERO_NOT_ALLOWED',
      salePrice,
      minimumPrice,
      maximumPrice,
      message: formatSalePriceRangeMessage('ZERO_NOT_ALLOWED', minimumPrice, maximumPrice),
    };
  }

  if (minimumPrice > 0 && salePrice + 0.01 < minimumPrice) {
    return {
      ok: false,
      reason: 'BELOW_MINIMUM',
      salePrice,
      minimumPrice,
      maximumPrice,
      message: formatSalePriceRangeMessage('BELOW_MINIMUM', minimumPrice, maximumPrice),
    };
  }

  if (maximumPrice != null && salePrice > maximumPrice + 0.01) {
    return {
      ok: false,
      reason: 'ABOVE_MAXIMUM',
      salePrice,
      minimumPrice,
      maximumPrice,
      message: formatSalePriceRangeMessage('ABOVE_MAXIMUM', minimumPrice, maximumPrice),
    };
  }

  return { ok: true, salePrice };
}

export function pricesDiffer(left: number, right: number) {
  return Math.abs(roundDisplayMoney(left) - roundDisplayMoney(right)) > 0.01;
}

export const SALE_PRICE_OUT_OF_RANGE_REGISTER_MESSAGE =
  'Невозможно зарегистрировать продажу.\n\nДля некоторых товаров цена находится вне разрешённого диапазона.';

export const PRICING_POLICY_CHANGED_MESSAGE =
  'Ценовая политика изменилась. Проверьте цены перед регистрацией продажи.';
