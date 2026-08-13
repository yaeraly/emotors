type ContactPersonSource = {
  contactPerson?: string | null;
  phone?: string | null;
};

export function formatHqWarehouseContactPerson(
  warehouse: ContactPersonSource,
  t: (key: string) => string,
): string {
  const parts = [warehouse.contactPerson?.trim(), warehouse.phone?.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : t('hqWarehouse.notSpecified');
}
