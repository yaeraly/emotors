function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function shouldRecordPurchasePriceChange(oldPriceYuan: number, newPriceYuan: number) {
  return roundMoney(oldPriceYuan) !== roundMoney(newPriceYuan);
}

function purchasePriceDifference(oldPriceYuan: number, newPriceYuan: number) {
  return roundMoney(newPriceYuan - oldPriceYuan);
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

assertEqual(shouldRecordPurchasePriceChange(85, 85), false, 'equal price should not record');
assertEqual(shouldRecordPurchasePriceChange(85, 90), true, 'increased price should record');
assertEqual(purchasePriceDifference(85, 90), 5, 'price increase difference');
assertEqual(shouldRecordPurchasePriceChange(92, 85), true, 'decreased price should record');
assertEqual(purchasePriceDifference(92, 85), -7, 'price decrease difference');

console.log('purchase-price.util.test.ts passed');
