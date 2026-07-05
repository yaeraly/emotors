'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { rankProducts } from '@/lib/product-fuzzy-search';
import type { Product, ProductListResponse } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type Props = {
  disabled?: boolean;
  onSelect: (product: Product) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
};

const DEBOUNCE_MS = 200;

export function ProcurementProductSearch({ disabled = false, onSelect, inputRef }: Props) {
  const { t } = useTranslation();
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const internalInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = inputRef ?? internalInputRef;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setOpen(false);
      setLoading(false);
      setError('');
      return;
    }

    setLoading(true);
    const timer = window.setTimeout(() => {
      const search = query.trim();
      void apiFetch<ProductListResponse>(
        `/inventory/products?search=${encodeURIComponent(search)}&pageSize=40&isActive=true`,
      )
        .then((response) => {
          const ranked = rankProducts(response.items, search, 20);
          setResults(ranked);
          setOpen(true);
          setHighlightedIndex(0);
          setError(ranked.length ? '' : t('procurement.orders.productSearch.noResults'));
        })
        .catch((err) => {
          setResults([]);
          setOpen(false);
          setError(err instanceof Error ? err.message : t('common.error'));
        })
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [query, t]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  function selectProduct(product: Product) {
    onSelect(product);
    setQuery('');
    setResults([]);
    setOpen(false);
    setHighlightedIndex(0);
    setError('');
    window.requestAnimationFrame(() => searchInputRef.current?.focus());
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open && results.length) setOpen(true);
      setHighlightedIndex((current) => Math.min(current + 1, Math.max(results.length - 1, 0)));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const product = results[highlightedIndex];
      if (product) selectProduct(product);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      setHighlightedIndex(0);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">{t('procurement.orders.productSearch.label')}</span>
        <input
          ref={searchInputRef}
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          disabled={disabled}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => {
            if (results.length) setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={t('procurement.orders.productSearch.placeholder')}
          className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
        />
      </label>

      <p className="mt-2 text-xs text-slate-500">{t('procurement.orders.productSearch.hint')}</p>

      {loading ? (
        <p className="mt-2 text-sm text-slate-500">{t('common.loading')}</p>
      ) : null}

      {!loading && error && query.trim() ? (
        <p className="mt-2 text-sm text-slate-500">{error}</p>
      ) : null}

      {open && results.length > 0 ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-2 max-h-80 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white py-2 shadow-xl"
        >
          {results.map((product, index) => (
            <li key={product.id} role="option" aria-selected={index === highlightedIndex}>
              <button
                type="button"
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => selectProduct(product)}
                className={`w-full px-4 py-3 text-left transition ${
                  index === highlightedIndex ? 'bg-blue-50' : 'hover:bg-slate-50'
                }`}
              >
                <p className="font-semibold text-slate-950">{product.name}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {t('procurement.orders.productSearch.sku')}: {product.sku}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  {product.warehouse?.name ?? t('procurement.orders.productSearch.warehouse')}: {product.quantity} {product.unit ?? 'pcs'}
                  {' · '}
                  {t('procurement.orders.netWeightKg')}: {Number(product.weightKg || 0).toFixed(1)} kg
                  {' · '}
                  {t('procurement.orders.productSearch.lastPrice')}: ¥{Number(product.purchasePriceYuan || 0).toFixed(2)}
                </p>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
