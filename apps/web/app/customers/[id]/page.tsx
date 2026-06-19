'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ProtectedShell } from '../../../components/protected-shell';
import { Card, PageHeader } from '../../../components/ui';
import { apiFetch } from '../../../lib/api';

type Customer = {
  id: string;
  fullName: string;
  phone: string;
  whatsappPhone?: string;
  status: string;
  notes?: string;
  totalPurchaseAmount: string;
  totalProfitAmount: string;
  totalDebtAmount: string;
};

type TimelineItem = {
  type: string;
  at: string;
  title: string;
  details?: string;
  status?: string;
};

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [eventTitle, setEventTitle] = useState('');
  const [followUpTitle, setFollowUpTitle] = useState('');
  const [followUpDueAt, setFollowUpDueAt] = useState('');

  const load = async () => {
    const [customerData, timelineData] = await Promise.all([
      apiFetch<Customer>(`/customers/${params.id}`),
      apiFetch<TimelineItem[]>(`/customers/${params.id}/timeline`),
    ]);
    setCustomer(customerData);
    setTimeline(timelineData);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const addEvent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await apiFetch(`/customers/${params.id}/events`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'WHATSAPP',
        title: eventTitle,
      }),
    });
    setEventTitle('');
    await load();
  };

  const addFollowUp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await apiFetch(`/customers/${params.id}/follow-ups`, {
      method: 'POST',
      body: JSON.stringify({
        title: followUpTitle,
        dueAt: followUpDueAt,
      }),
    });
    setFollowUpTitle('');
    setFollowUpDueAt('');
    await load();
  };

  return (
    <ProtectedShell>
      <PageHeader
        title={customer?.fullName ?? 'Customer'}
        description="Customer history, WhatsApp touches, follow-ups, sales, and repairs."
      />
      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <div className="space-y-6">
          <Card className="p-5">
            <h3 className="font-black text-slate-950">Profile</h3>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-slate-500">Phone</dt>
                <dd className="font-semibold">{customer?.phone}</dd>
              </div>
              <div>
                <dt className="text-slate-500">WhatsApp</dt>
                <dd className="font-semibold">{customer?.whatsappPhone ?? '-'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Status</dt>
                <dd className="font-semibold">{customer?.status}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Debt</dt>
                <dd className="font-semibold">{customer?.totalDebtAmount} KGS</dd>
              </div>
            </dl>
          </Card>
          <Card className="p-5">
            <h3 className="font-black text-slate-950">WhatsApp History</h3>
            <form onSubmit={addEvent} className="mt-4 space-y-3">
              <input
                className="w-full rounded-xl border border-slate-300 px-4 py-3"
                placeholder="Message summary"
                value={eventTitle}
                onChange={(event) => setEventTitle(event.target.value)}
                required
              />
              <button className="w-full rounded-xl bg-brand-600 px-4 py-3 font-bold text-white">
                Add WhatsApp Event
              </button>
            </form>
          </Card>
          <Card className="p-5">
            <h3 className="font-black text-slate-950">Follow-up</h3>
            <form onSubmit={addFollowUp} className="mt-4 space-y-3">
              <input
                className="w-full rounded-xl border border-slate-300 px-4 py-3"
                placeholder="Follow-up task"
                value={followUpTitle}
                onChange={(event) => setFollowUpTitle(event.target.value)}
                required
              />
              <input
                className="w-full rounded-xl border border-slate-300 px-4 py-3"
                type="datetime-local"
                value={followUpDueAt}
                onChange={(event) => setFollowUpDueAt(event.target.value)}
                required
              />
              <button className="w-full rounded-xl bg-slate-950 px-4 py-3 font-bold text-white">
                Schedule Follow-up
              </button>
            </form>
          </Card>
        </div>
        <Card className="overflow-hidden">
          <div className="border-b border-slate-200 p-5">
            <h3 className="font-black text-slate-950">Timeline</h3>
          </div>
          <div className="max-h-[720px] overflow-y-auto">
            {timeline.map((item, index) => (
              <div key={`${item.type}-${index}`} className="border-b border-slate-100 p-5">
                <p className="text-xs font-bold uppercase tracking-wide text-brand-700">
                  {item.type}
                </p>
                <p className="mt-1 font-bold text-slate-950">{item.title}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {new Date(item.at).toLocaleString()}
                  {item.status ? ` · ${item.status}` : ''}
                </p>
                {item.details ? (
                  <p className="mt-2 text-sm text-slate-600">{item.details}</p>
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </ProtectedShell>
  );
}
