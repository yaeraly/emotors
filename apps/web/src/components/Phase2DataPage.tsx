'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';

type Phase2DataPageProps = {
  titleKey: string;
  descriptionKey?: string;
  endpoint: string;
  createEndpoint?: string;
  defaultPayload?: Record<string, unknown>;
  actionHref?: string;
  actionKey?: string;
};

export function Phase2DataPage({
  titleKey,
  descriptionKey,
  endpoint,
  createEndpoint,
  defaultPayload = {},
  actionHref,
  actionKey,
}: Phase2DataPageProps) {
  const { t } = useTranslation();
  const [data, setData] = useState<unknown>(null);
  const [payload, setPayload] = useState(
    JSON.stringify(defaultPayload, null, 2),
  );
  const [error, setError] = useState('');

  async function load() {
    setError('');
    try {
      setData(await apiFetch(endpoint));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!createEndpoint) return;
    setError('');
    try {
      await apiFetch(createEndpoint, {
        method: 'POST',
        body: payload,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">
              {t('phase2.title')}
            </p>
            <h2 className="text-3xl font-bold text-slate-950">{t(titleKey)}</h2>
            {descriptionKey ? (
              <p className="mt-2 text-slate-500">{t(descriptionKey)}</p>
            ) : null}
          </div>
          <div className="flex gap-2">
            {actionHref && actionKey ? (
              <Link
                href={actionHref}
                className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white"
              >
                {t(actionKey)}
              </Link>
            ) : null}
            <button
              onClick={() => void load()}
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              type="button"
            >
              {t('phase2.refresh')}
            </button>
          </div>
        </div>

        {error ? (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {createEndpoint ? (
          <form
            onSubmit={submit}
            className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">
                {t('phase2.submitJson')}
              </span>
              <textarea
                value={payload}
                onChange={(event) => setPayload(event.target.value)}
                className="mt-2 min-h-40 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm"
              />
            </label>
            <button
              className="mt-4 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white"
              type="submit"
            >
              {t('common.create')}
            </button>
          </form>
        ) : null}

        <DataView data={data} />
      </section>
    </ProtectedShell>
  );
}

function DataView({ data }: { data: unknown }) {
  if (!data) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8 text-slate-500 shadow-sm">
        Loading...
      </div>
    );
  }

  if (Array.isArray(data)) {
    return <Table rows={data as Record<string, unknown>[]} />;
  }

  if (typeof data === 'object') {
    const objectData = data as Record<string, unknown>;
    if (Array.isArray(objectData.items)) {
      return <Table rows={objectData.items as Record<string, unknown>[]} />;
    }
    if (Array.isArray(objectData.comparison)) {
      return <Table rows={objectData.comparison as Record<string, unknown>[]} />;
    }
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Object.entries(objectData).map(([key, value]) => (
          <div
            key={key}
            className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {key}
            </p>
            <pre className="mt-2 whitespace-pre-wrap text-sm font-semibold text-slate-950">
              {formatValue(value)}
            </pre>
          </div>
        ))}
      </div>
    );
  }

  return null;
}

function Table({ rows }: { rows: Record<string, unknown>[] }) {
  const columns = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set<string>()),
  ).slice(0, 8);

  return (
    <div className="h-[calc(100vh-280px)] min-h-96 overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="sticky top-0 bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
            <tr>
              {columns.map((column) => (
                <th key={column} className="px-4 py-3">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, index) => (
              <tr key={String(row.id ?? index)}>
                {columns.map((column) => (
                  <td key={column} className="px-4 py-3 align-top">
                    {formatValue(row[column])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) return value.toLocaleDateString();
  if (typeof value === 'object') {
    const maybeNamed = value as { name?: string; title?: string; fullName?: string; code?: string };
    return maybeNamed.name ?? maybeNamed.title ?? maybeNamed.fullName ?? maybeNamed.code ?? JSON.stringify(value);
  }
  return String(value);
}
