import { Phase2DataPage } from '@/components/Phase2DataPage';

export default function MatchmakingPage() {
  return <Phase2DataPage titleKey="investment.matchmaking" endpoint="/investment/matchmaking" createEndpoint="/investment/matchmaking" defaultPayload={{ investorId: "", candidateId: "", score: 0 }} />;
}
