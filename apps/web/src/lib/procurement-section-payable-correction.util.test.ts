import { readFileSync } from 'fs';
import { join } from 'path';
import {
  shouldHideSubmissionSummaryOnCorrection,
  shouldShowSubmissionSummary,
} from './procurement-section-payable-correction.util';

function assert(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
}

const panel = readFileSync(
  join(__dirname, '../components/ProcurementSectionPayablePanel.tsx'),
  'utf8',
);

assert(
  panel.includes("from '@/lib/procurement-section-payable-correction.util'"),
  'panel imports correction util',
);
assert(
  panel.includes('shouldShowSubmissionSummary('),
  'panel uses shouldShowSubmissionSummary helper',
);
assert(
  !panel.includes('const showSubmissionSummary = Boolean('),
  'inline submission summary boolean removed',
);

const transportTypes = [
  'CHINA_DOMESTIC_TRANSPORT',
  'CARGO_PAYMENT',
  'KYRGYZSTAN_DOMESTIC_TRANSPORT',
] as const;

for (const requestType of transportTypes) {
  assert(
    shouldHideSubmissionSummaryOnCorrection(requestType, true),
    `1. hide submission summary for returned ${requestType}`,
  );
  assert(
    !shouldHideSubmissionSummaryOnCorrection(requestType, false),
    `2. keep submission summary when not awaiting SM correction for ${requestType}`,
  );
  assert(
    !shouldShowSubmissionSummary(
      { status: 'RETURNED', submittedAt: '2026-08-07T12:00:00.000Z' },
      requestType,
      true,
    ),
    `3. returned ${requestType} opens without submission summary block`,
  );
}

assert(
  shouldShowSubmissionSummary(
    { status: 'WAITING_ACCOUNTANT', submittedAt: '2026-08-07T12:00:00.000Z' },
    'CHINA_DOMESTIC_TRANSPORT',
    false,
  ),
  '4. sent transport still shows submission summary when not in SM correction',
);
assert(
  !shouldHideSubmissionSummaryOnCorrection('OTHER_EXPENSE', true),
  '5. other expense types unchanged on correction',
);
assert(
  panel.includes('procurement.payments.requiresCorrection'),
  '6. compact correction status UI remains',
);
assert(
  panel.includes('sendToAccountant()'),
  '7. resubmit to HQ Accountant action remains',
);

console.log('procurement-section-payable-correction.util.test.ts passed');
