'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { EntityCombobox } from '@/components/EntityCombobox';
import { canManageSvhToHqTransport, canUnlockProcurementOrder, canViewSvhToHqTransport, hasRole } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type TransportCompany = { id: string; name: string; companyCode: string };

export type DomesticTransportForm = {
  transportCompanyId: string;
  transportCostKgs: string;
  dispatchDate: string;
  notes: string;
  status: 'WAITING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
};

type Props = {
  user: User | null;
  finalized: boolean;
  readOnlyFinance: boolean;
  canEditSection: boolean;
  transportCompanies: TransportCompany[];
  form: DomesticTransportForm;
  onChange: <K extends keyof DomesticTransportForm>(key: K, value: DomesticTransportForm[K]) => void;
  dirty: boolean;
  saving: boolean;
  changeReason: string;
  onChangeReason: (value: string) => void;
  onSave: () => void;
};

const STATUS_OPTIONS = ['WAITING', 'IN_PROGRESS', 'COMPLETED'] as const;

export function DomesticTransportSection({
  user,
  finalized,
  readOnlyFinance,
  canEditSection,
  transportCompanies,
  form,
  onChange,
  dirty,
  saving,
  changeReason,
  onChangeReason,
  onSave,
}: Props) {
  const { t } = useTranslation();

  const canManage = canManageSvhToHqTransport(user);
  const canView = canViewSvhToHqTransport(user);
  const isCeo = canUnlockProcurementOrder(user);
  const isWm = hasRole(user, 'WAREHOUSE_MANAGER') && !canManage && !isCeo;
  const canEditFields = (canManage || isCeo) && !readOnlyFinance && !isWm && (!finalized || isCeo);
  const carrierOptions = useMemo(
    () => transportCompanies.map((company) => ({
      value: company.id,
      label: `${company.name} (${company.companyCode})`,
    })),
    [transportCompanies],
  );

  if (!canView) return null;

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-bold">{t('procurement.orders.domesticTransportKyrgyzstan')}</h3>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase text-slate-700">
          {t(`procurement.domesticTransport.status.${form.status}`)}
        </span>
      </div>

      {!canEditSection ? (
        <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{t('procurement.domesticTransport.notEligible')}</p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <EntityCombobox
          label={t('procurement.domesticTransport.carrier')}
          value={form.transportCompanyId}
          options={carrierOptions}
          onChange={(value) => onChange('transportCompanyId', value)}
          disabled={!canEditFields}
        />
        {canEditFields ? (
          <div className="flex items-end">
            <Link
              href="/procurement/transport-companies/new"
              className="rounded-xl border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700"
            >
              {t('procurement.domesticTransport.createCarrier')}
            </Link>
          </div>
        ) : null}
        <EditableField
          label={t('procurement.domesticTransport.costKgs')}
          value={form.transportCostKgs}
          onChange={(value) => onChange('transportCostKgs', value)}
          type="number"
          disabled={!canEditFields}
        />
        <EditableField
          label={t('procurement.domesticTransport.transportDate')}
          value={form.dispatchDate}
          onChange={(value) => onChange('dispatchDate', value)}
          type="date"
          disabled={!canEditFields}
        />
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">{t('procurement.domesticTransport.statusLabel')}</span>
          <select
            value={form.status}
            onChange={(e) => onChange('status', e.target.value as DomesticTransportForm['status'])}
            disabled={!canEditFields}
            className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 disabled:bg-slate-100"
          >
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>{t(`procurement.domesticTransport.status.${status}`)}</option>
            ))}
          </select>
        </label>
        <EditableField
          label={t('procurement.domesticTransport.notes')}
          value={form.notes}
          onChange={(value) => onChange('notes', value)}
          disabled={!canEditFields}
        />
      </div>

      {finalized && isCeo ? (
        <div className="mt-4">
          <label className="block text-sm font-semibold text-slate-700">{t('procurement.transport.changeReasonRequired')}</label>
          <textarea
            value={changeReason}
            onChange={(e) => onChangeReason(e.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            rows={2}
          />
        </div>
      ) : null}

      {(canEditFields && !finalized) || (finalized && isCeo && !readOnlyFinance) ? (
        <button
          type="button"
          disabled={saving || !dirty}
          onClick={onSave}
          className="mt-4 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:bg-blue-300"
        >
          {saving ? t('common.loading') : t('procurement.transport.save')}
        </button>
      ) : null}
    </section>
  );
}

function EditableField({
  label,
  value,
  onChange,
  type = 'text',
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input
        type={type}
        step={type === 'number' ? '0.01' : undefined}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 disabled:bg-slate-100"
      />
    </label>
  );
}
