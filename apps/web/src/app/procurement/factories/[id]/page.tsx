'use client';

import { useParams } from 'next/navigation';
import { Phase2DataPage } from '@/components/Phase2DataPage';

export default function FactoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <Phase2DataPage titleKey="procurement.factory" endpoint={`/procurement/factories/${id}`} />;
}
