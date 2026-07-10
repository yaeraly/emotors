'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { EntityCombobox } from '@/components/EntityCombobox';
import { API_URL } from '@/lib/api';
import { canManageSvhToHqTransport, canUnlockProcurementOrder, canViewSvhToHqTransport, hasRole } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type TransportCompany = { id: string; name: string; companyCode: string };

type DomesticAttachment = {
  id: string;
  documentType?: string | null;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  uploadedAt?: string;
  uploadedBy?: { fullName?: string } | null;
  receiptNumber?: string | null;
  receiptAmountKgs?: number | null;
  isCurrent?: boolean;
  replacedAt?: string | null;
  replacedBy?: { fullName?: string } | null;
};

type TimelineStep = {
  key: string;
  status: 'pending' | 'active' | 'completed';
  date: string | null;
  responsibleName: string | null;
  labelKey: string;
};

export type DomesticTransportForm = {
  transportCompanyId: string;
  transportCostKgs: string;
  dispatchDate: string;
  receiptNumber: string;
  receiptDate: string;
  receiptAmountKgs: string;
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
  currentReceipt: DomesticAttachment | null;
  attachments: DomesticAttachment[];
  receiptHistory: DomesticAttachment[];
  timeline: TimelineStep[];
  dirty: boolean;
  saving: boolean;
  changeReason: string;
  onChangeReason: (value: string) => void;
  onSave: () => void;
  onUpload: (file: File, documentType: string) => Promise<void>;
  onDeleteAttachment: (attachmentId: string) => Promise<void>;
};

const DOCUMENT_TYPES = ['RECEIPT', 'INVOICE', 'CARGO_PHOTO', 'DELIVERY_NOTE'] as const;
const STATUS_OPTIONS = ['WAITING', 'IN_PROGRESS', 'COMPLETED'] as const;

function formatDate(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('ru-RU');
}

