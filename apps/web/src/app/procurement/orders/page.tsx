import { Phase2DataPage } from '@/components/Phase2DataPage';

export default function ProcurementOrdersPage() {
  return <Phase2DataPage titleKey="procurement.orders" endpoint="/procurement/orders" actionHref="/procurement/orders/new" actionKey="common.create" />;
}
