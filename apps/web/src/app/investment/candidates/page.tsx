import { Phase2DataPage } from '@/components/Phase2DataPage';

export default function CandidatesPage() {
  return <Phase2DataPage titleKey="investment.candidates" endpoint="/investment/franchise-candidates" createEndpoint="/investment/franchise-candidates" defaultPayload={{ fullName: "Candidate", phone: "", city: "", investmentBudget: 0 }} />;
}
