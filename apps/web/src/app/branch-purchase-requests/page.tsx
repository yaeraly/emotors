import { Phase2DataPage } from '@/components/Phase2DataPage';

export default function BranchPurchaseRequestsPage() {
  return (
    <Phase2DataPage
      titleKey="operations.branchPurchaseRequests"
      endpoint="/branch-purchase-requests"
      createEndpoint="/branch-purchase-requests"
      defaultPayload={{ branchId: '', note: '', items: [{ productId: '', quantity: 1 }] }}
    />
  );
}
