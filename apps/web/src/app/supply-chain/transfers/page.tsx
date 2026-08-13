import { Phase2DataPage } from '@/components/Phase2DataPage';

export default function TransfersPage() {
  return <Phase2DataPage titleKey="supplyChain.transfers" endpoint="/supply-chain/transfers" createEndpoint="/supply-chain/transfers" defaultPayload={{ toBranchId: "", items: [{ productName: "Part", quantity: 1 }] }} />;
}
