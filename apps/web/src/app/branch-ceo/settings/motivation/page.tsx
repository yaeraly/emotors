'use client';

import { FormEvent, type ReactNode, useCallback, useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { EmotorsRecommendationCard } from '@/components/sales-motivation/EmotorsRecommendationCard';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';

import { toast } from '@/lib/toast';

type PlanLevel = { salesThreshold: number; bonusAmount: number };
type AvgLevel = { averageReceiptThreshold: number; bonusAmount: number };

type MotivationForm = {
  fullPaymentCommissionPercent: number;
  fullPaymentMinCommission: number;
  fullPaymentMaxCommission: number | null;
  fullPaymentEffectiveFrom: string;
  fullPaymentTrigger: 'AFTER_CASHIER_PAYMENT_CONFIRMATION' | 'AFTER_INVOICE_CLOSED';
  installmentApprovalCommissionPercent: number;
  installmentRepaymentCommissionPercent: number;
  installmentEffectiveFrom: string;
  installmentTrigger: 'AFTER_BRANCH_CEO_APPROVAL' | 'AFTER_FIRST_PAYMENT' | 'AFTER_FULL_REPAYMENT';
  returningCustomerDays: number;
  returningCustomerBonusType: 'FIXED' | 'PERCENT';
  returningCustomerFixedAmount: number | null;
  returningCustomerPercent: number | null;
  averageReceiptMinCount: number;
  planLevels: PlanLevel[];
  averageReceiptLevels: AvgLevel[];
  comment: string;
  recommendationSource?: string;
};

type RecommendationPayload = {
  recommendation: {
    source: string;
    values: Omit<MotivationForm, 'comment' | 'fullPaymentEffectiveFrom' | 'installmentEffectiveFrom'> & {
      fullPaymentEffectiveFrom?: string;
      installmentEffectiveFrom?: string;
    };
    reasons: Record<string, string>;
  };
  impact: { estimatedMonthlyBonusExpenseKgs: number };
  sections: Array<{
    section: string;
    title: string;
    why: string;
    recommendedValues: Record<string, unknown>;
  }>;
  stats: { sufficient: boolean; completedSalesCount: number; monthlySalesAverage: number };
};

type VersionRow = {
  id: string;
  version: number;
  isActive: boolean;
  comment?: string | null;
  createdAt: string;
  createdBy?: { fullName: string };
  recommendationSource?: string | null;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function defaultForm(): MotivationForm {
  return {
    fullPaymentCommissionPercent: 0.8,
    fullPaymentMinCommission: 0,
    fullPaymentMaxCommission: null,
    fullPaymentEffectiveFrom: todayIso(),
    fullPaymentTrigger: 'AFTER_CASHIER_PAYMENT_CONFIRMATION',
    installmentApprovalCommissionPercent: 0.3,
    installmentRepaymentCommissionPercent: 0.5,
    installmentEffectiveFrom: todayIso(),
    installmentTrigger: 'AFTER_FULL_REPAYMENT',
    returningCustomerDays: 30,
    returningCustomerBonusType: 'FIXED',
    returningCustomerFixedAmount: 150,
    returningCustomerPercent: null,
    averageReceiptMinCount: 30,
    planLevels: [
      { salesThreshold: 500000, bonusAmount: 5000 },
      { salesThreshold: 800000, bonusAmount: 10000 },
      { salesThreshold: 1200000, bonusAmount: 20000 },
      { salesThreshold: 1500000, bonusAmount: 30000 },
      { salesThreshold: 2000000, bonusAmount: 50000 },
    ],
    averageReceiptLevels: [
      { averageReceiptThreshold: 12000, bonusAmount: 2000 },
      { averageReceiptThreshold: 15000, bonusAmount: 5000 },
      { averageReceiptThreshold: 18000, bonusAmount: 8000 },
    ],
    comment: '',
  };
}

export default function SalesMotivationSettingsPage() {
  const { t } = useTranslation();
  const [form, setForm] = useState<MotivationForm>(defaultForm);
  const [recommendations, setRecommendations] = useState<RecommendationPayload | null>(null);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError('');
    const [settingsResult, recommendationResult, versionsResult] = await Promise.all([
      apiFetch<{ settings: MotivationForm | null; defaults: MotivationForm }>('/sales-motivation/settings'),
      apiFetch<RecommendationPayload>('/sales-motivation/recommendations'),
      apiFetch<VersionRow[]>('/sales-motivation/versions'),
    ]);
    if (settingsResult.settings) {
      setForm({
        ...settingsResult.settings,
        fullPaymentEffectiveFrom: String(settingsResult.settings.fullPaymentEffectiveFrom).slice(0, 10),
        installmentEffectiveFrom: String(settingsResult.settings.installmentEffectiveFrom).slice(0, 10),
        comment: '',
      });
    } else {
      setForm({
        ...defaultForm(),
        ...settingsResult.defaults,
        fullPaymentEffectiveFrom: todayIso(),
        installmentEffectiveFrom: todayIso(),
        comment: '',
      });
    }
    setRecommendations(recommendationResult);
    setVersions(versionsResult);
  }, []);

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [load, t]);

  function applyRecommendationValues() {
    if (!recommendations) return;
    const values = recommendations.recommendation.values;
    setForm((current) => ({
      ...current,
      ...values,
      fullPaymentEffectiveFrom: current.fullPaymentEffectiveFrom || todayIso(),
      installmentEffectiveFrom: current.installmentEffectiveFrom || todayIso(),
      recommendationSource: recommendations.recommendation.source,
      comment: 'Применена рекомендация EMOTORS',
    }));
    toast.success('Рекомендация применена в форму. Сохраните, чтобы активировать новую версию.');
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    /* toast clear */ void 0;
    try {
      await apiFetch('/sales-motivation/settings', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          fullPaymentEffectiveFrom: new Date(form.fullPaymentEffectiveFrom).toISOString(),
          installmentEffectiveFrom: new Date(form.installmentEffectiveFrom).toISOString(),
        }),
      });
      toast.success('Новая версия мотивации сохранена и активирована.');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  const impactLabel = recommendations
    ? `При текущем объёме продаж примерные расходы на бонусы ≈ ${recommendations.impact.estimatedMonthlyBonusExpenseKgs.toLocaleString('ru-RU')} KGS / месяц`
    : undefined;

  const reason = (key: string) => recommendations?.recommendation.reasons[key] ?? '';

  return (
    <ProtectedShell>
      <form onSubmit={submit} className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('nav.settings')}</p>
          <h2 className="text-3xl font-bold text-slate-950">{t('nav.salesMotivation')}</h2>
          <p className="mt-2 text-slate-500">Продавцы · настройка комиссий и бонусов</p>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {success ? <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</p> : null}

        <Section
          title="Комиссия полной оплаты"
          recommendation={
            <EmotorsRecommendationCard
              title="Комиссия полной оплаты"
              recommendedSummary={`${recommendations?.recommendation.values.fullPaymentCommissionPercent ?? 0.8}%`}
              why={reason('fullPayment')}
              impactLabel={impactLabel}
              onApply={applyRecommendationValues}
            />
          }
        >
          <Field label="Комиссия (%)" type="number" value={form.fullPaymentCommissionPercent} onChange={(v) => setForm({ ...form, fullPaymentCommissionPercent: Number(v) })} />
          <Field label="Минимальная комиссия" type="number" value={form.fullPaymentMinCommission} onChange={(v) => setForm({ ...form, fullPaymentMinCommission: Number(v) })} />
          <Field label="Максимальная комиссия (optional)" type="number" value={form.fullPaymentMaxCommission ?? ''} onChange={(v) => setForm({ ...form, fullPaymentMaxCommission: v === '' ? null : Number(v) })} />
          <Field label="Дата начала действия" type="date" value={form.fullPaymentEffectiveFrom} onChange={(v) => setForm({ ...form, fullPaymentEffectiveFrom: v })} />
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Когда начислять</span>
            <select value={form.fullPaymentTrigger} onChange={(e) => setForm({ ...form, fullPaymentTrigger: e.target.value as MotivationForm['fullPaymentTrigger'] })} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2">
              <option value="AFTER_CASHIER_PAYMENT_CONFIRMATION">После подтверждения оплаты кассиром</option>
              <option value="AFTER_INVOICE_CLOSED">После закрытия счета</option>
            </select>
          </label>
        </Section>

        <Section
          title="Комиссия рассрочки"
          recommendation={
            <EmotorsRecommendationCard
              title="Комиссия рассрочки"
              recommendedSummary={`${recommendations?.recommendation.values.installmentApprovalCommissionPercent ?? 0.3}%\n+\n${recommendations?.recommendation.values.installmentRepaymentCommissionPercent ?? 0.5}%`}
              why={reason('installment')}
              impactLabel={impactLabel}
              onApply={applyRecommendationValues}
            />
          }
        >
          <Field label="Комиссия после одобрения" type="number" value={form.installmentApprovalCommissionPercent} onChange={(v) => setForm({ ...form, installmentApprovalCommissionPercent: Number(v) })} />
          <Field label="Комиссия после полного погашения" type="number" value={form.installmentRepaymentCommissionPercent} onChange={(v) => setForm({ ...form, installmentRepaymentCommissionPercent: Number(v) })} />
          <Field label="Дата начала действия" type="date" value={form.installmentEffectiveFrom} onChange={(v) => setForm({ ...form, installmentEffectiveFrom: v })} />
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Когда начислять</span>
            <select value={form.installmentTrigger} onChange={(e) => setForm({ ...form, installmentTrigger: e.target.value as MotivationForm['installmentTrigger'] })} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2">
              <option value="AFTER_BRANCH_CEO_APPROVAL">После одобрения Branch CEO</option>
              <option value="AFTER_FIRST_PAYMENT">После первого платежа</option>
              <option value="AFTER_FULL_REPAYMENT">После полного погашения</option>
            </select>
          </label>
        </Section>

        <Section
          title="Ежемесячный план продаж"
          recommendation={
            <EmotorsRecommendationCard
              title="Ежемесячный план продаж"
              recommendedSummary={(recommendations?.recommendation.values.planLevels ?? form.planLevels)
                .map((level) => `${level.salesThreshold.toLocaleString('ru-RU')} → ${level.bonusAmount.toLocaleString('ru-RU')}`)
                .join('\n')}
              why={reason('plan')}
              impactLabel={impactLabel}
              onApply={applyRecommendationValues}
            />
          }
        >
          <div className="space-y-3 md:col-span-2">
            {form.planLevels.map((level, index) => (
              <div key={index} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                <Field label="Порог продаж" type="number" value={level.salesThreshold} onChange={(v) => {
                  const next = [...form.planLevels];
                  next[index] = { ...next[index], salesThreshold: Number(v) };
                  setForm({ ...form, planLevels: next });
                }} />
                <Field label="Бонус" type="number" value={level.bonusAmount} onChange={(v) => {
                  const next = [...form.planLevels];
                  next[index] = { ...next[index], bonusAmount: Number(v) };
                  setForm({ ...form, planLevels: next });
                }} />
                <button type="button" className="self-end rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600" onClick={() => setForm({ ...form, planLevels: form.planLevels.filter((_, i) => i !== index) })}>
                  Удалить уровень
                </button>
              </div>
            ))}
            <button type="button" className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700" onClick={() => setForm({ ...form, planLevels: [...form.planLevels, { salesThreshold: 0, bonusAmount: 0 }] })}>
              Добавить уровень
            </button>
          </div>
        </Section>

        <Section
          title="Бонус среднего чека"
          recommendation={
            <EmotorsRecommendationCard
              title="Бонус среднего чека"
              recommendedSummary={`${recommendations?.recommendation.values.averageReceiptMinCount ?? 30} чеков\n${(recommendations?.recommendation.values.averageReceiptLevels ?? form.averageReceiptLevels)
                .map((level) => `${level.averageReceiptThreshold.toLocaleString('ru-RU')} → ${level.bonusAmount.toLocaleString('ru-RU')}`)
                .join('\n')}`}
              why={reason('averageReceipt')}
              impactLabel={impactLabel}
              onApply={applyRecommendationValues}
            />
          }
        >
          <Field label="Минимальное количество чеков" type="number" value={form.averageReceiptMinCount} onChange={(v) => setForm({ ...form, averageReceiptMinCount: Number(v) })} />
          <div className="space-y-3 md:col-span-2">
            {form.averageReceiptLevels.map((level, index) => (
              <div key={index} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                <Field label="Средний чек" type="number" value={level.averageReceiptThreshold} onChange={(v) => {
                  const next = [...form.averageReceiptLevels];
                  next[index] = { ...next[index], averageReceiptThreshold: Number(v) };
                  setForm({ ...form, averageReceiptLevels: next });
                }} />
                <Field label="Бонус" type="number" value={level.bonusAmount} onChange={(v) => {
                  const next = [...form.averageReceiptLevels];
                  next[index] = { ...next[index], bonusAmount: Number(v) };
                  setForm({ ...form, averageReceiptLevels: next });
                }} />
                <button type="button" className="self-end rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600" onClick={() => setForm({ ...form, averageReceiptLevels: form.averageReceiptLevels.filter((_, i) => i !== index) })}>
                  Удалить уровень
                </button>
              </div>
            ))}
            <button type="button" className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700" onClick={() => setForm({ ...form, averageReceiptLevels: [...form.averageReceiptLevels, { averageReceiptThreshold: 0, bonusAmount: 0 }] })}>
              Добавить уровень
            </button>
          </div>
        </Section>

        <Section
          title="Бонус повторного клиента"
          recommendation={
            <EmotorsRecommendationCard
              title="Бонус повторного клиента"
              recommendedSummary={`${recommendations?.recommendation.values.returningCustomerDays ?? 30} дней\nФиксированная сумма\n${recommendations?.recommendation.values.returningCustomerFixedAmount ?? 150} KGS`}
              why={reason('returningCustomer')}
              impactLabel={impactLabel}
              onApply={applyRecommendationValues}
            />
          }
        >
          <Field label="Через сколько дней клиент считается вернувшимся" type="number" value={form.returningCustomerDays} onChange={(v) => setForm({ ...form, returningCustomerDays: Number(v) })} />
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Тип бонуса</span>
            <select value={form.returningCustomerBonusType} onChange={(e) => setForm({ ...form, returningCustomerBonusType: e.target.value as 'FIXED' | 'PERCENT' })} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2">
              <option value="FIXED">Фиксированная сумма</option>
              <option value="PERCENT">Процент (%)</option>
            </select>
          </label>
          {form.returningCustomerBonusType === 'FIXED' ? (
            <Field label="Фиксированная сумма" type="number" value={form.returningCustomerFixedAmount ?? 0} onChange={(v) => setForm({ ...form, returningCustomerFixedAmount: Number(v), returningCustomerPercent: null })} />
          ) : (
            <Field label="Процент (%)" type="number" value={form.returningCustomerPercent ?? 0} onChange={(v) => setForm({ ...form, returningCustomerPercent: Number(v), returningCustomerFixedAmount: null })} />
          )}
        </Section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold">Комментарий к версии</h3>
          <textarea value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} className="mt-3 min-h-20 w-full rounded-xl border border-slate-300 px-3 py-2" />
          <p className="mt-2 text-sm text-slate-500">
            Источник рекомендации: {recommendations?.recommendation.source === 'BRANCH_STATISTICS' ? 'статистика филиала' : 'EMOTORS default'}
            {recommendations ? ` · продаж в анализе: ${recommendations.stats.completedSalesCount}` : ''}
          </p>
          <button disabled={saving} type="submit" className="mt-4 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white disabled:opacity-60">
            {saving ? t('common.loading') : 'Сохранить новую версию'}
          </button>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold">История версий</h3>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Version</th>
                  <th className="px-3 py-2">Changed by</th>
                  <th className="px-3 py-2">Created at</th>
                  <th className="px-3 py-2">Comment</th>
                  <th className="px-3 py-2">Active</th>
                </tr>
              </thead>
              <tbody>
                {versions.map((version) => (
                  <tr key={version.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">v{version.version}</td>
                    <td className="px-3 py-2">{version.createdBy?.fullName ?? '—'}</td>
                    <td className="px-3 py-2">{new Date(version.createdAt).toLocaleString('ru-RU')}</td>
                    <td className="px-3 py-2">{version.comment ?? '—'}</td>
                    <td className="px-3 py-2">{version.isActive ? 'Активна' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </form>
    </ProtectedShell>
  );
}

function Section({
  title,
  recommendation,
  children,
}: {
  title: string;
  recommendation: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm xl:grid-cols-[1.4fr_1fr]">
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-slate-950">{title}</h3>
        <div className="grid gap-3 md:grid-cols-2">{children}</div>
      </div>
      {recommendation}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" />
    </label>
  );
}
