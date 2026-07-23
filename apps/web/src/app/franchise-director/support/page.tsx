'use client';

import { FormEvent, useEffect, useState } from 'react';
import { FranchiseDirectorShell } from '@/components/franchise-director/FranchiseDirectorShell';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';

const ASSIGNEE_ROLES = ['Branch Manager', 'Marketing', 'Academy', 'Supply Manager'] as const;

type Task = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  assigneeRole?: string | null;
  dueAt?: string | null;
  isOverdue?: boolean;
  branch?: { name: string } | null;
  assigneeUser?: { fullName: string } | null;
};

export default function FranchiseDirectorSupportPage() {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    title: '',
    description: '',
    assigneeRole: 'Branch Manager',
    dueAt: '',
  });

  async function load() {
    try {
      setTasks(await apiFetch<Task[]>('/franchise-director/tasks'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await apiFetch('/franchise-director/tasks', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setForm({ title: '', description: '', assigneeRole: 'Branch Manager', dueAt: '' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function completeTask(id: string) {
    try {
      await apiFetch(`/franchise-director/tasks/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'COMPLETED' }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  return (
    <FranchiseDirectorShell titleKey="franchiseDirector.support">
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      <form onSubmit={onCreate} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2">
        <input required value={form.title} onChange={(e) => setForm((c) => ({ ...c, title: e.target.value }))} placeholder={t('franchiseDirector.taskTitle')} className="rounded-xl border border-slate-300 px-3 py-2 text-sm md:col-span-2" />
        <textarea value={form.description} onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))} placeholder={t('franchiseDirector.taskDescription')} className="rounded-xl border border-slate-300 px-3 py-2 text-sm md:col-span-2" rows={3} />
        <select value={form.assigneeRole} onChange={(e) => setForm((c) => ({ ...c, assigneeRole: e.target.value }))} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
          {ASSIGNEE_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
        </select>
        <input type="date" value={form.dueAt} onChange={(e) => setForm((c) => ({ ...c, dueAt: e.target.value }))} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
        <button type="submit" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white md:col-span-2">
          {t('franchiseDirector.createTask')}
        </button>
      </form>

      <div className="space-y-3">
        {tasks.map((task) => (
          <div key={task.id} className={`rounded-2xl border p-4 shadow-sm ${task.isOverdue ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-white'}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-950">{task.title}</p>
                <p className="mt-1 text-sm text-slate-500">{task.description || '-'}</p>
                <p className="mt-2 text-xs text-slate-500">
                  {task.assigneeRole ?? task.assigneeUser?.fullName ?? '-'} · {task.branch?.name ?? t('franchiseDirector.networkWide')} · {task.status}
                  {task.dueAt ? ` · ${new Date(task.dueAt).toLocaleDateString()}` : ''}
                </p>
              </div>
              {task.status !== 'COMPLETED' ? (
                <button type="button" onClick={() => void completeTask(task.id)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">
                  {t('franchiseDirector.completeTask')}
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </FranchiseDirectorShell>
  );
}
