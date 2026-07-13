'use client';

import { useEffect, useState } from 'react';
import { PricingHubNav } from '@/components/pricing/PricingHubNav';
import { apiFetch } from '@/lib/api';
import { canManagePricingPolicy } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type PolicyVersion = {
  id: string;
  versionNumber: number;
  label: string;
  status: 'DRAFT' | 'READY_FOR_REVIEW' | 'APPROVED' | 'SCHEDULED' | 'ACTIVE' | 'ARCHIVED';
  isLocked: boolean;
  publishedAt?: string | null;
  productSnapshotCount: number;
  categoryDiscountSnapshotCount: number;
  createdAt: string;
};

export default function PricingVersionsPage() {
  const { t } = useTranslation();
  const [versions, setVersions] = useState<PolicyVersion[]>([]);
  const [activeVersion, setActiveVersion] = useState<PolicyVersion | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  const canManage = canManagePricingPolicy(user);
  const hasDraft = versions.some((version) => version.status === 'DRAFT');

  async function load() {
    const [rows, active, me] = await Promise.all([
      apiFetch<PolicyVersion[]>('/pricing/versions'),
      apiFetch<PolicyVersion | null>('/pricing/versions/active'),
      apiFetch<User>('/auth/me'),
    ]);
    setVersions(rows);
    setActiveVersion(active);
    setUser(me);
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  async function createVersion() {
    if (!canManage) return;
    setSaving(true);
    setError('');
    try {
      await apiFetch('/pricing/versions', { method: 'POST', body: JSON.stringify({}) });
      setSuccess(t('pricing.versionCreated'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function publishVersion(id: string) {
    if (!canManage) return;
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/pricing/versions/${id}/publish`, { method: 'POST', body: JSON.stringify({}) });
      setSuccess(t('pricing.versionPublished'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function rollbackVersion(id: string) {
    if (!canManage) return;
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/pricing/versions/${id}/rollback`, { method: 'POST', body: JSON.stringify({}) });
      setSuccess(t('pricing.versionRolledBack'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function validateVersion(id: string) {
    if (!canManage) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const report = await apiFetch<{
        valid: boolean;
        errorCount: number;
        warningCount: number;
        issues: Array<{ code: string; message: string; severity: string }>;
      }>(`/pricing/versions/${id}/validate`, { method: 'POST', body: JSON.stringify({}) });
      if (report.valid) {
        setSuccess(t('pricing.validationPassed'));
      } else {
        setError(
          `${t('pricing.validationFailed')}: ${report.issues
            .filter((i) => i.severity === 'ERROR')
            .slice(0, 5)
            .map((i) => i.message)
            .join('; ')}`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PricingHubNav activeTab="versions" />
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}
      <p className="text-xs text-slate-500">{t('pricing.versionsHint')}</p>

      {activeVersion ? (
        <p className="text-sm font-semibold text-slate-800">
          {t('pricing.activeVersion')}: {activeVersion.label} (v{activeVersion.versionNumber})
        </p>
      ) : (
        <p className="text-sm text-slate-500">{t('pricing.noActiveVersion')}</p>
      )}

      {canManage ? (
        <button
          type="button"
          disabled={saving || hasDraft}
          onClick={() => void createVersion()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {t('pricing.createVersion')}
        </button>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[760px] divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">{t('pricing.versionLabel')}</th>
              <th className="px-3 py-2">{t('common.status')}</th>
              <th className="px-3 py-2">{t('pricing.versionSnapshots')}</th>
              <th className="px-3 py-2">{t('pricing.colActions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {versions.map((version) => (
              <tr key={version.id}>
                <td className="px-3 py-2 font-semibold">{version.label}</td>
                <td className="px-3 py-2">{version.status}</td>
                <td className="px-3 py-2">
                  {version.productSnapshotCount} / {version.categoryDiscountSnapshotCount}
                </td>
                <td className="px-3 py-2">
                  {canManage ? (
                    <div className="flex flex-wrap gap-2">
                      {version.status === 'DRAFT' || version.status === 'READY_FOR_REVIEW' || version.status === 'APPROVED' ? (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void validateVersion(version.id)}
                          className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold"
                        >
                          {t('pricing.validateVersion')}
                        </button>
                      ) : null}
                      {version.status === 'DRAFT' ? (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void publishVersion(version.id)}
                          className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold"
                        >
                          {t('pricing.publishVersion')}
                        </button>
                      ) : null}
                      {version.isLocked && version.status !== 'DRAFT' ? (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void rollbackVersion(version.id)}
                          className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold"
                        >
                          {t('pricing.rollbackVersion')}
                        </button>
                      ) : null}
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
