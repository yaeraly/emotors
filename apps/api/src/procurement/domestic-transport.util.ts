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

export function buildDomesticTransportTimeline(order: {
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
  const paidStatuses = new Set(['PAID', 'OVERPAID']);
  const supplierPaid = paidStatuses.has(String(order.supplierPaymentStatus ?? ''));
  const lastPayment = (order.supplierPayments ?? [])
    .filter((payment) => payment.status !== 'VOID')
    .sort((a, b) => new Date(b.paymentDate ?? 0).getTime() - new Date(a.paymentDate ?? 0).getTime())[0];

  const cargoArrived = Boolean(order.actualArrivalDate)
    || ['ARRIVED', 'ARRIVED_IN_KYRGYZSTAN', 'CUSTOMS_CLEARANCE', 'IN_TRANSIT', 'RECEIVED_TO_HQ_WAREHOUSE'].includes(String(order.status ?? ''));

  const transport = order.svhToHqTransport;
  const transportStarted = Boolean(
    transport?.dispatchDate
    || transport?.status === SvhToHqTransportStatus.IN_PROGRESS
    || transport?.status === SvhToHqTransportStatus.COMPLETED,
  );
  const transportCompleted = transport?.status === SvhToHqTransportStatus.COMPLETED;
  const hqReceived = Boolean(order.hqStockMovementCreatedAt);
  const lastReceiving = (order.receivings ?? [])
    .sort((a, b) => new Date(b.receivedAt ?? 0).getTime() - new Date(a.receivedAt ?? 0).getTime())[0];

  const steps: Array<Omit<TimelineStep, 'status'>> = [
    {
      key: 'supplierPaid',
      labelKey: 'procurement.domesticTransport.timeline.supplierPaid',
      date: supplierPaid
        ? (order.paidAt ? new Date(order.paidAt).toISOString() : lastPayment?.paymentDate ? new Date(lastPayment.paymentDate).toISOString() : null)
        : null,
      responsibleName: lastPayment?.createdBy?.fullName ?? null,
    },
    {
      key: 'cargoArrivedSvh',
      labelKey: 'procurement.domesticTransport.timeline.cargoArrivedSvh',
      date: order.actualArrivalDate ? new Date(order.actualArrivalDate).toISOString() : null,
      responsibleName: null,
    },
    {
      key: 'domesticTransportStarted',
      labelKey: 'procurement.domesticTransport.timeline.domesticTransportStarted',
      date: transport?.dispatchDate ? new Date(transport.dispatchDate).toISOString() : null,
      responsibleName: transport?.createdBy?.fullName ?? null,
    },
    {
      key: 'domesticTransportCompleted',
      labelKey: 'procurement.domesticTransport.timeline.domesticTransportCompleted',
      date: transportCompleted
        ? (transport?.arrivalDate ? new Date(transport.arrivalDate).toISOString() : transport?.updatedAt ? new Date(transport.updatedAt).toISOString() : null)
        : null,
      responsibleName: transport?.createdBy?.fullName ?? null,
    },
    {
      key: 'hqWarehouseReceiving',
      labelKey: 'procurement.domesticTransport.timeline.hqWarehouseReceiving',
      date: order.hqStockMovementCreatedAt
        ? new Date(order.hqStockMovementCreatedAt).toISOString()
        : lastReceiving?.receivedAt
          ? new Date(lastReceiving.receivedAt).toISOString()
          : null,
      responsibleName: null,
    },
  ];

  let activeAssigned = false;
  return steps.map((step) => {
    const completed =
      (step.key === 'supplierPaid' && supplierPaid)
      || (step.key === 'cargoArrivedSvh' && cargoArrived)
      || (step.key === 'domesticTransportStarted' && transportStarted)
      || (step.key === 'domesticTransportCompleted' && transportCompleted)
      || (step.key === 'hqWarehouseReceiving' && hqReceived);

    if (completed) {
      return { ...step, status: 'completed' as const };
    }
    if (!activeAssigned) {
      activeAssigned = true;
      return { ...step, status: 'active' as const };
    }
    return { ...step, status: 'pending' as const };
  });
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
