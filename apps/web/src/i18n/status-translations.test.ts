import { languages, translations } from './translations';
import { statusTranslationSupplement } from './status-translations';
import { getStatusLabel } from '../lib/translate-status';

const mergedTranslations = Object.fromEntries(
  languages.map((lang) => [
    lang,
    { ...translations[lang], ...statusTranslationSupplement[lang] },
  ]),
) as typeof translations;

const REQUIRED_STATUS_VALUES = [
  'DRAFT',
  'PENDING',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'ACTIVE',
  'INACTIVE',
  'PAID',
  'PARTIALLY_PAID',
  'UNPAID',
  'OVERDUE',
  'RESERVED',
  'EXPIRED',
  'SHIPPED',
  'DELIVERED',
  'RECEIVED',
  'READY',
  'OPEN',
  'CLOSED',
  'FINALIZED',
  'SENT_TO_CUSTOMER',
  'COUNTING',
  'SUBMITTED',
  'PARTIAL',
  'DEBT',
] as const;

function assertTruthy(value: unknown, label: string) {
  if (!value) {
    throw new Error(label);
  }
}

function assertNotEqual(actual: string, expected: string, label: string) {
  if (actual === expected) {
    throw new Error(label);
  }
}

for (const lang of languages) {
  for (const status of REQUIRED_STATUS_VALUES) {
    const key = `status.${status}`;
    assertTruthy(mergedTranslations[lang][key], `${lang} missing ${key}`);
  }
}

for (const lang of languages) {
  const t = (key: string) => mergedTranslations[lang][key] ?? key;
  const label = getStatusLabel({ module: 'sale', status: 'FINALIZED', t });
  assertNotEqual(label, 'FINALIZED', `${lang} sale FINALIZED should be translated`);
}

for (const lang of languages) {
  const t = (key: string) => mergedTranslations[lang][key] ?? key;
  const label = getStatusLabel({
    module: 'installmentApproval',
    status: 'PENDING_BRANCH_CEO_APPROVAL',
    t,
  });
  assertNotEqual(
    label,
    'PENDING_BRANCH_CEO_APPROVAL',
    `${lang} installment approval status should be translated`,
  );
}

console.log('status-translations.test.ts: all checks passed');
