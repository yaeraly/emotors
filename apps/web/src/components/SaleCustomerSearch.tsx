'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import type { CustomerStatus } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

export type SaleCustomerOption = {
  id: string;
  fullName: string;
  phone: string;
  whatsappPhone?: string | null;
  status: CustomerStatus;
  customerType?: 'RETAIL' | 'MASTER' | 'WHOLESALE';
  lastPurchaseDate?: string | null;
  totalDebtAmount: number;
  hasOverdueInstallment: boolean;
};

type Props = {
  disabled?: boolean;
  includeArchived?: boolean;
  onSelect: (customer: SaleCustomerOption) => void;
};

const DEBOUNCE_MS = 200;

function formatDate(value?: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString('ru-RU');
}

export function SaleCustomerSearch({
  disabled = false,
  includeArchived = false,
  onSelect,
}: Props) {
  const { t } = useTranslation();
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SaleCustomerOption[]>([]);
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
      if (includeArchived) {
        params.set('includeArchived', 'true');
      }
      void apiFetch<SaleCustomerOption[]>(`/sales/customer-options?${params.toString()}`)
        .then((items) => {
          setResults(items);
          setOpen(true);
          setHighlightedIndex(0);
          setError(items.length ? '' : t('sales.customerSearch.noResults'));
        })
        .catch((err) => {
          setResults([]);
          setOpen(false);
          setError(err instanceof Error ? err.message : t('common.error'));
        })
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [query, includeArchived, t]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  function selectCustomer(customer: SaleCustomerOption) {
    onSelect(customer);
    setQuery('');
    setResults([]);
    setOpen(false);
    setHighlightedIndex(0);
    setError('');
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
      const customer = results[highlightedIndex];
      if (customer) selectCustomer(customer);
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
        <span className="text-sm font-semibold text-slate-700">{t('sales.customerSearch.label')}</span>
        <input
          ref={inputRef}
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
          placeholder={t('sales.customerSearch.placeholder')}
          className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
        />
      </label>

      <p className="mt-2 text-xs text-slate-500">{t('sales.customerSearch.hint')}</p>

      {loading ? <p className="mt-2 text-sm text-slate-500">{t('common.loading')}</p> : null}
      {!loading && error && query.trim() ? <p className="mt-2 text-sm text-slate-500">{error}</p> : null}

      {open && results.length > 0 ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-2 max-h-80 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white py-2 shadow-xl"
        >
          {results.map((customer, index) => {
            const lastPurchase = formatDate(customer.lastPurchaseDate);
            return (
              <li key={customer.id} role="option" aria-selected={index === highlightedIndex}>
                <button
                  type="button"
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onClick={() => selectCustomer(customer)}
                  className={`w-full px-4 py-3 text-left transition ${
                    index === highlightedIndex ? 'bg-blue-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950">{customer.fullName}</p>
                      <p className="mt-1 text-sm text-slate-600">{customer.phone}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {t(`status.${customer.status}`)}
                        {lastPurchase
                          ? ` • ${t('sales.customerSearch.lastPurchase')}: ${lastPurchase}`
                          : ''}
                      </p>
                    </div>
                    {customer.hasOverdueInstallment ? (
                      <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
                        {t('sales.customerSearch.overdue')}
                      </span>
                    ) : null}
                  </div>
                  {customer.totalDebtAmount > 0 ? (
                    <p className="mt-2 text-xs font-medium text-amber-700">
                      {t('sales.debtAmount')}: {customer.totalDebtAmount.toLocaleString('ru-RU')} KGS
                    </p>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
