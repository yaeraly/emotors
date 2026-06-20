'use client';

import { languageLabels, languages } from '@/i18n/translations';
import { useTranslation } from '@/i18n/useTranslation';

export function LanguageSwitcher() {
  const { language, setLanguage } = useTranslation();

  return (
    <label className="block">
      <span className="sr-only">Language</span>
      <select
        value={language}
        onChange={(event) => setLanguage(event.target.value as typeof language)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none ring-blue-500 focus:ring-2"
      >
        {languages.map((item) => (
          <option key={item} value={item}>
            {languageLabels[item]}
          </option>
        ))}
      </select>
    </label>
  );
}
