'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/i18n/useTranslation';

export const markupTable = {
  wrapper: 'overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm',
  table: 'w-full table-fixed divide-y divide-slate-200 text-xs',
  thead: 'bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500',
  thBase: 'px-1.5 py-1.5 whitespace-nowrap',
  thProduct: 'w-[19%] min-w-[108px] px-2 py-1.5 text-left',
  thCategory: 'w-[7%] min-w-[44px] px-1 py-1.5 text-center',
  thPercent: 'w-[5.5%] min-w-[42px] px-1 py-1.5 text-center',
  thMoney: 'w-[5.5%] min-w-[44px] px-1 py-1.5 text-right',
  thUpdated: 'w-[9%] min-w-[68px] px-1 py-1.5 text-center',
  thActions: 'w-[4%] min-w-[36px] px-1 py-1.5 text-center',
  tdProduct: 'px-2 py-1.5 align-middle',
  tdCategory: 'px-1 py-1.5 align-middle text-center truncate',
  tdPercent: 'px-1 py-1.5 align-middle text-center whitespace-nowrap tabular-nums',
  tdMoney: 'px-1 py-1.5 align-middle text-right whitespace-nowrap tabular-nums',
  tdUpdated: 'px-1 py-1.5 align-middle text-center text-[10px] text-slate-500 whitespace-nowrap',
  tdActions: 'px-1 py-1.5 align-middle text-center',
  input:
    'w-[3.25rem] max-w-full rounded border px-1 py-0.5 text-xs text-center tabular-nums disabled:bg-slate-50',
  productName: 'truncate font-semibold text-slate-900',
  productSku: 'truncate text-[10px] text-slate-500',
} as const;

export const markupGroup = {
  min: {
    cell: 'bg-amber-50/90',
    input: 'border-amber-200 bg-amber-50/50 focus:border-amber-400 focus:ring-1 focus:ring-amber-100',
    price: 'bg-amber-50/90 text-amber-950',
  },
  rec: {
    cell: 'bg-emerald-50/90',
    input: 'border-emerald-200 bg-emerald-50/50 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-100',
    price: 'bg-emerald-50/90 text-emerald-950',
  },
  max: {
    cell: 'bg-rose-50/90',
    input: 'border-rose-200 bg-rose-50/50 focus:border-rose-400 focus:ring-1 focus:ring-rose-100',
    price: 'bg-rose-50/90 text-rose-950',
  },
} as const;

export function CompactHeaderCell({
  label,
  tooltip,
  className,
}: {
  label: string;
  tooltip: string;
  className: string;
}) {
  return (
    <th title={tooltip} className={`${markupTable.thBase} ${className}`}>
      {label}
    </th>
  );
}

export function MarkupTableHeaders() {
  const { t } = useTranslation();

  return (
    <tr>
      <CompactHeaderCell
        label={t('pricing.colProduct')}
        tooltip={t('pricing.colProduct')}
        className={markupTable.thProduct}
      />
      <CompactHeaderCell
        label={t('pricing.compactCol.category')}
        tooltip={t('pricing.tooltip.category')}
        className={markupTable.thCategory}
      />
      <CompactHeaderCell
        label={t('pricing.compactCol.purchase')}
        tooltip={t('pricing.tooltip.purchase')}
        className={markupTable.thMoney}
      />
      <CompactHeaderCell
        label={t('pricing.colMinMarkup')}
        tooltip={t('pricing.tooltip.minMarkup')}
        className={markupTable.thPercent}
      />
      <CompactHeaderCell
        label={t('pricing.colMinimumPrice')}
        tooltip={t('pricing.tooltip.minPrice')}
        className={markupTable.thMoney}
      />
      <CompactHeaderCell
        label={t('pricing.colRecommendedMarkup')}
        tooltip={t('pricing.tooltip.recMarkup')}
        className={markupTable.thPercent}
      />
      <CompactHeaderCell
        label={t('pricing.compactCol.recPrice')}
        tooltip={t('pricing.tooltip.recPrice')}
        className={markupTable.thMoney}
      />
      <CompactHeaderCell
        label={t('pricing.colMaxMarkup')}
        tooltip={t('pricing.tooltip.maxMarkup')}
        className={markupTable.thPercent}
      />
      <CompactHeaderCell
        label={t('pricing.compactCol.maxPrice')}
        tooltip={t('pricing.tooltip.maxPrice')}
        className={markupTable.thMoney}
      />
      <CompactHeaderCell
        label={t('pricing.compactCol.actions')}
        tooltip={t('pricing.tooltip.actions')}
        className={markupTable.thActions}
      />
    </tr>
  );
}

export function formatCompactMoney(value: number) {
  return new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatCompactPercent(value: number) {
  return `${value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)}%`;
}

export function formatCompactDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function MaximumMarkupSourceDot({
  source,
  inheritedLabel,
  ceoLabel,
}: {
  source: 'INHERITED' | 'CEO_PRODUCT_OVERRIDE';
  inheritedLabel: string;
  ceoLabel: string;
}) {
  const isOverride = source === 'CEO_PRODUCT_OVERRIDE';
  return (
    <span
      title={isOverride ? ceoLabel : inheritedLabel}
      className={`ml-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full align-middle ${
        isOverride ? 'bg-amber-500' : 'bg-slate-300'
      }`}
      aria-label={isOverride ? ceoLabel : inheritedLabel}
    />
  );
}

type RowActionsMenuProps = {
  disabled: boolean;
  canSave: boolean;
  isDirty: boolean;
  hasOverride: boolean;
  onSave: () => void;
  onCancel: () => void;
  onOverride: () => void;
  onRestore: () => void;
  saveLabel: string;
  cancelLabel: string;
  overrideLabel: string;
  restoreLabel: string;
};

export function RowActionsMenu({
  disabled,
  canSave,
  isDirty,
  hasOverride,
  onSave,
  onCancel,
  onOverride,
  onRestore,
  saveLabel,
  cancelLabel,
  overrideLabel,
  restoreLabel,
}: RowActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        disabled={disabled}
        title={saveLabel}
        onClick={() => setOpen((current) => !current)}
        className="rounded px-1.5 py-0.5 text-sm font-bold leading-none text-slate-600 hover:bg-slate-100 disabled:opacity-50"
      >
        •••
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-1 min-w-[9.5rem] rounded-lg border border-slate-200 bg-white py-1 text-left text-[11px] shadow-lg">
          <button
            type="button"
            disabled={!canSave}
            onClick={() => {
              setOpen(false);
              onSave();
            }}
            className="block w-full px-2.5 py-1.5 text-left font-semibold hover:bg-slate-50 disabled:opacity-50"
          >
            {saveLabel}
          </button>
          {isDirty ? (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onCancel();
              }}
              className="block w-full px-2.5 py-1.5 text-left hover:bg-slate-50"
            >
              {cancelLabel}
            </button>
          ) : null}
          {hasOverride ? (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onRestore();
              }}
              className="block w-full px-2.5 py-1.5 text-left hover:bg-slate-50"
            >
              {restoreLabel}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onOverride();
              }}
              className="block w-full px-2.5 py-1.5 text-left hover:bg-slate-50"
            >
              {overrideLabel}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
