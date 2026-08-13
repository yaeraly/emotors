'use client';

import { useMemo, useState } from 'react';
import type { Warehouse } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type HqWarehouseMultiSelectProps = {
  warehouses: Warehouse[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
};

export function HqWarehouseMultiSelect({
  warehouses,
  selectedIds,
  onChange,
  disabled = false,
}: HqWarehouseMultiSelectProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return warehouses;
    return warehouses.filter(
      (warehouse) =>
        warehouse.name.toLowerCase().includes(query) ||
        warehouse.code.toLowerCase().includes(query) ||
        (warehouse.city ?? '').toLowerCase().includes(query),
    );
  }, [search, warehouses]);

  function toggle(warehouseId: string) {
    if (disabled) return;
    if (selectedIds.includes(warehouseId)) {
      onChange(selectedIds.filter((id) => id !== warehouseId));
      return;
    }
    onChange([...selectedIds, warehouseId]);
  }

  return (
    <fieldset className="rounded-2xl border border-slate-200 p-4 md:col-span-2">
      <legend className="px-1 text-sm font-semibold text-slate-700">{t('users.assignedHqWarehouses')}</legend>
      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={t('users.searchHqWarehouses')}
        disabled={disabled}
        className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
      />
      <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-sm text-slate-500">{t('users.noHqWarehousesFound')}</p>
        ) : (
          filtered.map((warehouse) => (
            <label
              key={warehouse.id}
              className={`flex items-start gap-3 rounded-xl border px-3 py-2 text-sm ${
                selectedIds.includes(warehouse.id) ? 'border-blue-200 bg-blue-50' : 'border-slate-200'
              }`}
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(warehouse.id)}
                onChange={() => toggle(warehouse.id)}
                disabled={disabled}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600"
              />
              <span>
                <span className="block font-semibold text-slate-900">{warehouse.name}</span>
                <span className="block text-xs text-slate-500">
                  {warehouse.code}
                  {warehouse.city ? ` · ${warehouse.city}` : ''}
                </span>
              </span>
            </label>
          ))
        )}
      </div>
    </fieldset>
  );
}
