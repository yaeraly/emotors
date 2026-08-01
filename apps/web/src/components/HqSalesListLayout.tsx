import type { ReactNode } from 'react';

type FilterGridProps = {
  children: ReactNode;
  columns?: 2 | 3;
};

/** Filter panel shell shared by HQ Sales «Заказы филиалов» and «Заказы на отправку». */
export function HqSalesListFilterGrid({ children, columns = 3 }: FilterGridProps) {
  const columnClass = columns === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3';
  return (
    <div className={`grid gap-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm ${columnClass}`}>
      {children}
    </div>
  );
}

type TableCardProps = {
  children: ReactNode;
};

/** Scrollable table card shared by HQ Sales list pages. */
export function HqSalesListTableCard({ children }: TableCardProps) {
  return (
    <div className="h-[calc(100vh-300px)] min-h-96 overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
      {children}
    </div>
  );
}

export const hqSalesListFilterControlClass = 'rounded-xl border border-slate-300 px-4 py-3';

export const hqSalesListTableClass = 'min-w-full divide-y divide-slate-200 text-sm';

export const hqSalesListTableHeadClass =
  'sticky top-0 bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500';

export const hqSalesListTableThClass = 'px-4 py-3';

export const hqSalesListTableTdClass = 'px-4 py-3';
