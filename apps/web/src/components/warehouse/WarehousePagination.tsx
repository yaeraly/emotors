'use client';

import { useTranslation } from '@/i18n/useTranslation';

type Props = {
  currentPage: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
};

export function WarehousePagination({ currentPage, totalPages, total, pageSize, onPageChange }: Props) {
  const { t } = useTranslation();

  if (total === 0) return null;

  const from = (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
      <p>
        {t('warehouse.paginationSummary')
          .replace('{from}', String(from))
          .replace('{to}', String(to))
          .replace('{total}', String(total))}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 font-semibold disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t('common.back')}
        </button>
        <span className="font-semibold text-slate-900">
          {currentPage} / {totalPages}
        </span>
        <button
          type="button"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 font-semibold disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t('common.next')}
        </button>
      </div>
    </div>
  );
}
