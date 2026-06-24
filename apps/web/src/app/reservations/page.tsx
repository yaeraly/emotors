import { Phase2DataPage } from '@/components/Phase2DataPage';

export default function ReservationsPage() {
  return (
    <Phase2DataPage
      titleKey="operations.reservations"
      endpoint="/reservations"
      actionHref="/reservations/new"
      actionKey="common.create"
    />
  );
}
