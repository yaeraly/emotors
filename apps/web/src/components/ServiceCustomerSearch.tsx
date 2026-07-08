'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import type { ServiceCustomerOption } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type Props = {
  disabled?: boolean;
  onSelect: (customer: ServiceCustomerOption) => void;
};

const DEBOUNCE_MS = 200;

export function ServiceCustomerSearch({ disabled = false, onSelect }: Props) {
  const { t } = useTranslation();
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ServiceCustomerOption[]>([]);
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
      void apiFetch<ServiceCustomerOption[]>(`/service-orders/customer-search?${params}`)
        .then((items) => {
          setResults(items);
          setOpen(true);
          setHighlightedIndex(0);
        })
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

  function selectCustomer(customer: ServiceCustomerOption) {
    onSelect(customer);
    setQuery('');
    setResults([]);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">{t('service.customer')}</span>
        <input
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          disabled={disabled}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => { if (results.length) setOpen(true); }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setHighlightedIndex((i) => Math.min(i + 1, results.length - 1));
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              setHighlightedIndex((i) => Math.max(i - 1, 0));
            }
            if ((event.key === 'Enter' || event.key === 'Tab') && results[highlightedIndex]) {
              event.preventDefault();
              selectCustomer(results[highlightedIndex]);
            }
          }}
          placeholder={t('sales.customerSearch.placeholder')}
          className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"
        />
      </label>
      {loading ? <p className="mt-2 text-sm text-slate-500">{t('common.loading')}</p> : null}
      {open && results.length > 0 ? (
        <ul id={listboxId} className="absolute z-20 mt-2 max-h-80 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white py-2 shadow-xl">
          {results.map((customer, index) => (
            <li key={customer.id}>
              <button
                type="button"
                onClick={() => selectCustomer(customer)}
                className={`w-full px-4 py-3 text-left ${index === highlightedIndex ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
              >
                <p className="font-semibold text-slate-950">{customer.fullName}</p>
                <p className="text-sm text-slate-600">{customer.phone} · {customer.customerCode}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {customer.vipStatus ? 'VIP' : t(`status.${customer.status}`)}
                  {customer.lastVisit ? ` · ${new Date(customer.lastVisit).toLocaleDateString('ru-RU')}` : ''}
                </p>
                {customer.outstandingDebt > 0 ? (
                  <p className="mt-1 text-xs text-amber-700">{t('sales.debtAmount')}: {customer.outstandingDebt.toLocaleString('ru-RU')} KGS</p>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
