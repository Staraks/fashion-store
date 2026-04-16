import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { productsAPI } from '../services/api';
import { Product, ProductFilterOptions } from '../types';
import { getCategoryLabel } from '../utils/categoryLabels';

export default function Catalog() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [filterOptions, setFilterOptions] = useState<ProductFilterOptions>({
    categories: [],
    subcategories: [],
    brands: [],
  });
  const [loading, setLoading] = useState(true);

  const gender = searchParams.get('category');
  const category = searchParams.get('productCategory');
  const subcategory = searchParams.get('subcategory');
  const brand = searchParams.get('brand');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      productsAPI.getAll({ gender, category, subcategory, brand }),
      productsAPI.getFilters({ gender, category }),
    ])
      .then(([loadedProducts, loadedFilters]) => {
        setProducts(loadedProducts);
        setFilterOptions(loadedFilters);
      })
      .catch(() => {
        setProducts([]);
        setFilterOptions({ categories: [], subcategories: [], brands: [] });
      })
      .finally(() => setLoading(false));
  }, [gender, category, subcategory, brand]);

  const title = useMemo(() => {
    if (!gender) {
      return 'Каталог';
    }

    return `Каталог/${getCategoryLabel(gender)}`;
  }, [gender]);

  const availableSubcategories = useMemo(() => {
    if (!category) {
      return filterOptions.subcategories;
    }

    return filterOptions.subcategories.filter((item) => item.parentSlug === category);
  }, [filterOptions.subcategories, category]);

  const updateFilter = (key: 'productCategory' | 'subcategory' | 'brand', value: string) => {
    const nextParams = new URLSearchParams(searchParams);

    if (value) {
      nextParams.set(key, value);
    } else {
      nextParams.delete(key);
    }

    if (key === 'productCategory') {
      nextParams.delete('subcategory');
    }

    setSearchParams(nextParams);
  };

  return (
    <main className="max-w-7xl mx-auto py-12 px-4">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8 mb-12 border-b border-gray-100 pb-8">
        <div>
          <h1 className="text-5xl font-playfair font-bold uppercase tracking-widest mb-4">
            {title}
          </h1>
          <p className="text-gray-400 font-inter text-sm tracking-widest uppercase">
            Найдено товаров: {products.length}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full lg:max-w-3xl">
          <label className="text-xs uppercase tracking-[0.25em] text-gray-500">
            Категория
            <select
              value={category || ''}
              onChange={(event) => updateFilter('productCategory', event.target.value)}
              className="mt-2 w-full border border-gray-200 bg-white px-4 py-3 text-sm text-black outline-none focus:border-black"
            >
              <option value="">Все категории</option>
              {filterOptions.categories.map((item) => (
                <option key={item.slug} value={item.slug}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs uppercase tracking-[0.25em] text-gray-500">
            Подкатегория
            <select
              value={subcategory || ''}
              onChange={(event) => updateFilter('subcategory', event.target.value)}
              className="mt-2 w-full border border-gray-200 bg-white px-4 py-3 text-sm text-black outline-none focus:border-black"
            >
              <option value="">Все подкатегории</option>
              {availableSubcategories.map((item) => (
                <option key={item.slug} value={item.slug}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs uppercase tracking-[0.25em] text-gray-500">
            Бренд
            <select
              value={brand || ''}
              onChange={(event) => updateFilter('brand', event.target.value)}
              className="mt-2 w-full border border-gray-200 bg-white px-4 py-3 text-sm text-black outline-none focus:border-black"
            >
              <option value="">Все бренды</option>
              {filterOptions.brands.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {loading ? (
        <div className="h-96 flex items-center justify-center font-opensans text-xl italic opacity-50">
          Загружаем коллекцию...
        </div>
      ) : products.length === 0 ? (
        <div className="h-96 flex items-center justify-center font-opensans text-xl italic opacity-50">
          Товары не найдены.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-16">
          {products.map((product) => (
            <Link
              key={product.id}
              to={`/product/${product.id}`}
              className="group block no-underline text-inherit"
            >
              <div className="relative aspect-[3/4] overflow-hidden bg-gray-50 mb-6">
                <img
                  src={product.images[0]}
                  alt={product.name}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-bold uppercase tracking-widest opacity-60">
                  {product.brand}
                </h3>
                <h4 className="text-lg font-medium leading-tight">{product.name}</h4>
                <div className="flex items-end gap-3">
                  <p className="text-base font-bold">{product.price.toLocaleString()} ₽</p>
                  {product.oldPrice ? (
                    <p className="text-sm text-gray-400 line-through">
                      {product.oldPrice.toLocaleString()} ₽
                    </p>
                  ) : null}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
