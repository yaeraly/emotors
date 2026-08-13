import { redirect } from 'next/navigation';

type Props = {
  params: Promise<{ id: string }>;
};

export default async function BranchWarehouseInventoryDetailRedirectPage({ params }: Props) {
  const { id } = await params;
  redirect(`/branch-warehouse/warehouse/inventory/${id}`);
}
