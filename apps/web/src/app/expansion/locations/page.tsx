import { Phase2DataPage } from '@/components/Phase2DataPage';

export default function ExpansionLocationsPage() {
  return <Phase2DataPage titleKey="expansion.locations" endpoint="/expansion/locations" createEndpoint="/expansion/locations" defaultPayload={{ city: "City", address: "", rentCost: 0 }} />;
}
