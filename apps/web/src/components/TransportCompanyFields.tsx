'use client';

const transportTypes = ['CHINA_DOMESTIC', 'CHINA_EXPORT', 'KYRGYZSTAN_LOCAL', 'UNIVERSAL'] as const;
const currencies = ['CNY', 'USD', 'KGS'];

export function TransportCompanyFields({
  form,
  setField,
  t,
}: {
  form: Record<string, string>;
  setField: (key: string, value: string) => void;
  t: (key: string) => string;
}) {
  return (
    <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
      <Input label={t('procurement.transportCompanies.name')} value={form.name} onChange={(value) => setField('name', value)} required />
      <Input label={t('procurement.transportCompanies.companyCode')} value={form.companyCode} onChange={(value) => setField('companyCode', value)} required />
      <Input label={t('procurement.transportCompanies.country')} value={form.country} onChange={(value) => setField('country', value)} />
      <Input label={t('procurement.transportCompanies.city')} value={form.city} onChange={(value) => setField('city', value)} />
      <Input label={t('procurement.transportCompanies.contactPerson')} value={form.contactPerson} onChange={(value) => setField('contactPerson', value)} />
      <Input label={t('procurement.transportCompanies.phone')} value={form.phone} onChange={(value) => setField('phone', value)} />
      <Input label={t('procurement.transportCompanies.whatsapp')} value={form.whatsapp} onChange={(value) => setField('whatsapp', value)} />
      <Input label={t('procurement.transportCompanies.wechat')} value={form.wechat} onChange={(value) => setField('wechat', value)} />
      <Input label={t('procurement.transportCompanies.email')} value={form.email} onChange={(value) => setField('email', value)} />
      <Input label={t('procurement.transportCompanies.address')} value={form.address} onChange={(value) => setField('address', value)} />
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">{t('procurement.transportCompanies.transportType')}</span>
        <select value={form.transportType} onChange={(e) => setField('transportType', e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2">
          {transportTypes.map((type) => <option key={type} value={type}>{t(`procurement.transportCompanies.type.${type}`)}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">{t('procurement.transportCompanies.defaultCurrency')}</span>
        <select value={form.defaultCurrency} onChange={(e) => setField('defaultCurrency', e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2">
          {currencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">{t('procurement.transportCompanies.status')}</span>
        <select value={form.status} onChange={(e) => setField('status', e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2">
          <option value="ACTIVE">{t('procurement.transportCompanies.statusValue.ACTIVE')}</option>
          <option value="INACTIVE">{t('procurement.transportCompanies.statusValue.INACTIVE')}</option>
        </select>
      </label>
      <Input label={t('procurement.transportCompanies.notes')} value={form.notes} onChange={(value) => setField('notes', value)} />
    </section>
  );
}

function Input({ label, value, onChange, required }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return <label className="block"><span className="text-sm font-semibold text-slate-700">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} required={required} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>;
}
