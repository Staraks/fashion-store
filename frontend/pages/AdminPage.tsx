import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';

import { adminAPI } from '../services/api';
import { useAppContext } from '../store/AppContext';
import { AdminCatalogOptions } from '../types';

type FormState = {
  name: string;
  brand: string;
  material: string;
  description: string;
  basePrice: string;
  discountPercent: string;
  categoryId: string;
  subcategoryId: string;
  color: string;
};

type BrandMode = 'existing' | 'new';

const initialFormState: FormState = {
  name: '',
  brand: '',
  material: '',
  description: '',
  basePrice: '',
  discountPercent: '0',
  categoryId: '',
  subcategoryId: '',
  color: '',
};

export default function AdminPage() {
  const { authLoading, authToken, user } = useAppContext();
  const [options, setOptions] = useState<AdminCatalogOptions | null>(null);
  const [form, setForm] = useState<FormState>(initialFormState);
  const [brandMode, setBrandMode] = useState<BrandMode>('existing');
  const [selectedGenderIds, setSelectedGenderIds] = useState<number[]>([]);
  const [stockBySizeId, setStockBySizeId] = useState<Record<number, string>>({});
  const [images, setImages] = useState<File[]>([]);
  const [imageInputKey, setImageInputKey] = useState(0);
  const [primaryImageIndex, setPrimaryImageIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canManageAdmin = Boolean(user && (user.isStaff || user.isSuperuser || ['admin', 'manager', 'content_manager', 'staff'].includes(user.role)));

  useEffect(() => {
    if (!authToken || !canManageAdmin) {
      setIsLoadingOptions(false);
      return;
    }

    adminAPI
      .getCatalogOptions(authToken)
      .then((response) => {
        setOptions(response);
      })
      .catch((requestError) => {
        setError(requestError instanceof Error ? requestError.message : 'Не удалось загрузить настройки админки.');
      })
      .finally(() => {
        setIsLoadingOptions(false);
      });
  }, [authToken, canManageAdmin]);

  const rootCategories = useMemo(
    () => options?.categories.filter((category) => category.parentId === null) ?? [],
    [options]
  );

  const availableSubcategories = useMemo(
    () => options?.categories.filter((category) => String(category.parentId) === form.categoryId) ?? [],
    [options, form.categoryId]
  );

  const activeCategory = useMemo(() => {
    const finalCategoryId = form.subcategoryId || form.categoryId;
    if (!finalCategoryId) {
      return null;
    }

    return options?.categories.find((category) => String(category.id) === finalCategoryId) ?? null;
  }, [options, form.categoryId, form.subcategoryId]);

  const availableSizes = useMemo(() => {
    if (!options || !activeCategory) {
      return [];
    }

    const alphaSizes = ['XS', 'S', 'M', 'L', 'XL'];
    const denimSizes = ['24', '25', '26', '27', '28', '29', '30', '31', '32', '33', '34'];
    const shoeSizes = ['35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45'];

    const allowedNames =
      activeCategory.sizeGroup === 'denim'
        ? denimSizes
        : activeCategory.sizeGroup === 'shoes'
          ? shoeSizes
          : alphaSizes;

    return options.sizes.filter((size) => allowedNames.includes(size.name));
  }, [options, activeCategory]);

  const imagePreviews = useMemo(
    () =>
      images.map((file) => ({
        file,
        url: URL.createObjectURL(file),
      })),
    [images]
  );

  useEffect(() => {
    return () => {
      imagePreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [imagePreviews]);

  useEffect(() => {
    if (!options) {
      return;
    }

    setStockBySizeId((prev) => {
      const allowedSizeIds = new Set(availableSizes.map((size) => size.id));
      const nextEntries = Object.entries(prev).filter(([sizeId]) => allowedSizeIds.has(Number(sizeId)));

      if (nextEntries.length === Object.keys(prev).length) {
        return prev;
      }

      return Object.fromEntries(nextEntries);
    });
  }, [availableSizes, options]);

  if (authLoading) {
    return <div className="px-4 md:px-8 py-16">Загрузка доступа...</div>;
  }

  if (!user || !authToken) {
    return <Navigate to="/auth" replace />;
  }

  if (!canManageAdmin) {
    return <Navigate to="/" replace />;
  }

  const handleInputChange = (field: keyof FormState, value: string) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
      ...(field === 'categoryId' ? { subcategoryId: '' } : {}),
    }));
  };

  const toggleGender = (genderId: number) => {
    setSelectedGenderIds((prev) =>
      prev.includes(genderId) ? prev.filter((id) => id !== genderId) : [...prev, genderId]
    );
  };

  const updateStock = (sizeId: number, value: string) => {
    setStockBySizeId((prev) => ({
      ...prev,
      [sizeId]: value,
    }));
  };

  const appendImages = (files: File[]) => {
    if (files.length === 0) {
      return;
    }

    setImages((prev) => [...prev, ...files]);
    setImageInputKey((prev) => prev + 1);
  };

  const removeImage = (indexToRemove: number) => {
    setImages((prev) => prev.filter((_, index) => index !== indexToRemove));
    setPrimaryImageIndex((prev) => {
      if (indexToRemove === prev) {
        return 0;
      }
      if (indexToRemove < prev) {
        return prev - 1;
      }
      return prev;
    });
  };

  const resetForm = () => {
    setForm(initialFormState);
    setBrandMode('existing');
    setSelectedGenderIds([]);
    setStockBySizeId({});
    setImages([]);
    setImageInputKey((prev) => prev + 1);
    setPrimaryImageIndex(0);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!authToken) {
      return;
    }

    const finalCategoryId = form.subcategoryId || form.categoryId;
    const normalizedBrand = form.brand.trim();
    const selectedSizes = Object.entries(stockBySizeId)
      .map(([sizeId, stockQuantity]) => ({
        sizeId: Number(sizeId),
        stockQuantity: Number(stockQuantity),
      }))
      .filter((row) => Number.isFinite(row.stockQuantity) && row.stockQuantity > 0);

    if (!finalCategoryId) {
      setError('Выбери категорию или подкатегорию.');
      return;
    }

    if (selectedGenderIds.length === 0) {
      setError('Выбери хотя бы один гендер.');
      return;
    }

    if (!normalizedBrand) {
      setError('Выбери существующий бренд или введи новый.');
      return;
    }

    if (selectedSizes.length === 0) {
      setError('Укажи остаток хотя бы для одного размера.');
      return;
    }

    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    try {
      const createdProduct = await adminAPI.createProduct(authToken, {
        name: form.name,
        brand: normalizedBrand,
        material: form.material,
        description: form.description,
        basePrice: form.basePrice,
        discountPercent: form.discountPercent,
        categoryId: finalCategoryId,
        genderIds: selectedGenderIds,
        color: form.color,
        sizes: selectedSizes,
        images,
        primaryImageIndex,
      });

      setSuccess(`Товар "${createdProduct.name}" добавлен в каталог.`);
      resetForm();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось сохранить товар.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="px-4 md:px-8 py-10 md:py-14">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="space-y-2">
          <p className="text-xs tracking-[0.3em] uppercase text-neutral-500">Admin</p>
          <h1 className="text-3xl md:text-5xl font-light tracking-tight">Добавление товара</h1>
          <p className="max-w-2xl text-sm md:text-base text-neutral-600">
            Здесь можно завести новый товар в каталог. Начинаем с базовой карточки: описание, категория,
            размеры, остатки и изображения.
          </p>
        </div>

        {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {success ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div> : null}

        {isLoadingOptions ? (
          <div className="rounded-3xl border border-neutral-200 bg-neutral-50 px-6 py-8 text-sm text-neutral-600">
            Загружаю категории, размеры и гендеры...
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-6 rounded-[2rem] border border-neutral-200 bg-white p-6 md:p-8">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm text-neutral-600">Название</span>
                  <input
                    required
                    value={form.name}
                    onChange={(event) => handleInputChange('name', event.target.value)}
                    className="w-full rounded-2xl border border-neutral-200 px-4 py-3 outline-none focus:border-black"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-neutral-600">Бренд</span>
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setBrandMode('existing');
                          setForm((prev) => ({
                            ...prev,
                            brand: options?.brands[0] ?? '',
                          }));
                        }}
                        className={`rounded-full border px-3 py-2 text-xs uppercase tracking-[0.2em] ${
                          brandMode === 'existing' ? 'border-black bg-black text-white' : 'border-neutral-300 text-neutral-700'
                        }`}
                      >
                        Из списка
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setBrandMode('new');
                          setForm((prev) => ({
                            ...prev,
                            brand: '',
                          }));
                        }}
                        className={`rounded-full border px-3 py-2 text-xs uppercase tracking-[0.2em] ${
                          brandMode === 'new' ? 'border-black bg-black text-white' : 'border-neutral-300 text-neutral-700'
                        }`}
                      >
                        Новый бренд
                      </button>
                    </div>

                    {brandMode === 'existing' ? (
                      <select
                        value={form.brand}
                        onChange={(event) => handleInputChange('brand', event.target.value)}
                        className="w-full rounded-2xl border border-neutral-200 px-4 py-3 outline-none focus:border-black"
                      >
                        <option value="">Выбери бренд</option>
                        {options?.brands.map((brand) => (
                          <option key={brand} value={brand}>
                            {brand}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={form.brand}
                        onChange={(event) => handleInputChange('brand', event.target.value)}
                        className="w-full rounded-2xl border border-neutral-200 px-4 py-3 outline-none focus:border-black"
                        placeholder="Например, Dries Van Noten"
                      />
                    )}
                  </div>
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-neutral-600">Материал</span>
                  <input
                    value={form.material}
                    onChange={(event) => handleInputChange('material', event.target.value)}
                    className="w-full rounded-2xl border border-neutral-200 px-4 py-3 outline-none focus:border-black"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-neutral-600">Цвет варианта</span>
                  <input
                    required
                    value={form.color}
                    onChange={(event) => handleInputChange('color', event.target.value)}
                    className="w-full rounded-2xl border border-neutral-200 px-4 py-3 outline-none focus:border-black"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-neutral-600">Цена</span>
                  <input
                    required
                    min="0"
                    step="0.01"
                    type="number"
                    value={form.basePrice}
                    onChange={(event) => handleInputChange('basePrice', event.target.value)}
                    className="w-full rounded-2xl border border-neutral-200 px-4 py-3 outline-none focus:border-black"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-neutral-600">Скидка, %</span>
                  <input
                    min="0"
                    max="100"
                    step="0.01"
                    type="number"
                    value={form.discountPercent}
                    onChange={(event) => handleInputChange('discountPercent', event.target.value)}
                    className="w-full rounded-2xl border border-neutral-200 px-4 py-3 outline-none focus:border-black"
                  />
                </label>
              </div>

              <label className="space-y-2 block">
                <span className="text-sm text-neutral-600">Описание</span>
                <textarea
                  rows={5}
                  value={form.description}
                  onChange={(event) => handleInputChange('description', event.target.value)}
                  className="w-full rounded-3xl border border-neutral-200 px-4 py-3 outline-none focus:border-black"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm text-neutral-600">Категория</span>
                  <select
                    required
                    value={form.categoryId}
                    onChange={(event) => handleInputChange('categoryId', event.target.value)}
                    className="w-full rounded-2xl border border-neutral-200 px-4 py-3 outline-none focus:border-black"
                  >
                    <option value="">Выбери категорию</option>
                    {rootCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-sm text-neutral-600">Подкатегория</span>
                  <select
                    value={form.subcategoryId}
                    onChange={(event) => handleInputChange('subcategoryId', event.target.value)}
                    disabled={!form.categoryId || availableSubcategories.length === 0}
                    className="w-full rounded-2xl border border-neutral-200 px-4 py-3 outline-none focus:border-black disabled:bg-neutral-100"
                  >
                    <option value="">Без подкатегории</option>
                    {availableSubcategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="space-y-6">
              <section className="rounded-[2rem] border border-neutral-200 bg-neutral-50 p-6">
                <h2 className="text-lg font-medium">Гендер</h2>
                <div className="mt-4 flex flex-wrap gap-3">
                  {options?.genders.map((gender) => {
                    const isActive = selectedGenderIds.includes(gender.id);
                    return (
                      <button
                        key={gender.id}
                        type="button"
                        onClick={() => toggleGender(gender.id)}
                        className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                          isActive ? 'border-black bg-black text-white' : 'border-neutral-300 bg-white text-neutral-700'
                        }`}
                      >
                        {gender.name}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-[2rem] border border-neutral-200 bg-neutral-50 p-6">
                <h2 className="text-lg font-medium">Остатки по размерам</h2>
                <p className="mt-2 text-sm text-neutral-500">
                  {!activeCategory
                    ? 'Сначала выбери категорию.'
                    : activeCategory.sizeGroup === 'denim'
                      ? 'Для джинсов и брюк доступны размеры 24-34.'
                      : activeCategory.sizeGroup === 'shoes'
                        ? 'Для обуви доступны размеры 35-45.'
                        : 'Для этой категории доступны размеры XS-XL.'}
                </p>
                <div className="mt-4 grid gap-3">
                  {availableSizes.map((size) => (
                    <label key={size.id} className="flex items-center justify-between gap-4 rounded-2xl bg-white px-4 py-3">
                      <span className="text-sm">{size.name}</span>
                      <input
                        min="0"
                        type="number"
                        value={stockBySizeId[size.id] ?? ''}
                        onChange={(event) => updateStock(size.id, event.target.value)}
                        className="w-24 rounded-xl border border-neutral-200 px-3 py-2 text-right outline-none focus:border-black"
                        placeholder="0"
                        disabled={!activeCategory}
                      />
                    </label>
                  ))}
                </div>
              </section>

              <section className="rounded-[2rem] border border-neutral-200 bg-neutral-50 p-6">
                <h2 className="text-lg font-medium">Изображения</h2>
                <label className="mt-4 block rounded-2xl border border-dashed border-neutral-300 bg-white px-4 py-6 text-sm text-neutral-600">
                  <span className="block">Загрузи одно или несколько изображений</span>
                  <span className="mt-1 block text-xs text-neutral-500">
                    Можно добавлять файлы в несколько заходов, новые изображения будут добавляться к уже выбранным.
                  </span>
                  <input
                    key={imageInputKey}
                    multiple
                    type="file"
                    accept="image/*"
                    className="mt-3 block w-full text-sm"
                    onChange={(event) => {
                      const files = Array.from(event.target.files ?? []);
                      appendImages(files);
                    }}
                  />
                </label>

                {imagePreviews.length > 0 ? (
                  <div className="mt-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-neutral-600">Выбрано изображений: {imagePreviews.length}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setImages([]);
                          setPrimaryImageIndex(0);
                          setImageInputKey((prev) => prev + 1);
                        }}
                        className="text-xs uppercase tracking-[0.2em] text-neutral-500 hover:text-black"
                      >
                        Очистить
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {imagePreviews.map((preview, index) => {
                        const isPrimary = index === primaryImageIndex;

                        return (
                          <div
                            key={`${preview.file.name}-${index}`}
                            className={`overflow-hidden rounded-3xl border bg-white ${
                              isPrimary ? 'border-black' : 'border-neutral-200'
                            }`}
                          >
                            <div className="aspect-[4/5] overflow-hidden bg-neutral-100">
                              <img src={preview.url} alt={preview.file.name} className="h-full w-full object-cover" />
                            </div>
                            <div className="space-y-3 p-3">
                              <p className="truncate text-xs text-neutral-600">{preview.file.name}</p>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => setPrimaryImageIndex(index)}
                                  className={`flex-1 rounded-full px-3 py-2 text-[11px] uppercase tracking-[0.2em] ${
                                    isPrimary ? 'bg-black text-white' : 'border border-neutral-300 text-neutral-700'
                                  }`}
                                >
                                  {isPrimary ? 'Основное' : 'Сделать основным'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeImage(index)}
                                  className="rounded-full border border-neutral-300 px-3 py-2 text-[11px] uppercase tracking-[0.2em] text-neutral-700"
                                >
                                  Удалить
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </section>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-full bg-black px-6 py-4 text-sm uppercase tracking-[0.3em] text-white transition-opacity hover:opacity-85 disabled:opacity-50"
              >
                {isSubmitting ? 'Сохраняю...' : 'Добавить товар'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
