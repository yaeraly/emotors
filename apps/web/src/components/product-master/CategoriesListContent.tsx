'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { canManageProductCatalog } from '@/lib/rbac';
import type { ProductCategory, User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

const emptyForm = {
  code: '',
  nameKy: '',
  nameRu: '',
  nameEn: '',
  description: '',
};

export function CategoriesListContent() {
  const { t, language } = useTranslation();
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<ProductCategory | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    return params.toString();
  }, [search]);

  useEffect(() => {
    apiFetch<User>('/auth/me').then(setCurrentUser).catch(() => setCurrentUser(null));
    void loadCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const canManage = canManageProductCatalog(currentUser);

  async function loadCategories() {
    try {
      setCategories(
        await apiFetch<ProductCategory[]>(
          `/inventory/categories${query ? `?${query}` : ''}`,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    try {
      if (editing) {
        await apiFetch(`/inventory/categories/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(form),
        });
      } else {
        await apiFetch('/inventory/categories', {
          method: 'POST',
          body: JSON.stringify(form),
        });
      }
      setEditing(null);
      setForm(emptyForm);
      await loadCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function deleteCategory(category: ProductCategory) {
    if (!window.confirm(t('common.delete'))) return;

    try {
      await apiFetch(`/inventory/categories/${category.id}`, {
        method: 'DELETE',
      });
      await loadCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function startEdit(category: ProductCategory) {
    setEditing(category);
    setForm({
      code: category.code,
      nameKy: category.nameKy,
      nameRu: category.nameRu,
      nameEn: category.nameEn,
      description: category.description ?? '',
    });
  }

  return (
    <div className="space-y-6">
      {error ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {canManage ? (
        <form
          id="category-create-form"
          onSubmit={submit}
          className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-3"
        >
          <Input
            label={t('inventory.categoryCode')}
            value={form.code}
            onChange={(value) => setForm({ ...form, code: value })}
          />
          <Input
            label={t('inventory.categoryNameKy')}
            value={form.nameKy}
            onChange={(value) => setForm({ ...form, nameKy: value })}
          />
          <Input
            label={t('inventory.categoryNameRu')}
            value={form.nameRu}
            onChange={(value) => setForm({ ...form, nameRu: value })}
          />
          <Input
            label={t('inventory.categoryNameEn')}
            value={form.nameEn}
            onChange={(value) => setForm({ ...form, nameEn: value })}
          />
          <Input
            label={t('inventory.description')}
            value={form.description}
            onChange={(value) => setForm({ ...form, description: value })}
          />
          <button className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white" type="submit">
            {editing ? t('inventory.editCategory') : t('inventory.createCategory')}
          </button>
        </form>
      ) : (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {t('productMaster.readOnlyNotice')}
        </p>
      )}

      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={t('common.search')}
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3"
      />

      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">{t('inventory.categoryCode')}</th>
              <th className="px-4 py-3">{t('inventory.category')}</th>
              <th className="px-4 py-3">{t('inventory.productCount')}</th>
              <th className="px-4 py-3">{t('common.status')}</th>
              <th className="px-4 py-3">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {categories.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  {t('inventory.noCategories')}
                </td>
              </tr>
            ) : (
              categories.map((category) => (
                <tr key={category.id}>
                  <td className="px-4 py-3 font-bold">{category.code}</td>
                  <td className="px-4 py-3">{categoryName(category, language)}</td>
                  <td className="px-4 py-3">{category.productCount ?? 0}</td>
                  <td className="px-4 py-3">
                    {category.isActive ? t('warehouse.active') : t('warehouse.inactive')}
                  </td>
                  <td className="px-4 py-3">
                    {canManage ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => startEdit(category)}
                          className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold"
                          type="button"
                        >
                          {t('common.edit')}
                        </button>
                        <button
                          onClick={() => void deleteCategory(category)}
                          className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600"
                          type="button"
                        >
                          {t('common.delete')}
                        </button>
                      </div>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
        className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
      />
    </label>
  );
}

function categoryName(category: ProductCategory, language: string) {
  if (language === 'ky') return category.nameKy;
  if (language === 'ru') return category.nameRu;
  return category.nameEn;
}
