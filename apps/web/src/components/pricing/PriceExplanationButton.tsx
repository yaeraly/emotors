'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { canViewPriceExplanation } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type ExplanationLine = {
  key: string;
  label: string;
  previousValueKgs: number | null;
  adjustment: string | null;
  resultingValueKgs: number | null;
  valueKgs: number | null;
  percent: number | null;
  detail: string | null;
  applied: boolean;
};

type Explanation = {
  currency: string;
  lines: ExplanationLine[];
  finalPriceKgs: number;
  appliedRuleType: string;
  pricingProfileName: string | null;
};

type Props = {
  productId: string;
  branchId?: string | null;
  priceType?: string;
};

export function PriceExplanationButton({
  productId,
  branchId,
  priceType = 'BRANCH_PURCHASE',
}: Props) {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [resolvedBranchId, setResolvedBranchId] = useState(branchId ?? '');

  useEffect(() => {
    void apiFetch<User>('/auth/me').then(setUser).catch(() => null);
  }, []);

  useEffect(() => {
    setResolvedBranchId(branchId ?? '');
  }, [branchId]);

  if (!canViewPriceExplanation(user)) return null;

  async function loadExplanation() {
    setLoading(true);
    setError('');
    try {
      let targetBranchId = resolvedBranchId;
      if (!targetBranchId) {
        const branches = await apiFetch<Array<{ id: string; code: string; branchType: string }>>(
          '/branches',
        );
        const branch =
          branches.find((row) => row.branchType !== 'HQ_BRANCH' && row.code !== 'HQ') ??
          branches[0];
        if (!branch) throw new Error(t('pricing.explanationNoBranch'));
        targetBranchId = branch.id;
        setResolvedBranchId(branch.id);
      }

      const data = await apiFetch<Explanation>(
        `/pricing/explain?productId=${encodeURIComponent(productId)}&branchId=${encodeURIComponent(targetBranchId)}&priceType=${encodeURIComponent(priceType)}`,
      );
      setExplanation(data);
      setOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
      setOpen(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        title={t('pricing.explanationTitle')}
        disabled={loading}
        onClick={() => void loadExplanation()}
        className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
      >
        i
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-7 w-80 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t('pricing.explanationTitle')}
            </p>
            <button
              type="button"
              className="text-xs text-slate-400 hover:text-slate-700"
              onClick={() => setOpen(false)}
            >
              ✕
            </button>
          </div>
          {error ? <p className="text-xs text-red-600">{error}</p> : null}
          {explanation ? (
            <ol className="space-y-2 text-xs text-slate-700">
              {explanation.lines.map((line, index) => (
                <li key={line.key} className="border-b border-slate-100 pb-2 last:border-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-800">
                      {index > 0 ? '↓ ' : ''}
                      {line.label}
                    </span>
                    {!line.applied && line.key !== 'fifoCost' && line.key !== 'hqFranchiseMarkup' && line.key !== 'finalPrice' ? (
                      <span className="text-slate-400">{t('pricing.explanationNone')}</span>
                    ) : null}
                  </div>
                  <div className="mt-1 grid grid-cols-3 gap-1 text-[11px] text-slate-500">
                    <span>
                      {t('pricing.explanationPrevious')}:{' '}
                      {line.previousValueKgs != null
                        ? `${Math.round(line.previousValueKgs)}`
                        : '—'}
                    </span>
                    <span>
                      {t('pricing.explanationAdjustment')}: {line.adjustment ?? '—'}
                    </span>
                    <span className="text-right font-semibold text-slate-800">
                      {line.resultingValueKgs != null
                        ? `${Math.round(line.resultingValueKgs)} ${explanation.currency}`
                        : '—'}
                    </span>
                  </div>
                </li>
              ))}
              {explanation.pricingProfileName ? (
                <li className="pt-1 text-[11px] text-slate-400">
                  {t('pricing.profile')}: {explanation.pricingProfileName}
                </li>
              ) : null}
            </ol>
          ) : null}
        </div>
      ) : null}
    </span>
  );
}
