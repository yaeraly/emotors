'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from '@/i18n/useTranslation';

const REASON_CODES = [
  'MARKET_PRICE',
  'PRODUCT_SPECIFIC_MARGIN',
  'COMPETITION',
  'SLOW_MOVING_PRODUCT',
  'HIGH_DEMAND',
  'PROMOTION',
  'STRATEGIC_PRODUCT',
  'MANAGEMENT_DECISION',
  'OTHER',
] as const;

type ReasonCode = (typeof REASON_CODES)[number];

type MaximumMarkupOverrideModalProps = {
  open: boolean;
  title: string;
  inheritedMaximumMarkupPercent: number;
  currentOverridePercent: number | null;
  onClose: () => void;
  onSubmit: (payload: {
    overridePercent: number;
    overrideReasonCode: ReasonCode;
    overrideReasonComment?: string;
  }) => Promise<void>;
};

export function MaximumMarkupOverrideModal({
  open,
  title,
  inheritedMaximumMarkupPercent,
  currentOverridePercent,
  onClose,
  onSubmit,
}: MaximumMarkupOverrideModalProps) {
  const { t } = useTranslation();
  const [overridePercent, setOverridePercent] = useState(
    currentOverridePercent ?? inheritedMaximumMarkupPercent,
  );
  const [reasonCode, setReasonCode] = useState<ReasonCode>('MANAGEMENT_DECISION');
  const [reasonComment, setReasonComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setOverridePercent(currentOverridePercent ?? inheritedMaximumMarkupPercent);
    setReasonCode('MANAGEMENT_DECISION');
    setReasonComment('');
    setError('');
  }, [open, currentOverridePercent, inheritedMaximumMarkupPercent]);

  if (!open) return null;

  async function handleSubmit() {
    if (reasonCode === 'OTHER' && !reasonComment.trim()) {
      setError(t('pricing.overrideReasonCommentRequired'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSubmit({
        overridePercent,
        overrideReasonCode: reasonCode,
        overrideReasonComment: reasonComment.trim() || undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <p className="mt-2 text-sm text-slate-600">
          {t('pricing.inheritedMaximumMarkup')}: {inheritedMaximumMarkupPercent.toFixed(2)}%
        </p>

        <label className="mt-4 block text-sm font-medium text-slate-700">
          {t('pricing.colMaxMarkup')}
          <input
            type="number"
            min="0"
            step="0.01"
            value={overridePercent}
            onChange={(e) => setOverridePercent(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="mt-4 block text-sm font-medium text-slate-700">
          {t('pricing.overrideReason')}
          <select
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value as ReasonCode)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {REASON_CODES.map((code) => (
              <option key={code} value={code}>
                {t(`pricing.overrideReasonCode.${code}`)}
              </option>
            ))}
          </select>
        </label>

        {reasonCode === 'OTHER' ? (
          <label className="mt-4 block text-sm font-medium text-slate-700">
            {t('pricing.overrideReasonComment')}
            <textarea
              value={reasonComment}
              onChange={(e) => setReasonComment(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        ) : null}

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSubmit()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? '…' : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
