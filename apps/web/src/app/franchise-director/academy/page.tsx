'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { FranchiseDirectorShell } from '@/components/franchise-director/FranchiseDirectorShell';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';

type AcademyResponse = {
  students: Array<{ id: string; fullName: string; status: string; certificates: Array<{ id: string }> }>;
  certificates: Array<{ id: string; certificateNumber: string; level: string; expiresAt?: string | null; student?: { fullName: string }; course?: { title: string } }>;
  expiredCertificates: Array<{ id: string; certificateNumber: string; student?: { fullName: string }; expiresAt?: string | null }>;
  requiredTraining: Array<{ id: string; student?: { fullName: string }; course?: { title: string }; status: string }>;
};

export default function FranchiseDirectorAcademyPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<AcademyResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void apiFetch<AcademyResponse>('/franchise-director/academy')
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  return (
    <FranchiseDirectorShell titleKey="franchiseDirector.academy">
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      <p className="text-sm text-slate-500">{t('franchiseDirector.academyReadOnly')}</p>
      <div className="flex gap-3">
        <Link href="/academy/students" className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold">{t('franchiseDirector.openTrainingRecords')}</Link>
        <Link href="/academy/certificates" className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold">{t('nav.academy')}</Link>
      </div>
      {data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">{t('franchiseDirector.trainingProgress')}</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {data.requiredTraining.slice(0, 20).map((row) => (
                <li key={row.id} className="flex justify-between gap-3">
                  <span>{row.student?.fullName ?? '-'} · {row.course?.title ?? '-'}</span>
                  <span className="text-slate-500">{row.status}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">{t('franchiseDirector.expiredCertificates')}</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {data.expiredCertificates.length === 0 ? (
                <li className="text-slate-500">{t('franchiseDirector.none')}</li>
              ) : (
                data.expiredCertificates.map((row) => (
                  <li key={row.id}>
                    {row.student?.fullName ?? '-'} · {row.certificateNumber}
                    {row.expiresAt ? ` · ${new Date(row.expiresAt).toLocaleDateString()}` : ''}
                  </li>
                ))
              )}
            </ul>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
            <h2 className="text-lg font-bold">{t('franchiseDirector.certificationStatus')}</h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 text-sm">
              {data.certificates.slice(0, 40).map((row) => (
                <li key={row.id} className="rounded-xl border border-slate-100 px-3 py-2">
                  <p className="font-semibold">{row.student?.fullName ?? '-'}</p>
                  <p className="text-slate-500">{row.course?.title ?? '-'} · {row.level}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}
    </FranchiseDirectorShell>
  );
}
