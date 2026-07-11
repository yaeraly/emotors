'use client';

import { useEffect, useMemo, useState } from 'react';
import { PricingHubNav } from '@/components/pricing/PricingHubNav';
import { apiFetch } from '@/lib/api';
import { canManagePricingPolicy } from '@/lib/rbac';
import type { BranchType, User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type CategoryOption = { id: string; code: string; nameRu: string; nameEn: string };
type CategoryDiscount = { categoryId: string; discountPercent: number };

type PriceProfile = {
  id: string;
  name: string;
  code: string;
  profileType: string;
  branchType: BranchType;
  status: 'ACTIVE' | 'INACTIVE';
  description?: string | null;
  branchCount: number;
  branches: Array<{ id: string; name: string; code: string; branchType: BranchType }>;
  categoryDiscounts: Array<{
    categoryId: string;
    discountPercent: number;
    category: CategoryOption;
  }>;
};

type BranchOption = { id: string; name: string; code: string; branchType: BranchType };

const FRANCHISE_PROFILE_TYPES = new Set([
  'STANDARD_FRANCHISE',
  'BRONZE_FRANCHISE',
  'SILVER_FRANCHISE',
  'GOLD_FRANCHISE',
  'PLATINUM_FRANCHISE',
  'VIP_FRANCHISE',
]);

const DEALER_PROFILE_TYPES = new Set(['DEALER', 'DEALER_PREMIUM']);
const DISTRIBUTOR_PROFILE_TYPES = new Set(['DISTRIBUTOR', 'DISTRIBUTOR_PREMIUM']);

function isProfileCompatibleWithBranch(branchType: BranchType, profileType: string) {
  if (branchType === 'HQ_BRANCH') return profileType === 'HQ_BRANCH';
  if (branchType === 'FRANCHISE') return FRANCHISE_PROFILE_TYPES.has(profileType);
  if (branchType === 'DEALER') return DEALER_PROFILE_TYPES.has(profileType);
  if (branchType === 'DISTRIBUTOR') return DISTRIBUTOR_PROFILE_TYPES.has(profileType);
  return false;
}

export default function PricingProfilesPage() {
  const { t } = useTranslation();
  const [profiles, setProfiles] = useState<PriceProfile[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [discountDraft, setDiscountDraft] = useState<Record<string, string>>({});
  const [assignBranchId, setAssignBranchId] = useState('');
  const [assignProfileId, setAssignProfileId] = useState('');
  const [saving, setSaving] = useState(false);

  const canManage = canManagePricingPolicy(user);
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? profiles[0] ?? null;
  const selectedAssignBranch = branches.find((branch) => branch.id === assignBranchId) ?? null;

  function profileTypeLabel(profileType: string) {
    const key = `pricing.profileTypeName.${profileType}`;
    const translated = t(key);
    return translated === key ? profileType : translated;
  }

  async function load() {
    const [profileRows, categoryRows, branchRows, me] = await Promise.all([
      apiFetch<PriceProfile[]>('/pricing/profiles'),
      apiFetch<CategoryOption[]>('/pricing/categories'),
      apiFetch<BranchOption[]>('/branches'),
      apiFetch<User>('/auth/me'),
    ]);
    setProfiles(profileRows);
    setCategories(
      categoryRows.map((row) => ({
        id: row.id,
        code: row.code,
        nameRu: row.nameRu,
        nameEn: row.nameEn,
      })),
    );
    setBranches(branchRows);
    setUser(me);
    if (!selectedProfileId && profileRows[0]) setSelectedProfileId(profileRows[0].id);
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  useEffect(() => {
    if (!selectedProfile) return;
    const next: Record<string, string> = {};
    for (const category of categories) {
      const existing = selectedProfile.categoryDiscounts.find((row) => row.categoryId === category.id);
      next[category.id] = existing ? String(existing.discountPercent) : '0';
    }
    setDiscountDraft(next);
  }, [selectedProfile, categories]);

  const assignableBranches = branches;

  const compatibleProfiles = useMemo(() => {
    const activeProfiles = profiles.filter((profile) => profile.status === 'ACTIVE');
    if (!selectedAssignBranch) return activeProfiles;
    return activeProfiles.filter((profile) =>
      isProfileCompatibleWithBranch(selectedAssignBranch.branchType, profile.profileType),
    );
  }, [profiles, selectedAssignBranch]);

  async function saveCategoryDiscounts() {
    if (!canManage || !selectedProfile) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const discounts: CategoryDiscount[] = categories.map((category) => ({
        categoryId: category.id,
        discountPercent: Number(discountDraft[category.id] ?? 0),
      }));
      await apiFetch(`/pricing/profiles/${selectedProfile.id}/category-discounts`, {
        method: 'PUT',
        body: JSON.stringify({ discounts }),
      });
      setSuccess(t('pricing.categoryDiscountsSaved'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function assignProfile() {
    if (!canManage || !assignBranchId) return;
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/pricing/profiles/assign-branch/${assignBranchId}`, {
        method: 'PUT',
        body: JSON.stringify({ profileId: assignProfileId || null }),
      });
      setSuccess(t('pricing.profileAssigned'));
      setAssignBranchId('');
      setAssignProfileId('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PricingHubNav activeTab="profiles" />
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}
      <p className="text-xs text-slate-500">{t('pricing.profilesHint')}</p>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[760px] divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">{t('pricing.profileName')}</th>
              <th className="px-3 py-2">{t('pricing.profileType')}</th>
              <th className="px-3 py-2">{t('common.status')}</th>
              <th className="px-3 py-2">{t('pricing.colBranch')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {profiles.map((profile) => (
              <tr
                key={profile.id}
                className={selectedProfile?.id === profile.id ? 'bg-blue-50' : undefined}
                onClick={() => setSelectedProfileId(profile.id)}
              >
                <td className="px-3 py-2 font-semibold text-slate-900">{profile.name}</td>
                <td className="px-3 py-2">{profileTypeLabel(profile.profileType)}</td>
                <td className="px-3 py-2">
                  {profile.status === 'ACTIVE' ? t('pricing.profileStatusActive') : t('pricing.profileStatusInactive')}
                </td>
                <td className="px-3 py-2">{profile.branchCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canManage && selectedProfile ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-lg font-bold text-slate-950">
            {t('pricing.categoryDiscountsFor').replace('{{profile}}', selectedProfile.name)}
          </h3>
          {selectedProfile.description ? (
            <p className="mt-1 text-sm text-slate-500">{selectedProfile.description}</p>
          ) : null}
          <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {categories.map((category) => (
              <label key={category.id} className="block">
                <span className="text-sm font-semibold text-slate-700">{category.nameRu}</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={discountDraft[category.id] ?? '0'}
                  onChange={(e) =>
                    setDiscountDraft((current) => ({ ...current, [category.id]: e.target.value }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
            ))}
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveCategoryDiscounts()}
            className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? t('common.loading') : t('pricing.saveCategoryDiscounts')}
          </button>
        </section>
      ) : null}

      {canManage ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-lg font-bold text-slate-950">{t('pricing.assignProfile')}</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">{t('pricing.colBranch')}</span>
              <select
                value={assignBranchId}
                onChange={(e) => {
                  setAssignBranchId(e.target.value);
                  setAssignProfileId('');
                }}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">{t('pricing.selectBranch')}</option>
                {assignableBranches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name} ({branch.branchType})
                  </option>
                ))}
              </select>
            </label>
            <label className="block md:col-span-2">
              <span className="text-sm font-semibold text-slate-700">{t('pricing.tabProfiles')}</span>
              <select
                value={assignProfileId}
                onChange={(e) => setAssignProfileId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                disabled={!assignBranchId}
              >
                <option value="">{t('pricing.defaultBranchProfile')}</option>
                {compatibleProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            disabled={saving || !assignBranchId}
            onClick={() => void assignProfile()}
            className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {t('pricing.assignProfileAction')}
          </button>
        </section>
      ) : null}
    </>
  );
}
