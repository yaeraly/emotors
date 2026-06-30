'use client';

import { ProtectedShell } from '@/components/ProtectedShell';

export default function SettingsPage() {
  return (
    <ProtectedShell>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-950">System Settings</h1>
        <p className="mt-2 text-sm text-slate-600">
          Security configuration, backups, and platform settings are managed here by system administrators.
        </p>
      </section>
    </ProtectedShell>
  );
}
