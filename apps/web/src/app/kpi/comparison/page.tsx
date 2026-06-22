import { Phase2DataPage } from '@/components/Phase2DataPage';

export default function KpiComparisonPage() {
  return <Phase2DataPage titleKey="kpi.comparison" endpoint="/kpi/branch-comparison" createEndpoint="/kpi/targets" defaultPayload={{ branchId: '', metric: 'totalSales', targetValue: 100000, month: new Date().toISOString() }} />;
}
