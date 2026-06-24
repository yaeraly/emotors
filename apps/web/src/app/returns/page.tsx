import { Phase2DataPage } from '@/components/Phase2DataPage';

export default function ReturnsPage() {
  return (
    <Phase2DataPage
      titleKey="operations.returns"
      endpoint="/returns"
      actionHref="/returns/new"
      actionKey="common.create"
    />
  );
}
