import { Phase2DataPage } from '@/components/Phase2DataPage';

export default function TaxReportsPage() {
  return <Phase2DataPage titleKey="tax.reports" endpoint="/tax/reports" createEndpoint="/tax/reports/generate" defaultPayload={{ branchId: "", month: new Date().toISOString(), taxRate: 2 }} />;
}
