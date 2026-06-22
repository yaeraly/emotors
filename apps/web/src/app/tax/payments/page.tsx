import { Phase2DataPage } from '@/components/Phase2DataPage';

export default function TaxPaymentsPage() {
  return <Phase2DataPage titleKey="tax.payments" endpoint="/tax/reports" createEndpoint="/tax/payments" defaultPayload={{ branchId: "", reportId: "", amount: 0 }} />;
}
