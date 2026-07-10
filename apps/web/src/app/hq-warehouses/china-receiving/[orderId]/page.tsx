'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { ChinaReceivingWorkspace, type ChinaReceivingDetail } from '@/components/china-receiving/ChinaReceivingWorkspace';
import { apiFetch } from '@/lib/api';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

export default function ChinaReceivingDetailPage() {
  const { t } = useTranslation();
  const params = useParams<{ orderId: string }>();
  const [user, setUser] = useState<User | null>(null);
  const [task, setTask] = useState<ChinaReceivingDetail | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [me, detail] = await Promise.all([
        apiFetch<User>('/auth/me'),
        apiFetch<ChinaReceivingDetail>(`/procurement/china-receiving/${params.orderId}`),
      ]);
      setUser(me);
      setTask(detail);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }, [params.orderId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ProtectedShell>
      {error && !task ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {task && user ? <ChinaReceivingWorkspace task={task} user={user} onReload={load} /> : null}
    </ProtectedShell>
  );
}
