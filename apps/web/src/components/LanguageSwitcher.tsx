'use client';

import {
  languageLabels,
  languageShortLabels,
  languages,
} from '@/i18n/translations';
import { useTranslation } from '@/i18n/useTranslation';

export function LanguageSwitcher() {
  const { language, setLanguage } = useTranslation();

  return (
    <div
      aria-label="Language"
      className="inline-flex rounded-xl border border-slate-300 bg-white p-1"
    >
        {languages.map((item) => (
        <button
          key={item}
          onClick={() => setLanguage(item)}
          type="button"
          title={languageLabels[item]}
          className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
            language === item
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          {languageShortLabels[item]}
        </button>
        ))}
    </div>
  );
}
