import { Phase2DataPage } from '@/components/Phase2DataPage';

export default function ShipmentsPage() {
  return <Phase2DataPage titleKey="procurement.shipments" endpoint="/procurement/shipments" createEndpoint="/procurement/shipments" defaultPayload={{ shipmentNumber: "", carrier: "", originCity: "Yiwu", destinationCity: "Bishkek" }} />;
}
