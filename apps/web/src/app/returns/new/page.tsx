import { Phase2DataPage } from '@/components/Phase2DataPage';

export default function NewReturnPage() {
  return (
    <Phase2DataPage
      titleKey="operations.newReturn"
      endpoint="/returns"
      createEndpoint="/returns"
      defaultPayload={{
        branchId: '',
        customerId: '',
        saleId: '',
        reason: 'DEFECTIVE',
        note: '',
        items: [{ productId: '', quantity: 1, unitPrice: 0, defective: false }],
      }}
    />
  );
}
