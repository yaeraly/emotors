import type { Role } from '@/lib/types';

export const assignableRoles: Role[] = [
  'FRANCHISE_OWNER',
  'MANAGER',
  'MASTER',
  'WAREHOUSE_OPERATOR',
  'CASHIER',
  'ACCOUNTANT',
  'SALESPERSON',
  'SUPPLY_CHAIN_MANAGER',
  'WAREHOUSE_MANAGER',
  'PROCUREMENT_MANAGER',
  'FINANCE_MANAGER',
  'ACADEMY_MANAGER',
  'MARKETING_MANAGER',
];

export function roleLabel(role: Role) {
  return role.replaceAll('_', ' ');
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
}: {
  label: string;
  selectedRoles: Role[];
  onChange: (roles: Role[]) => void;
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
        {assignableRoles.map((role) => (
          <label key={role} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
            <input
              checked={selectedRoles.includes(role)}
              onChange={() => toggle(role)}
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-blue-600"
            />
            {roleLabel(role)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
