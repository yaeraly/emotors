import { Phase2DataPage } from '@/components/Phase2DataPage';

export default function PurchaseOrdersPage() {
  return <Phase2DataPage titleKey="procurement.purchaseOrders" endpoint="/procurement/purchase-orders" createEndpoint="/procurement/purchase-orders" defaultPayload={{ supplierId: "", branchId: "", items: [{ productName: "Part", quantity: 1, unitPriceYuan: 0 }] }} />;
}
