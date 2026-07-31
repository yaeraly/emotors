'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { LifecycleDeleteConfirmModal } from '@/components/LifecycleDeleteConfirmModal';
import { API_URL, apiFetch } from '@/lib/api';
import {
  canAssignBranchHqWarehouse,
  canChangeBranchType,
  canDeleteBranch,
  canDeleteBranchWarehouse,
  canManageBranches,
  canInspectAnyBranchWarehouse,
} from '@/lib/rbac';
import type { Branch, BranchType, User, Warehouse } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';
import { translateStatus } from '@/lib/translate-status';

type BranchForm = {
  name: string;
  code: string;
  city: string;
  address: string;
  phone: string;
  ownerName: string;
  status: 'ACTIVE' | 'INACTIVE' | 'PENDING' | 'SUSPENDED';
  branchType: BranchType;
  assignedHqWarehouseId: string;
  priceProfileId: string;
  branchTypeChangeReasonCode: string;
  branchTypeChangeReasonComment: string;
};

type PriceProfileOption = {
  id: string;
  name: string;
  code: string;
  profileType: string;
  branchType: BranchType;
  status: 'ACTIVE' | 'INACTIVE';
};

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

function branchTypeLabel(branchType: BranchType | undefined, t: (key: string) => string) {
  switch (branchType) {
    case 'HQ_BRANCH':
      return t('branches.branchTypeHq');
    case 'FRANCHISE':
      return t('branches.branchTypeFranchise');
    case 'DEALER':
      return t('branches.branchTypeDealer');
    case 'DISTRIBUTOR':
      return t('branches.branchTypeDistributor');
    default:
      return '-';
  }
}

