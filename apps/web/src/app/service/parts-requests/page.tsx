'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { isBranchWarehouseOperator, BRANCH_WAREHOUSE_OPERATOR_REQUESTS_REDIRECT } from '@/lib/rbac';
import { shouldHideBranchCeoDuplicateNavTitle } from '@/lib/unified-nav-page-title';
import type { PartsRequest, User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';
import { translateStatus } from '@/lib/translate-status';

import { toast } from '@/lib/toast';

export default function PartsRequestsPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [requests, setRequests] = useState<PartsRequest[]>([]);
  const [error, setError] = useState('');
  const hideDuplicateTitle = shouldHideBranchCeoDuplicateNavTitle(user);

  useEffect(() => {
    apiFetch<User>('/auth/me')
      .then((currentUser) => {
        setUser(currentUser);
        if (isBranchWarehouseOperator(currentUser)) {
          router.replace(BRANCH_WAREHOUSE_OPERATOR_REQUESTS_REDIRECT);
        }
      })
      .catch(() => null);
  }, [router]);

  async function load() {
    setRequests(await apiFetch<PartsRequest[]>('/service-orders/parts-requests'));
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  async function issue(requestId: string) {
    setError('');
    try {
      await apiFetch(`/service-orders/parts-requests/${requestId}/issue`, { method: 'POST', body: JSON.stringify({}) });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function reject(requestId: string) {
    await apiFetch(`/service-orders/parts-requests/${requestId}/reject`, { method: 'POST', body: JSON.stringify({}) });
    await load();
  }

  async function waitingStock(requestId: string) {
    await apiFetch(`/service-orders/parts-requests/${requestId}/waiting-stock`, { method: 'POST', body: JSON.stringify({}) });
    await load();
  }

  return (
    <ProtectedShell>
      <section className="space-y-6">
        {!hideDuplicateTitle ? (
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('service.title')}</p>
            <h2 className="text-3xl font-bold text-slate-950">{t('operations.partsRequests')}</h2>
          </div>
        ) : null}
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        <div className="space-y-4">
          {requests.map((request) => (
            <article key={request.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-bold text-slate-950">{request.requestNumber}</p>
                  <p className="text-sm text-slate-600">
                    {request.serviceOrder?.orderNumber} · {request.serviceOrder?.customer?.fullName}
                  </p>
                  <p className="text-sm">{translateStatus(t, request.status, 'service')}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {request.serviceOrderId ? (
                    <Link href={`/service/${request.serviceOrderId}`} className="rounded-xl border px-3 py-2 text-sm font-semibold">{t('common.open')}</Link>
                  ) : null}
                  {['SUBMITTED', 'PARTIALLY_ISSUED', 'WAITING_STOCK', 'PENDING'].includes(request.status) ? (
                    <>
                      <button onClick={() => void issue(request.id)} className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white" type="button">Выдать</button>
                      <button onClick={() => void waitingStock(request.id)} className="rounded-xl border px-3 py-2 text-sm font-semibold" type="button">Ожидание склада</button>
                      <button onClick={() => void reject(request.id)} className="rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600" type="button">Отклонить</button>
                    </>
                  ) : null}
                </div>
              </div>
              <ul className="mt-4 space-y-2 text-sm">
                {request.items.map((item) => (
                  <li key={item.id} className="rounded-xl bg-slate-50 px-3 py-2">
                    {item.sku} · {item.productName} — {item.issuedQuantity}/{item.quantity}
                    {item.unitPrice != null ? ` · ${item.unitPrice.toLocaleString('ru-RU')} KGS` : ''}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>
    </ProtectedShell>
  );
}
