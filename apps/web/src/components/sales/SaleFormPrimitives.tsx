'use client';

import type { ReactNode } from 'react';

export function SaleFormSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-bold text-slate-950">{title}</h3>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function SaleInput({
  label,
  labelAccessory,
  value,
  onChange,
  required,
  type = 'text',
  readOnly,
  error,
  min,
  step,
}: {
  label: string;
  labelAccessory?: ReactNode;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  readOnly?: boolean;
  error?: string;
  min?: number | string;
  step?: number | string;
}) {
  return (
    <label className="block min-w-0">
      <span className="flex items-center gap-1 text-sm font-semibold text-slate-700">
        <span className="truncate">{label}</span>
        {labelAccessory}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        readOnly={readOnly}
        type={type}
        min={min}
        step={step}
        className={`mt-2 w-full min-w-0 rounded-xl border px-3 py-2 outline-none ring-blue-500 focus:ring-2 ${
          readOnly ? 'border-slate-200 bg-slate-100 text-slate-700' : 'border-slate-300'
        } ${error ? 'border-red-300' : ''}`}
      />
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </label>
  );
}

export function SaleFormSummary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-950">{value}</p>
    </div>
  );
}

export function formatMoneyKgs(value: number | string | null | undefined) {
  return `${Number(value ?? 0).toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} сом`;
}

export function formatCompactDate(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
