import {
  isFinanceModuleRoute,
  isFinancePaymentsRoute,
  isFinanceShiftsRoute,
  isRouteActive,
  resolveActiveRouteHref,
  sidebarFinanceNavClass,
  sidebarPaymentsNavClass,
} from './nav-matching';

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

assertEqual(isFinancePaymentsRoute('/finance/payments/pending'), true, 'pending payments route');
assertEqual(isFinancePaymentsRoute('/finance/payments'), true, 'accepted payments route');
assertEqual(isFinancePaymentsRoute('/finance/shifts'), false, 'shifts is not payments route');

assertEqual(isFinanceShiftsRoute('/finance/shifts'), true, 'shifts route');
assertEqual(isFinanceShiftsRoute('/finance/accounts'), false, 'accounts is not shifts route');

assertEqual(isFinanceModuleRoute('/finance/dashboard'), true, 'finance module route');

assertEqual(
  isRouteActive('/finance/payments', '/finance/payments/pending', ''),
  false,
  'pending tab inactive on accepted page',
);
assertEqual(
  isRouteActive('/finance/payments/pending', '/finance/payments/pending', ''),
  true,
  'pending tab active on pending page',
);
assertEqual(
  isRouteActive('/finance/payments', '/finance/payments', ''),
  true,
  'accepted tab active without query',
);
assertEqual(
  isRouteActive('/finance/payments/pending', '/finance/payments', ''),
  false,
  'accepted tab inactive on pending page',
);
assertEqual(
  isRouteActive('/finance/payments', '/finance/payments?status=PARTIAL', '?status=PARTIAL'),
  true,
  'partial tab active with query',
);
assertEqual(
  isRouteActive('/finance/payments', '/finance/payments', '?status=PARTIAL'),
  false,
  'accepted tab inactive when partial filter applied',
);

assertEqual(
  resolveActiveRouteHref('/finance/payments/pending', '', [
    '/finance/payments/pending',
    '/finance/payments',
  ]),
  '/finance/payments/pending',
  'longest payment href wins',
);

assertEqual(
  sidebarPaymentsNavClass('/finance/payments').includes('bg-blue-50'),
  true,
  'payments sidebar active on accepted page',
);
assertEqual(
  sidebarFinanceNavClass('/finance/reconciliation').includes('bg-blue-50'),
  true,
  'finance sidebar active on child finance route',
);

console.log('nav-matching.test.ts passed');
