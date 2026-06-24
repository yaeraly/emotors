import { Phase2DataPage } from '@/components/Phase2DataPage';

export default function PartsRequestsPage() {
  return (
    <Phase2DataPage
      titleKey="operations.partsRequests"
      endpoint="/parts-requests"
      createEndpoint="/parts-requests"
      defaultPayload={{ serviceOrderId: '', note: '', items: [{ productId: '', warehouseId: '', quantity: 1 }] }}
    />
  );
}
