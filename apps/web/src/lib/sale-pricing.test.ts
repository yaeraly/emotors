import { evaluateSaleLinePrice } from './sale-pricing';

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const recommended = evaluateSaleLinePrice({
  unitPrice: 1200,
  minimumPrice: 1000,
  recommendedPrice: 1200,
  maximumPrice: 1400,
  hasMaximumPrice: true,
});
assertEqual(recommended.level, 'ok', 'recommended price is ok');

const atMinimum = evaluateSaleLinePrice({
  unitPrice: 1000,
  minimumPrice: 1000,
  recommendedPrice: 1200,
  maximumPrice: 1400,
  hasMaximumPrice: true,
});
assertEqual(atMinimum.level, 'warning', 'minimum is allowed with manager-changed indicator');
assertEqual(atMinimum.kind, 'changed-manually', 'minimum marked as changed');

const between = evaluateSaleLinePrice({
  unitPrice: 1150,
  minimumPrice: 1000,
  recommendedPrice: 1200,
  maximumPrice: 1400,
  hasMaximumPrice: true,
});
assertEqual(between.level, 'warning', 'between min/max is allowed');
assertEqual(between.kind, 'changed-manually', 'between marked as changed');

const atMaximum = evaluateSaleLinePrice({
  unitPrice: 1400,
  minimumPrice: 1000,
  recommendedPrice: 1200,
  maximumPrice: 1400,
  hasMaximumPrice: true,
});
assertEqual(atMaximum.level, 'warning', 'maximum is allowed');
assertEqual(atMaximum.kind, 'changed-manually', 'maximum marked as changed');

const belowMinimum = evaluateSaleLinePrice({
  unitPrice: 999,
  minimumPrice: 1000,
  recommendedPrice: 1200,
  maximumPrice: 1400,
  hasMaximumPrice: true,
});
assertEqual(belowMinimum.level, 'error', 'below minimum is error');
assertEqual(belowMinimum.kind, 'below-minimum', 'below minimum kind');

const aboveMaximum = evaluateSaleLinePrice({
  unitPrice: 1401,
  minimumPrice: 1000,
  recommendedPrice: 1200,
  maximumPrice: 1400,
  hasMaximumPrice: true,
});
assertEqual(aboveMaximum.level, 'error', 'above maximum is error');
assertEqual(aboveMaximum.kind, 'above-maximum', 'above maximum kind');

const empty = evaluateSaleLinePrice({
  unitPrice: '',
  rawUnitPrice: '',
  minimumPrice: 1000,
  recommendedPrice: 1200,
  maximumPrice: 1400,
  hasMaximumPrice: true,
});
assertEqual(empty.level, 'error', 'empty is error');
assertEqual(empty.kind, 'empty', 'empty kind');

const negative = evaluateSaleLinePrice({
  unitPrice: -10,
  minimumPrice: 1000,
  recommendedPrice: 1200,
  maximumPrice: 1400,
  hasMaximumPrice: true,
});
assertEqual(negative.level, 'error', 'negative is error');
assertEqual(negative.kind, 'negative', 'negative kind');

const invalid = evaluateSaleLinePrice({
  unitPrice: 'abc',
  rawUnitPrice: 'abc',
  minimumPrice: 1000,
  recommendedPrice: 1200,
  maximumPrice: 1400,
  hasMaximumPrice: true,
});
assertEqual(invalid.level, 'error', 'invalid is error');
assertEqual(invalid.kind, 'invalid', 'invalid kind');

console.log('sale-pricing.test.ts passed');
