'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';

type AlertItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  status: 'UNREAD' | 'READ' | 'RESOLVED';
  entityType?: string | null;
  entityId?: string | null;
  createdAt: string;
};

function alertHref(alert: AlertItem): string | null {
  if (alert.entityType === 'BranchDistributionOrder' && alert.entityId) {
    return `/distribution/orders/${alert.entityId}`;
  }
  if (alert.entityType === 'BranchInvoice' && alert.entityId) {
    return `/distribution/invoices/${alert.entityId}`;
  }
  if (alert.entityType === 'ShortageReport' && alert.entityId) {
    return `/distribution/shortage-reports/${alert.entityId}`;
  }
  if (alert.entityType === 'BranchPurchaseRequest' && alert.entityId) {
    return '/branch-purchase-requests';
  }
  return null;
}

export function NotificationBell() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  async function loadAlerts() {
    try {
      const result = await apiFetch<AlertItem[]>('/alerts');
      setAlerts(result.slice(0, 20));
    } catch {
      setAlerts([]);
    }
  }

  useEffect(() => {
    void loadAlerts();
    const interval = window.setInterval(() => void loadAlerts(), 60000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const unreadCount = alerts.filter((alert) => alert.status === 'UNREAD').length;

  async function markRead(id: string) {
    await apiFetch(`/alerts/${id}/read`, { method: 'POST' }).catch(() => null);
    await loadAlerts();
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
          void loadAlerts();
        }}
        className="relative rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        aria-label={t('scm.notifications.title')}
      >
        🔔
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-96 max-h-96 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-bold text-slate-900">{t('scm.notifications.title')}</p>
          </div>
          {alerts.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">{t('scm.notifications.empty')}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {alerts.map((alert) => {
                const href = alertHref(alert);
                return (
                  <li key={alert.id} className="px-4 py-3 hover:bg-slate-50">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className={`text-sm font-semibold ${alert.status === 'UNREAD' ? 'text-slate-950' : 'text-slate-600'}`}>
                          {alert.title}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">{alert.message}</p>
                        <p className="mt-1 text-[10px] text-slate-400">{new Date(alert.createdAt).toLocaleString()}</p>
                      </div>
                      <div className="flex shrink-0 flex-col gap-1">
                        {href ? (
                          <Link href={href} onClick={() => setOpen(false)} className="text-xs font-semibold text-blue-600">
                            {t('common.open')}
                          </Link>
                        ) : null}
                        {alert.status === 'UNREAD' ? (
                          <button type="button" onClick={() => void markRead(alert.id)} className="text-xs text-slate-500">
                            {t('scm.notifications.markRead')}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
