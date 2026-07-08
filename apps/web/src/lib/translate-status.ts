export type StatusDomain =
  | 'procurement'
  | 'distribution'
  | 'payment'
  | 'warehouse'
  | 'employee'
  | 'branch'
  | 'branchRequest'
  | 'branchShortage'
  | 'service'
  | 'inventory'
  | 'general';

export function translateStatus(
  t: (key: string) => string,
  status: string | null | undefined,
  domain?: StatusDomain,
): string {
  if (!status) return '-';
  const normalized = String(status).trim();
  if (!normalized) return '-';

  const candidates = domain
    ? [`${domain}.status.${normalized}`, `status.${normalized}`]
    : [`status.${normalized}`];

  for (const key of candidates) {
    const translated = t(key);
    if (translated !== key) return translated;
  }

  return normalized.replaceAll('_', ' ');
}
