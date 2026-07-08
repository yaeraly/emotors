'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { rankProducts } from '@/lib/product-fuzzy-search';
import { useTranslation } from '@/i18n/useTranslation';

export type BranchProductOption = {
  id: string;
  catalogProductId?: string;
  name: string;
  sku: string;
  barcode?: string | null;
  category: string;
  productCode?: string | null;
  unit: string;
  branchPurchasePriceKgs?: number;
};

type Props = {
  disabled?: boolean;
  branchId?: string;
  onSelect: (product: BranchProductOption) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
};

const DEBOUNCE_MS = 200;

export function BranchProductSearch({
  disabled = false,
  branchId,
  onSelect,
  inputRef,
}: Props) {
  const { t } = useTranslation();
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const internalInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = inputRef ?? internalInputRef;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BranchProductOption[]>([]);
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
      const params = new URLSearchParams({ search });
      if (branchId) {
        params.set('branchId', branchId);
      }
      void apiFetch<BranchProductOption[]>(`/branch-purchase-requests/product-options?${params.toString()}`)
        .then((items) => {
          const searchable = items.map((item) => ({
            ...item,
            barcode: item.barcode ?? undefined,
            productCategory: item.productCode ? { code: item.productCode } : undefined,
          }));
          const rankedIds = rankProducts(searchable as unknown as import('@/lib/types').Product[], search, 20).map(
            (product) => product.id,
          );
          const ranked = rankedIds
            .map((id) => items.find((item) => item.id === id))
            .filter((item): item is BranchProductOption => Boolean(item));
          setResults(ranked);
          setOpen(true);
          setHighlightedIndex(0);
          setError(ranked.length ? '' : t('branchProductRequest.productSearch.noResults'));
        })
        .catch((err) => {
          setResults([]);
          setOpen(false);
          setError(err instanceof Error ? err.message : t('common.error'));
        })
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [branchId, query, t]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  function selectProduct(product: BranchProductOption) {
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

    if (event.key === 'Enter' || event.key === 'Tab') {
      if (!open || !results.length) return;
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
        <span className="text-sm font-semibold text-slate-700">{t('branchProductRequest.productSearch.label')}</span>
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
          placeholder={t('branchProductRequest.productSearch.placeholder')}
          className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
        />
      </label>

      <p className="mt-2 text-xs text-slate-500">{t('branchProductRequest.productSearch.hint')}</p>

      {loading ? <p className="mt-2 text-sm text-slate-500">{t('common.loading')}</p> : null}
      {!loading && error && query.trim() ? <p className="mt-2 text-sm text-slate-500">{error}</p> : null}

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
                  {t('branchProductRequest.productSearch.sku')}: {product.sku}
                  {product.category ? ` · ${product.category}` : ''}
                  {product.unit ? ` · ${product.unit}` : ''}
                </p>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
