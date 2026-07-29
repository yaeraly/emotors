import { redirect } from 'next/navigation';

export default function LegacyWholesaleSalePage() {
  redirect('/sales/new');
}
