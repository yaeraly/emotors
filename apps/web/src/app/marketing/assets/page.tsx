import { Phase2DataPage } from '@/components/Phase2DataPage';

export default function MarketingAssetsPage() {
  return <Phase2DataPage titleKey="marketing.assets" endpoint="/marketing/assets" createEndpoint="/marketing/assets" defaultPayload={{ title: 'Asset title', type: 'POST', language: 'KY', caption: '', fileUrl: '' }} />;
}
