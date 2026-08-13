'use client';

import { useEffect, useId, useRef, useState } from 'react';

export type PopupFilterOption = {
  value: string;
  label: string;
};

type PopupFilterButtonProps = {
  label: string;
  value: string;
  options: PopupFilterOption[];
  allValue: string;
  allLabel: string;
  onChange: (value: string) => void;
  formatActiveLabel?: (label: string, selectedLabel: string) => string;
};

export function PopupFilterButton({
  label,
  value,
  options,
  allValue,
  allLabel,
  onChange,
  formatActiveLabel,
}: PopupFilterButtonProps) {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const selected = options.find((option) => option.value === value) ?? null;
  const isActive = value !== allValue;
  const buttonText = isActive && selected
    ? formatActiveLabel
      ? formatActiveLabel(label, selected.label)
      : `${label}: ${selected.label}`
  : label;

  useEffect(() => {
    if (!open) return;
    const selectedIndex = options.findIndex((option) => option.value === value);
    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [open, options, value]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  function selectOption(option: PopupFilterOption) {
    onChange(option.value);
    setOpen(false);
  }

  function handleTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setOpen(true);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    }
  }

  function handleListKeyDown(event: React.KeyboardEvent<HTMLUListElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((current) => Math.min(current + 1, options.length - 1));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const option = options[highlightedIndex];
      if (option) selectOption(option);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative inline-flex max-w-full">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        title={isActive && selected ? selected.label : undefined}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleTriggerKeyDown}
        className={`inline-flex max-w-full items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
          isActive
            ? 'border-blue-300 bg-blue-50 text-blue-800'
            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
        }`}
      >
        <span className="truncate">{buttonText}</span>
        {isActive ? (
          <span
            role="button"
            tabIndex={-1}
            aria-label={allLabel}
            onClick={(event) => {
              event.stopPropagation();
              onChange(allValue);
              setOpen(false);
            }}
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-white hover:text-slate-800"
          >
            ×
          </span>
        ) : (
          <span className="shrink-0 text-slate-400">▾</span>
        )}
      </button>

      {open ? (
        <ul
          id={listboxId}
          role="listbox"
          tabIndex={-1}
          onKeyDown={handleListKeyDown}
          className="absolute left-0 top-full z-30 mt-1 max-h-56 min-w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isHighlighted = index === highlightedIndex;
            return (
              <li key={option.value} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onClick={() => selectOption(option)}
                  className={`flex w-full items-center px-3 py-2 text-left text-sm ${
                    isSelected
                      ? 'bg-blue-50 font-semibold text-blue-800'
                      : isHighlighted
                        ? 'bg-slate-50 text-slate-900'
                        : 'text-slate-700'
                  }`}
                >
                  {option.label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
