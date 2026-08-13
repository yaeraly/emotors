import { Phase2DataPage } from '@/components/Phase2DataPage';

export default function AiInsightsPage() {
  return <Phase2DataPage titleKey="ai.insights" endpoint="/ai/insights" createEndpoint="/ai/generate-insights" defaultPayload={{}} />;
}
