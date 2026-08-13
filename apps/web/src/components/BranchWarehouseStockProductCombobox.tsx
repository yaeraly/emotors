'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { filterBranchHqReturnStockProducts } from '@/lib/branch-hq-return-product-search.util';
import { useTranslation } from '@/i18n/useTranslation';

export type BranchWarehouseStockProductOption = {
  productId: string;
  productName: string;
  productCode: string;
  availableQuantity: number;
};

type Props = {
  label?: string;
  value: string;
  options: BranchWarehouseStockProductOption[];
  excludedProductIds?: string[];
  loading?: boolean;
  disabled?: boolean;
  onChange: (productId: string) => void;
  /** When set, Enter on a highlighted selectable option adds immediately instead of only selecting. */
  onEnterAdd?: (option: BranchWarehouseStockProductOption) => void;
  onDuplicateAttempt?: () => void;
};

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

export function BranchWarehouseStockProductCombobox({
  label,
  value,
  options,
  excludedProductIds = [],
  loading = false,
  disabled = false,
  onChange,
  onEnterAdd,
  onDuplicateAttempt,
}: Props) {
  const { t } = useTranslation();
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const excluded = useMemo(() => new Set(excludedProductIds), [excludedProductIds]);

  const selected = useMemo(
    () => options.find((option) => option.productId === value) ?? null,
    [options, value],
  );

  const filtered = useMemo(
    () => filterBranchHqReturnStockProducts(options, query),
    [options, query],
  );

  const selectableIndices = useMemo(
    () =>
      filtered
        .map((option, index) => ({ option, index }))
        .filter(({ option }) => !excluded.has(option.productId) && option.availableQuantity > 0)
        .map(({ index }) => index),
    [excluded, filtered],
  );

  useEffect(() => {
    if (!open) return;
    const firstSelectable = selectableIndices[0] ?? 0;
    setHighlightedIndex(firstSelectable);
  }, [open, query, selectableIndices.join(',')]);

  useEffect(() => {
    if (selected) {
      setQuery(selected.productName);
    } else if (!open) {
      setQuery('');
    }
  }, [selected, open]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        if (selected) {
          setQuery(selected.productName);
        } else {
          setQuery('');
        }
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [selected]);

  function isOptionSelectable(option: BranchWarehouseStockProductOption) {
    return !excluded.has(option.productId) && option.availableQuantity > 0;
  }

  function selectOption(option: BranchWarehouseStockProductOption | null) {
    if (option && !isOptionSelectable(option)) return;
    onChange(option?.productId ?? '');
    setQuery(option?.productName ?? '');
    setOpen(false);
    setHighlightedIndex(0);
  }

  function moveHighlight(direction: 1 | -1) {
    if (!selectableIndices.length) return;
    const currentPos = selectableIndices.indexOf(highlightedIndex);
    const startPos = currentPos >= 0 ? currentPos : direction > 0 ? -1 : selectableIndices.length;
    const nextPos = (startPos + direction + selectableIndices.length) % selectableIndices.length;
    setHighlightedIndex(selectableIndices[nextPos] ?? selectableIndices[0] ?? 0);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) setOpen(true);
      moveHighlight(1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) setOpen(true);
      moveHighlight(-1);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const option = filtered[highlightedIndex];
      if (!option) return;

      if (excluded.has(option.productId)) {
        onDuplicateAttempt?.();
        return;
      }

      if (!isOptionSelectable(option)) return;

      if (onEnterAdd) {
        onEnterAdd(option);
        onChange('');
        setQuery('');
        setOpen(false);
        setHighlightedIndex(0);
        requestAnimationFrame(() => inputRef.current?.focus());
        return;
      }

      selectOption(option);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      if (selected) {
        setQuery(selected.productName);
      } else {
        setQuery('');
      }
      return;
    }

    if (event.key === 'Tab') {
      setOpen(false);
    }
  }

  const showDropdown = open && !loading;
  const showNotFound = showDropdown && normalizeSearch(query).length > 0 && filtered.length === 0;
  const showEmptyStock = showDropdown && !query.trim() && filtered.length === 0;

  return (
    <div ref={containerRef} className="relative min-w-0 flex-1">
      {label ? (
        <span className="mb-2 block text-sm font-semibold text-slate-700">{label}</span>
      ) : null}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          disabled={disabled || loading}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            if (!event.target.value.trim() && value) {
              onChange('');
            }
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={t('branchHqReturn.searchProduct')}
          className="w-full rounded-xl border border-slate-300 px-3 py-2 pr-16 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
        />
        {value ? (
          <button
            type="button"
            onClick={() => selectOption(null)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            tabIndex={-1}
            aria-label={t('common.combobox.clear')}
          >
            {t('common.combobox.clear')}
          </button>
        ) : null}
      </div>

      {loading ? (
        <p className="absolute z-20 mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 shadow-lg">
          {t('common.loading')}
        </p>
      ) : null}

      {showNotFound || showEmptyStock ? (
        <p className="absolute z-20 mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 shadow-lg">
          {t('branchHqReturn.nothingFound')}
        </p>
      ) : null}

      {showDropdown && filtered.length > 0 ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          {filtered.map((option, index) => {
            const alreadyAdded = excluded.has(option.productId);
            const outOfStock = option.availableQuantity <= 0;
            const selectable = isOptionSelectable(option);
            const highlighted = index === highlightedIndex;

            return (
              <li
                key={option.productId}
                role="option"
                aria-selected={highlighted}
                aria-disabled={!selectable}
              >
                <button
                  type="button"
                  disabled={!selectable}
                  onMouseEnter={() => {
                    if (selectable) setHighlightedIndex(index);
                  }}
                  onClick={() => selectOption(option)}
                  className={`w-full px-3 py-2 text-left transition ${
                    !selectable
                      ? 'cursor-not-allowed opacity-60'
                      : highlighted
                        ? 'bg-blue-50 text-blue-900'
                        : 'hover:bg-slate-50'
                  }`}
                >
                  <p className="text-sm font-semibold text-slate-900">{option.productName}</p>
                  <p className="mt-0.5 text-xs text-slate-600">
                    {t('branchHqReturn.available')}: {option.availableQuantity}
                    {option.productCode ? (
                      <span className="text-slate-400"> · {option.productCode}</span>
                    ) : null}
                  </p>
                  {alreadyAdded ? (
                    <p className="mt-0.5 text-xs font-medium text-amber-700">
                      {t('branchHqReturn.alreadyAdded')}
                    </p>
                  ) : null}
                  {!alreadyAdded && outOfStock ? (
                    <p className="mt-0.5 text-xs font-medium text-slate-500">
                      {t('branchHqReturn.available')}: 0
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
