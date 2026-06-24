import { Phase2DataPage } from '@/components/Phase2DataPage';

export default function AlertsPage() {
  return (
    <Phase2DataPage
      titleKey="operations.alerts"
      endpoint="/alerts"
      createEndpoint="/alerts"
      defaultPayload={{ branchId: '', type: 'LOW_STOCK', title: '', message: '' }}
    />
  );
}
