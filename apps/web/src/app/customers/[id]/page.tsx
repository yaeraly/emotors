'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import type {
  Customer,
  CustomerEvent,
  CustomerEventType,
  FollowUp,
  TimelineEntry,
} from '@/lib/types';

const eventTypes: CustomerEventType[] = [
  'NOTE',
  'CALL',
  'WHATSAPP',
  'VISIT',
  'SALE',
  'SERVICE',
  'FOLLOW_UP',
];

type TimelineResponse = {
  customer: Customer;
  events: CustomerEvent[];
  whatsappEvents: CustomerEvent[];
  followUps: FollowUp[];
  timeline: TimelineEntry[];
};

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const customerId = params.id;
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [events, setEvents] = useState<CustomerEvent[]>([]);
  const [whatsappEvents, setWhatsappEvents] = useState<CustomerEvent[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [eventType, setEventType] = useState<CustomerEventType>('NOTE');
  const [eventMessage, setEventMessage] = useState('');
  const [whatsappMessage, setWhatsappMessage] = useState('');
  const [followUpTitle, setFollowUpTitle] = useState('');
  const [followUpDescription, setFollowUpDescription] = useState('');
  const [followUpDueAt, setFollowUpDueAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    void loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  async function loadDetail() {
    setLoading(true);
    setError('');

    try {
      const result = await apiFetch<TimelineResponse>(
        `/customers/${customerId}/timeline`,
      );
      setCustomer(result.customer);
      setEvents(result.events);
      setWhatsappEvents(result.whatsappEvents);
      setFollowUps(result.followUps);
      setTimeline(result.timeline);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load customer');
    } finally {
      setLoading(false);
    }
  }

  async function addEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiFetch(`/customers/${customerId}/events`, {
      method: 'POST',
      body: JSON.stringify({
        type: eventType,
        message: eventMessage,
      }),
    });
    setEventMessage('');
    await loadDetail();
  }

  async function addWhatsAppEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiFetch(`/customers/${customerId}/events`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'WHATSAPP',
        message: whatsappMessage,
      }),
    });
    setWhatsappMessage('');
    await loadDetail();
  }

  async function addFollowUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiFetch(`/customers/${customerId}/follow-ups`, {
      method: 'POST',
      body: JSON.stringify({
        title: followUpTitle,
        description: followUpDescription || undefined,
        dueAt: new Date(followUpDueAt).toISOString(),
      }),
    });
    setFollowUpTitle('');
    setFollowUpDescription('');
    setFollowUpDueAt('');
    await loadDetail();
  }

  async function markDone(followUpId: string) {
    await apiFetch(`/customers/${customerId}/follow-ups/${followUpId}/done`, {
      method: 'PUT',
    });
    await loadDetail();
  }

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <Link
          href="/customers"
          className="inline-flex text-sm font-semibold text-blue-700 hover:text-blue-800"
        >
          Back to customers
        </Link>

        {error ? (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {loading ? (
          <p className="rounded-3xl border border-slate-200 bg-white p-8 text-slate-500 shadow-sm">
            Loading customer...
          </p>
        ) : customer ? (
          <>
            <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
              <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col justify-between gap-4 lg:flex-row">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">
                      Customer Profile
                    </p>
                    <h2 className="mt-2 text-3xl font-bold text-slate-950">
                      {customer.fullName}
                    </h2>
                    <p className="mt-2 text-slate-500">{customer.notes}</p>
                  </div>
                  <span className="h-fit rounded-full bg-blue-100 px-4 py-2 text-sm font-bold text-blue-700">
                    {customer.status}
                  </span>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <Info label="Phone" value={customer.phone} />
                  <Info
                    label="WhatsApp"
                    value={customer.whatsappPhone ?? 'Not set'}
                  />
                  <Info
                    label="Branch"
                    value={customer.branch?.name ?? customer.branchId}
                  />
                  <Info
                    label="Created"
                    value={new Date(customer.createdAt).toLocaleDateString()}
                  />
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  <Amount
                    label="Total purchases"
                    value={customer.totalPurchaseAmount}
                  />
                  <Amount label="Total profit" value={customer.totalProfitAmount} />
                  <Amount label="Total debt" value={customer.totalDebtAmount} />
                </div>
              </article>

              <aside className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-bold text-slate-950">
                  Add follow-up
                </h3>
                <form onSubmit={addFollowUp} className="mt-4 space-y-3">
                  <input
                    value={followUpTitle}
                    onChange={(event) => setFollowUpTitle(event.target.value)}
                    placeholder="Title"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring-2"
                    required
                  />
                  <textarea
                    value={followUpDescription}
                    onChange={(event) =>
                      setFollowUpDescription(event.target.value)
                    }
                    placeholder="Description"
                    className="min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring-2"
                  />
                  <input
                    value={followUpDueAt}
                    onChange={(event) => setFollowUpDueAt(event.target.value)}
                    type="datetime-local"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring-2"
                    required
                  />
                  <button
                    className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700"
                    type="submit"
                  >
                    Add follow-up
                  </button>
                </form>
              </aside>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-bold text-slate-950">
                  Add customer event
                </h3>
                <form onSubmit={addEvent} className="mt-4 space-y-3">
                  <select
                    value={eventType}
                    onChange={(event) =>
                      setEventType(event.target.value as CustomerEventType)
                    }
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring-2"
                  >
                    {eventTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                  <textarea
                    value={eventMessage}
                    onChange={(event) => setEventMessage(event.target.value)}
                    placeholder="Write event details"
                    className="min-h-28 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring-2"
                    required
                  />
                  <button
                    className="rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white hover:bg-slate-800"
                    type="submit"
                  >
                    Add event
                  </button>
                </form>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-bold text-slate-950">
                  Add WhatsApp history
                </h3>
                <form onSubmit={addWhatsAppEvent} className="mt-4 space-y-3">
                  <textarea
                    value={whatsappMessage}
                    onChange={(event) => setWhatsappMessage(event.target.value)}
                    placeholder="Paste or summarize WhatsApp communication"
                    className="min-h-28 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring-2"
                    required
                  />
                  <button
                    className="rounded-xl bg-green-600 px-4 py-3 font-semibold text-white hover:bg-green-700"
                    type="submit"
                  >
                    Save WhatsApp event
                  </button>
                </form>
              </section>
            </div>

            <div className="grid gap-6 xl:grid-cols-3">
              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-2">
                <h3 className="text-lg font-bold text-slate-950">Timeline</h3>
                <div className="mt-4 max-h-[520px] space-y-3 overflow-y-auto pr-2">
                  {timeline.length === 0 ? (
                    <p className="rounded-2xl bg-slate-50 p-6 text-center text-slate-500">
                      No timeline entries yet.
                    </p>
                  ) : (
                    timeline.map((entry) => (
                      <TimelineRow key={`${entry.kind}-${entry.item.id}`} entry={entry} />
                    ))
                  )}
                </div>
              </section>

              <section className="space-y-6">
                <Panel title="WhatsApp history">
                  {whatsappEvents.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      No WhatsApp events yet.
                    </p>
                  ) : (
                    whatsappEvents.map((event) => (
                      <div
                        key={event.id}
                        className="rounded-2xl bg-green-50 p-4 text-sm text-green-950"
                      >
                        <p>{event.message}</p>
                        <p className="mt-2 text-xs text-green-700">
                          {new Date(event.createdAt).toLocaleString()}
                        </p>
                      </div>
                    ))
                  )}
                </Panel>

                <Panel title="Follow-ups">
                  {followUps.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      No follow-ups yet.
                    </p>
                  ) : (
                    followUps.map((followUp) => (
                      <div
                        key={followUp.id}
                        className="rounded-2xl border border-slate-200 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-bold text-slate-900">
                              {followUp.title}
                            </p>
                            <p className="text-sm text-slate-500">
                              Due {new Date(followUp.dueAt).toLocaleString()}
                            </p>
                          </div>
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">
                            {followUp.status}
                          </span>
                        </div>
                        {followUp.description ? (
                          <p className="mt-2 text-sm text-slate-600">
                            {followUp.description}
                          </p>
                        ) : null}
                        {followUp.status === 'OPEN' ? (
                          <button
                            onClick={() => void markDone(followUp.id)}
                            className="mt-3 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                            type="button"
                          >
                            Mark done
                          </button>
                        ) : null}
                      </div>
                    ))
                  )}
                </Panel>
              </section>
            </div>

            <section className="hidden">
              {events.length}
            </section>
          </>
        ) : null}
      </section>
    </ProtectedShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 font-bold text-slate-900">{value}</p>
    </div>
  );
}

function Amount({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-slate-950">
        {Number(value).toFixed(2)}
      </p>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-bold text-slate-950">{title}</h3>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function TimelineRow({ entry }: { entry: TimelineEntry }) {
  if (entry.kind === 'event') {
    return (
      <div className="rounded-2xl border border-slate-200 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-blue-700">
              {entry.item.type}
            </p>
            <p className="mt-1 font-semibold text-slate-950">
              {entry.item.message}
            </p>
          </div>
          <time className="shrink-0 text-right text-xs text-slate-500">
            {new Date(entry.at).toLocaleString()}
          </time>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-blue-700">
            FOLLOW_UP · {entry.item.status}
          </p>
          <p className="mt-1 font-semibold text-slate-950">
            {entry.item.title}
          </p>
          {entry.item.description ? (
            <p className="mt-1 text-sm text-slate-600">
              {entry.item.description}
            </p>
          ) : null}
        </div>
        <time className="shrink-0 text-right text-xs text-slate-500">
          {new Date(entry.at).toLocaleString()}
        </time>
      </div>
    </div>
  );
}
