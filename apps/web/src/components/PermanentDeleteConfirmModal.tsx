'use client';

import { DeleteConfirmModal } from '@/components/DeleteConfirmModal';
import { PERMANENT_DELETE_CONFIRM_PHRASE } from '@/lib/permanent-delete';
import { useTranslation } from '@/i18n/useTranslation';

type Props = {
  open: boolean;
  message?: string;
  requireReason?: boolean;
  minLength?: number;
  reasonPlaceholder?: string;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (reason?: string) => void | Promise<void>;
};

export function PermanentDeleteConfirmModal({
  open,
  message,
  requireReason = false,
  minLength = 1,
  reasonPlaceholder,
  loading = false,
  onClose,
  onConfirm,
}: Props) {
  const { t } = useTranslation();

  return (
    <DeleteConfirmModal
      open={open}
      title={t('common.permanentDeleteConfirmTitle')}
      message={message ?? t('common.permanentDeleteConfirmMessage')}
      requireReason={requireReason}
      minLength={minLength}
      reasonPlaceholder={reasonPlaceholder}
      confirmPhrase={PERMANENT_DELETE_CONFIRM_PHRASE}
      confirmPhraseLabel={t('common.permanentDeleteTypeConfirm')}
      loading={loading}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
