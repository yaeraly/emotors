import { Phase2DataPage } from '@/components/Phase2DataPage';

export default function NewFactoryPage() {
  return <Phase2DataPage titleKey="procurement.factory" endpoint="/procurement/factories" createEndpoint="/procurement/factories" defaultPayload={{ supplierId: '', name: 'Factory', city: '', address: '', productTypes: [], productionCapacity: '', notes: '' }} />;
}
