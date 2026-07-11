'use client';

import { useEffect, useState } from 'react';
import { PricingHubNav } from '@/components/pricing/PricingHubNav';
import { apiFetch } from '@/lib/api';
import { canManagePricingPolicy } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type DraftVersion = { id: string; label: string; versionNumber: number; status: string };
type Profile = { id: string; name: string };
type Product = { id: string; name: string; sku: string };
type ProductRule = {
  id: string;
  adjustmentMode: string;
  adjustmentValue: number;
  pricingProfile: Profile;
  product: Product;
};

export default function PricingProductRulesPage() {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [draft, setDraft] = useState<DraftVersion | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [rules, setRules] = useState<ProductRule[]>([]);
  const [form, setForm] = useState({
    pricingProfileId: '',
    productId: '',
    adjustmentMode: 'PERCENTAGE_DISCOUNT',
    adjustmentValue: 0,
  });
  const [error, setError] = useState('');

  const canManage = canManagePricingPolicy(user);

  async function load() {
    const [versions, profileRows, productRows, me] = await Promise.all([
      apiFetch<DraftVersion[]>('/pricing/versions'),
      apiFetch<Profile[]>('/pricing/profiles'),
      apiFetch<Product[]>('/pricing/products'),
      apiFetch<User>('/auth/me'),
    ]);
    const draftVersion = versions.find((v) => v.status === 'DRAFT' || v.status === 'READY_FOR_REVIEW') ?? null;
    setDraft(draftVersion);
    setProfiles(profileRows);
    setProducts(productRows);
    setUser(me);
    if (draftVersion) {
      const ruleRows = await apiFetch<ProductRule[]>(`/pricing/versions/${draftVersion.id}/product-rules`);
      setRules(ruleRows);
    } else {
      setRules([]);
    }
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  async function saveRule() {
    if (!draft || !canManage) return;
    await apiFetch(`/pricing/versions/${draft.id}/product-rules`, {
      method: 'PUT',
      body: JSON.stringify(form),
    });
    await load();
  }

  return (
    <>
      <PricingHubNav activeTab="product-rules" />
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      <p className="text-sm text-slate-600">{t('pricing.productRulesHint')}</p>
      {!draft ? <p className="text-sm text-amber-700">{t('pricing.noDraftVersion')}</p> : null}
      {canManage && draft ? (
        <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-5">
          <select
            value={form.pricingProfileId}
            onChange={(e) => setForm({ ...form, pricingProfileId: e.target.value })}
            className="rounded-xl border border-slate-300 px-3 py-2"
          >
            <option value="">{t('pricing.selectProfile')}</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select
            value={form.productId}
            onChange={(e) => setForm({ ...form, productId: e.target.value })}
            className="rounded-xl border border-slate-300 px-3 py-2"
          >
            <option value="">{t('pricing.selectProduct')}</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>
            ))}
          </select>
          <select
            value={form.adjustmentMode}
            onChange={(e) => setForm({ ...form, adjustmentMode: e.target.value })}
            className="rounded-xl border border-slate-300 px-3 py-2"
          >
            <option value="PERCENTAGE_DISCOUNT">{t('pricing.modePercentage')}</option>
            <option value="FIXED_AMOUNT_DISCOUNT">{t('pricing.modeFixedAmount')}</option>
            <option value="FIXED_SELLING_PRICE">{t('pricing.modeFixedPrice')}</option>
          </select>
          <input
            type="number"
            min={0}
            value={form.adjustmentValue}
            onChange={(e) => setForm({ ...form, adjustmentValue: Number(e.target.value) })}
            className="rounded-xl border border-slate-300 px-3 py-2"
          />
          <button type="button" onClick={() => void saveRule()} className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white">
            {t('common.save')}
          </button>
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">{t('pricing.profile')}</th>
              <th className="px-4 py-3">{t('pricing.product')}</th>
              <th className="px-4 py-3">{t('pricing.mode')}</th>
              <th className="px-4 py-3">{t('pricing.value')}</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={rule.id} className="border-t border-slate-100">
                <td className="px-4 py-3">{rule.pricingProfile.name}</td>
                <td className="px-4 py-3">{rule.product.sku}</td>
                <td className="px-4 py-3">{rule.adjustmentMode}</td>
                <td className="px-4 py-3">{Number(rule.adjustmentValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
