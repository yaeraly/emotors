function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function slugifyHqWarehouseCity(value: string): string {
  const slug = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
  return slug || 'HQ';
}

export function nextHqWarehouseCode(city: string, name: string, existingCodes: string[]): string {
  const source = city.trim() || name.trim();
  const citySlug = slugifyHqWarehouseCity(source);
  const prefix = `HQ-${citySlug}`;
  const pattern = new RegExp(`^${escapeRegex(prefix)}-(\\d+)$`, 'i');

  let maxNum = 0;
  for (const code of existingCodes) {
    const match = code.match(pattern);
    if (match) maxNum = Math.max(maxNum, Number.parseInt(match[1], 10));
  }

  return `${prefix}-${String(maxNum + 1).padStart(4, '0')}`;
}
