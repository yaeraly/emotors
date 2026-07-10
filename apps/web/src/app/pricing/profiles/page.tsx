'use client';

import { useEffect, useMemo, useState } from 'react';
import { PricingHubNav } from '@/components/pricing/PricingHubNav';
import { apiFetch } from '@/lib/api';
import { canManagePricingPolicy } from '@/lib/rbac';
import type { BranchType, User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type PriceProfile = {
  id: string;
  name: string;
  branchType: BranchType;
  defaultHqMarkupPercent: number;
  status: 'ACTIVE' | 'INACTIVE';
  description?: string | null;
  branchCount: number;
  branches: Array<{ id: string; name: string; code: string; branchType: BranchType }>;
};

type BranchOption = {
  id: string;
  name: string;
  code: string;
  branchType: BranchType;
};

type ProfileForm = {
  name: string;
  branchType: BranchType;
  defaultHqMarkupPercent: string;
  status: 'ACTIVE' | 'INACTIVE';
  description: string;
};

const emptyForm: ProfileForm = {
  name: '',
  branchType: 'FRANCHISE_BRANCH',
  defaultHqMarkupPercent: '15',
  status: 'ACTIVE',
  description: '',
};

export default function PricingProfilesPage() {
  const { t } = useTranslation();
  const [profiles, setProfiles] = useState<PriceProfile[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState<ProfileForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [assignBranchId, setAssignBranchId] = useState('');
  const [assignProfileId, setAssignProfileId] = useState('');
  const [saving, setSaving] = useState(false);

  const canManage = canManagePricingPolicy(user);

  async function load() {
    const [profileRows, branchRows, me] = await Promise.all([
      apiFetch<PriceProfile[]>('/pricing/profiles'),
      apiFetch<BranchOption[]>('/branches'),
      apiFetch<User>('/auth/me'),
    ]);
    setProfiles(profileRows);
    setBranches(branchRows.filter((branch) => branch.branchType === 'FRANCHISE_BRANCH'));
    setUser(me);
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  const franchiseBranches = useMemo(
    () => branches.filter((branch) => branch.branchType === 'FRANCHISE_BRANCH'),
    [branches],
  );

  function startEdit(profile: PriceProfile) {
    setEditingId(profile.id);
    setForm({
      name: profile.name,
      branchType: profile.branchType,
      defaultHqMarkupPercent: String(profile.defaultHqMarkupPercent),
      status: profile.status,
      description: profile.description ?? '',
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function saveProfile() {
    if (!canManage) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload = {
        name: form.name.trim(),
        branchType: form.branchType,
        defaultHqMarkupPercent: Number(form.defaultHqMarkupPercent),
        status: form.status,
        description: form.description.trim() || undefined,
      };
      if (editingId) {
        await apiFetch(`/pricing/profiles/${editingId}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await apiFetch('/pricing/profiles', { method: 'POST', body: JSON.stringify(payload) });
      }
      setSuccess(t('pricing.profileSaved'));
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function deleteProfile(id: string) {
    if (!canManage) return;
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/pricing/profiles/${id}/delete`, { method: 'POST', body: JSON.stringify({}) });
      setSuccess(t('pricing.profileDeleted'));
      if (editingId === id) resetForm();
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
      {!canManage ? <p className="text-sm text-slate-500">{t('pricing.readOnly')}</p> : null}

      <p className="text-xs text-slate-500">{t('pricing.profilesHint')}</p>

      {canManage ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-lg font-bold text-slate-950">
            {editingId ? t('pricing.editProfile') : t('pricing.createProfile')}
          </h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">{t('pricing.profileName')}</span>
              <input
                value={form.name}
                onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">{t('pricing.colHqMarkup')}</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.defaultHqMarkupPercent}
                onChange={(e) => setForm((current) => ({ ...current, defaultHqMarkupPercent: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">{t('common.status')}</span>
              <select
                value={form.status}
                onChange={(e) => setForm((current) => ({ ...current, status: e.target.value as 'ACTIVE' | 'INACTIVE' }))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="ACTIVE">{t('pricing.profileStatusActive')}</option>
                <option value="INACTIVE">{t('pricing.profileStatusInactive')}</option>
              </select>
            </label>
            <label className="block md:col-span-2 lg:col-span-3">
              <span className="text-sm font-semibold text-slate-700">{t('pricing.profileDescription')}</span>
              <input
                value={form.description}
                onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving || !form.name.trim()}
              onClick={() => void saveProfile()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? t('common.loading') : t('common.save')}
            </button>
            {editingId ? (
              <button type="button" onClick={resetForm} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">
                {t('common.cancel')}
              </button>
            ) : null}
          </div>
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
                onChange={(e) => setAssignBranchId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">{t('pricing.selectBranch')}</option>
                {franchiseBranches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
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
              >
                <option value="">{t('pricing.defaultFranchiseMarkup')}</option>
                {profiles
                  .filter((profile) => profile.status === 'ACTIVE')
                  .map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name} ({profile.defaultHqMarkupPercent}%)
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

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[760px] divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">{t('pricing.profileName')}</th>
              <th className="px-3 py-2">{t('pricing.colHqMarkup')}</th>
              <th className="px-3 py-2">{t('common.status')}</th>
              <th className="px-3 py-2">{t('pricing.colBranch')}</th>
              <th className="px-3 py-2">{t('pricing.colActions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {profiles.map((profile) => (
              <tr key={profile.id}>
                <td className="px-3 py-2">
                  <p className="font-semibold text-slate-900">{profile.name}</p>
                  {profile.description ? <p className="text-xs text-slate-500">{profile.description}</p> : null}
                </td>
                <td className="px-3 py-2">{profile.defaultHqMarkupPercent}%</td>
                <td className="px-3 py-2">{profile.status === 'ACTIVE' ? t('pricing.profileStatusActive') : t('pricing.profileStatusInactive')}</td>
                <td className="px-3 py-2">
                  {profile.branches.length ? (
                    <ul className="space-y-1 text-xs text-slate-600">
                      {profile.branches.map((branch) => (
                        <li key={branch.id}>{branch.name}</li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {canManage ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(profile)}
                        className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold"
                      >
                        {t('common.edit')}
                      </button>
                      <button
                        type="button"
                        disabled={saving || profile.branchCount > 0}
                        onClick={() => void deleteProfile(profile.id)}
                        className="rounded border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 disabled:opacity-50"
                      >
                        {t('common.delete')}
                      </button>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
