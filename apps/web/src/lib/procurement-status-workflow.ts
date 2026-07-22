export const PROCUREMENT_STATUS_WORKFLOW = [
  { path: 'approve', status: 'APPROVED' },
  { path: 'mark-ordered', status: 'ORDERED' },
  { path: 'mark-sent-to-supplier', status: 'SENT_TO_SUPPLIER' },
  { path: 'mark-paid', status: 'PAID' },
  { path: 'mark-production', status: 'IN_PRODUCTION' },
  { path: 'mark-shipped-to-yiwu', status: 'SHIPPED_TO_YIWU' },
  { path: 'mark-in-transit', status: 'IN_TRANSIT' },
  { path: 'mark-arrived', status: 'ARRIVED' },
] as const;

export type ProcurementWorkflowAction = (typeof PROCUREMENT_STATUS_WORKFLOW)[number];
export type StatusButtonVisualState =
  | 'completed'
  | 'current'
  | 'next'
  | 'unavailable'
  | 'cancelled'
  | 'cancel-available';

const POST_WORKFLOW_STATUSES = new Set([
  'ARRIVED_IN_KYRGYZSTAN',
  'CUSTOMS_CLEARANCE',
  'RECEIVED_TO_HQ_WAREHOUSE',
  'CLOSED',
]);

function getWorkflowIndex(status: string) {
  if (status === 'DRAFT') return -1;
  const workflowIndex = PROCUREMENT_STATUS_WORKFLOW.findIndex((entry) => entry.status === status);
  if (workflowIndex >= 0) return workflowIndex;
  if (POST_WORKFLOW_STATUSES.has(status)) return PROCUREMENT_STATUS_WORKFLOW.length;
  return -1;
}

export function getProcurementStatusButtonState(
  orderStatus: string,
  action: ProcurementWorkflowAction | { path: 'cancel'; status: 'CANCELLED' },
): StatusButtonVisualState {
  if (action.path === 'cancel') {
    return orderStatus === 'CANCELLED' ? 'cancelled' : 'cancel-available';
  }

  if (orderStatus === 'CANCELLED') {
    return 'unavailable';
  }

  const currentIndex = getWorkflowIndex(orderStatus);
  const actionIndex = PROCUREMENT_STATUS_WORKFLOW.findIndex((entry) => entry.path === action.path);

  if (orderStatus === action.status) {
    return 'current';
  }

  // PAID is set only by supplier payment confirmation — never a manual next step.
  if (action.path === 'mark-paid') {
    if (currentIndex > actionIndex) {
      return 'completed';
    }
    return 'unavailable';
  }

  if (currentIndex < 0) {
    return actionIndex === 0 ? 'next' : 'unavailable';
  }

  if (actionIndex < currentIndex) {
    return 'completed';
  }

  if (actionIndex === currentIndex + 1) {
    return 'next';
  }

  return 'unavailable';
}

export function statusButtonClassName(state: StatusButtonVisualState) {
  switch (state) {
    case 'completed':
      return 'border-emerald-300 bg-emerald-50 text-emerald-800';
    case 'current':
      return 'border-blue-700 bg-blue-600 text-white shadow-sm';
    case 'next':
      return 'border-blue-300 bg-white text-blue-700 hover:bg-blue-50';
    case 'cancel-available':
      return 'border-red-300 bg-white text-red-700 hover:bg-red-50';
    case 'cancelled':
      return 'border-red-600 bg-red-600 text-white';
    default:
      return 'border-slate-200 bg-slate-100 text-slate-400';
  }
}

export function isStatusActionDisabled(state: StatusButtonVisualState) {
  return state === 'current' || state === 'unavailable' || state === 'completed' || state === 'cancelled';
}
