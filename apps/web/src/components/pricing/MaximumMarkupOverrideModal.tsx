'use client';

import { useEffect, useRef, useState } from 'react';
import { formatCompactMoney, formatCompactPercent } from '@/components/pricing/pricing-markup-table-ui';
import { apiFetch } from '@/lib/api';
import type { MarkupPreviewResponse } from '@/lib/pricing-markup-preview';
import { useTranslation } from '@/i18n/useTranslation';

import { toast } from '@/lib/toast';

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
  channel: 'retail' | 'wholesale';
  productId?: string;
  minimumMarkupPercent?: number;
  recommendedMarkupPercent?: number;
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
  channel,
  productId,
  minimumMarkupPercent = 0,
  recommendedMarkupPercent = 0,
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
  const [previewMaxPrice, setPreviewMaxPrice] = useState<number | null>(null);
  const [previewMaxMarkup, setPreviewMaxMarkup] = useState<number | null>(null);
  const [previewFlash, setPreviewFlash] = useState(false);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    setOverridePercent(currentOverridePercent ?? inheritedMaximumMarkupPercent);
    setReasonCode('MANAGEMENT_DECISION');
    setReasonComment('');
    setError('');
    setPreviewMaxPrice(null);
    setPreviewMaxMarkup(null);
  }, [open, currentOverridePercent, inheritedMaximumMarkupPercent]);

  useEffect(() => {
    if (!open || !productId) return;
    if (!Number.isFinite(overridePercent) || overridePercent < 0) {
      setError(t('pricing.validationMarkupNegative'));
      return;
    }

    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => {
      previewControllerRef.current?.abort();
      const controller = new AbortController();
      previewControllerRef.current = controller;

      const payload =
        channel === 'retail'
          ? {
              minimumSellingMarkupPercent: minimumMarkupPercent,
              recommendedRetailMarkupPercent: recommendedMarkupPercent,
              maximumRetailMarkupOverridePercent: overridePercent,
            }
          : {
              minimumWholesaleMarkupPercent: minimumMarkupPercent,
              recommendedWholesaleMarkupPercent: recommendedMarkupPercent,
              maximumWholesaleMarkupOverridePercent: overridePercent,
            };

      void apiFetch<MarkupPreviewResponse>(`/pricing/${channel}/${productId}/preview`, {
        method: 'POST',
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
        .then((result) => {
          if (result.validationStatus === 'ERROR' || !result.preview) {
            setError(result.validationErrors[0] ?? t('common.error'));
            return;
          }
          setError('');
          setPreviewMaxPrice((current) => {
            if (current != null && current !== result.preview!.maximumPriceKgs) {
              setPreviewFlash(true);
              setTimeout(() => setPreviewFlash(false), 650);
            }
            return result.preview!.maximumPriceKgs;
          });
          setPreviewMaxMarkup(result.preview.effectiveMaximumMarkupPercent);
        })
        .catch((err) => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          setError(err instanceof Error ? err.message : t('common.error'));
        });
    }, 300);

    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
      previewControllerRef.current?.abort();
    };
  }, [
    channel,
    minimumMarkupPercent,
    open,
    overridePercent,
    productId,
    recommendedMarkupPercent,
    t,
  ]);

  if (!open) return null;

  async function handleSubmit() {
    if (reasonCode === 'OTHER' && !reasonComment.trim()) {
      setError(t('pricing.overrideReasonCommentRequired'));
      return;
    }
    if (error) return;
    setSaving(true);
    try {
      await onSubmit({
        overridePercent,
        overrideReasonCode: reasonCode,
        overrideReasonComment: reasonComment.trim() || undefined,
      });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <p className="mt-2 text-sm text-slate-600">
          {t('pricing.inheritedMaximumMarkup')}: {formatCompactPercent(inheritedMaximumMarkupPercent)}
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

        {previewMaxPrice != null ? (
          <p
            className={`mt-3 rounded-lg px-3 py-2 text-sm transition-colors duration-500 ${
              previewFlash ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-50 text-slate-700'
            }`}
          >
            {t('pricing.compactCol.maxPrice')}: {formatCompactMoney(previewMaxPrice)}
            {previewMaxMarkup != null ? ` (${formatCompactPercent(previewMaxMarkup)})` : ''}
          </p>
        ) : null}

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
            disabled={saving || !!error}
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
