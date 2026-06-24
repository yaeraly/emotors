import { Phase2DataPage } from '@/components/Phase2DataPage';

export default function WarehouseReleasePage() {
  return (
    <Phase2DataPage
      titleKey="operations.warehouseRelease"
      endpoint="/warehouse-release"
      createEndpoint="/warehouse-release"
      defaultPayload={{ branchId: '', warehouseId: '', saleId: '', items: [{ productId: '', quantity: 1 }] }}
    />
  );
}
