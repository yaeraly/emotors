'use client';

import type { ReactNode } from 'react';

type Props = {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
};

export function WarehousePageHeader({ eyebrow, title, description, action }: Props) {
  return (
    <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{eyebrow}</p>
        <h2 className="text-3xl font-bold text-slate-950">{title}</h2>
        {description ? <p className="mt-2 text-slate-500">{description}</p> : null}
      </div>
      {action ? <div className="flex flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}
