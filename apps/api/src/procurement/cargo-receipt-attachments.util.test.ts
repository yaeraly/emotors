import assert from 'node:assert/strict';
import { FileAttachmentEntityType, TransportExpenseType } from '@prisma/client';
import {
  countCargoReceiptAttachmentsByOrderIds,
  countCargoReceiptAttachmentsForOrder,
  listCargoReceiptAttachmentsForOrder,
  resolveCargoReceiptEntityIds,
} from './cargo-receipt-attachments.util';

function createMockDb(params: {
  expenses: Array<{ id: string; procurementOrderId: string | null }>;
  attachments: Array<{
    id: string;
    entityId: string;
    fileName: string;
    fileUrl: string;
    mimeType: string;
    createdAt?: Date;
  }>;
}) {
  return {
    procurementTransportExpense: {
      findMany: async (args: {
        where: {
          procurementOrderId?: string | { in: string[] };
          expenseType?: TransportExpenseType;
          status?: { not: string };
        };
        select: Record<string, boolean>;
      }) => {
        const orderFilter = args.where.procurementOrderId;
        const orderIds =
          typeof orderFilter === 'string'
            ? [orderFilter]
            : orderFilter && 'in' in orderFilter
              ? orderFilter.in
              : [];
        return params.expenses
          .filter((row) => row.procurementOrderId && orderIds.includes(row.procurementOrderId))
          .map((row) => {
            const selected: Record<string, unknown> = {};
            for (const key of Object.keys(args.select)) {
              selected[key] = (row as Record<string, unknown>)[key];
            }
            return selected;
          });
      },
    },
    fileAttachment: {
      findMany: async (args: {
        where: {
          entityType: FileAttachmentEntityType;
          deletedAt: null;
          entityId: { in: string[] };
        };
        select?: Record<string, unknown>;
        orderBy?: unknown;
      }) => {
        assert.equal(args.where.entityType, FileAttachmentEntityType.CARGO_RECEIPT);
        return params.attachments.filter((row) => args.where.entityId.in.includes(row.entityId));
      },
    },
  };
}

async function run() {
  const orderId = 'order-1';
  const expenseId = 'expense-1';

  const db = createMockDb({
    expenses: [{ id: expenseId, procurementOrderId: orderId }],
    attachments: [
      {
        id: 'att-expense',
        entityId: expenseId,
        fileName: 'cargo.pdf',
        fileUrl: '/uploads/procurement/cargo.pdf',
        mimeType: 'application/pdf',
        createdAt: new Date('2026-06-01'),
      },
    ],
  });

  const entityIds = await resolveCargoReceiptEntityIds(db as never, orderId);
  assert.deepEqual(entityIds, [orderId, expenseId]);

  const listed = await listCargoReceiptAttachmentsForOrder(db as never, orderId);
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.id, 'att-expense');

  const count = await countCargoReceiptAttachmentsForOrder(db as never, orderId);
  assert.equal(count, 1);

  const byOrder = await countCargoReceiptAttachmentsByOrderIds(db as never, [orderId, 'order-2']);
  assert.equal(byOrder.get(orderId), 1);
  assert.equal(byOrder.get('order-2'), 0);

  const orderOnlyDb = createMockDb({
    expenses: [],
    attachments: [
      {
        id: 'att-order',
        entityId: orderId,
        fileName: 'order-cargo.pdf',
        fileUrl: '/uploads/procurement/order-cargo.pdf',
        mimeType: 'application/pdf',
      },
    ],
  });
  assert.equal(await countCargoReceiptAttachmentsForOrder(orderOnlyDb as never, orderId), 1);

  console.log('cargo-receipt-attachments.util.test.ts passed');
}

void run();
