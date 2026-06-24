import { Phase2DataPage } from '@/components/Phase2DataPage';

export default function NewReservationPage() {
  return (
    <Phase2DataPage
      titleKey="operations.newReservation"
      endpoint="/reservations"
      createEndpoint="/reservations"
      defaultPayload={{
        branchId: '',
        customerId: '',
        depositAmount: 0,
        expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        items: [{ productId: '', quantity: 1, unitPrice: 0 }],
      }}
    />
  );
}
