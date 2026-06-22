import { Phase2DataPage } from '@/components/Phase2DataPage';

export default function AiPage() {
  return <Phase2DataPage titleKey="ai.title" endpoint="/ai/insights" createEndpoint="/ai/generate-insights" defaultPayload={{}} />;
}
