import { Phase2DataPage } from '@/components/Phase2DataPage';

export default function RoyaltyRulesPage() {
  return <Phase2DataPage titleKey="royalty.rules" endpoint="/royalty/rules" createEndpoint="/royalty/rules" defaultPayload={{ branchId: '', type: 'PERCENT_OF_REVENUE', percent: 5, fixedAmount: 0 }} />;
}
