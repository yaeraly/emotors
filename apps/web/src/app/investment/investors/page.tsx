import { Phase2DataPage } from '@/components/Phase2DataPage';

export default function InvestorsPage() {
  return <Phase2DataPage titleKey="investment.investors" endpoint="/investment/investors" createEndpoint="/investment/investors" defaultPayload={{ fullName: "Investor", phone: "", city: "", budgetAmount: 0 }} />;
}
