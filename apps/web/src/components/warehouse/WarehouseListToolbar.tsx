'use client';

import type { StatusFilter } from '@/lib/warehouse-list-utils';
import { useTranslation } from '@/i18n/useTranslation';

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
}: Props) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-nowrap">
      <label className="block min-w-[140px] flex-[1.2] lg:max-w-[220px]">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('common.search')}</span>
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
          className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="block min-w-[120px] flex-1 lg:max-w-[180px]">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('warehouse.region')}</span>
        <select
          value={region}
          onChange={(event) => onRegionChange(event.target.value)}
          className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">{t('common.all')}</option>
          {regionOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <label className="block min-w-[120px] flex-1 lg:max-w-[180px]">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('hqWarehouse.city')}</span>
        <select
          value={city}
          onChange={(event) => onCityChange(event.target.value)}
          className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">{t('common.all')}</option>
          {cityOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <label className="block min-w-[120px] flex-1 lg:max-w-[160px]">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('common.status')}</span>
        <select
          value={status}
          onChange={(event) => onStatusChange(event.target.value as StatusFilter)}
          className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="all">{t('common.all')}</option>
          <option value="active">{t('warehouse.active')}</option>
          <option value="inactive">{t('warehouse.inactive')}</option>
        </select>
      </label>
    </div>
  );
}
