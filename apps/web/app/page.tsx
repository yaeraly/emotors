import { ProtectedShell } from '../components/protected-shell';
import { PageHeader, StatCard } from '../components/ui';

const modules = [
  ['CRM', 'Customers, follow-ups, WhatsApp history, and timelines'],
  ['Sales', 'Receipts, QR payloads, installments, payments, and debts'],
  ['Service', 'Diagnostics, repairs, warranties, and master assignment'],
  ['Inventory', 'Catalog, warehouses, stock movement, and low-stock alerts'],
  ['Finance', 'Cashbox, profit, debts, cashflow, ABC/XYZ, and margins'],
  ['Users', 'JWT login, role permissions, users, and branches'],
];

export default function DashboardPage() {
  return (
    <ProtectedShell>
      <PageHeader
        title="Management Dashboard"
        description="Phase 1 production-ready operating foundation for EMOTORS."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="API Port" value="3001" />
        <StatCard label="WEB Port" value="3000" />
        <StatCard label="Auth" value="JWT" />
        <StatCard label="Database" value="PostgreSQL" />
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {modules.map(([title, description]) => (
          <section
            key={title}
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <h3 className="text-xl font-black text-slate-950">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
          </section>
        ))}
      </div>
    </ProtectedShell>
  );
}
