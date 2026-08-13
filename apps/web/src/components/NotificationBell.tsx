'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { notificationHref, notificationModuleIcon, type NotificationItem } from '@/lib/notifications';
import { hasFullAccess } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type NotificationBellProps = {
  user?: User | null;
};

export function NotificationBell({ user = null }: NotificationBellProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [currentUser, setCurrentUser] = useState<User | null>(user);
  const containerRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<User | null>(user);
  const currentUserRef = useRef<User | null>(user);

  useEffect(() => {
    userRef.current = user;
    if (user) {
      setCurrentUser(user);
      currentUserRef.current = user;
    }
  }, [user]);

  async function loadAlerts() {
    try {
      const [result, count] = await Promise.all([
        apiFetch<NotificationItem[]>('/alerts'),
        apiFetch<number>('/alerts/unread-count'),
      ]);
      setAlerts(result.slice(0, 20));
      setUnreadCount(count);
      // Prefer shell-provided session user; only fetch /auth/me as a fallback.
      if (!userRef.current && !currentUserRef.current) {
        const me = await apiFetch<User>('/auth/me');
        currentUserRef.current = me;
        setCurrentUser(me);
      }
    } catch {
      setAlerts([]);
      setUnreadCount(0);
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

  async function markRead(id: string) {
    await apiFetch(`/alerts/${id}/read`, { method: 'POST' }).catch(() => null);
    await loadAlerts();
  }

  async function openNotification(alert: NotificationItem) {
    if (alert.status === 'UNREAD') {
      await markRead(alert.id);
    }
    setOpen(false);
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
        aria-label={t('notifications.title')}
      >
        🔔
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-50 mt-2 max-h-96 w-96 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-bold text-slate-900">{t('notifications.title')}</p>
            <Link href="/notifications" onClick={() => setOpen(false)} className="text-xs font-semibold text-blue-600">
              {t('notifications.viewAll')}
            </Link>
          </div>
          {alerts.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">{t('notifications.empty')}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {alerts.map((alert) => {
                const href = notificationHref(alert);
                const titleKey = `notifications.types.${alert.type}.title`;
                const messageKey = `notifications.types.${alert.type}.message`;
                const title = t(titleKey) === titleKey ? alert.title : t(titleKey);
                const message = t(messageKey) === messageKey ? alert.message : t(messageKey);
                const content = (
                  <div className={`px-4 py-3 hover:bg-slate-50 ${alert.status === 'UNREAD' ? 'bg-blue-50/40' : ''}`}>
                    <div className="flex items-start gap-2">
                      <span className="text-lg">{notificationModuleIcon(alert.module)}</span>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-semibold ${alert.status === 'UNREAD' ? 'text-slate-950' : 'text-slate-600'}`}>
                          {title}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">{message}</p>
                        {alert.referenceNumber ? (
                          <p className="mt-1 text-[10px] font-semibold text-slate-400">{alert.referenceNumber}</p>
                        ) : null}
                        <p className="mt-1 text-[10px] text-slate-400">{new Date(alert.createdAt).toLocaleString()}</p>
                      </div>
                      {alert.status === 'UNREAD' ? (
                        <span className="mt-1 h-2 w-2 rounded-full bg-blue-600" />
                      ) : null}
                    </div>
                  </div>
                );
                return (
                  <li key={alert.id}>
                    {href ? (
                      <Link href={href} onClick={() => void openNotification(alert)}>
                        {content}
                      </Link>
                    ) : (
                      <button type="button" className="w-full text-left" onClick={() => void openNotification(alert)}>
                        {content}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {hasFullAccess(currentUser) ? (
            <div className="border-t border-slate-100 px-4 py-2 text-[10px] text-slate-400">
              {t('notifications.ceoArchiveHint')}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
