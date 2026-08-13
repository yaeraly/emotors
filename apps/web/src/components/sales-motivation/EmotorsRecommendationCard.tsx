'use client';

type Props = {
  title: string;
  recommendedSummary: string;
  why: string;
  impactLabel?: string;
  onApply: () => void;
};

export function EmotorsRecommendationCard({
  title,
  recommendedSummary,
  why,
  impactLabel,
  onApply,
}: Props) {
  return (
    <aside className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 shadow-sm">
      <p className="text-sm font-bold text-amber-900">💡 Рекомендуется EMOTORS</p>
      <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-amber-700">{title}</p>
      <p className="mt-2 text-lg font-bold text-slate-950 whitespace-pre-line">{recommendedSummary}</p>
      <div className="mt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Почему рекомендуется именно это значение?</p>
        <p className="mt-1 text-sm text-slate-700">{why}</p>
      </div>
      {impactLabel ? (
        <div className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-sm text-slate-700">
          <p className="font-semibold text-slate-900">Влияние</p>
          <p className="mt-1">{impactLabel}</p>
        </div>
      ) : null}
      <button
        type="button"
        onClick={onApply}
        className="mt-4 w-full rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
      >
        Применить рекомендацию
      </button>
    </aside>
  );
}
