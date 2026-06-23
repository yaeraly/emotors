import { Phase2DataPage } from '@/components/Phase2DataPage';

export default function FactoriesPage() {
  return <Phase2DataPage titleKey="procurement.factories" endpoint="/procurement/factories" actionHref="/procurement/factories/new" actionKey="common.create" />;
}
