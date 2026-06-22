import { Phase2DataPage } from '@/components/Phase2DataPage';

export default function RoyaltyInvoicesPage() {
  return <Phase2DataPage titleKey="royalty.invoices" endpoint="/royalty/invoices" createEndpoint="/royalty/generate-monthly" defaultPayload={{ month: new Date().toISOString() }} />;
}
