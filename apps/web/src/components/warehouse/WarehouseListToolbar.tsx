'use client';

import type { StatusFilter } from '@/lib/warehouse-list-utils';
import { useTranslation } from '@/i18n/useTranslation';

export type WarehouseBranchFilterOption = {
  id: string;
  name: string;
};

type Props = {
  search: string;
  region: string;
  city: string;
  status: StatusFilter;
  regionOptions: string[];
  cityOptions: string[];
  onSearchChange: (value: string) => void;
  onRegionChange: (value: string) => void;
  onCityChange: (value: string) => void;
  onStatusChange: (value: StatusFilter) => void;
  searchPlaceholder: string;
  branchId?: string;
  branchOptions?: WarehouseBranchFilterOption[];
  onBranchChange?: (value: string) => void;
  onClear?: () => void;
};

export function WarehouseListToolbar({
  search,
  region,
  city,
  status,
  regionOptions,
  cityOptions,
  onSearchChange,
  onRegionChange,
  onCityChange,
  onStatusChange,
  searchPlaceholder,
  branchId = '',
  branchOptions,
  onBranchChange,
  onClear,
}: Props) {
  const { t } = useTranslation();
  const showBranchFilter = Boolean(branchOptions && onBranchChange);

  return (
    <div className="flex min-w-0 flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:gap-3 sm:p-4 lg:flex-nowrap">
      <label className="block min-w-0 w-full flex-[2_1_12rem] sm:min-w-[8rem] lg:min-w-[10rem]">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('common.search')}</span>
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
          className="mt-1.5 w-full min-w-0 rounded-xl border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      {showBranchFilter ? (
        <label className="block min-w-0 w-[calc(50%-0.25rem)] flex-1 sm:w-auto sm:min-w-[6.5rem]">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t('branchWarehouse.filterBranch')}
          </span>
          <select
            value={branchId}
            onChange={(event) => onBranchChange?.(event.target.value)}
            className="mt-1.5 w-full min-w-0 rounded-xl border border-slate-300 px-2 py-2 text-sm"
          >
            <option value="">{t('branchWarehouse.allBranches')}</option>
            {branchOptions?.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="block min-w-0 w-[calc(50%-0.25rem)] flex-1 sm:w-auto sm:min-w-[6.5rem]">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('warehouse.region')}</span>
        <select
          value={region}
          onChange={(event) => onRegionChange(event.target.value)}
          className="mt-1.5 w-full min-w-0 rounded-xl border border-slate-300 px-2 py-2 text-sm"
        >
          <option value="">{t('common.all')}</option>
          {regionOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <label className="block min-w-0 w-[calc(50%-0.25rem)] flex-1 sm:w-auto sm:min-w-[6.5rem]">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('hqWarehouse.city')}</span>
        <select
          value={city}
          onChange={(event) => onCityChange(event.target.value)}
          className="mt-1.5 w-full min-w-0 rounded-xl border border-slate-300 px-2 py-2 text-sm"
        >
          <option value="">{t('common.all')}</option>
          {cityOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <label className="block min-w-0 w-full flex-1 sm:w-auto sm:min-w-[6rem] lg:max-w-[9rem]">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('common.status')}</span>
        <select
          value={status}
          onChange={(event) => onStatusChange(event.target.value as StatusFilter)}
          className="mt-1.5 w-full min-w-0 rounded-xl border border-slate-300 px-2 py-2 text-sm"
        >
          <option value="all">{t('common.all')}</option>
          <option value="active">{t('warehouse.active')}</option>
          <option value="inactive">{t('warehouse.inactive')}</option>
        </select>
      </label>
      {onClear ? (
        <button
          type="button"
          onClick={onClear}
          className="mt-1.5 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          {t('branches.clearFilters')}
        </button>
      ) : null}
    </div>
  );
}
