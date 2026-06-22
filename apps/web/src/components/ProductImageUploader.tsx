'use client';

import { ChangeEvent, useState } from 'react';
import { API_URL, getToken } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';

type ProductImageUploaderProps = {
  photoUrl: string;
  onChange: (photoUrl: string) => void;
};

const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
const maxSize = 5 * 1024 * 1024;

export function ProductImageUploader({
  photoUrl,
  onChange,
}: ProductImageUploaderProps) {
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fullImageUrl = photoUrl ? `${API_URL}${photoUrl}` : null;

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    setError('');

    if (!file) return;

    if (!allowedTypes.includes(file.type)) {
      setError(t('inventory.invalidImageFormat'));
      return;
    }

    if (file.size > maxSize) {
      setError(t('inventory.imageTooLarge'));
      return;
    }

    const token = getToken();
    if (!token) {
      setError(t('common.error'));
      return;
    }

    const formData = new FormData();
    formData.append('image', file);
    setUploading(true);

    try {
      const response = await fetch(`${API_URL}/inventory/products/upload-image`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || t('inventory.imageUploadFailed'));
      }

      const result = (await response.json()) as { url: string };
      onChange(result.url);
    } catch (err) {
      console.error('Product image upload failed', err);
      setError(
        err instanceof TypeError
          ? t('inventory.apiNotReachable')
          : t('inventory.imageUploadFailed'),
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold text-slate-700">
        {t('inventory.productImage')}
      </p>
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center">
        {fullImageUrl ? (
          <img
            src={fullImageUrl}
            alt=""
            className="h-28 w-28 rounded-2xl object-cover"
          />
        ) : (
          <div className="flex h-28 w-28 items-center justify-center rounded-2xl bg-slate-100 text-xs font-semibold text-slate-400">
            IMG
          </div>
        )}
        <div className="space-y-2">
          <label className="inline-flex cursor-pointer rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            {uploading
              ? t('common.loading')
              : fullImageUrl
                ? t('inventory.changeImage')
                : t('inventory.uploadImage')}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={upload}
              className="hidden"
              disabled={uploading}
            />
          </label>
          {fullImageUrl ? (
            <button
              onClick={() => onChange('')}
              type="button"
              className="ml-2 rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
            >
              {t('inventory.removeImage')}
            </button>
          ) : null}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
