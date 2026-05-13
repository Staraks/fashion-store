import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Star } from "lucide-react";

import { productsAPI } from "../services/api";
import { Product, ProductFilterOptions, ProductReviewSummary } from "../types";
import { getCategoryLabel } from "../utils/categoryLabels";

function ProductRating({
  averageRating,
  reviewsCount,
}: {
  averageRating: number | null;
  reviewsCount: number;
}) {
  if (!reviewsCount || averageRating === null) {
    return <p className="text-sm text-gray-400">Нет оценок</p>;
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            size={14}
            className={
              averageRating >= star ? "fill-black text-black" : "text-gray-300"
            }
          />
        ))}
      </div>
      <span className="text-sm font-medium text-black">
        {averageRating.toFixed(1)}
      </span>
      <span className="text-xs text-gray-500">({reviewsCount})</span>
    </div>
  );
}

export default function Catalog() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [visualResults, setVisualResults] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterOptions, setFilterOptions] = useState<ProductFilterOptions>({
    categories: [],
    subcategories: [],
    brands: [],
  });
  const [loading, setLoading] = useState(true);
  const [visualSearchLoading, setVisualSearchLoading] = useState(false);
  const [visualSearchError, setVisualSearchError] = useState("");
  const [selectedImageName, setSelectedImageName] = useState("");
  const [selectedImagePreview, setSelectedImagePreview] = useState("");
  const [productRatings, setProductRatings] = useState<
    Record<string, ProductReviewSummary>
  >({});

  const gender = searchParams.get("category");
  const category = searchParams.get("productCategory");
  const subcategory = searchParams.get("subcategory");
  const brand = searchParams.get("brand");

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

  useEffect(() => {
    setVisualResults([]);
    setVisualSearchError("");
    setSelectedImageName("");
    setSelectedImagePreview("");
    setVisualSearchLoading(false);
  }, [gender]);

  useEffect(() => {
    return () => {
      if (selectedImagePreview) {
        URL.revokeObjectURL(selectedImagePreview);
      }
    };
  }, [selectedImagePreview]);

  const handleVisualSearch = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setVisualSearchLoading(true);
    setVisualSearchError("");
    setSelectedImageName(file.name);
    setSelectedImagePreview((prev) => {
      if (prev) {
        URL.revokeObjectURL(prev);
      }

      return URL.createObjectURL(file);
    });

    try {
      const matchedProducts = await productsAPI.searchByImage(file, gender);
      setVisualResults(matchedProducts);
    } catch (error) {
      setVisualResults([]);
      setVisualSearchError(
        error instanceof Error
          ? error.message
          : "Не удалось выполнить поиск по изображению.",
      );
    } finally {
      setVisualSearchLoading(false);
      event.target.value = "";
    }
  };

  const resetVisualSearch = () => {
    setVisualResults([]);
    setVisualSearchError("");
    setSelectedImageName("");
    setSelectedImagePreview((prev) => {
      if (prev) {
        URL.revokeObjectURL(prev);
      }

      return "";
    });
  };

  const title = useMemo(() => {
    if (!gender) {
      return "Каталог";
    }

    return `Каталог/${getCategoryLabel(gender)}`;
  }, [gender]);

  const availableSubcategories = useMemo(() => {
    if (!category) {
      return filterOptions.subcategories;
    }

    return filterOptions.subcategories.filter(
      (item) => item.parentSlug === category,
    );
  }, [filterOptions.subcategories, category]);

  const isVisualSearchActive = selectedImageName.length > 0;
  const baseProducts = isVisualSearchActive ? visualResults : products;
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const displayedProducts = useMemo(() => {
    if (!normalizedSearchQuery) {
      return baseProducts;
    }

    return baseProducts.filter((product) => {
      const productName = product.name.toLowerCase();
      const productBrand = product.brand.toLowerCase();

      return (
        productName.includes(normalizedSearchQuery) ||
        productBrand.includes(normalizedSearchQuery)
      );
    });
  }, [baseProducts, normalizedSearchQuery]);

  useEffect(() => {
    if (displayedProducts.length === 0) {
      setProductRatings({});
      return;
    }

    let isCancelled = false;

    Promise.all(
      displayedProducts.map(async (product) => {
        try {
          const summary = await productsAPI.getReviews(product.id);
          return [product.id, summary] as const;
        } catch {
          return [
            product.id,
            {
              averageRating: null,
              reviewsCount: 0,
              reviews: [],
            },
          ] as const;
        }
      }),
    ).then((entries) => {
      if (isCancelled) {
        return;
      }

      setProductRatings(Object.fromEntries(entries));
    });

    return () => {
      isCancelled = true;
    };
  }, [displayedProducts]);

  const updateFilter = (
    key: "productCategory" | "subcategory" | "brand",
    value: string,
  ) => {
    const nextParams = new URLSearchParams(searchParams);

    if (value) {
      nextParams.set(key, value);
    } else {
      nextParams.delete(key);
    }

    if (key === "productCategory") {
      nextParams.delete("subcategory");
    }

    setSearchParams(nextParams);
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-12">
      <div className="mb-12 flex flex-col gap-8 border-b border-gray-100 pb-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="mb-4 text-5xl font-playfair font-bold uppercase tracking-widest">
            {title}
          </h1>
          <p className="font-inter text-sm uppercase tracking-widest text-gray-400">
            {isVisualSearchActive
              ? `Найдено похожих товаров: ${displayedProducts.length}`
              : `Найдено товаров: ${products.length}`}
          </p>
        </div>

        <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2 lg:max-w-5xl lg:grid-cols-4">
          <label className="text-xs uppercase tracking-[0.25em] text-gray-500 md:col-span-2 lg:col-span-1">
            Поиск
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Название или бренд"
              className="mt-2 w-full border border-gray-200 bg-white px-4 py-3 text-sm normal-case tracking-normal text-black outline-none placeholder:text-gray-400 focus:border-black"
            />
          </label>
          <label className="text-xs uppercase tracking-[0.25em] text-gray-500">
            Категория
            <select
              value={category || ""}
              onChange={(event) =>
                updateFilter("productCategory", event.target.value)
              }
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
              value={subcategory || ""}
              onChange={(event) =>
                updateFilter("subcategory", event.target.value)
              }
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
              value={brand || ""}
              onChange={(event) => updateFilter("brand", event.target.value)}
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

      <section className="mb-10 rounded-3xl border border-black/10 bg-stone-50 px-6 py-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="mb-2 text-xs uppercase tracking-[0.3em] text-gray-500">
              Визуальный поиск
            </p>
            <h2 className="text-2xl font-playfair font-bold uppercase tracking-[0.18em]">
              Найти похожие товары по фото
            </h2>
            <p className="mt-3 text-sm leading-6 text-gray-600">
              Загрузите изображение образа, и мы покажем самые похожие товары.
              Если совпадения слишком слабые, результаты не будут показаны.
            </p>
          </div>

          <div className="flex flex-col gap-3 lg:items-end">
            <label className="inline-flex cursor-pointer items-center justify-center border border-black bg-black px-6 py-3 text-sm font-semibold uppercase tracking-[0.22em] text-white transition hover:bg-white hover:text-black">
              Загрузить изображение
              <input
                type="file"
                accept="image/*"
                onChange={handleVisualSearch}
                className="hidden"
              />
            </label>

            {isVisualSearchActive ? (
              <button
                type="button"
                onClick={resetVisualSearch}
                className="text-xs uppercase tracking-[0.25em] text-gray-500 transition hover:text-black"
              >
                Сбросить визуальный поиск
              </button>
            ) : null}
          </div>
        </div>

        {selectedImageName ? (
          <div className="mt-5 flex flex-col gap-4 rounded-3xl border border-black/10 bg-white/70 p-4 sm:flex-row sm:items-center">
            {selectedImagePreview ? (
              <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-neutral-100">
                <img
                  src={selectedImagePreview}
                  alt={selectedImageName}
                  className="h-full w-full object-cover"
                />
              </div>
            ) : null}
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-gray-500">
                Ваше изображение
              </p>
              <p className="mt-2 text-sm text-gray-600">{selectedImageName}</p>
            </div>
          </div>
        ) : null}

        {visualSearchLoading ? (
          <p className="mt-4 text-sm text-gray-500">
            Ищем похожие товары по изображению...
          </p>
        ) : null}

        {visualSearchError ? (
          <p className="mt-4 text-sm text-red-600">{visualSearchError}</p>
        ) : null}

        {isVisualSearchActive && !visualSearchLoading && !visualSearchError ? (
          <p className="mt-4 text-sm text-gray-600">
            {visualResults.length > 0
              ? `Подобрано товаров: ${visualResults.length}`
              : "Похожие товары не найдены. Попробуйте другое изображение."}
          </p>
        ) : null}
      </section>

      {loading ? (
        <div className="flex h-96 items-center justify-center font-opensans text-xl italic opacity-50">
          Загружаем коллекцию...
        </div>
      ) : displayedProducts.length === 0 ? (
        <div className="flex h-96 items-center justify-center font-opensans text-xl italic opacity-50">
          {isVisualSearchActive
            ? "Похожие товары не найдены."
            : "Товары не найдены."}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-8 gap-y-16 md:grid-cols-3 lg:grid-cols-4">
          {displayedProducts.map((product) => (
            <Link
              key={product.id}
              to={`/product/${product.id}`}
              className="group block text-inherit no-underline"
            >
              <div className="relative mb-6 aspect-[3/4] overflow-hidden bg-gray-50">
                {/* {isVisualSearchActive && typeof product.similarity === 'number' ? (
                  <div className="absolute left-3 top-3 z-10 bg-white/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-black">
                    Match {Math.round(product.similarity * 100)}%
                  </div>
                ) : null} */}
                <img
                  src={product.images[0]}
                  alt={product.name}
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-bold uppercase tracking-widest opacity-60">
                  {product.brand}
                </h3>
                <h4 className="text-lg font-medium leading-tight">
                  {product.name}
                </h4>
                <ProductRating
                  averageRating={
                    productRatings[product.id]?.averageRating ?? null
                  }
                  reviewsCount={productRatings[product.id]?.reviewsCount ?? 0}
                />
                <div className="flex items-end gap-3">
                  <p className="text-base font-bold">
                    {product.price.toLocaleString()} ₽
                  </p>
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
