import { Phase2DataPage } from '@/components/Phase2DataPage';

export default function WarrantyClaimsPage() {
  return (
    <Phase2DataPage
      titleKey="operations.warrantyClaims"
      endpoint="/warranty/claims"
      createEndpoint="/warranty/claims"
      defaultPayload={{ branchId: '', customerId: '', productId: '', reason: '', note: '' }}
    />
  );
}
