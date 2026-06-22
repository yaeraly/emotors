import { Phase2DataPage } from '@/components/Phase2DataPage';

export default function SuppliersPage() {
  return <Phase2DataPage titleKey="procurement.suppliers" endpoint="/procurement/suppliers" createEndpoint="/procurement/suppliers" defaultPayload={{ name: "Supplier", companyName: "", country: "China", city: "Yiwu", productTypes: [] }} />;
}
