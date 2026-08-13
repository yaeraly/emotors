import {
  FileAttachmentEntityType,
  Prisma,
  TransportExpenseStatus,
  TransportExpenseType,
} from '@prisma/client';

type DbClient = Prisma.TransactionClient | {
  procurementTransportExpense: Prisma.TransactionClient['procurementTransportExpense'];
  fileAttachment: Prisma.TransactionClient['fileAttachment'];
};

export type CargoReceiptAttachmentRow = {
  id: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  entityId: string;
  createdAt?: Date;
  uploadedBy?: { id: string; fullName: string } | null;
  replacedBy?: { id: string; fullName: string } | null;
};

/**
 * Cargo receipts may be stored on the procurement order (Import Logistics)
 * or on INTERNATIONAL_FREIGHT transport expenses (invoice/payment request to Accountant).
 * Both locations are one source of truth — never require a duplicate upload.
 */
export async function resolveCargoReceiptEntityIds(
  db: DbClient,
  procurementOrderId: string,
): Promise<string[]> {
  const expenses = await db.procurementTransportExpense.findMany({
    where: {
      procurementOrderId,
      expenseType: TransportExpenseType.INTERNATIONAL_FREIGHT,
      status: { not: TransportExpenseStatus.CANCELLED },
    },
    select: { id: true },
  });
  return [procurementOrderId, ...expenses.map((row) => row.id)];
}

export async function listCargoReceiptAttachmentsForOrder(
  db: DbClient,
  procurementOrderId: string,
): Promise<CargoReceiptAttachmentRow[]> {
  const entityIds = await resolveCargoReceiptEntityIds(db, procurementOrderId);
  const rows = await db.fileAttachment.findMany({
    where: {
      entityType: FileAttachmentEntityType.CARGO_RECEIPT,
      deletedAt: null,
      entityId: { in: entityIds },
    },
    select: {
      id: true,
      fileName: true,
      fileUrl: true,
      mimeType: true,
      entityId: true,
      createdAt: true,
      uploadedBy: { select: { id: true, fullName: true } },
      replacedBy: { select: { id: true, fullName: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const seen = new Set<string>();
  const unique: CargoReceiptAttachmentRow[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    unique.push(row);
  }
  return unique;
}

export async function countCargoReceiptAttachmentsForOrder(
  db: DbClient,
  procurementOrderId: string,
): Promise<number> {
  const rows = await listCargoReceiptAttachmentsForOrder(db, procurementOrderId);
  return rows.length;
}

export async function countCargoReceiptAttachmentsByOrderIds(
  db: DbClient,
  procurementOrderIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const orderId of procurementOrderIds) {
    counts.set(orderId, 0);
  }
  if (!procurementOrderIds.length) return counts;

  const expenses = await db.procurementTransportExpense.findMany({
    where: {
      procurementOrderId: { in: procurementOrderIds },
      expenseType: TransportExpenseType.INTERNATIONAL_FREIGHT,
      status: { not: TransportExpenseStatus.CANCELLED },
    },
    select: { id: true, procurementOrderId: true },
  });

  const expenseIdToOrderId = new Map(
    expenses
      .filter((row): row is { id: string; procurementOrderId: string } => Boolean(row.procurementOrderId))
      .map((row) => [row.id, row.procurementOrderId]),
  );
  const entityIds = [...procurementOrderIds, ...expenses.map((row) => row.id)];

  const attachments = await db.fileAttachment.findMany({
    where: {
      entityType: FileAttachmentEntityType.CARGO_RECEIPT,
      deletedAt: null,
      entityId: { in: entityIds },
    },
    select: { id: true, entityId: true },
  });

  const seenByOrder = new Map<string, Set<string>>();
  for (const attachment of attachments) {
    const orderId = procurementOrderIds.includes(attachment.entityId)
      ? attachment.entityId
      : expenseIdToOrderId.get(attachment.entityId);
    if (!orderId) continue;
    if (!seenByOrder.has(orderId)) seenByOrder.set(orderId, new Set());
    seenByOrder.get(orderId)!.add(attachment.id);
  }

  for (const [orderId, ids] of seenByOrder) {
    counts.set(orderId, ids.size);
  }
  return counts;
}
