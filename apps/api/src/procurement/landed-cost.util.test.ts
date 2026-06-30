import { calculateLandedCosts } from './landed-cost.util';

function assertEqual(actual: number, expected: number, label: string) {
  if (Math.abs(actual - expected) > 0.01) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

// Test case: 2,000 kg shipment, cargo rate 0.90 USD/kg, USD rate 89.50
const result = calculateLandedCosts(
  [
    {
      quantity: 1,
      purchasePriceYuan: 1000,
      yuanRate: 12.5,
      weightKg: 2000,
      packagingWeightKg: 0,
      directPackagingCostKgs: 0,
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
  { cargo: { usdRate: 89.5, cargoRateUsdPerKg: 0.9 } },
);

assertEqual(result.totalShipmentWeightKg, 2000, 'Total shipment weight');
assertEqual(result.totalCargoCostUsd, 1800, 'Total cargo cost USD');
assertEqual(result.totalCargoCostKgs, 161100, 'Total cargo cost KGS');
assertEqual(result.items[0].chinaExportAllocKgs, 161100, 'Export transport allocation');
assertEqual(result.items[0].transportCostKgs, 161100, 'Per-unit transport cost');
assertEqual(result.items[0].finalCostKgs, 173600, 'Final landed cost per unit');

console.log('All landed cost tests passed.');
console.log(JSON.stringify({
  totalShipmentWeightKg: result.totalShipmentWeightKg,
  totalCargoCostUsd: result.totalCargoCostUsd,
  totalCargoCostKgs: result.totalCargoCostKgs,
  transportAllocation: result.items[0].chinaExportAllocKgs,
  finalLandedCost: result.items[0].finalCostKgs,
}, null, 2));
