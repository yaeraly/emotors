import { Phase2DataPage } from '@/components/Phase2DataPage';

export default function BranchesPage() {
  return (
    <Phase2DataPage
      titleKey="branches.title"
      endpoint="/branches"
      actionHref="/branches/new"
      actionKey="branches.new"
    />
  );
}
