'use client';

import { DeleteConfirmModal } from '@/components/DeleteConfirmModal';
import { useTranslation } from '@/i18n/useTranslation';

type Props = {
  open: boolean;
  warehouseName: string;
  branchName: string;
  loading?: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
};

export function BranchWarehouseDeleteConfirmModal({
  open,
  warehouseName,
  branchName,
  loading = false,
  onClose,
  onConfirm,
}: Props) {
  const { t } = useTranslation();

  const message = [
    `${t('warehouse.name')}: ${warehouseName}`,
    `${t('branchWarehouse.branchName')}: ${branchName}`,
    t('branchWarehouse.deleteIrreversibleWarning'),
  ].join('\n');

  return (
    <DeleteConfirmModal
      open={open}
      title={t('branchWarehouse.deleteWarehouse')}
      message={message}
      confirmButtonLabel={t('branchWarehouse.deleteWarehouse')}
      loading={loading}
      onClose={onClose}
      onConfirm={() => onConfirm()}
    />
  );
}
