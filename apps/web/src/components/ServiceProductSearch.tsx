'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import type { ServiceProductOption } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type Props = {
  disabled?: boolean;
  onSelect: (product: ServiceProductOption) => void;
};

const DEBOUNCE_MS = 200;

export function ServiceProductSearch({ disabled = false, onSelect }: Props) {
  const { t } = useTranslation();
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ServiceProductOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ search: query.trim() });
      void apiFetch<ServiceProductOption[]>(`/service-orders/product-search?${params}`)
        .then((items) => { setResults(items); setOpen(true); setHighlightedIndex(0); })
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  function selectProduct(product: ServiceProductOption) {
    onSelect(product);
    setQuery('');
    setResults([]);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">{t('sales.product')}</span>
        <input
          type="search"
          disabled={disabled}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('inventory.searchProduct')}
          className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"
        />
      </label>
      {loading ? <p className="mt-2 text-sm text-slate-500">{t('common.loading')}</p> : null}
      {open && results.length > 0 ? (
        <ul id={listboxId} className="absolute z-20 mt-2 max-h-80 w-full overflow-y-auto rounded-2xl border bg-white py-2 shadow-xl">
          {results.map((product, index) => (
            <li key={product.id}>
              <button
                type="button"
                onClick={() => selectProduct(product)}
                className={`w-full px-4 py-3 text-left ${index === highlightedIndex ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
              >
                <p className="font-semibold">{product.sku} · {product.name}</p>
                <p className="text-sm text-slate-600">{product.category ?? '-'} · {product.unitPrice.toLocaleString('ru-RU')} KGS</p>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
