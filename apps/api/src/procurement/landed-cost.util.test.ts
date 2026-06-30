import { calculateLandedCosts } from './landed-cost.util';

function assertEqual(actual: number, expected: number, label: string) {
  if (Math.abs(actual - expected) > 0.01) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function assertThrows(fn: () => void, label: string) {
  try {
    fn();
    throw new Error(`${label}: expected error but succeeded`);
  } catch {
    // expected
  }
}

// Two products: 1000kg + 500kg net, cargo total 1600kg => 100kg packaging
const multiProduct = calculateLandedCosts(
  [
    { quantity: 10, purchasePriceYuan: 100, yuanRate: 12, weightKg: 100 },
    { quantity: 5, purchasePriceYuan: 200, yuanRate: 12, weightKg: 100 },
  ],
  {
    chinaDomesticTransportKgs: 0,
    chinaExportTransportKgs: 0,
    localTransportKgs: 0,
    packagingCostKgs: 0,
    customsCostKgs: 0,
    insuranceCostKgs: 0,
    bankFeeCostKgs: 0,
    otherExpenseKgs: 0,
  },
  { cargo: { usdRate: 89.5, cargoRateUsdPerKg: 0.9, cargoTotalWeightKg: 1600 } },
);

assertEqual(multiProduct.totalNetWeightKg, 1500, 'Total net weight');
assertEqual(multiProduct.totalPackagingWeightKg, 100, 'Total packaging weight');
assertEqual(multiProduct.totalShipmentWeightKg, 1600, 'Total shipment weight');
assertEqual(multiProduct.items[0].linePackagingWeightKg, 66.667, 'Item 1 packaging alloc');
assertEqual(multiProduct.items[1].linePackagingWeightKg, 33.333, 'Item 2 packaging alloc');
assertEqual(multiProduct.totalCargoCostUsd, 1440, 'Cargo cost USD');
assertEqual(multiProduct.totalCargoCostKgs, 128880, 'Cargo cost KGS');

// Cargo cost uses cargo total weight, not net weight
const singleShipment = calculateLandedCosts(
  [
    {
      quantity: 1,
      purchasePriceYuan: 1000,
      yuanRate: 12.5,
      weightKg: 2000,
    },
  ],
  {
    chinaDomesticTransportKgs: 0,
    chinaExportTransportKgs: 0,
    localTransportKgs: 0,
    packagingCostKgs: 0,
    customsCostKgs: 0,
    insuranceCostKgs: 0,
    bankFeeCostKgs: 0,
    otherExpenseKgs: 0,
  },
  { cargo: { usdRate: 89.5, cargoRateUsdPerKg: 0.9, cargoTotalWeightKg: 2000 } },
);

assertEqual(singleShipment.totalCargoCostUsd, 1800, 'Single shipment cargo USD');
assertEqual(singleShipment.totalCargoCostKgs, 161100, 'Single shipment cargo KGS');
if (singleShipment.isEstimated) throw new Error('Single shipment should not be estimated');

assertThrows(
  () => calculateLandedCosts(
    [{ quantity: 1, purchasePriceYuan: 100, yuanRate: 12, weightKg: 2000 }],
    {
      chinaDomesticTransportKgs: 0,
      chinaExportTransportKgs: 0,
      localTransportKgs: 0,
      packagingCostKgs: 0,
      customsCostKgs: 0,
      insuranceCostKgs: 0,
      bankFeeCostKgs: 0,
      otherExpenseKgs: 0,
    },
    { cargo: { usdRate: 89.5, cargoRateUsdPerKg: 0.9, cargoTotalWeightKg: 1500 } },
  ),
  'Cargo less than net weight',
);

console.log('All landed cost tests passed.');
console.log(JSON.stringify({
  multiProductNet: multiProduct.totalNetWeightKg,
  multiProductPackaging: multiProduct.totalPackagingWeightKg,
  cargoCostUsd: multiProduct.totalCargoCostUsd,
  cargoCostKgs: multiProduct.totalCargoCostKgs,
}, null, 2));
