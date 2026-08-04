import { Prisma } from '@prisma/client';
import { roundDisplayMoney } from '../pricing/product-cost-precision.util';
import { multiplyMoney, sumMoney } from '../sales/sale-price-range.util';

export type ServiceWorkLineInput = {
  quantity: number;
  unitPrice: number | string | Prisma.Decimal;
};

export type ServiceProductLineInput = {
  quantity: number;
  unitPrice: number | string | Prisma.Decimal;
};

export function calculateServiceWorkLineTotal(line: ServiceWorkLineInput) {
  return multiplyMoney(line.unitPrice, line.quantity);
}

export function calculateServiceProductLineTotal(line: ServiceProductLineInput) {
  return multiplyMoney(line.unitPrice, line.quantity);
}

export function calculateServiceOrderTotals(input: {
  workLines: ServiceWorkLineInput[];
  productLines: ServiceProductLineInput[];
}) {
  const workTotal = sumMoney(input.workLines.map((line) => calculateServiceWorkLineTotal(line)));
  const productTotal = sumMoney(input.productLines.map((line) => calculateServiceProductLineTotal(line)));
  const grandTotal = sumMoney([workTotal, productTotal]);
  return {
    workTotal: roundDisplayMoney(workTotal),
    productTotal: roundDisplayMoney(productTotal),
    grandTotal: roundDisplayMoney(grandTotal),
  };
}
