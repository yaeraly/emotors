'use client';

import { useEffect, useMemo, useState } from 'react';
import { PricingHubNav } from '@/components/pricing/PricingHubNav';
import { apiFetch } from '@/lib/api';
import {
  normalizeFranchiseSalesCatalogResponse,
  type FranchiseSalesCatalogListResponse,
  type FranchiseSalesCatalogRow,
} from '@/lib/franchise-sales-catalog';
import { canManagePricingPolicy } from '@/lib/rbac';
import type { BranchType, User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

import { toast } from '@/lib/toast';

type OverrideRow = {
  id: string;
  branchId: string;
  productId: string;
  overridePriceKgs: number;
  startDate: string;
  endDate: string;
  reason: string;
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
  isEffective: boolean;
  branch: { id: string; name: string; code: string; branchType: BranchType };
  product: { id: string; name: string; sku: string };
  createdBy: { id: string; fullName: string };
  approvedBy?: { id: string; fullName: string } | null;
};

type BranchOption = { id: string; name: string; code: string; branchType: BranchType };
type ProductOption = { id: string; name: string; sku: string };

type OverrideForm = {
  branchId: string;
  productId: string;
  overridePriceKgs: string;
  startDate: string;
  endDate: string;
  reason: string;
};

const REASON_OPTIONS = [
  'VIP agreement',
  'Promotional campaign',
  'First order discount',
  'Regional support',
  'Strategic customer',
  'Manual CEO decision',
] as const;

const emptyForm: OverrideForm = {
  branchId: '',
  productId: '',
  overridePriceKgs: '',
  startDate: '',
  endDate: '',
  reason: REASON_OPTIONS[0],
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

function statusLabel(status: OverrideRow['status'], t: (key: string) => string) {
  if (status === 'ACTIVE') return t('pricing.overrideStatusActive');
  if (status === 'EXPIRED') return t('pricing.overrideStatusExpired');
  return t('pricing.overrideStatusCancelled');
}

export default function PricingOverridesPage() {
  const { t } = useTranslation();
  const [overrides, setOverrides] = useState<OverrideRow[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState<OverrideForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const canManage = canManagePricingPolicy(user);

  async function load() {
    const query = statusFilter ? `?status=${statusFilter}` : '';
    const [overrideRows, branchRows, productRows, me] = await Promise.all([
      apiFetch<OverrideRow[]>(`/pricing/overrides${query}`),
      apiFetch<BranchOption[]>('/branches'),
      apiFetch<FranchiseSalesCatalogListResponse | FranchiseSalesCatalogRow[]>(
        '/pricing/franchise-sales',
      ),
      apiFetch<User>('/auth/me'),
    ]);
    setOverrides(overrideRows);
    setBranches(branchRows.filter((branch) => branch.branchType === 'FRANCHISE'));
    const catalog = normalizeFranchiseSalesCatalogResponse(productRows);
    setProducts(catalog.items.map((row) => ({ id: row.id, name: row.name, sku: row.sku })));
    setUser(me);
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t, statusFilter]);

  const franchiseBranches = useMemo(
    () => branches.filter((branch) => branch.branchType === 'FRANCHISE'),
    [branches],
  );

  function startEdit(row: OverrideRow) {
    setEditingId(row.id);
    setForm({
      branchId: row.branchId,
      productId: row.productId,
      overridePriceKgs: String(row.overridePriceKgs),
      startDate: row.startDate.slice(0, 10),
      endDate: row.endDate.slice(0, 10),
      reason: row.reason,
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function saveOverride() {
    if (!canManage) return;
    setSaving(true);
    setError('');
    /* toast clear */ void 0;
    try {
      const payload = {
        branchId: form.branchId,
        productId: form.productId,
        overridePriceKgs: Number(form.overridePriceKgs),
        startDate: form.startDate,
        endDate: form.endDate,
        reason: form.reason.trim(),
      };
      if (editingId) {
        await apiFetch(`/pricing/overrides/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify({
            overridePriceKgs: Number(form.overridePriceKgs),
            startDate: form.startDate,
            endDate: form.endDate,
            reason: form.reason.trim(),
          }),
        });
      } else {
        await apiFetch('/pricing/overrides', { method: 'POST', body: JSON.stringify(payload) });
      }
      toast.success(t('pricing.overrideSaved'));
      resetForm();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function approveOverride(id: string) {
    if (!canManage) return;
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/pricing/overrides/${id}/approve`, { method: 'POST', body: JSON.stringify({}) });
      toast.success(t('pricing.overrideApproved'));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function cancelOverride(id: string) {
    if (!canManage) return;
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/pricing/overrides/${id}/cancel`, { method: 'POST', body: JSON.stringify({}) });
      toast.success(t('pricing.overrideCancelled'));
      if (editingId === id) resetForm();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PricingHubNav activeTab="overrides" />
      <div>
        <h1 className="text-2xl font-semibold">{t('pricing.tabOverrides')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pricing.overridesHint')}</p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {success ? <p className="text-sm text-green-600">{success}</p> : null}

      {canManage ? (
        <div className="rounded-lg border p-4 space-y-4">
          <h2 className="font-medium">{editingId ? t('pricing.editOverride') : t('pricing.createOverride')}</h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <label className="space-y-1 text-sm">
              <span>{t('pricing.selectBranch')}</span>
              <select
                className="w-full rounded border px-3 py-2"
                value={form.branchId}
                disabled={!!editingId}
                onChange={(e) => setForm((current) => ({ ...current, branchId: e.target.value }))}
              >
                <option value="">{t('pricing.selectBranch')}</option>
                {franchiseBranches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span>{t('pricing.selectProduct')}</span>
              <select
                className="w-full rounded border px-3 py-2"
                value={form.productId}
                disabled={!!editingId}
                onChange={(e) => setForm((current) => ({ ...current, productId: e.target.value }))}
              >
                <option value="">{t('pricing.selectProduct')}</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} ({product.sku})
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span>{t('pricing.overridePrice')}</span>
              <input
                type="number"
                min={0}
                className="w-full rounded border px-3 py-2"
                value={form.overridePriceKgs}
                onChange={(e) => setForm((current) => ({ ...current, overridePriceKgs: e.target.value }))}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>{t('pricing.overrideStartDate')}</span>
              <input
                type="date"
                className="w-full rounded border px-3 py-2"
                value={form.startDate}
                onChange={(e) => setForm((current) => ({ ...current, startDate: e.target.value }))}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>{t('pricing.overrideEndDate')}</span>
              <input
                type="date"
                className="w-full rounded border px-3 py-2"
                value={form.endDate}
                onChange={(e) => setForm((current) => ({ ...current, endDate: e.target.value }))}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>{t('pricing.overrideReason')}</span>
              <select
                className="w-full rounded border px-3 py-2"
                value={form.reason}
                onChange={(e) => setForm((current) => ({ ...current, reason: e.target.value }))}
              >
                {REASON_OPTIONS.map((reason) => (
                  <option key={reason} value={reason}>
                    {reason}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
              disabled={saving || !form.branchId || !form.productId || !form.overridePriceKgs}
              onClick={() => void saveOverride()}
            >
              {saving ? t('common.saving') : t('common.save')}
            </button>
            {editingId ? (
              <button type="button" className="rounded border px-4 py-2" onClick={resetForm}>
                {t('common.cancel')}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <label className="text-sm">
          {t('pricing.overrideStatus')}
          <select
            className="ml-2 rounded border px-2 py-1"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">{t('common.all')}</option>
            <option value="ACTIVE">{t('pricing.overrideStatusActive')}</option>
            <option value="EXPIRED">{t('pricing.overrideStatusExpired')}</option>
            <option value="CANCELLED">{t('pricing.overrideStatusCancelled')}</option>
          </select>
        </label>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-3 py-2">{t('pricing.selectBranch')}</th>
              <th className="px-3 py-2">{t('pricing.selectProduct')}</th>
              <th className="px-3 py-2">{t('pricing.overridePrice')}</th>
              <th className="px-3 py-2">{t('pricing.overrideStartDate')}</th>
              <th className="px-3 py-2">{t('pricing.overrideEndDate')}</th>
              <th className="px-3 py-2">{t('pricing.overrideReason')}</th>
              <th className="px-3 py-2">{t('pricing.overrideStatus')}</th>
              {canManage ? <th className="px-3 py-2">{t('common.actions')}</th> : null}
            </tr>
          </thead>
          <tbody>
            {overrides.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="px-3 py-2">{row.branch.name}</td>
                <td className="px-3 py-2">
                  {row.product.name}
                  <div className="text-xs text-muted-foreground">{row.product.sku}</div>
                </td>
                <td className="px-3 py-2">{row.overridePriceKgs.toFixed(0)}</td>
                <td className="px-3 py-2">{formatDate(row.startDate)}</td>
                <td className="px-3 py-2">{formatDate(row.endDate)}</td>
                <td className="px-3 py-2">{row.reason}</td>
                <td className="px-3 py-2">
                  {row.isEffective ? t('pricing.overrideEffective') : statusLabel(row.status, t)}
                </td>
                {canManage ? (
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      {row.status === 'ACTIVE' ? (
                        <>
                          <button type="button" className="text-primary" onClick={() => startEdit(row)}>
                            {t('common.edit')}
                          </button>
                          {!row.approvedBy ? (
                            <button type="button" className="text-primary" onClick={() => void approveOverride(row.id)}>
                              {t('pricing.approveOverride')}
                            </button>
                          ) : null}
                          <button type="button" className="text-destructive" onClick={() => void cancelOverride(row.id)}>
                            {t('pricing.cancelOverride')}
                          </button>
                        </>
                      ) : null}
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
            {!overrides.length ? (
              <tr>
                <td className="px-3 py-6 text-center text-muted-foreground" colSpan={canManage ? 8 : 7}>
                  {t('pricing.noOverrides')}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
