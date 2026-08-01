import { Prisma } from '@prisma/client';
import { roundDisplayMoney } from '../pricing/product-cost-precision.util';

export const BRANCH_TRANSPORT_MISSING_WEIGHT_MESSAGE =
  'Невозможно распределить транспортные расходы. Для некоторых товаров не указан вес одной единицы.';

export type BranchReceivingTransportLineInput = {
  productId: string;
  sku?: string;
  productName?: string;
  receivedQuantity: number;
  weightKg: number | Prisma.Decimal | string;
  unitCostKgs: number | Prisma.Decimal | string;
};

export type BranchReceivingTransportLineCost = {
  productId: string;
  itemTotalWeightKg: number;
  transportExpenseAllocation: number;
  transportCostPerUnit: number;
  finalUnitCostKgs: number;
};

export type MissingWeightProduct = {
  productId: string;
  sku: string | null;
  productName: string | null;
  weightKg: number;
};

function toDecimal(value: number | Prisma.Decimal | string): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

function roundWeight(value: Prisma.Decimal): number {
  return value.toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP).toNumber();
}

export function collectMissingWeightProducts(
  items: BranchReceivingTransportLineInput[],
): MissingWeightProduct[] {
  const missing: MissingWeightProduct[] = [];
  for (const item of items) {
    if (item.receivedQuantity <= 0) continue;
    const weight = toDecimal(item.weightKg ?? 0);
    if (weight.lte(0)) {
      missing.push({
        productId: item.productId,
        sku: item.sku ?? null,
        productName: item.productName ?? null,
        weightKg: weight.toNumber(),
      });
    }
  }
  return missing;
}

export function assertPositiveUnitWeights(items: BranchReceivingTransportLineInput[]) {
  const missing = collectMissingWeightProducts(items);
  if (missing.length) {
    const error = new Error(BRANCH_TRANSPORT_MISSING_WEIGHT_MESSAGE) as Error & {
      missingWeightProducts: MissingWeightProduct[];
    };
    error.missingWeightProducts = missing;
    throw error;
  }
}

/**
 * Allocate branch transport cost by received quantity × unit weight.
 * Authoritative money math uses Prisma Decimal; remainder is assigned to the
 * heaviest line (then stable productId) so totals equal the entered cost exactly.
 */
export function allocateBranchReceivingTransportCost(
  items: BranchReceivingTransportLineInput[],
  transportCostKgs: number | Prisma.Decimal | string,
): BranchReceivingTransportLineCost[] {
  const receivedLines = items.filter((item) => item.receivedQuantity > 0);
  if (!receivedLines.length) return [];

  assertPositiveUnitWeights(receivedLines);

  const targetTransport = toDecimal(transportCostKgs ?? 0);
  if (targetTransport.lt(0)) {
    throw new Error('Transport cost cannot be negative');
  }
  const safeTransport = targetTransport.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

  const prepared = receivedLines.map((item) => {
    const unitWeight = toDecimal(item.weightKg);
    const qty = new Prisma.Decimal(item.receivedQuantity);
    const itemTotalWeight = unitWeight.mul(qty);
    return {
      productId: item.productId,
      receivedQuantity: item.receivedQuantity,
      unitCostKgs: toDecimal(item.unitCostKgs),
      itemTotalWeight,
    };
  });

  const shipmentTotalWeight = prepared.reduce(
    (sum, row) => sum.plus(row.itemTotalWeight),
    new Prisma.Decimal(0),
  );
  if (shipmentTotalWeight.lte(0)) {
    throw new Error(BRANCH_TRANSPORT_MISSING_WEIGHT_MESSAGE);
  }

  if (safeTransport.lte(0)) {
    return prepared.map((row) => ({
      productId: row.productId,
      itemTotalWeightKg: roundWeight(row.itemTotalWeight),
      transportExpenseAllocation: 0,
      transportCostPerUnit: 0,
      finalUnitCostKgs: roundDisplayMoney(row.unitCostKgs),
    }));
  }

  const rawAllocations = prepared.map((row) => {
    const rawShare = safeTransport.mul(row.itemTotalWeight.div(shipmentTotalWeight));
    return {
      ...row,
      rawAllocation: rawShare,
      transportExpenseAllocation: roundDisplayMoney(rawShare),
    };
  });

  const allocatedTotal = rawAllocations.reduce(
    (sum, row) => sum.plus(toDecimal(row.transportExpenseAllocation)),
    new Prisma.Decimal(0),
  );
  const remainder = safeTransport
    .minus(allocatedTotal)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

  if (!remainder.isZero()) {
    const target = [...rawAllocations].sort((a, b) => {
      const weightCmp = b.itemTotalWeight.comparedTo(a.itemTotalWeight);
      if (weightCmp !== 0) return weightCmp;
      return a.productId.localeCompare(b.productId);
    })[0];
    if (target) {
      target.transportExpenseAllocation = roundDisplayMoney(
        toDecimal(target.transportExpenseAllocation).plus(remainder),
      );
    }
  }

  return rawAllocations.map((row) => {
    const allocation = toDecimal(row.transportExpenseAllocation);
    const perUnit =
      row.receivedQuantity > 0
        ? allocation.div(row.receivedQuantity)
        : new Prisma.Decimal(0);
    return {
      productId: row.productId,
      itemTotalWeightKg: roundWeight(row.itemTotalWeight),
      transportExpenseAllocation: roundDisplayMoney(allocation),
      transportCostPerUnit: roundDisplayMoney(perUnit),
      finalUnitCostKgs: roundDisplayMoney(row.unitCostKgs.plus(perUnit)),
    };
  });
}

export function sumAllocatedTransportCost(rows: BranchReceivingTransportLineCost[]): number {
  return roundDisplayMoney(
    rows.reduce(
      (sum, row) => sum.plus(toDecimal(row.transportExpenseAllocation)),
      new Prisma.Decimal(0),
    ),
  );
}