export function DomesticTransportSection({
  user,
  finalized,
  readOnlyFinance,
  canEditSection,
  transportCompanies,
  form,
  onChange,
  currentReceipt,
  attachments,
  receiptHistory,
  timeline,
  dirty,
  saving,
  changeReason,
  onChangeReason,
  onSave,
  onUpload,
  onDeleteAttachment,
}: Props) {
  const { t } = useTranslation();
  const [attachmentType, setAttachmentType] = useState<typeof DOCUMENT_TYPES[number]>('CARGO_PHOTO');
  const [uploading, setUploading] = useState(false);

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

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>, documentType: string) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !canManage) return;
    setUploading(true);
    try {
      await onUpload(file, documentType);
    } finally {
      setUploading(false);
    }
  }

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

      <div className="mb-6 grid gap-3 md:grid-cols-5">
        {timeline.map((step) => (
          <div
            key={step.key}
            className={`rounded-2xl border p-4 ${
              step.status === 'completed'
                ? 'border-emerald-200 bg-emerald-50'
                : step.status === 'active'
                  ? 'border-blue-200 bg-blue-50'
                  : 'border-slate-200 bg-slate-50'
            }`}
          >
            <p className="text-xs font-semibold uppercase text-slate-500">{t(step.labelKey)}</p>
            <p className="mt-1 text-sm font-bold text-slate-900">{formatDate(step.date)}</p>
            <p className="mt-1 text-xs text-slate-600">{step.responsibleName ?? '-'}</p>
          </div>
        ))}
      </div>

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
        <EditableField
          label={t('procurement.domesticTransport.receiptNumber')}
          value={form.receiptNumber}
          onChange={(value) => onChange('receiptNumber', value)}
          disabled={!canEditFields}
        />
        <EditableField
          label={t('procurement.domesticTransport.receiptDate')}
          value={form.receiptDate}
          onChange={(value) => onChange('receiptDate', value)}
          type="date"
          disabled={!canEditFields}
        />
        <EditableField
          label={t('procurement.domesticTransport.receiptAmountKgs')}
          value={form.receiptAmountKgs}
          onChange={(value) => onChange('receiptAmountKgs', value)}
          type="number"
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

      <div className="mt-6 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm font-semibold text-slate-900">{t('procurement.domesticTransport.receipt')}</p>
          {currentReceipt ? (
            <a href={`${API_URL}${currentReceipt.fileUrl}`} target="_blank" rel="noreferrer" className="text-sm font-semibold text-blue-700">
              {currentReceipt.fileName}
            </a>
          ) : (
            <span className="text-sm text-slate-500">-</span>
          )}
          {canEditFields ? (
            <label className="cursor-pointer rounded-xl border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-700">
              {currentReceipt ? t('procurement.domesticTransport.replaceReceipt') : t('procurement.domesticTransport.uploadReceipt')}
              <input
                type="file"
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                disabled={uploading}
                onChange={(e) => void handleFileChange(e, 'RECEIPT')}
              />
            </label>
          ) : null}
        </div>

        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <p className="font-semibold text-slate-900">{t('procurement.domesticTransport.attachments')}</p>
            {canEditFields ? (
              <>
                <select
                  value={attachmentType}
                  onChange={(e) => setAttachmentType(e.target.value as typeof DOCUMENT_TYPES[number])}
                  className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
                >
                  {DOCUMENT_TYPES.map((type) => (
                    <option key={type} value={type}>{t(`procurement.domesticTransport.documentType.${type}`)}</option>
                  ))}
                </select>
                <label className="cursor-pointer rounded-xl border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-700">
                  {t('procurement.domesticTransport.uploadAttachment')}
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    disabled={uploading}
                    onChange={(e) => void handleFileChange(e, attachmentType)}
                  />
                </label>
              </>
            ) : null}
          </div>
          {attachments.length ? (
            <ul className="space-y-2">
              {attachments.map((attachment) => (
                <li key={attachment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm">
                  <div>
                    <p className="font-semibold">
                      {t(`procurement.domesticTransport.documentType.${attachment.documentType ?? 'RECEIPT'}`)} · {attachment.fileName}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatDate(attachment.uploadedAt)} · {attachment.uploadedBy?.fullName ?? '-'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <a href={`${API_URL}${attachment.fileUrl}`} target="_blank" rel="noreferrer" className="font-semibold text-blue-700">
                      {t('common.open')}
                    </a>
                    {isCeo && !finalized ? (
                      <button type="button" onClick={() => void onDeleteAttachment(attachment.id)} className="font-semibold text-red-700">
                        {t('common.delete')}
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">{t('procurement.domesticTransport.noAttachments')}</p>
          )}
        </div>

        {receiptHistory.length > 0 ? (
          <div className="rounded-2xl border border-slate-200 p-4">
            <p className="mb-3 font-semibold text-slate-900">{t('procurement.domesticTransport.receiptHistory')}</p>
            <ul className="space-y-2 text-sm">
              {receiptHistory.map((item) => (
                <li key={item.id} className="rounded-xl bg-slate-50 px-3 py-2">
                  <p className="font-semibold">{item.fileName}</p>
                  <p className="text-xs text-slate-500">
                    {t('procurement.domesticTransport.uploadedAt')}: {formatDate(item.uploadedAt)} · {item.uploadedBy?.fullName ?? '-'}
                  </p>
                  <p className="text-xs text-slate-500">
                    {t('procurement.domesticTransport.receiptNumber')}: {item.receiptNumber ?? '-'} · {t('procurement.domesticTransport.receiptAmountKgs')}: {item.receiptAmountKgs ?? '-'}
                  </p>
                  {item.replacedAt ? (
                    <p className="text-xs text-amber-700">
                      {t('procurement.domesticTransport.replacedAt')}: {formatDate(item.replacedAt)} · {item.replacedBy?.fullName ?? '-'}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
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
