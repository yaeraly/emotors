import { Phase2DataPage } from '@/components/Phase2DataPage';

export default function MarketingCampaignsPage() {
  return <Phase2DataPage titleKey="marketing.campaigns" endpoint="/marketing/campaigns" createEndpoint="/marketing/campaigns" defaultPayload={{ title: 'Campaign title', description: '' }} />;
}
