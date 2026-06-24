import { Phase2DataPage } from '@/components/Phase2DataPage';

export default function SupplierClaimsPage() {
  return (
    <Phase2DataPage
      titleKey="operations.supplierClaims"
      endpoint="/supplier-claims"
      createEndpoint="/supplier-claims"
      defaultPayload={{ supplierId: '', factoryId: '', procurementOrderId: '', productId: '', quantity: 1, reason: '', evidencePhotos: [], claimAmount: 0 }}
    />
  );
}
