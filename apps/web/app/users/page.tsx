'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ProtectedShell } from '../../components/protected-shell';
import { Card, PageHeader } from '../../components/ui';
import { apiFetch } from '../../lib/api';

type User = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  branch?: { name: string };
};

type Branch = { id: string; name: string; code: string };

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [form, setForm] = useState({
    email: '',
    fullName: '',
    password: 'password123',
    role: 'MANAGER',
    branchId: '',
  });

  const load = async () => {
    const [userData, branchData] = await Promise.all([
      apiFetch<User[]>('/users'),
      apiFetch<Branch[]>('/users/branches'),
    ]);
    setUsers(userData);
    setBranches(branchData);
    if (!form.branchId && branchData[0]) {
      setForm((current) => ({ ...current, branchId: branchData[0].id }));
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await apiFetch('/users', {
      method: 'POST',
      body: JSON.stringify(form),
    });
    setForm((current) => ({
      ...current,
      email: '',
      fullName: '',
      password: 'password123',
    }));
    await load();
  };

  return (
    <ProtectedShell>
      <PageHeader
        title="Users"
        description="Owner-only user and branch management."
      />
      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <Card className="p-5">
          <h3 className="font-black text-slate-950">Create User</h3>
          <form onSubmit={submit} className="mt-4 space-y-3">
            <input
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
              placeholder="Email"
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              required
            />
            <input
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
              placeholder="Full name"
              value={form.fullName}
              onChange={(event) =>
                setForm({ ...form, fullName: event.target.value })
              }
              required
            />
            <input
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
              placeholder="Password"
              value={form.password}
              onChange={(event) =>
                setForm({ ...form, password: event.target.value })
              }
              required
            />
            <select
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
              value={form.role}
              onChange={(event) => setForm({ ...form, role: event.target.value })}
            >
              <option value="OWNER">OWNER</option>
              <option value="MANAGER">MANAGER</option>
              <option value="MASTER">MASTER</option>
              <option value="ACCOUNTANT">ACCOUNTANT</option>
            </select>
            <select
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
              value={form.branchId}
              onChange={(event) =>
                setForm({ ...form, branchId: event.target.value })
              }
              required
            >
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name} ({branch.code})
                </option>
              ))}
            </select>
            <button className="w-full rounded-xl bg-brand-600 px-4 py-3 font-bold text-white">
              Create User
            </button>
          </form>
        </Card>
        <Card className="overflow-hidden">
          {users.map((user) => (
            <div key={user.id} className="border-b border-slate-100 p-5">
              <p className="font-black text-slate-950">{user.fullName}</p>
              <p className="text-sm text-slate-500">
                {user.email} · {user.role} · {user.branch?.name}
              </p>
            </div>
          ))}
        </Card>
      </div>
    </ProtectedShell>
  );
}
