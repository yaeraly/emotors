import { DomesticTransportDocumentType, SvhToHqTransportStatus } from '@prisma/client';

type TimelineStep = {
  key: string;
  status: 'pending' | 'active' | 'completed';
  date: string | null;
  responsibleName: string | null;
  labelKey: string;
};

type DomesticTransportAttachment = {
  id: string;
  documentType: DomesticTransportDocumentType | null;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  uploadedBy?: { id: string; fullName: string } | null;
  transportCompanyId?: string | null;
  receiptNumber?: string | null;
  receiptDate?: string | null;
  receiptAmountKgs?: number | null;
  isCurrent: boolean;
  replacedAt?: string | null;
  replacedBy?: { id: string; fullName: string } | null;
};

export function buildDomesticTransportTimeline(_order: {
  supplierPaymentStatus?: string | null;
  paidAt?: Date | string | null;
  supplierPayments?: Array<{
    status?: string;
    paymentDate?: Date | string;
    createdBy?: { fullName?: string | null } | null;
  }>;
  actualArrivalDate?: Date | string | null;
  status?: string | null;
  svhToHqTransport?: {
    status?: SvhToHqTransportStatus | null;
    dispatchDate?: Date | string | null;
    arrivalDate?: Date | string | null;
    createdBy?: { fullName?: string | null } | null;
    updatedAt?: Date | string | null;
  } | null;
  hqStockMovementCreatedAt?: Date | string | null;
  receivings?: Array<{
    receivedAt?: Date | string;
    receivedBy?: { fullName?: string | null } | null;
  }>;
}): TimelineStep[] {
  return [];
}

export function mapDomesticTransportAttachment(attachment: DomesticTransportAttachment & { entityType?: string }) {
  return {
    id: attachment.id,
    entityType: attachment.entityType,
    documentType: attachment.documentType,
    fileName: attachment.fileName,
    fileUrl: attachment.fileUrl,
    mimeType: attachment.mimeType,
    size: attachment.size,
    uploadedAt: attachment.uploadedAt,
    uploadedBy: attachment.uploadedBy ?? null,
    transportCompanyId: attachment.transportCompanyId ?? null,
    receiptNumber: attachment.receiptNumber ?? null,
    receiptDate: attachment.receiptDate ?? null,
    receiptAmountKgs: attachment.receiptAmountKgs ?? null,
    isCurrent: attachment.isCurrent,
    replacedAt: attachment.replacedAt ?? null,
    replacedBy: attachment.replacedBy ?? null,
  };
}

export function assertDomesticReceiptFieldsComplete(input: {
  transportCompanyId?: string | null;
  receiptNumber?: string | null;
  receiptDate?: Date | string | null;
  receiptAmountKgs?: number | string | null;
}) {
  const missing: string[] = [];
  if (!input.transportCompanyId) missing.push('carrier');
  if (!input.receiptNumber?.trim()) missing.push('receiptNumber');
  if (!input.receiptDate) missing.push('receiptDate');
  if (input.receiptAmountKgs === null || input.receiptAmountKgs === undefined || Number(input.receiptAmountKgs) < 0) {
    missing.push('receiptAmountKgs');
  }
  return missing;
}
