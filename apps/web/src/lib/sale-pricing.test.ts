import { evaluateSaleLinePrice } from './sale-pricing';

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const recommended = evaluateSaleLinePrice({
  unitPrice: 9000,
  minimumPrice: 8500,
  recommendedPrice: 9000,
  maximumPrice: 9500,
  hasMaximumPrice: true,
});
assertEqual(recommended.level, 'ok', 'recommended price is ok');

const belowRecommended = evaluateSaleLinePrice({
  unitPrice: 8800,
  minimumPrice: 8500,
  recommendedPrice: 9000,
  maximumPrice: 9500,
  hasMaximumPrice: true,
});
assertEqual(belowRecommended.level, 'warning', 'below recommended is warning');
assertEqual(
  belowRecommended.level === 'warning' ? belowRecommended.difference : null,
  200,
  'below recommended difference',
);

const aboveRecommended = evaluateSaleLinePrice({
  unitPrice: 9200,
  minimumPrice: 8500,
  recommendedPrice: 9000,
  maximumPrice: 9500,
  hasMaximumPrice: true,
});
assertEqual(aboveRecommended.level, 'warning', 'above recommended is warning');

const belowMinimum = evaluateSaleLinePrice({
  unitPrice: 8000,
  minimumPrice: 8500,
  recommendedPrice: 9000,
  maximumPrice: 9500,
  hasMaximumPrice: true,
});
assertEqual(belowMinimum.level, 'error', 'below minimum is error');

const aboveMaximum = evaluateSaleLinePrice({
  unitPrice: 9600,
  minimumPrice: 8500,
  recommendedPrice: 9000,
  maximumPrice: 9500,
  hasMaximumPrice: true,
});
assertEqual(aboveMaximum.level, 'error', 'above maximum is error');

console.log('sale-pricing.test.ts passed');
