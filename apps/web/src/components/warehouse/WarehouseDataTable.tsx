'use client';

import type { ReactNode } from 'react';
import type { SortDirection } from '@/lib/warehouse-list-utils';

export type WarehouseTableColumn<T> = {
  key: string;
  label: string;
  sortable?: boolean;
  className?: string;
  render: (row: T) => ReactNode;
};

type Props<T> = {
  columns: WarehouseTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  sortKey: string;
  sortDirection: SortDirection;
  onSort: (key: string) => void;
  emptyLabel: string;
};

export function WarehouseDataTable<T>({
  columns,
  rows,
  rowKey,
  sortKey,
  sortDirection,
  onSort,
  emptyLabel,
}: Props<T>) {
  return (
    <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={`px-4 py-3 ${column.className ?? ''}`}>
                {column.sortable ? (
                  <button
                    type="button"
                    onClick={() => onSort(column.key)}
                    className="inline-flex items-center gap-1 hover:text-blue-700"
                  >
                    <span>{column.label}</span>
                    {sortKey === column.key ? (
                      <span aria-hidden>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    ) : null}
                  </button>
                ) : (
                  column.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-slate-500">
                {emptyLabel}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((column) => (
                  <td key={column.key} className={`px-4 py-3 ${column.className ?? ''}`}>
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
