'use client';

import type { ReactNode } from 'react';

export type WarehouseProfileField = {
  label: string;
  value: string;
  className?: string;
};

type Props = {
  fields: WarehouseProfileField[];
  action?: ReactNode;
  children?: ReactNode;
};

export function WarehouseProfileCard({ fields, action, children }: Props) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      {action ? <div className="mb-4 flex flex-wrap justify-end gap-2">{action}</div> : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {fields.map((field) => (
          <div key={field.label} className={field.className}>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{field.label}</p>
            <p className="mt-1 text-sm font-medium text-slate-900">{field.value}</p>
          </div>
        ))}
      </div>
      {children}
    </div>
  );
}
