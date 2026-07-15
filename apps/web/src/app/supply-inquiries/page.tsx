'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedShell } from '@/components/ProtectedShell';
import { useTranslation } from '@/i18n/useTranslation';

export default function SupplyInquiriesRedirectPage() {
  const router = useRouter();
  const { t } = useTranslation();

  useEffect(() => {
    router.replace('/procurement');
  }, [router]);

  return (
    <ProtectedShell>
      <p className="text-sm text-slate-600">{t('common.loading')}</p>
    </ProtectedShell>
  );
}
