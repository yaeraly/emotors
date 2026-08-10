'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { notificationHref, notificationModuleIcon, type NotificationItem } from '@/lib/notifications';
import { hasFullAccess } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

import { toast } from '@/lib/toast';

const MODULE_FILTERS = [
  'ALL',
  'UNREAD',
  'INVENTORY',
  'PROCUREMENT',
  'WAREHOUSE',
  'DISTRIBUTION',
  'FINANCE',
  'BRANCH_ORDERS',
  'SYSTEM',
] as const;

export default function NotificationsPage() {
  const { t } = useTranslation();
  const [alerts, setAlerts] = useState<NotificationItem[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [filter, setFilter] = useState<(typeof MODULE_FILTERS)[number]>('ALL');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (filter === 'UNREAD') params.set('status', 'UNREAD');
    if (filter !== 'ALL' && filter !== 'UNREAD') params.set('module', filter);
    if (search.trim()) params.set('search', search.trim());
    return params.toString();
  }, [filter, search]);

  async function load() {
    try {
      const [result, me] = await Promise.all([
        apiFetch<NotificationItem[]>(`/alerts${query ? `?${query}` : ''}`),
        apiFetch<User>('/auth/me'),
      ]);
      setAlerts(result);
      setCurrentUser(me);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function markRead(id: string) {
    await apiFetch(`/alerts/${id}/read`, { method: 'POST' });
    await load();
  }

  async function archive(id: string) {
    await apiFetch(`/alerts/${id}/archive`, { method: 'POST' });
    await load();
  }

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('app.name')}</p>
          <h2 className="text-3xl font-bold text-slate-950">{t('notifications.title')}</h2>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('notifications.searchPlaceholder')}
            className="flex-1 rounded-xl border border-slate-300 px-3 py-2"
          />
          <div className="flex flex-wrap gap-2">
            {MODULE_FILTERS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFilter(item)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  filter === item ? 'bg-blue-600 text-white' : 'border border-slate-300 text-slate-600'
                }`}
              >
                {t(`notifications.filters.${item}`)}
              </button>
            ))}
          </div>
        </div>

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        <div className="divide-y divide-slate-100 rounded-3xl border border-slate-200 bg-white shadow-sm">
          {alerts.length === 0 ? (
            <p className="px-6 py-10 text-sm text-slate-500">{t('notifications.empty')}</p>
          ) : (
            alerts.map((alert) => {
              const href = notificationHref(alert);
              const titleKey = `notifications.types.${alert.type}.title`;
              const messageKey = `notifications.types.${alert.type}.message`;
              const title = t(titleKey) === titleKey ? alert.title : t(titleKey);
              const message = t(messageKey) === messageKey ? alert.message : t(messageKey);
              return (
                <div
                  key={alert.id}
                  className={`flex items-start justify-between gap-4 px-6 py-4 ${alert.status === 'UNREAD' ? 'bg-blue-50/40' : ''}`}
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="text-xl">{notificationModuleIcon(alert.module)}</span>
                    <div>
                      <p className="font-semibold text-slate-950">{title}</p>
                      <p className="mt-1 text-sm text-slate-500">{message}</p>
                      {alert.referenceNumber ? (
                        <p className="mt-1 text-xs font-semibold text-slate-400">{alert.referenceNumber}</p>
                      ) : null}
                      <p className="mt-1 text-xs text-slate-400">{new Date(alert.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-2">
                    {href ? (
                      <Link
                        href={href}
                        onClick={() => alert.status === 'UNREAD' && void markRead(alert.id)}
                        className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold"
                      >
                        {t('common.open')}
                      </Link>
                    ) : null}
                    {alert.status === 'UNREAD' ? (
                      <button type="button" onClick={() => void markRead(alert.id)} className="text-xs text-slate-500">
                        {t('notifications.markRead')}
                      </button>
                    ) : null}
                    {hasFullAccess(currentUser) && alert.status !== 'ARCHIVED' ? (
                      <button type="button" onClick={() => void archive(alert.id)} className="text-xs text-red-600">
                        {t('notifications.archive')}
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </ProtectedShell>
  );
}
