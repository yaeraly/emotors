'use client';

import { WarehouseSummaryCard } from './WarehouseSummaryCard';

type SummaryItem = {
  label: string;
  value: string;
};

type Props = {
  loading?: boolean;
  items: SummaryItem[];
  skeletonCount?: number;
};

export function WarehouseSummaryGrid({ loading = false, items, skeletonCount = 4 }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 lg:gap-3">
        {Array.from({ length: skeletonCount }).map((_, index) => (
          <div key={index} className="animate-pulse rounded-xl border border-slate-200 bg-white px-2.5 py-2 sm:px-3 sm:py-2.5">
            <div className="h-3 w-16 rounded bg-slate-200" />
            <div className="mt-2 h-6 w-12 rounded bg-slate-200" />
          </div>
        ))}
      </div>
    );
  }

  const columnClass =
    items.length >= 6
      ? 'grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 lg:gap-3'
      : 'grid grid-cols-2 gap-2 sm:grid-cols-2 lg:grid-cols-4 lg:gap-3';

  return (
    <div className={columnClass}>
      {items.map((item) => (
        <WarehouseSummaryCard key={item.label} compact label={item.label} value={item.value} />
      ))}
    </div>
  );
}