export default function BranchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const [branch, setBranch] = useState<Branch | null>(null);
  const [dashboard, setDashboard] = useState<{ branch?: Branch } | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [hqWarehouses, setHqWarehouses] = useState<Warehouse[]>([]);
  const [assignedHqWarehouseId, setAssignedHqWarehouseId] = useState('');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<BranchForm>({
    name: '',
    code: '',
    city: '',
    address: '',
    phone: '',
    ownerName: '',
    status: 'ACTIVE',
    branchType: 'FRANCHISE',
    assignedHqWarehouseId: '',
    priceProfileId: '',
    branchTypeChangeReasonCode: 'MANAGEMENT_DECISION',
    branchTypeChangeReasonComment: '',
  });
  const [priceProfiles, setPriceProfiles] = useState<PriceProfileOption[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [warehouseDeleteModalOpen, setWarehouseDeleteModalOpen] = useState(false);
  const [warehouseDeleting, setWarehouseDeleting] = useState(false);
  const [branchWarehouseCode, setBranchWarehouseCode] = useState<string | null>(null);
  const [branchWarehouseId, setBranchWarehouseId] = useState<string | null>(null);
  const [branchWarehouseMissing, setBranchWarehouseMissing] = useState(false);
  const [branchWarehouseLoading, setBranchWarehouseLoading] = useState(false);

  async function load() {
    const [dashboardData, me, branchData, warehouses, profiles] = await Promise.all([
      apiFetch<{ branch: Branch }>(`/branches/${id}/dashboard`),
      apiFetch<User>('/auth/me'),
      apiFetch<Branch>(`/branches/${id}`),
      apiFetch<Warehouse[]>('/inventory/warehouses?warehouseType=HQ&status=ACTIVE'),
      apiFetch<PriceProfileOption[]>('/pricing/profiles').catch(() => [] as PriceProfileOption[]),
    ]);
    setDashboard(dashboardData);
    setBranch(branchData);
    setUser(me);
    setHqWarehouses(warehouses);
    setPriceProfiles(profiles.filter((profile) => profile.status === 'ACTIVE'));
    setAssignedHqWarehouseId(branchData.assignedHqWarehouseId ?? '');
    setForm({
      name: branchData.name,
      code: branchData.code,
      city: branchData.city ?? '',
      address: branchData.address ?? '',
      phone: branchData.phone ?? '',
      ownerName: branchData.ownerName ?? '',
      status: branchData.status ?? 'ACTIVE',
      branchType: branchData.branchType ?? 'FRANCHISE',
      assignedHqWarehouseId: branchData.assignedHqWarehouseId ?? '',
      priceProfileId: branchData.priceProfile?.id ?? '',
      branchTypeChangeReasonCode: 'MANAGEMENT_DECISION',
      branchTypeChangeReasonComment: '',
    });
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [id, t]);

  useEffect(() => {
    if (!user || !canInspectAnyBranchWarehouse(user)) {
      setBranchWarehouseId(null);
      setBranchWarehouseMissing(false);
      return;
    }
    setBranchWarehouseLoading(true);
    apiFetch<{ id: string; code?: string }>(`/branches/${id}/warehouse`)
      .then((warehouse) => {
        setBranchWarehouseId(warehouse.id);
        setBranchWarehouseCode(warehouse.code ?? null);
        setBranchWarehouseMissing(false);
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : '';
        if (message.includes('не найден') || message.includes('not found')) {
          setBranchWarehouseId(null);
          setBranchWarehouseMissing(true);
          return;
        }
        setBranchWarehouseId(null);
        setBranchWarehouseMissing(false);
      })
      .finally(() => setBranchWarehouseLoading(false));
  }, [id, user]);

  const canManage = canManageBranches(user);
  const canDelete = canDeleteBranch(user);
  const canDeleteWarehouse = canDeleteBranchWarehouse(user);
  const canAssign = canAssignBranchHqWarehouse(user);
  const canEditBranchType = canChangeBranchType(user);
  const canInspectWarehouse = canInspectAnyBranchWarehouse(user);

  const compatibleProfiles = useMemo(
    () =>
      priceProfiles.filter((profile) =>
        isProfileCompatibleWithBranch(form.branchType, profile.profileType),
      ),
    [form.branchType, priceProfiles],
  );

  const branchTypeChanged = Boolean(branch && form.branchType !== (branch.branchType ?? 'FRANCHISE'));
  const currentProfileCompatible = useMemo(() => {
    if (!branch?.priceProfile?.profileType) return true;
    return isProfileCompatibleWithBranch(form.branchType, branch.priceProfile.profileType);
  }, [branch, form.branchType]);

  useEffect(() => {
    if (!branchTypeChanged) return;
    if (form.priceProfileId && compatibleProfiles.some((profile) => profile.id === form.priceProfileId)) {
      return;
    }
    const preferred =
      compatibleProfiles.find((profile) => profile.profileType.includes('STANDARD') || profile.profileType === 'HQ_BRANCH' || profile.profileType === 'DEALER' || profile.profileType === 'DISTRIBUTOR')
      ?? compatibleProfiles[0];
    if (preferred) {
      setForm((current) => ({ ...current, priceProfileId: preferred.id }));
    }
  }, [branchTypeChanged, compatibleProfiles, form.priceProfileId]);

  async function saveAssignment(event: FormEvent) {
    event.preventDefault();
    if (!branch) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const updated = await apiFetch<Branch>(`/branches/${branch.id}/assigned-hq-warehouse`, {
        method: 'PUT',
        body: JSON.stringify({
          assignedHqWarehouseId: assignedHqWarehouseId || null,
        }),
      });
      setBranch(updated);
      setSuccess(t('branchHqRouting.assignmentSaved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function saveBranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!branch || saving) return;

    if (branchTypeChanged) {
      if (!canEditBranchType) {
        setError(t('branches.branchTypeForbidden'));
        return;
      }
      if (!currentProfileCompatible && !form.priceProfileId) {
        setError(t('branches.branchTypeProfileIncompatible'));
        return;
      }
      const confirmed = window.confirm(
        [
          t('branches.confirmBranchTypeChangeTitle'),
          '',
          t('branches.confirmBranchTypeChangeMessage'),
          '',
          `${t('branches.currentBranchType')}: ${branchTypeLabel(branch.branchType, t)}`,
          `${t('branches.newBranchType')}: ${branchTypeLabel(form.branchType, t)}`,
          `${t('branches.currentPricingProfile')}: ${branch.priceProfile?.name ?? '-'}`,
          `${t('branches.newPricingProfile')}: ${
            compatibleProfiles.find((profile) => profile.id === form.priceProfileId)?.name
            ?? branch.priceProfile?.name
            ?? '-'
          }`,
        ].join('\n'),
      );
      if (!confirmed) return;
    }

    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        code: form.code,
        city: form.city || undefined,
        address: form.address || undefined,
        phone: form.phone || undefined,
        ownerName: form.ownerName || undefined,
        status: form.status,
        branchType: form.branchType,
      };
      if (canAssign) {
        payload.assignedHqWarehouseId = form.assignedHqWarehouseId || null;
      }
      if (branchTypeChanged || form.priceProfileId) {
        payload.priceProfileId = form.priceProfileId || null;
      }
      if (branchTypeChanged) {
        payload.branchTypeChangeReasonCode = form.branchTypeChangeReasonCode || 'MANAGEMENT_DECISION';
        payload.branchTypeChangeReasonComment = form.branchTypeChangeReasonComment || undefined;
      }

      const updated = await apiFetch<Branch & { newBranchType?: BranchType; profileChanged?: boolean }>(
        `/branches/${branch.id}`,
        {
          method: 'PUT',
          body: JSON.stringify(payload),
        },
      );
      setBranch(updated);
      setForm((current) => ({
        ...current,
        name: updated.name,
        code: updated.code,
        city: updated.city ?? '',
        address: updated.address ?? '',
        phone: updated.phone ?? '',
        ownerName: updated.ownerName ?? '',
        status: updated.status ?? 'ACTIVE',
        branchType: updated.branchType ?? current.branchType,
        assignedHqWarehouseId: updated.assignedHqWarehouseId ?? '',
        priceProfileId: updated.priceProfile?.id ?? '',
      }));
      setAssignedHqWarehouseId(updated.assignedHqWarehouseId ?? '');
      setEditing(false);
      setSuccess(
        branchTypeChanged ? t('branches.branchTypeChangedSuccess') : t('branches.updated'),
      );
    } catch (err) {
      setError(localizeBranchError(err instanceof Error ? err.message : t('branches.branchTypeChangeFailed'), t));
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteBranch(reason?: string) {
    if (!branch) return;

    setDeleting(true);
    setError('');
    setSuccess('');

    try {
      const result = await apiFetch<{ success?: boolean; archived?: boolean; message?: string }>(
        `/branches/${branch.id}`,
        {
          method: 'DELETE',
          body: JSON.stringify({ reason }),
        },
      );

      if (!result.success) {
        throw new Error(t('branches.deleteFailed'));
      }

      const successMessage = result.archived
        ? t('lifecycle.branchArchivedSuccess')
        : t('branches.deletedSuccess');
      window.localStorage.setItem('emotors-branch-deleted', successMessage);
      setDeleteModalOpen(false);
      router.replace('/branches');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('branches.deleteFailed'));
    } finally {
      setDeleting(false);
    }
  }

  async function confirmDeleteWarehouse(reason?: string) {
    if (!branchWarehouseId) return;
    setWarehouseDeleting(true);
    setError('');
    try {
      const result = await apiFetch<{ success: boolean; archived?: boolean; message?: string }>(
        `/branch-warehouses/${branchWarehouseId}`,
        {
          method: 'DELETE',
          body: JSON.stringify({ reason }),
        },
      );
      setWarehouseDeleteModalOpen(false);
      setSuccess(
        result.archived
          ? t('lifecycle.warehouseArchivedSuccess')
          : t('lifecycle.warehouseDeletedSuccess'),
      );
      setBranchWarehouseId(null);
      setBranchWarehouseCode(null);
      setBranchWarehouseMissing(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setWarehouseDeleting(false);
    }
  }

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/branches" className="text-sm font-semibold text-blue-600">← {t('nav.branches')}</Link>
            <p className="mt-2 text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('branches.detail')}</p>
            <h2 className="text-3xl font-bold text-slate-950">{branch?.name ?? dashboard?.branch?.name ?? '-'}</h2>
          </div>
          {(canManage || canDelete) ? (
            <div className="flex flex-wrap gap-2">
              {canManage ? (
                <button
                  type="button"
                  onClick={() => setEditing((current) => !current)}
                  className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700"
                >
                  {editing ? t('common.cancel') : t('common.edit')}
                </button>
              ) : null}
              {canDelete ? (
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setDeleteModalOpen(true)}
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50"
                >
                  {deleting ? t('common.loading') : t('common.delete')}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}

        {canManage && editing ? (
          <form onSubmit={saveBranch} className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
            <BranchInput label={t('warehouse.name')} value={form.name} onChange={(value) => setForm({ ...form, name: value })} required />
            <BranchInput label={t('warehouse.code')} value={form.code} onChange={(value) => setForm({ ...form, code: value })} required />
            <BranchInput label={t('hqWarehouse.city')} value={form.city} onChange={(value) => setForm({ ...form, city: value })} />
            <BranchInput label={t('warehouse.address')} value={form.address} onChange={(value) => setForm({ ...form, address: value })} />
            <BranchInput label={t('users.phone')} value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
            <BranchInput label={t('branches.ownerName')} value={form.ownerName} onChange={(value) => setForm({ ...form, ownerName: value })} />
            <label className="block md:col-span-2">
              <span className="text-sm font-semibold text-slate-700">{t('branches.branchType')}</span>
              <div className="mt-2 flex flex-wrap gap-4">
                {([
                  ['HQ_BRANCH', 'branches.branchTypeHq'],
                  ['FRANCHISE', 'branches.branchTypeFranchise'],
                  ['DEALER', 'branches.branchTypeDealer'],
                  ['DISTRIBUTOR', 'branches.branchTypeDistributor'],
                ] as const).map(([value, labelKey]) => (
                  <label key={value} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name="branchType"
                      value={value}
                      disabled={!canEditBranchType}
                      checked={form.branchType === value}
                      onChange={() => setForm({ ...form, branchType: value })}
                    />
                    {t(labelKey)}
                  </label>
                ))}
              </div>
              {!canEditBranchType ? (
                <p className="mt-2 text-xs text-slate-500">{t('branches.branchTypeCeoOnly')}</p>
              ) : null}
            </label>
            {canEditBranchType && branchTypeChanged ? (
              <>
                <label className="block md:col-span-2">
                  <span className="text-sm font-semibold text-slate-700">{t('branches.pricingProfile')}</span>
                  <select
                    value={form.priceProfileId}
                    onChange={(event) => setForm({ ...form, priceProfileId: event.target.value })}
                    className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                  >
                    <option value="">{t('branches.selectPricingProfile')}</option>
                    {compatibleProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.name}
                      </option>
                    ))}
                  </select>
                  {!currentProfileCompatible ? (
                    <p className="mt-2 text-sm text-amber-700">{t('branches.branchTypeProfileIncompatible')}</p>
                  ) : null}
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">{t('branches.branchTypeChangeReason')}</span>
                  <select
                    value={form.branchTypeChangeReasonCode}
                    onChange={(event) => setForm({ ...form, branchTypeChangeReasonCode: event.target.value })}
                    className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                  >
                    <option value="BUSINESS_MODEL_CHANGED">{t('branches.reason.BUSINESS_MODEL_CHANGED')}</option>
                    <option value="FRANCHISE_CONVERTED">{t('branches.reason.FRANCHISE_CONVERTED')}</option>
                    <option value="DEALER_CONVERTED">{t('branches.reason.DEALER_CONVERTED')}</option>
                    <option value="DISTRIBUTOR_CONVERTED">{t('branches.reason.DISTRIBUTOR_CONVERTED')}</option>
                    <option value="HQ_RESTRUCTURE">{t('branches.reason.HQ_RESTRUCTURE')}</option>
                    <option value="MANAGEMENT_DECISION">{t('branches.reason.MANAGEMENT_DECISION')}</option>
                    <option value="OTHER">{t('branches.reason.OTHER')}</option>
                  </select>
                </label>
                {form.branchTypeChangeReasonCode === 'OTHER' ? (
                  <label className="block">
                    <span className="text-sm font-semibold text-slate-700">{t('branches.branchTypeChangeComment')}</span>
                    <input
                      value={form.branchTypeChangeReasonComment}
                      onChange={(event) => setForm({ ...form, branchTypeChangeReasonComment: event.target.value })}
                      className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                    />
                  </label>
                ) : null}
              </>
            ) : null}
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">{t('common.status')}</span>
              <select
                value={form.status}
                onChange={(event) => setForm({ ...form, status: event.target.value as BranchForm['status'] })}
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
              >
                {['ACTIVE', 'INACTIVE', 'PENDING', 'SUSPENDED'].map((status) => (
                  <option key={status} value={status}>
                    {translateStatus(t, status, 'branch')}
                  </option>
                ))}
              </select>
            </label>
            {canAssign ? (
              <label className="block md:col-span-2">
                <span className="text-sm font-semibold text-slate-700">{t('branchHqRouting.assignedHqWarehouse')}</span>
                <select
                  value={form.assignedHqWarehouseId}
                  onChange={(event) => setForm({ ...form, assignedHqWarehouseId: event.target.value })}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                >
                  <option value="">{t('branchHqRouting.noWarehouseSelected')}</option>
                  {hqWarehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name} ({warehouse.code})
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <button disabled={saving} type="submit" className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:bg-blue-300 md:col-span-2">
              {saving ? t('common.loading') : t('common.save')}
            </button>
          </form>
        ) : null}

        {canAssign && !editing ? (
          <form onSubmit={(event) => void saveAssignment(event)} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">{t('branchHqRouting.assignHqWarehouse')}</h3>
            <p className="mt-1 text-sm text-slate-500">{t('branchHqRouting.assignHqWarehouseHint')}</p>
            <label className="mt-4 block max-w-xl">
              <span className="text-sm font-semibold text-slate-700">{t('branchHqRouting.assignedHqWarehouse')}</span>
              <select
                value={assignedHqWarehouseId}
                onChange={(event) => setAssignedHqWarehouseId(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
              >
                <option value="">{t('branchHqRouting.noWarehouseSelected')}</option>
                {hqWarehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name} ({warehouse.code})
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={saving}
              className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-blue-300"
            >
              {saving ? t('common.loading') : t('common.save')}
            </button>
          </form>
        ) : branch?.assignedHqWarehouse && !editing ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-bold uppercase text-slate-400">{t('branchHqRouting.assignedHqWarehouse')}</p>
            <p className="mt-1 font-semibold text-slate-900">{branch.assignedHqWarehouse.name}</p>
            {branch.assignedHqWarehouse.hqManagerAssignments?.[0]?.user?.fullName ? (
              <p className="mt-2 text-sm text-slate-600">
                {t('branchHqRouting.hqWarehouseManager')}: {branch.assignedHqWarehouse.hqManagerAssignments[0].user.fullName}
              </p>
            ) : null}
          </div>
        ) : null}

        {canInspectWarehouse ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase text-slate-400">{t('branchWarehouse.branchWarehouseTab')}</p>
                {branchWarehouseLoading ? (
                  <p className="mt-2 text-sm text-slate-500">{t('common.loading')}</p>
                ) : branchWarehouseId ? (
                  <p className="mt-1 text-sm text-slate-600">{t('branchWarehouse.warehouseLabel')}</p>
                ) : branchWarehouseMissing ? (
                  <p className="mt-2 text-sm text-slate-500">{t('branchWarehouse.noWarehouseAssigned')}</p>
                ) : null}
              </div>
              {branchWarehouseId ? (
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/branch-warehouses/${branchWarehouseId}?fromBranch=${id}`}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
                  >
                    {t('branchWarehouse.openWarehouse')}
                  </Link>
                  {canDeleteWarehouse ? (
                    <button
                      type="button"
                      onClick={() => setWarehouseDeleteModalOpen(true)}
                      className="rounded-xl border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700"
                    >
                      {t('common.delete')}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {branch && !editing ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-bold uppercase text-slate-400">{t('branches.branchType')}</p>
            <p className="mt-1 font-semibold text-slate-900">{branchTypeLabel(branch.branchType, t)}</p>
            {branch.priceProfile?.name ? (
              <p className="mt-2 text-sm text-slate-600">
                {t('branches.pricingProfile')}: {branch.priceProfile.name}
              </p>
            ) : null}
          </div>
        ) : null}

        {dashboard ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Object.entries(dashboard)
              .filter(([key]) => key !== 'branch')
              .map(([key, value]) => (
                <div key={key} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {branchMetricLabel(key, t)}
                  </p>
                  <p className="mt-2 text-lg font-bold text-slate-950">{formatBranchMetricValue(key, value)}</p>
                </div>
              ))}
          </div>
        ) : null}
      </section>
      <LifecycleDeleteConfirmModal
        open={deleteModalOpen}
        entityType="branch"
        entityName={branch?.name ?? ''}
        entityCode={branch?.code}
        requireReason
        loading={deleting}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={(reason) => void confirmDeleteBranch(reason)}
      />
      <LifecycleDeleteConfirmModal
        open={warehouseDeleteModalOpen}
        entityType="warehouse"
        entityName={branch?.name ? `${branch.name} — склад` : t('branchWarehouse.warehouseLabel')}
        entityCode={branchWarehouseCode ?? undefined}
        requireReason
        loading={warehouseDeleting}
        onClose={() => setWarehouseDeleteModalOpen(false)}
        onConfirm={(reason) => void confirmDeleteWarehouse(reason)}
      />
    </ProtectedShell>
  );
}

function BranchInput({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
      />
    </label>
  );
}

function branchMetricLabel(key: string, t: (key: string) => string) {
  const translationKey = BRANCH_METRIC_KEYS[key] ?? BRANCH_METRIC_KEYS[key.charAt(0).toUpperCase() + key.slice(1)];
  return translationKey ? t(translationKey) : key;
}

function formatBranchMetricValue(key: string, value: unknown) {
  if (typeof value === 'number') {
    const moneyKeys = new Set(['totalSales', 'totalProfit', 'debtAmount', 'inventoryValue']);
    if (moneyKeys.has(key)) {
      return `${value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} KGS`;
    }
    return value.toLocaleString('ru-RU');
  }
  return String(value ?? '—');
}

const BRANCH_METRIC_KEYS: Record<string, string> = {
  customerCount: 'branchProfile.customerCount',
  CustomerCount: 'branchProfile.customerCount',
  totalSales: 'branchProfile.totalSales',
  totalProfit: 'branchProfile.totalProfit',
  debtAmount: 'branchProfile.debtAmount',
  inventoryQuantity: 'branchProfile.inventoryQuantity',
  inventoryValue: 'branchProfile.inventoryValue',
  lowStockCount: 'branchProfile.lowStockCount',
};

function localizeBranchError(message: string, t: (key: string) => string) {
  if (message.includes('уже существует') || message.includes('already exists')) return t('branches.duplicateCode');
  if (
    message.includes('У вас нет прав для изменения типа филиала')
    || message.includes('нет прав')
    || message.includes('Forbidden')
    || message.includes('permission')
  ) {
    return t('branches.branchTypeForbidden');
  }
  if (message.includes('не найден') || message.includes('not found')) return t('branches.notFound');
  if (message.includes('несовместим') || message.includes('incompatible')) {
    return t('branches.branchTypeProfileIncompatible');
  }
  if (message.includes('некорректный тип') || message.includes('incorrect')) {
    return t('branches.invalidBranchType');
  }
  if (message.includes('Не удалось изменить тип филиала') || message.includes('Internal server error')) {
    return t('branches.branchTypeChangeFailed');
  }
  return message || t('branches.branchTypeChangeFailed');
}
