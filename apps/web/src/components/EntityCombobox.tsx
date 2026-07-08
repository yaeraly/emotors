'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from '@/i18n/useTranslation';

export type ComboboxOption = {
  value: string;
  label: string;
};

type Props = {
  label: string;
  value: string;
  options: ComboboxOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  allowClear?: boolean;
  disabled?: boolean;
  required?: boolean;
};

const DEBOUNCE_MS = 200;

export function EntityCombobox({
  label,
  value,
  options,
  onChange,
  placeholder,
  allowClear = true,
  disabled = false,
  required = false,
}: Props) {
  const { t } = useTranslation();
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const selected = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  const filtered = useMemo(() => {
    const term = debouncedQuery.trim().toLowerCase();
    if (!term) return options;
    return options.filter((option) => option.label.toLowerCase().includes(term));
  }, [debouncedQuery, options]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [debouncedQuery, filtered.length]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        if (selected) {
          setQuery(selected.label);
        } else {
          setQuery('');
        }
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [selected]);

  useEffect(() => {
    if (selected) {
      setQuery(selected.label);
    } else if (!open) {
      setQuery('');
    }
  }, [selected, open]);

  function selectOption(option: ComboboxOption | null) {
    onChange(option?.value ?? '');
    setQuery(option?.label ?? '');
    setOpen(false);
    setHighlightedIndex(0);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open && filtered.length) setOpen(true);
      setHighlightedIndex((current) => Math.min(current + 1, Math.max(filtered.length - 1, 0)));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const option = filtered[highlightedIndex];
      if (option) selectOption(option);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      setHighlightedIndex(0);
      if (selected) setQuery(selected.label);
      return;
    }

    if (event.key === 'Tab') {
      setOpen(false);
    }
  }

  const showNotFound = open && debouncedQuery.trim().length > 0 && filtered.length === 0;

  return (
    <div ref={containerRef} className="relative">
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">{label}</span>
        <div className="relative mt-2">
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-autocomplete="list"
            disabled={disabled}
            required={required && !value}
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
            placeholder={placeholder ?? t('common.combobox.placeholder')}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 pr-16 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
          />
          {allowClear && value ? (
            <button
              type="button"
              onClick={() => selectOption(null)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              tabIndex={-1}
            >
              {t('common.combobox.clear')}
            </button>
          ) : null}
        </div>
      </label>

      {showNotFound ? (
        <p className="mt-1 text-xs text-slate-500">{t('common.combobox.notFound')}</p>
      ) : null}

      {open && filtered.length > 0 ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          {filtered.map((option, index) => (
            <li key={option.value} role="option" aria-selected={index === highlightedIndex}>
              <button
                type="button"
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => selectOption(option)}
                className={`w-full px-3 py-2 text-left text-sm transition ${
                  index === highlightedIndex ? 'bg-blue-50 text-blue-900' : 'hover:bg-slate-50'
                }`}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
