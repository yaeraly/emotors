import type { Role } from '@/lib/types';

export const assignableRoles: Role[] = [
  'MANAGER',
  'MASTER',
  'WAREHOUSE_OPERATOR',
  'CASHIER',
  'ACCOUNTANT',
];

export const branchOwnerAssignableRoles: Role[] = [
  'FRANCHISE_OWNER',
  ...assignableRoles,
];

export const hqAssignableRoles: Role[] = [
  'FRANCHISE_DIRECTOR',
  'SUPPLY_CHAIN_MANAGER',
  'WAREHOUSE_MANAGER',
  'FINANCE_MANAGER',
  'ACCOUNTANT',
  'MARKETING_MANAGER',
  'CONTENT_CREATOR',
  'ACADEMY_DIRECTOR',
  'SYSTEM_ADMINISTRATOR',
];

const roleLabels: Partial<Record<Role, string>> = {
  FRANCHISE_OWNER: 'Branch Owner',
  MANAGER: 'Sales Manager',
  MASTER: 'Technician',
  WAREHOUSE_OPERATOR: 'Warehouse Manager',
  CASHIER: 'Cashier',
  ACCOUNTANT: 'Accountant',
  FRANCHISE_DIRECTOR: 'Franchise Director',
  SUPPLY_CHAIN_MANAGER: 'Supply Chain Manager',
  WAREHOUSE_MANAGER: 'Warehouse Manager',
  FINANCE_MANAGER: 'Finance Manager',
  MARKETING_MANAGER: 'Marketing Manager',
  CONTENT_CREATOR: 'Content Creator',
  ACADEMY_DIRECTOR: 'Academy Director',
  SYSTEM_ADMINISTRATOR: 'System Administrator',
};

const roleDescriptions: Partial<Record<Role, string>> = {
  FRANCHISE_OWNER: 'Own branch CRM, sales, service, inventory, finance, KPI, employees, reports',
  MANAGER: 'CRM, customers, sales, installments, service coordination',
  MASTER: 'Service orders, diagnosis, repairs, warranty, parts consumption',
  WAREHOUSE_OPERATOR: 'Branch warehouse receiving, stock count, stock movements',
  CASHIER: 'Payments, receipts, cash register, daily cash closing',
  ACCOUNTANT: 'Branch finance view, payments, optional payroll support',
};

export function roleLabel(role: Role) {
  return roleLabels[role] ?? role.replaceAll('_', ' ');
}

export function RoleBadges({ roles }: { roles: Role[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {roles.map((role) => (
        <span key={role} className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
          {roleLabel(role)}
        </span>
      ))}
    </div>
  );
}

export function RoleSelector({
  label,
  selectedRoles,
  onChange,
  roles = assignableRoles,
}: {
  label: string;
  selectedRoles: Role[];
  onChange: (roles: Role[]) => void;
  roles?: Role[];
}) {
  function toggle(role: Role) {
    if (selectedRoles.includes(role)) {
      const next = selectedRoles.filter((selectedRole) => selectedRole !== role);
      onChange(next.length ? next : selectedRoles);
      return;
    }
    onChange([...selectedRoles, role]);
  }

  return (
    <fieldset className="rounded-2xl border border-slate-200 p-4 md:col-span-2">
      <legend className="px-1 text-sm font-semibold text-slate-700">{label}</legend>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {roles.map((role) => (
          <label key={role} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
            <input
              checked={selectedRoles.includes(role)}
              onChange={() => toggle(role)}
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-blue-600"
            />
            <span>
              <span className="block">{roleLabel(role)}</span>
              <span className="block text-xs font-normal text-slate-500">{roleDescriptions[role]}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
