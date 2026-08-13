import { Prisma } from '@prisma/client';
import {
  assertMoneyEqual,
  consumeFifoLayerMoney,
  remainingFifoLayerMoney,
  toExactMoney,
  toExactUnitCost,
  toMoneyDecimal,
  type MoneyInput,
} from './money';

export type FifoLayerMoneyFields = {
  unitCostKgs: Prisma.Decimal;
  originalLayerCostKgs: Prisma.Decimal;
  remainingLayerCostKgs: Prisma.Decimal;
};

/**
 * Authoritative FIFO layer money from a received movement / procurement line.
 * originalLayerCost is the financial source of truth; exactUnitCost is derived.
 */
export function buildFifoLayerMoneyFromLine(input: {
  quantity: number;
  authoritativeLineTotal: MoneyInput;
  remainingQuantity?: number;
}): FifoLayerMoneyFields {
  const qty = Math.max(0, Math.trunc(Number(input.quantity) || 0));
  const remainingQty =
    input.remainingQuantity == null ? qty : Math.max(0, Math.trunc(Number(input.remainingQuantity) || 0));
  const originalLayerCostKgs = toExactMoney(input.authoritativeLineTotal);
  const remainingLayerCostKgs = remainingFifoLayerMoney({
    originalLayerCost: originalLayerCostKgs,
    layerBaseQuantity: qty,
    remainingQuantity: remainingQty,
  });
  return {
    unitCostKgs: toExactUnitCost(originalLayerCostKgs, qty),
    originalLayerCostKgs,
    remainingLayerCostKgs,
  };
}

export function consumePersistedFifoLayer(input: {
  originalLayerCost: MoneyInput | unknown;
  remainingLayerCost: MoneyInput | unknown;
  layerBaseQuantity: number;
  remainingQuantity: number;
  takeQuantity: number;
}) {
  const original = toExactMoney(input.originalLayerCost);
  const remainingBefore = toExactMoney(
    toMoneyDecimal(input.remainingLayerCost).gt(0)
      ? input.remainingLayerCost
      : remainingFifoLayerMoney({
          originalLayerCost: original,
          layerBaseQuantity: input.layerBaseQuantity,
          remainingQuantity: input.remainingQuantity,
        }),
  );
  const take = Math.max(0, Math.trunc(Number(input.takeQuantity) || 0));
  const step = consumeFifoLayerMoney({
    originalLayerCost: original,
    layerBaseQuantity: input.layerBaseQuantity,
    remainingQuantity: input.remainingQuantity,
    takeQuantity: take,
    remainingLayerCost: remainingBefore,
  });
  assertMoneyEqual(
    toExactMoney(remainingBefore),
    toExactMoney(step.consumedCost.plus(step.remainingCost)),
    'FIFO remaining = consumed + leftover',
  );
  return {
    ...step,
    originalLayerCost: original,
    exactUnitCost: toExactUnitCost(step.consumedCost, take),
  };
}
