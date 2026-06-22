import { Phase2DataPage } from '@/components/Phase2DataPage';

export default function RequestsPage() {
  return <Phase2DataPage titleKey="supplyChain.requests" endpoint="/supply-chain/stock-requests" createEndpoint="/supply-chain/stock-requests" defaultPayload={{ productName: "Part", quantity: 1 }} />;
}
