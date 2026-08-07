import { TransportExpenseStatus } from '@prisma/client';
import {
  formatCorrectionRoutingAssignee,
  resolveCorrectionRoutingEmployee,
  resolveSupplierInvoiceCorrectionRouting,
  resolveTransportExpenseCorrectionRouting,
} from './accountant-bill-correction-routing.util';

function assert(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// 1–4. Procurement invoice types routed to Supply Manager
for (const requestType of [
  'SUPPLIER_PAYMENT',
  'CHINA_DOMESTIC_TRANSPORT',
  'CARGO_PAYMENT',
  'KYRGYZSTAN_DOMESTIC_TRANSPORT',
] as const) {
  assertEqual(
    resolveTransportExpenseCorrectionRouting({
      requestType,
      status: TransportExpenseStatus.RETURNED,
      executionStatus: null,
      supplyManager: { id: 'sm-1', fullName: 'Азамат' },
    }),
    {
      direction: 'TO_SUPPLY_MANAGER',
      employeeName: 'Азамат',
    },
    `${requestType} returned to Supply Manager`,
  );
}

assertEqual(
  resolveSupplierInvoiceCorrectionRouting({
    invoiceReviewStatus: 'RETURNED',
    invoiceSentBy: { id: 'sm-1', fullName: 'Азамат' },
  }),
  {
    direction: 'TO_SUPPLY_MANAGER',
    employeeName: 'Азамат',
  },
  '1. supplier payment returned to Supply Manager',
);

// 5. Specific Supply Manager name when available
assertEqual(
  resolveTransportExpenseCorrectionRouting({
    requestType: 'CARGO_PAYMENT',
    status: TransportExpenseStatus.RETURNED,
    executionStatus: null,
    supplyManager: { id: 'sm-2', fullName: 'Азамат', username: 'azamat01' },
  })?.employeeName,
  'Азамат',
  '5. full name preferred',
);

// 6. Login fallback when name unavailable
assertEqual(
  resolveCorrectionRoutingEmployee({ id: 'sm-3', username: 'azamat01' }),
  { employeeLogin: 'azamat01' },
  '6. login fallback',
);

assertEqual(
  resolveCorrectionRoutingEmployee({ id: 'sm-4', email: 'azamat01@example.com' }),
  { employeeLogin: 'azamat01@example.com' },
  '6b. email login fallback',
);

// 7. Raw user ID is never displayed in formatted assignee
const formatted = formatCorrectionRoutingAssignee({ direction: 'TO_SUPPLY_MANAGER' }, 'Supply Manager');
assert(!formatted.includes('sm-'), '7. raw user ID not shown');
assertEqual(formatted, 'Supply Manager', '7b. role-only when no identity');

// 8–9. Cashier return shows FROM_HQ_CASHIER with cashier identity
assertEqual(
  resolveTransportExpenseCorrectionRouting({
    requestType: 'CHINA_DOMESTIC_TRANSPORT',
    status: TransportExpenseStatus.RETURNED,
    executionStatus: 'RETURNED_TO_ACCOUNTANT',
    returnedBy: { id: 'cash-1', fullName: 'Айбек' },
  }),
  {
    direction: 'FROM_HQ_CASHIER',
    employeeName: 'Айбек',
  },
  '8. cashier-returned transport',
);

assertEqual(
  resolveSupplierInvoiceCorrectionRouting({
    invoiceReviewStatus: 'APPROVED',
    supplierPayments: [
      {
        status: 'RETURNED',
        executionStatus: 'RETURNED_TO_ACCOUNTANT',
        returnedAt: '2026-08-01T10:00:00.000Z',
        sequenceNumber: 1,
        returnedBy: { id: 'cash-1', fullName: 'Айбек' },
      },
    ],
  }),
  {
    direction: 'FROM_HQ_CASHIER',
    employeeName: 'Айбек',
  },
  '8b. cashier-returned supplier payment',
);

// 10. After accountant forwards to Supply Manager, current routing is SM
assertEqual(
  resolveSupplierInvoiceCorrectionRouting({
    invoiceReviewStatus: 'RETURNED',
    invoiceSentBy: { id: 'sm-1', fullName: 'Азамат' },
    supplierPayments: [
      {
        status: 'RETURNED',
        executionStatus: 'RETURNED_TO_ACCOUNTANT',
        returnedAt: '2026-08-02T10:00:00.000Z',
        returnedBy: { id: 'cash-1', fullName: 'Айбек' },
      },
    ],
  }),
  {
    direction: 'TO_SUPPLY_MANAGER',
    employeeName: 'Азамат',
  },
  '10. invoiceReviewStatus RETURNED overrides prior cashier return',
);

assertEqual(
  resolveTransportExpenseCorrectionRouting({
    requestType: 'KYRGYZSTAN_DOMESTIC_TRANSPORT',
    status: TransportExpenseStatus.RETURNED,
    executionStatus: null,
    supplyManager: { id: 'sm-1', fullName: 'Азамат' },
    returnedBy: { id: 'cash-1', fullName: 'Айбек' },
  })?.direction,
  'TO_SUPPLY_MANAGER',
  '10b. transport forwarded to SM after cashier return',
);

// 12. Normal invoices do not show correction text
assertEqual(
  resolveTransportExpenseCorrectionRouting({
    requestType: 'OTHER_EXPENSE',
    status: TransportExpenseStatus.RETURNED,
    executionStatus: null,
  }),
  undefined,
  '12. unrelated request type',
);

assertEqual(
  resolveTransportExpenseCorrectionRouting({
    requestType: 'CARGO_PAYMENT',
    status: TransportExpenseStatus.WAITING_ACCOUNTANT,
    executionStatus: null,
  }),
  undefined,
  '12b. non-returned status',
);

// Role-only when Supply Manager is not individually assigned
assertEqual(
  formatCorrectionRoutingAssignee({ direction: 'TO_SUPPLY_MANAGER' }, 'Supply Manager'),
  'Supply Manager',
  'role-only Supply Manager',
);

assertEqual(
  formatCorrectionRoutingAssignee(
    { direction: 'TO_SUPPLY_MANAGER', employeeName: 'Азамат' },
    'Supply Manager',
  ),
  'Supply Manager — Азамат',
  'named Supply Manager',
);

console.log('accountant-bill-correction-routing.util.test.ts passed');
