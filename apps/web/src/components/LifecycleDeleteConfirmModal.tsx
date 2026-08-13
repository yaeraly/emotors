'use client';

import { DeleteConfirmModal } from '@/components/DeleteConfirmModal';
import { useTranslation } from '@/i18n/useTranslation';

type Props = {
  open: boolean;
  entityType: 'branch' | 'warehouse' | 'user';
  entityName: string;
  entityCode?: string;
  userFullName?: string;
  employeeId?: string;
  requireReason?: boolean;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (reason?: string) => void | Promise<void>;
};

export function LifecycleDeleteConfirmModal({
  open,
  entityType,
  entityName,
  entityCode,
  userFullName,
  employeeId,
  requireReason = false,
  loading = false,
  onClose,
  onConfirm,
}: Props) {
  const { t } = useTranslation();

  const title =
    entityType === 'branch'
      ? t('lifecycle.deleteBranchTitle')
      : entityType === 'warehouse'
        ? t('lifecycle.deleteWarehouseTitle')
        : t('lifecycle.deleteUserTitle');

  const lines = [
    entityType === 'user' && userFullName
      ? `${t('crm.fullName')}: ${userFullName}`
      : `${t('lifecycle.entityName')}: ${entityName}`,
    entityCode ? `${t('lifecycle.entityCode')}: ${entityCode}` : null,
    entityType === 'user' && employeeId ? `${t('users.employeeId')}: ${employeeId}` : null,
    t('lifecycle.relatedRecordsWarning'),
  ].filter(Boolean);

  const message = lines.join('\n');

  return (
    <DeleteConfirmModal
      open={open}
      title={title}
      message={message}
      requireReason={requireReason}
      minLength={3}
      reasonPlaceholder={t('lifecycle.deleteReasonPlaceholder')}
      loading={loading}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
