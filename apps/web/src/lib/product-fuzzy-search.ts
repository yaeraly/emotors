import type { Product } from '@/lib/types';

function normalize(value: string) {
  return value.toLowerCase().trim();
}

function fuzzySubsequenceScore(query: string, text: string) {
  if (!query) return 0;
  if (text.includes(query)) {
    const index = text.indexOf(query);
    return 120 - index + (index === 0 ? 20 : 0);
  }

  let queryIndex = 0;
  let score = 0;
  let lastMatch = -1;

  for (let i = 0; i < text.length && queryIndex < query.length; i += 1) {
    if (text[i] === query[queryIndex]) {
      score += lastMatch === i - 1 ? 8 : 4;
      lastMatch = i;
      queryIndex += 1;
    }
  }

  return queryIndex === query.length ? score : 0;
}

function fieldScore(query: string, value?: string | null) {
  if (!value) return 0;
  return fuzzySubsequenceScore(query, normalize(value));
}

export function scoreProduct(product: Product, rawQuery: string) {
  const query = normalize(rawQuery);
  if (!query) return 0;

  const terms = query.split(/\s+/).filter(Boolean);
  const fields = [product.name, product.sku, product.barcode ?? '', product.category, product.productCategory?.code ?? ''].map(normalize);
  const haystack = fields.join(' ');

  const allTermsMatch = terms.every((term) => fields.some((field) => field.includes(term) || fuzzySubsequenceScore(term, field) > 0));
  if (!allTermsMatch) return 0;

  const baseScore = Math.max(
    fieldScore(query, product.name),
    fieldScore(query, product.sku),
    fieldScore(query, product.barcode),
    fieldScore(query, product.category),
    fieldScore(query, product.productCategory?.code),
  );

  const termBonus = terms.reduce((sum, term) => sum + Math.max(
    fieldScore(term, product.name),
    fieldScore(term, product.sku),
    fieldScore(term, product.barcode),
    fieldScore(term, product.category),
    fieldScore(term, product.productCategory?.code),
  ), 0);

  return baseScore + termBonus + (haystack.includes(query) ? 10 : 0);
}

export function rankProducts(products: Product[], rawQuery: string, limit = 20) {
  const query = normalize(rawQuery);
  if (!query) return [];

  return products
    .map((product) => ({ product, score: scoreProduct(product, query) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.product.name.localeCompare(right.product.name, 'ru'))
    .slice(0, limit)
    .map((entry) => entry.product);
}
