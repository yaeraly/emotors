import { Phase2DataPage } from '@/components/Phase2DataPage';

export default function NewProcurementOrderPage() {
  return <Phase2DataPage titleKey="procurement.purchaseOrder" endpoint="/procurement/orders" createEndpoint="/procurement/orders" defaultPayload={{ supplierId: '', factoryId: '', hqWarehouseId: '', estimatedArrivalDate: '', note: '', items: [{ productId: '', quantity: 1, purchasePriceYuan: 0, yuanRate: 0, transportCostKgs: 0, weightKg: 0 }] }} />;
}
