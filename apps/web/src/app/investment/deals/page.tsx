import { Phase2DataPage } from '@/components/Phase2DataPage';

export default function DealsPage() {
  return <Phase2DataPage titleKey="investment.deals" endpoint="/investment/deals" createEndpoint="/investment/deals" defaultPayload={{ investorId: "", candidateId: "", amount: 0 }} />;
}
