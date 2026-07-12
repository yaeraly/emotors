'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { canViewBranchRequestIssues } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';
import { translateStatus } from '@/lib/translate-status';

type BranchRequestIssue = {
  id: string;
  issueType: 'NO_PRICING_POLICY' | 'OUT_OF_STOCK';
  status: string;
  requestedQuantity: number;
  availableQuantity: number;
  unavailableQuantity: number;
  publicComment?: string | null;
  createdAt: string;
  branchRequest: { id: string; requestNumber: string };
  branchRequestItem: { id: string; sku: string; productName: string; quantity: number; publicComment?: string | null };
  branch: { id: string; name: string };
  product: { id: string; sku: string; name: string; category?: string | null; productCategory?: { name?: string } | null };
  supplyInquiries: Array<{
    id: string;
    status: string;
    respondedBy?: { fullName: string } | null;
  }>;
};

const ISSUE_GROUPS = [
  { key: 'NO_PRICING_POLICY', labelKey: 'branchRequestIssues.noPricingPolicy' },
  { key: 'OUT_OF_STOCK', labelKey: 'branchRequestIssues.outOfStock' },
  { key: 'WAITING_FOR_SUPPLY', labelKey: 'branchRequestIssues.waitingForSupply' },
] as const;

export default function BranchRequestIssuesPage() {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [issues, setIssues] = useState<BranchRequestIssue[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [inquiryModal, setInquiryModal] = useState<BranchRequestIssue | null>(null);
  const [inquiryMessage, setInquiryMessage] = useState('');
  const [inquiryPriority, setInquiryPriority] = useState('NORMAL');

  const canView = canViewBranchRequestIssues(user);

  async function load() {
    const [me, rows] = await Promise.all([
      apiFetch<User>('/auth/me'),
      apiFetch<BranchRequestIssue[]>('/branch-request-issues'),
    ]);
    setUser(me);
    setIssues(rows);
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  const grouped = useMemo(() => {
    const noPricing = issues.filter((issue) => issue.issueType === 'NO_PRICING_POLICY' && issue.status === 'OPEN');
    const outOfStock = issues.filter(
      (issue) => issue.issueType === 'OUT_OF_STOCK' && (issue.status === 'OPEN' || issue.status === 'WAITING_FOR_SUPPLY'),
    );
    const waitingSupply = issues.filter((issue) => issue.status === 'WAITING_FOR_SUPPLY');
    return { noPricing, outOfStock, waitingSupply };
  }, [issues]);

  async function updateIssueStatus(issueId: string, status: string) {
    setError('');
    try {
      await apiFetch(`/branch-request-issues/${issueId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setSuccess(t('branchRequestIssues.statusUpdated'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function sendSupplyInquiry() {
    if (!inquiryModal) return;
    setError('');
    try {
      await apiFetch(`/branch-request-issues/${inquiryModal.id}/supply-inquiry`, {
        method: 'POST',
        body: JSON.stringify({ message: inquiryMessage, priority: inquiryPriority }),
      });
      setSuccess(t('branchRequestIssues.inquirySent'));
      setInquiryModal(null);
      setInquiryMessage('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function openInquiryModal(issue: BranchRequestIssue) {
    setInquiryModal(issue);
    setInquiryMessage(t('branchRequestIssues.defaultInquiryMessage'));
    setInquiryPriority('NORMAL');
  }

  function renderIssueCard(issue: BranchRequestIssue) {
    const category = issue.product.productCategory?.name ?? issue.product.category ?? '-';
    return (
      <div key={issue.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-slate-900">{issue.product.name}</p>
            <p className="text-xs text-slate-500">{issue.product.sku} · {category}</p>
            <p className="mt-2 text-sm text-slate-600">
              {issue.branch.name} · {issue.branchRequest.requestNumber}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {t('branchProductRequest.requestedQuantity')}: {issue.requestedQuantity} ·{' '}
              {t('branchProductRequest.availableQuantity')}: {issue.availableQuantity} ·{' '}
              {t('branchProductRequest.missingQuantity')}: {issue.unavailableQuantity}
            </p>
            {issue.publicComment ? <p className="mt-2 text-sm text-amber-700">{issue.publicComment}</p> : null}
            <p className="mt-1 text-xs text-slate-400">{new Date(issue.createdAt).toLocaleString()}</p>
          </div>
          <div className="flex flex-col gap-2">
            {issue.issueType === 'NO_PRICING_POLICY' ? (
              <Link
                href={`/pricing/retail`}
                className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white"
              >
                {t('branchRequestIssues.configurePricingPolicy')}
              </Link>
            ) : null}
            {issue.issueType === 'OUT_OF_STOCK' ? (
              <>
                <button
                  type="button"
                  onClick={() => openInquiryModal(issue)}
                  className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white"
                >
                  {t('branchRequestIssues.askSupplyManager')}
                </button>
                <Link href={`/products/${issue.product.id}`} className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold">
                  {t('branchRequestIssues.openProduct')}
                </Link>
                <Link href={`/branch-purchase-requests/${issue.branchRequest.id}`} className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold">
                  {t('branchRequestIssues.openBranchRequest')}
                </Link>
                <Link href="/procurement" className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold">
                  {t('branchRequestIssues.openProcurement')}
                </Link>
              </>
            ) : null}
            <select
              value={issue.status}
              onChange={(event) => void updateIssueStatus(issue.id, event.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
            >
              {['OPEN', 'WAITING_FOR_SUPPLY', 'RESOLVED', 'CANCELLED'].map((status) => (
                <option key={status} value={status}>
                  {translateStatus(t, status, 'branchRequestIssue')}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    );
  }

  if (user && !canView) {
    return (
      <ProtectedShell>
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{t('common.forbiddenMessage')}</p>
      </ProtectedShell>
    );
  }

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('branchRequestIssues.subtitle')}</p>
          <h2 className="text-3xl font-bold text-slate-950">{t('branchRequestIssues.title')}</h2>
        </div>

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}

        <div className="space-y-8">
          <div>
            <h3 className="mb-3 text-lg font-bold text-slate-900">{t('branchRequestIssues.noPricingPolicy')}</h3>
            <div className="space-y-3">
              {grouped.noPricing.length ? grouped.noPricing.map(renderIssueCard) : (
                <p className="text-sm text-slate-500">{t('branchRequestIssues.emptyGroup')}</p>
              )}
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-lg font-bold text-slate-900">{t('branchRequestIssues.outOfStock')}</h3>
            <div className="space-y-3">
              {grouped.outOfStock.length ? grouped.outOfStock.map(renderIssueCard) : (
                <p className="text-sm text-slate-500">{t('branchRequestIssues.emptyGroup')}</p>
              )}
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-lg font-bold text-slate-900">{t('branchRequestIssues.waitingForSupply')}</h3>
            <div className="space-y-3">
              {grouped.waitingSupply.length ? grouped.waitingSupply.map(renderIssueCard) : (
                <p className="text-sm text-slate-500">{t('branchRequestIssues.emptyGroup')}</p>
              )}
            </div>
          </div>
        </div>

        {inquiryModal ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
            <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-xl">
              <h3 className="text-lg font-bold text-slate-950">{t('branchRequestIssues.askSupplyManager')}</h3>
              <p className="mt-2 text-sm text-slate-600">
                {inquiryModal.product.name} ({inquiryModal.product.sku})
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {inquiryModal.branchRequest.requestNumber} · {t('branchProductRequest.requestedQuantity')}: {inquiryModal.requestedQuantity} · {t('branchProductRequest.availableQuantity')}: {inquiryModal.availableQuantity}
              </p>
              <label className="mt-4 block">
                <span className="text-sm font-semibold text-slate-700">{t('branchRequestIssues.priority')}</span>
                <select
                  value={inquiryPriority}
                  onChange={(event) => setInquiryPriority(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                >
                  {['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((priority) => (
                    <option key={priority} value={priority}>{priority}</option>
                  ))}
                </select>
              </label>
              <label className="mt-4 block">
                <span className="text-sm font-semibold text-slate-700">{t('branchRequestIssues.message')}</span>
                <textarea
                  value={inquiryMessage}
                  onChange={(event) => setInquiryMessage(event.target.value)}
                  rows={4}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </label>
              <div className="mt-6 flex justify-end gap-2">
                <button type="button" onClick={() => setInquiryModal(null)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold">
                  {t('common.cancel')}
                </button>
                <button type="button" onClick={() => void sendSupplyInquiry()} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
                  {t('common.send')}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </ProtectedShell>
  );
}
