import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { buildSaleLinePricingTooltipContent } from './sale-line-pricing-tooltip.util';
import { applyLoyaltyMarkupToRecommendedPrice } from './sale-customer-pricing';
import { evaluateSaleLinePrice } from './sale-pricing';

const labels = {
  title: 'Допустимый диапазон цены',
  minimum: 'Минимальная цена',
  recommended: 'Рекомендуемая цена',
  maximum: 'Максимальная цена',
  notConfigured: 'Диапазон цены не настроен.',
  valueNotConfigured: 'не настроена',
};

const formatMoney = (value: number) => `${value.toLocaleString('ru-RU')} KGS`;

describe('sale line pricing tooltip content', () => {
  it('shows all three configured prices with shared money formatter', () => {
    const content = buildSaleLinePricingTooltipContent({
      minimumPrice: 1000,
      recommendedPrice: 1200,
      maximumPrice: 1400,
      hasMaximumPrice: true,
      hasPricingPolicy: true,
      formatMoney,
      labels,
    });
    assert.equal(content.configured, true);
    assert.equal(content.title, 'Допустимый диапазон цены');
    assert.deepEqual(content.lines, [
      'Минимальная цена: 1 000 KGS',
      'Рекомендуемая цена: 1 200 KGS',
      'Максимальная цена: 1 400 KGS',
    ]);
  });

  it('shows range-not-configured when pricing policy is missing', () => {
    const content = buildSaleLinePricingTooltipContent({
      minimumPrice: 0,
      recommendedPrice: 0,
      maximumPrice: null,
      hasMaximumPrice: false,
      hasPricingPolicy: false,
      formatMoney,
      labels,
    });
    assert.equal(content.configured, false);
    assert.deepEqual(content.lines, ['Диапазон цены не настроен.']);
  });
});

describe('sale registration price layout', () => {
  const pageSource = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../app/sales/new/page.tsx'),
    'utf8',
  );
  const popoverSource = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../components/InfoPopover.tsx'),
    'utf8',
  );
  const tooltipSource = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../components/SaleLinePricingTooltip.tsx'),
    'utf8',
  );

  it('does not render separate visible minimum price column', () => {
    assert.doesNotMatch(pageSource, /pricing\.tooltip\.minPrice/);
  });

  it('does not render separate visible recommended price column header in item grid', () => {
    assert.doesNotMatch(pageSource, /label=\{t\('sales\.recommendedPrice'\)\}/);
  });

  it('does not render separate visible maximum price column header in item grid', () => {
    assert.doesNotMatch(pageSource, /label=\{t\('sales\.maximumPrice'\)\}/);
  });

  it('keeps selling price visible with tooltip accessory', () => {
    assert.match(pageSource, /label=\{t\('sales\.sellingPrice'\)\}/);
    assert.match(pageSource, /<SaleLinePricingTooltip/);
  });

  it('reuses InfoPopover with hover, focus, and tap interactions', () => {
    assert.match(tooltipSource, /InfoPopover/);
    assert.match(popoverSource, /onMouseEnter/);
    assert.match(popoverSource, /onFocus/);
    assert.match(popoverSource, /onClick/);
    assert.match(popoverSource, /aria-label/);
  });

  it('does not keep the old eight-column price layout', () => {
    assert.doesNotMatch(pageSource, /1\.8fr_.*0\.9fr_.*0\.9fr_.*0\.9fr/);
  });

  it('does not show duplicated recommended and sale price text before the input', () => {
    assert.doesNotMatch(pageSource, /sales\.recommendedPrice'\)\}: \{formatKgs\(item\.recommendedPrice\)\}/);
    assert.doesNotMatch(pageSource, /\{' · '\}/);
    assert.doesNotMatch(
      pageSource,
      /sales\.sellingPrice'\)\}: \{formatKgs\(Number\(item\.unitPrice/,
    );
  });

  it('vertically centers the line total block label and amount', () => {
    assert.match(
      pageSource,
      /flex min-w-0 flex-col justify-center gap-1 rounded-xl bg-slate-50/,
    );
    assert.match(pageSource, /lg:items-center/);
  });
});

describe('sale price validation unchanged', () => {
  const limits = {
    minimumPrice: 1000,
    recommendedPrice: 1200,
    maximumPrice: 1400,
    hasMaximumPrice: true,
  };

  it('defaults sale price to recommended price', () => {
    const recommended = applyLoyaltyMarkupToRecommendedPrice({
      basePriceKgs: 1200,
      loyaltyMarkupPercent: 0,
      minimumPriceKgs: 1000,
      maximumPriceKgs: 1400,
    });
    assert.equal(recommended, 1200);
  });

  it('accepts minimum and maximum boundary prices', () => {
    assert.equal(evaluateSaleLinePrice({ unitPrice: 1000, ...limits }).level, 'warning');
    assert.equal(evaluateSaleLinePrice({ unitPrice: 1400, ...limits }).level, 'warning');
  });

  it('rejects below minimum and above maximum', () => {
    assert.equal(evaluateSaleLinePrice({ unitPrice: 999, ...limits }).kind, 'below-minimum');
    assert.equal(evaluateSaleLinePrice({ unitPrice: 1401, ...limits }).kind, 'above-maximum');
  });
});
