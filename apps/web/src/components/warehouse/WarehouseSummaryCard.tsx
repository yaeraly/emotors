export function WarehouseSummaryCard({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white shadow-sm ${
        compact ? 'min-w-0 px-2.5 py-2 sm:px-3 sm:py-2.5' : 'p-4'
      }`}
    >
      <p
        className={`font-semibold uppercase tracking-wide text-slate-500 ${
          compact ? 'truncate text-[10px] leading-tight sm:text-[11px]' : 'text-xs'
        }`}
      >
        {label}
      </p>
      <p
        className={`font-bold text-slate-950 ${
          compact ? 'mt-1 truncate text-base sm:text-lg' : 'mt-2 text-2xl'
        }`}
      >
        {value}
      </p>
    </div>
  );
}
