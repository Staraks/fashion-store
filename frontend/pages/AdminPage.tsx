import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";

import { adminAPI } from "../services/api";
import { useAppContext } from "../store/AppContext";
import {
  AdminCatalogOptions,
  AdminOrder,
  AdminProductDetail,
  AdminUser,
  Product,
} from "../types";
import { AdminSectionId, canAccessAdminSection } from "../utils/adminAccess";

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

type BrandMode = "existing" | "new";
type CatalogFilterState = {
  category: string;
  subcategory: string;
  brand: string;
  search: string;
};

const ADMIN_SECTIONS: Array<{
  id: AdminSectionId;
  label: string;
  description: string;
}> = [
  {
    id: "catalog",
    label: "Каталог",
    description: "Товары, остатки и изображения",
  },
  { id: "orders", label: "Заказы", description: "Просмотр и статусы" },
  { id: "reports", label: "Отчётность", description: "Excel по продажам" },
  {
    id: "users",
    label: "Управление пользователями",
    description: "Роли и доступы",
  },
];

const USER_ROLE_OPTIONS = [
  { value: "user", label: "Пользователь" },
  { value: "content_manager", label: "Контент-менеджер" },
  { value: "sales_manager", label: "Менеджер продаж" },
  { value: "admin", label: "Администратор" },
];

const USER_ROLE_LABELS = Object.fromEntries(
  USER_ROLE_OPTIONS.map((roleOption) => [roleOption.value, roleOption.label]),
);

const ORDER_STATUS_OPTIONS = [
  { value: "new", label: "Новый" },
  { value: "processing", label: "В обработке" },
  { value: "shipped", label: "Отправлен" },
  { value: "delivered", label: "Доставлен" },
  { value: "cancelled", label: "Отменен" },
];

const ORDER_STATUS_LABELS = Object.fromEntries(
  ORDER_STATUS_OPTIONS.map((statusOption) => [
    statusOption.value,
    statusOption.label,
  ]),
);

function formatAdminOrderDate(value: string) {
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getDefaultReportDates() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 30);

  return {
    start: toDateInputValue(start),
    end: toDateInputValue(end),
  };
}

function getGenderLabel(name: string) {
  const normalized = name.trim().toLowerCase();

  if (normalized === "male" || normalized === "men") {
    return "Мужчинам";
  }

  if (normalized === "female" || normalized === "women") {
    return "Женщинам";
  }

  return name;
}

const initialFormState: FormState = {
  name: "",
  brand: "",
  material: "",
  description: "",
  basePrice: "",
  discountPercent: "0",
  categoryId: "",
  subcategoryId: "",
  color: "",
};

export default function AdminPage() {
  const { authLoading, authToken, user } = useAppContext();
  const defaultReportDates = useMemo(() => getDefaultReportDates(), []);
  const [activeSection, setActiveSection] = useState<AdminSectionId>("catalog");
  const [options, setOptions] = useState<AdminCatalogOptions | null>(null);
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [reportStartDate, setReportStartDate] = useState(
    defaultReportDates.start,
  );
  const [reportEndDate, setReportEndDate] = useState(defaultReportDates.end);
  const [catalogFilters, setCatalogFilters] = useState<CatalogFilterState>({
    category: "",
    subcategory: "",
    brand: "",
    search: "",
  });
  const [form, setForm] = useState<FormState>(initialFormState);
  const [brandMode, setBrandMode] = useState<BrandMode>("existing");
  const [selectedGenderIds, setSelectedGenderIds] = useState<number[]>([]);
  const [stockBySizeId, setStockBySizeId] = useState<Record<number, string>>(
    {},
  );
  const [images, setImages] = useState<File[]>([]);
  const [existingImages, setExistingImages] = useState<
    AdminProductDetail["images"]
  >([]);
  const [imageInputKey, setImageInputKey] = useState(0);
  const [primaryImageIndex, setPrimaryImageIndex] = useState(0);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [isLoadingEditor, setIsLoadingEditor] = useState(false);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(
    null,
  );
  const [updatingOrderId, setUpdatingOrderId] = useState<number | null>(null);
  const [updatingUserId, setUpdatingUserId] = useState<number | null>(null);
  const [isDownloadingReport, setIsDownloadingReport] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const availableAdminSections = useMemo(
    () =>
      ADMIN_SECTIONS.filter((section) =>
        canAccessAdminSection(user, section.id),
      ),
    [user],
  );
  const canManageCatalog = canAccessAdminSection(user, "catalog");
  const canManageOrders = canAccessAdminSection(user, "orders");
  const canViewReports = canAccessAdminSection(user, "reports");
  const canManageUsers = canAccessAdminSection(user, "users");
  const canManageAdmin = availableAdminSections.length > 0;
  const currentSection = availableAdminSections.some(
    (section) => section.id === activeSection,
  )
    ? activeSection
    : (availableAdminSections[0]?.id ?? "catalog");

  const rootCategories = useMemo(
    () =>
      options?.categories.filter((category) => category.parentId === null) ??
      [],
    [options],
  );

  const availableSubcategories = useMemo(
    () =>
      options?.categories.filter(
        (category) => String(category.parentId) === form.categoryId,
      ) ?? [],
    [options, form.categoryId],
  );

  const catalogFilterSubcategories = useMemo(() => {
    const subcategories =
      options?.categories.filter((category) => category.parentId !== null) ??
      [];

    if (!catalogFilters.category) {
      return subcategories;
    }

    const selectedCategory = rootCategories.find(
      (category) =>
        (category.slug || category.name) === catalogFilters.category,
    );

    if (!selectedCategory) {
      return subcategories;
    }

    return subcategories.filter(
      (category) => category.parentId === selectedCategory.id,
    );
  }, [catalogFilters.category, options, rootCategories]);

  const filteredCatalogProducts = useMemo(() => {
    const normalizedSearch = catalogFilters.search.trim().toLowerCase();

    if (!normalizedSearch) {
      return catalogProducts;
    }

    return catalogProducts.filter((product) => {
      const productName = product.name.toLowerCase();
      const productBrand = product.brand.toLowerCase();

      return (
        productName.includes(normalizedSearch) ||
        productBrand.includes(normalizedSearch)
      );
    });
  }, [catalogFilters.search, catalogProducts]);

  const activeCategory = useMemo(() => {
    const finalCategoryId = form.subcategoryId || form.categoryId;
    if (!finalCategoryId) return null;
    return (
      options?.categories.find(
        (category) => String(category.id) === finalCategoryId,
      ) ?? null
    );
  }, [options, form.categoryId, form.subcategoryId]);

  const availableSizes = useMemo(() => {
    if (!options || !activeCategory) return [];
    const alpha = ["XS", "S", "M", "L", "XL"];
    const denim = [
      "24",
      "25",
      "26",
      "27",
      "28",
      "29",
      "30",
      "31",
      "32",
      "33",
      "34",
    ];
    const shoes = [
      "35",
      "36",
      "37",
      "38",
      "39",
      "40",
      "41",
      "42",
      "43",
      "44",
      "45",
    ];
    const allowed =
      activeCategory.sizeGroup === "denim"
        ? denim
        : activeCategory.sizeGroup === "shoes"
          ? shoes
          : alpha;
    return options.sizes.filter((size) => allowed.includes(size.name));
  }, [options, activeCategory]);

  const imagePreviews = useMemo(
    () => images.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [images],
  );

  useEffect(() => {
    return () => {
      imagePreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [imagePreviews]);

  useEffect(() => {
    if (!availableAdminSections.length) return;
    if (
      !availableAdminSections.some((section) => section.id === activeSection)
    ) {
      setActiveSection(availableAdminSections[0].id);
    }
  }, [activeSection, availableAdminSections]);

  useEffect(() => {
    if (!authToken || !canManageAdmin) {
      setIsLoadingOptions(false);
      setIsLoadingCatalog(false);
      setIsLoadingOrders(false);
      setIsLoadingUsers(false);
      return;
    }

    if (canManageCatalog) {
      setIsLoadingOptions(true);
      adminAPI
        .getCatalogOptions(authToken)
        .then(setOptions)
        .catch((e) => {
          setError(
            e instanceof Error
              ? e.message
              : "Не удалось загрузить настройки админки.",
          );
        })
        .finally(() => setIsLoadingOptions(false));

      setIsLoadingCatalog(true);
      adminAPI
        .getProducts(authToken, catalogFilters)
        .then(setCatalogProducts)
        .catch((e) => {
          setError(
            e instanceof Error ? e.message : "Не удалось загрузить каталог.",
          );
        })
        .finally(() => setIsLoadingCatalog(false));
    } else {
      setIsLoadingOptions(false);
      setIsLoadingCatalog(false);
    }

    if (canManageOrders) {
      setIsLoadingOrders(true);
      adminAPI
        .getOrders(authToken)
        .then(setOrders)
        .catch((e) => {
          setError(
            e instanceof Error ? e.message : "Не удалось загрузить заказы.",
          );
        })
        .finally(() => setIsLoadingOrders(false));
    } else {
      setIsLoadingOrders(false);
    }

    if (canManageUsers) {
      setIsLoadingUsers(true);
      adminAPI
        .getUsers(authToken)
        .then(setAdminUsers)
        .catch((e) => {
          setError(
            e instanceof Error
              ? e.message
              : "Не удалось загрузить пользователей.",
          );
        })
        .finally(() => setIsLoadingUsers(false));
    } else {
      setIsLoadingUsers(false);
    }
  }, [
    authToken,
    canManageAdmin,
    canManageCatalog,
    canManageOrders,
    canManageUsers,
    catalogFilters,
  ]);

  useEffect(() => {
    if (!options) return;
    setStockBySizeId((prev) => {
      const allowed = new Set(availableSizes.map((size) => size.id));
      return Object.fromEntries(
        Object.entries(prev).filter(([id]) => allowed.has(Number(id))),
      );
    });
  }, [availableSizes, options]);

  if (authLoading)
    return <div className="px-4 md:px-8 py-16">Загрузка доступа...</div>;
  if (!user || !authToken) return <Navigate to="/auth" replace />;
  if (!canManageAdmin) return <Navigate to="/" replace />;

  const loadCatalogProducts = async () => {
    if (!authToken) return;
    setCatalogProducts(await adminAPI.getProducts(authToken, catalogFilters));
  };

  const loadCatalogOptions = async () => {
    if (!authToken) return;
    setOptions(await adminAPI.getCatalogOptions(authToken));
  };

  const loadOrders = async () => {
    if (!authToken) return;
    setOrders(await adminAPI.getOrders(authToken));
  };

  const loadAdminUsers = async () => {
    if (!authToken) return;
    setAdminUsers(await adminAPI.getUsers(authToken));
  };

  const handleOrderStatusChange = async (
    orderId: number,
    nextStatus: string,
  ) => {
    if (!authToken) return;

    setUpdatingOrderId(orderId);
    setError(null);
    setSuccess(null);
    try {
      const updatedOrder = await adminAPI.updateOrderStatus(
        authToken,
        orderId,
        nextStatus,
      );
      setOrders((prev) =>
        prev.map((order) => (order.id === orderId ? updatedOrder : order)),
      );
      setSuccess(`Статус заказа #${orderId} обновлён.`);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось обновить статус заказа.",
      );
      await loadOrders();
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const handleUserRoleChange = async (
    targetUserId: number,
    nextRole: string,
  ) => {
    if (!authToken) return;

    setUpdatingUserId(targetUserId);
    setError(null);
    setSuccess(null);
    try {
      const updatedUser = await adminAPI.updateUserRole(
        authToken,
        targetUserId,
        nextRole,
      );
      setAdminUsers((prev) =>
        prev.map((adminUser) =>
          adminUser.id === targetUserId ? updatedUser : adminUser,
        ),
      );
      setSuccess(
        `Роль пользователя ${updatedUser.email || updatedUser.username} обновлена.`,
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Не удалось обновить роль пользователя.",
      );
      await loadAdminUsers();
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleDownloadSalesReport = async () => {
    if (!authToken) return;
    if (!canViewReports) {
      setError("У вас нет доступа к отчётности по продажам.");
      return;
    }
    if (!reportStartDate || !reportEndDate) {
      setError("Выбери начало и конец периода для отчёта.");
      return;
    }
    if (reportStartDate > reportEndDate) {
      setError("Дата начала периода не может быть позже даты окончания.");
      return;
    }

    setIsDownloadingReport(true);
    setError(null);
    setSuccess(null);
    try {
      const { blob, filename } = await adminAPI.downloadSalesReport(
        authToken,
        reportStartDate,
        reportEndDate,
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download =
        filename ?? `sales-report-${reportStartDate}-${reportEndDate}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setSuccess("Отчёт по продажам сформирован.");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Не удалось скачать отчёт по продажам.",
      );
    } finally {
      setIsDownloadingReport(false);
    }
  };

  const handleCatalogFilterChange = (
    field: keyof CatalogFilterState,
    value: string,
  ) => {
    setCatalogFilters((prev) => ({
      ...prev,
      [field]: value,
      ...(field === "category" ? { subcategory: "" } : {}),
    }));
  };

  const resetCatalogFilters = () => {
    setCatalogFilters({
      category: "",
      subcategory: "",
      brand: "",
      search: "",
    });
  };

  const handleInputChange = (field: keyof FormState, value: string) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
      ...(field === "categoryId" ? { subcategoryId: "" } : {}),
    }));
  };

  const toggleGender = (genderId: number) => {
    setSelectedGenderIds((prev) =>
      prev.includes(genderId)
        ? prev.filter((id) => id !== genderId)
        : [...prev, genderId],
    );
  };

  const updateStock = (sizeId: number, value: string) => {
    setStockBySizeId((prev) => ({ ...prev, [sizeId]: value }));
  };

  const appendImages = (files: File[]) => {
    if (!files.length) return;
    setImages((prev) => [...prev, ...files]);
    setImageInputKey((prev) => prev + 1);
  };

  const removeImage = (indexToRemove: number) => {
    setImages((prev) => prev.filter((_, index) => index !== indexToRemove));
    setPrimaryImageIndex((prev) =>
      indexToRemove === prev ? 0 : indexToRemove < prev ? prev - 1 : prev,
    );
  };

  const resetForm = () => {
    setForm(initialFormState);
    setBrandMode("existing");
    setSelectedGenderIds([]);
    setStockBySizeId({});
    setImages([]);
    setExistingImages([]);
    setEditingProductId(null);
    setImageInputKey((prev) => prev + 1);
    setPrimaryImageIndex(0);
  };

  const hydrateFormFromProduct = (product: AdminProductDetail) => {
    setBrandMode(options?.brands.includes(product.brand) ? "existing" : "new");
    setForm({
      name: product.name,
      brand: product.brand,
      material: product.material,
      description: product.description,
      basePrice: String(product.basePrice),
      discountPercent: String(product.discountPercent),
      categoryId: product.categoryId ? String(product.categoryId) : "",
      subcategoryId: product.subcategoryId ? String(product.subcategoryId) : "",
      color: product.color,
    });
    setSelectedGenderIds(product.genderIds);
    setStockBySizeId(
      Object.fromEntries(
        product.sizes.map((size) => [size.sizeId, String(size.stockQuantity)]),
      ),
    );
    setExistingImages(product.images);
    setImages([]);
    setImageInputKey((prev) => prev + 1);
    setPrimaryImageIndex(
      Math.max(
        product.images.findIndex((image) => image.is_primary),
        0,
      ),
    );
    setEditingProductId(String(product.id));
  };

  const handleStartEditing = async (productId: string) => {
    if (!authToken) return;
    setError(null);
    setSuccess(null);
    setIsLoadingEditor(true);
    try {
      hydrateFormFromProduct(
        await adminAPI.getProductDetail(authToken, productId),
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить товар.");
    } finally {
      setIsLoadingEditor(false);
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!authToken) return;
    const target = catalogProducts.find((product) => product.id === productId);
    if (
      !window.confirm(
        `Удалить товар "${target?.name ?? "без названия"}" из каталога?`,
      )
    )
      return;
    setDeletingProductId(productId);
    try {
      await adminAPI.deleteProduct(authToken, productId);
      await loadCatalogProducts();
      if (editingProductId === productId) resetForm();
      setSuccess("Товар удалён из каталога.");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось удалить товар.");
    } finally {
      setDeletingProductId(null);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!authToken) return;
    const finalCategoryId = form.subcategoryId || form.categoryId;
    const normalizedBrand = form.brand.trim();
    const selectedSizes = Object.entries(stockBySizeId)
      .map(([sizeId, stockQuantity]) => ({
        sizeId: Number(sizeId),
        stockQuantity: Number(stockQuantity),
      }))
      .filter(
        (row) => Number.isFinite(row.stockQuantity) && row.stockQuantity > 0,
      );

    if (!finalCategoryId) return setError("Выбери категорию или подкатегорию.");
    if (!selectedGenderIds.length)
      return setError("Выбери хотя бы один гендер.");
    if (!normalizedBrand)
      return setError("Выбери существующий бренд или введи новый.");
    if (!selectedSizes.length)
      return setError("Укажи остаток хотя бы для одного размера.");

    setError(null);
    setSuccess(null);
    setIsSubmitting(true);
    try {
      const payload = {
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
      };
      if (editingProductId) {
        await adminAPI.updateProduct(authToken, editingProductId, payload);
        setSuccess("Товар обновлён.");
      } else {
        await adminAPI.createProduct(authToken, payload);
        setSuccess(`Товар "${form.name}" добавлен в каталог.`);
      }
      await Promise.all([loadCatalogProducts(), loadCatalogOptions()]);
      resetForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить товар.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="px-4 md:px-8 py-10 md:py-14">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="space-y-2">
          <p className="text-xs tracking-[0.3em] uppercase text-neutral-500">
            Админка
          </p>
          <h1 className="text-3xl md:text-5xl font-light tracking-tight">
            Панель администратора
          </h1>
        </div>
        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}
        {success ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {success}
          </div>
        ) : null}
        <nav className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {availableAdminSections.map((section) => {
            const isActive = currentSection === section.id;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => {
                  setActiveSection(section.id);
                  setError(null);
                  setSuccess(null);
                }}
                className={`rounded-[1.5rem] border px-5 py-4 text-left transition-colors ${
                  isActive
                    ? "border-black bg-black text-white"
                    : "border-neutral-200 bg-white text-neutral-900 hover:border-neutral-400"
                }`}
              >
                <span
                  className={`block text-xs uppercase tracking-[0.25em] ${isActive ? "text-neutral-300" : "text-neutral-500"}`}
                >
                  Раздел
                </span>
                <span className="mt-2 block text-xl font-light">
                  {section.label}
                </span>
                <span
                  className={`mt-1 block text-sm ${isActive ? "text-neutral-300" : "text-neutral-500"}`}
                >
                  {section.description}
                </span>
              </button>
            );
          })}
        </nav>
        {currentSection === "reports" ? (
          <section className="rounded-[2rem] border border-neutral-200 bg-white p-6 md:p-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">
                  Отчёты
                </p>
                <h2 className="mt-2 text-2xl font-light">
                  Отчётность по продажам
                </h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-[180px_180px_auto] sm:items-end">
                <label className="space-y-2">
                  <span className="text-sm text-neutral-600">
                    Начало периода
                  </span>
                  <input
                    type="date"
                    value={reportStartDate}
                    onChange={(event) => setReportStartDate(event.target.value)}
                    className="w-full rounded-2xl border border-neutral-200 px-4 py-3 outline-none focus:border-black"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-neutral-600">
                    Конец периода
                  </span>
                  <input
                    type="date"
                    value={reportEndDate}
                    onChange={(event) => setReportEndDate(event.target.value)}
                    className="w-full rounded-2xl border border-neutral-200 px-4 py-3 outline-none focus:border-black"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleDownloadSalesReport}
                  disabled={isDownloadingReport}
                  className="rounded-full bg-black px-6 py-4 text-xs uppercase tracking-[0.25em] text-white transition-opacity hover:opacity-85 disabled:opacity-50"
                >
                  {isDownloadingReport ? "Формирую..." : "Скачать Excel"}
                </button>
              </div>
            </div>
          </section>
        ) : null}
        {currentSection === "catalog" ? (
          isLoadingOptions ? (
            <div className="rounded-3xl border border-neutral-200 bg-neutral-50 px-6 py-8 text-sm text-neutral-600">
              Загружаю категории, размеры и гендеры...
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]"
            >
              <div className="space-y-6 rounded-[2rem] border border-neutral-200 bg-white p-6 md:p-8">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">
                      {editingProductId ? "Редактирование" : "Создание"}
                    </p>
                    <h2 className="mt-2 text-2xl font-light">
                      {editingProductId
                        ? "Редактирование товара"
                        : "Новый товар"}
                    </h2>
                  </div>
                  {editingProductId ? (
                    <button
                      type="button"
                      onClick={() => {
                        resetForm();
                        setError(null);
                        setSuccess(null);
                      }}
                      className="rounded-full border border-neutral-300 px-4 py-2 text-xs uppercase tracking-[0.2em] text-neutral-700"
                    >
                      Отменить
                    </button>
                  ) : null}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm text-neutral-600">Название</span>
                    <input
                      required
                      value={form.name}
                      onChange={(e) =>
                        handleInputChange("name", e.target.value)
                      }
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
                            setBrandMode("existing");
                            setForm((prev) => ({
                              ...prev,
                              brand: options?.brands[0] ?? "",
                            }));
                          }}
                          className={`rounded-full border px-3 py-2 text-xs uppercase tracking-[0.2em] ${brandMode === "existing" ? "border-black bg-black text-white" : "border-neutral-300 text-neutral-700"}`}
                        >
                          Из списка
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setBrandMode("new");
                            setForm((prev) => ({ ...prev, brand: "" }));
                          }}
                          className={`rounded-full border px-3 py-2 text-xs uppercase tracking-[0.2em] ${brandMode === "new" ? "border-black bg-black text-white" : "border-neutral-300 text-neutral-700"}`}
                        >
                          Новый бренд
                        </button>
                      </div>
                      {brandMode === "existing" ? (
                        <select
                          value={form.brand}
                          onChange={(e) =>
                            handleInputChange("brand", e.target.value)
                          }
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
                          onChange={(e) =>
                            handleInputChange("brand", e.target.value)
                          }
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
                      onChange={(e) =>
                        handleInputChange("material", e.target.value)
                      }
                      className="w-full rounded-2xl border border-neutral-200 px-4 py-3 outline-none focus:border-black"
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm text-neutral-600">
                      Цвет варианта
                    </span>
                    <input
                      required
                      value={form.color}
                      onChange={(e) =>
                        handleInputChange("color", e.target.value)
                      }
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
                      onChange={(e) =>
                        handleInputChange("basePrice", e.target.value)
                      }
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
                      onChange={(e) =>
                        handleInputChange("discountPercent", e.target.value)
                      }
                      className="w-full rounded-2xl border border-neutral-200 px-4 py-3 outline-none focus:border-black"
                    />
                  </label>
                </div>

                <label className="space-y-2 block">
                  <span className="text-sm text-neutral-600">Описание</span>
                  <textarea
                    rows={5}
                    value={form.description}
                    onChange={(e) =>
                      handleInputChange("description", e.target.value)
                    }
                    className="w-full rounded-3xl border border-neutral-200 px-4 py-3 outline-none focus:border-black"
                  />
                </label>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm text-neutral-600">Категория</span>
                    <select
                      required
                      value={form.categoryId}
                      onChange={(e) =>
                        handleInputChange("categoryId", e.target.value)
                      }
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
                    <span className="text-sm text-neutral-600">
                      Подкатегория
                    </span>
                    <select
                      value={form.subcategoryId}
                      onChange={(e) =>
                        handleInputChange("subcategoryId", e.target.value)
                      }
                      disabled={
                        !form.categoryId || availableSubcategories.length === 0
                      }
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
                          className={`rounded-full border px-4 py-2 text-sm transition-colors ${isActive ? "border-black bg-black text-white" : "border-neutral-300 bg-white text-neutral-700"}`}
                        >
                          {getGenderLabel(gender.name)}
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section className="rounded-[2rem] border border-neutral-200 bg-neutral-50 p-6">
                  <h2 className="text-lg font-medium">Остатки по размерам</h2>
                  <p className="mt-2 text-sm text-neutral-500">
                    {!activeCategory
                      ? "Сначала выбери категорию."
                      : activeCategory.sizeGroup === "denim"
                        ? "Для джинсов и брюк доступны размеры 24-34."
                        : activeCategory.sizeGroup === "shoes"
                          ? "Для обуви доступны размеры 35-45."
                          : "Для этой категории доступны размеры XS-XL."}
                  </p>
                  <div className="mt-4 grid gap-3">
                    {availableSizes.map((size) => (
                      <label
                        key={size.id}
                        className="flex items-center justify-between gap-4 rounded-2xl bg-white px-4 py-3"
                      >
                        <span className="text-sm">{size.name}</span>
                        <input
                          min="0"
                          type="number"
                          value={stockBySizeId[size.id] ?? ""}
                          onChange={(e) => updateStock(size.id, e.target.value)}
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
                  {editingProductId &&
                  existingImages.length > 0 &&
                  images.length === 0 ? (
                    <div className="mt-4 space-y-3">
                      <p className="text-sm text-neutral-600">
                        Текущая галерея сохранится, если не выбрать новые файлы.
                      </p>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {existingImages.map((image) => (
                          <div
                            key={image.id}
                            className={`overflow-hidden rounded-3xl border bg-white ${image.is_primary ? "border-black" : "border-neutral-200"}`}
                          >
                            <div className="aspect-[4/5] overflow-hidden bg-neutral-100">
                              <img
                                src={image.url}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            </div>
                            <div className="p-3 text-xs text-neutral-600">
                              {image.is_primary
                                ? "Основное изображение"
                                : "Дополнительное изображение"}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <label className="mt-4 block rounded-2xl border border-dashed border-neutral-300 bg-white px-4 py-6 text-sm text-neutral-600">
                    <span className="block">
                      Загрузи одно или несколько изображений
                    </span>
                    <span className="mt-1 block text-xs text-neutral-500">
                      Можно добавлять файлы в несколько заходов. При
                      редактировании новые изображения заменят текущую галерею
                      товара.
                    </span>
                    <input
                      key={imageInputKey}
                      multiple
                      type="file"
                      accept="image/*"
                      className="mt-3 block w-full text-sm"
                      onChange={(e) =>
                        appendImages(Array.from(e.target.files ?? []))
                      }
                    />
                  </label>

                  {imagePreviews.length > 0 ? (
                    <div className="mt-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-neutral-600">
                          Выбрано изображений: {imagePreviews.length}
                        </span>
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
                              className={`overflow-hidden rounded-3xl border bg-white ${isPrimary ? "border-black" : "border-neutral-200"}`}
                            >
                              <div className="aspect-[4/5] overflow-hidden bg-neutral-100">
                                <img
                                  src={preview.url}
                                  alt={preview.file.name}
                                  className="h-full w-full object-cover"
                                />
                              </div>
                              <div className="space-y-3 p-3">
                                <p className="truncate text-xs text-neutral-600">
                                  {preview.file.name}
                                </p>
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setPrimaryImageIndex(index)}
                                    className={`flex-1 rounded-full px-3 py-2 text-[11px] uppercase tracking-[0.2em] ${isPrimary ? "bg-black text-white" : "border border-neutral-300 text-neutral-700"}`}
                                  >
                                    {isPrimary
                                      ? "Основное"
                                      : "Сделать основным"}
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
                  disabled={isSubmitting || isLoadingEditor}
                  className="w-full rounded-full bg-black px-6 py-4 text-sm uppercase tracking-[0.3em] text-white transition-opacity hover:opacity-85 disabled:opacity-50"
                >
                  {isLoadingEditor
                    ? "Загружаю товар..."
                    : isSubmitting
                      ? "Сохраняю..."
                      : editingProductId
                        ? "Сохранить изменения"
                        : "Добавить товар"}
                </button>
              </div>
            </form>
          )
        ) : null}
        {currentSection === "orders" ? (
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">
                  Заказы
                </p>
                <h2 className="mt-2 text-2xl font-light">
                  Заказы пользователей
                </h2>
              </div>
              <span className="text-sm text-neutral-500">
                {isLoadingOrders
                  ? "Загрузка..."
                  : `Всего заказов: ${orders.length}`}
              </span>
            </div>

            {isLoadingOrders ? (
              <div className="rounded-3xl border border-neutral-200 bg-neutral-50 px-6 py-8 text-sm text-neutral-600">
                Загружаю заказы...
              </div>
            ) : orders.length === 0 ? (
              <div className="rounded-3xl border border-neutral-200 bg-neutral-50 px-6 py-8 text-sm text-neutral-600">
                Заказов пока нет.
              </div>
            ) : (
              <div className="space-y-4">
                {orders.map((order) => (
                  <article
                    key={order.id}
                    className="rounded-[2rem] border border-neutral-200 bg-white p-5 md:p-6"
                  >
                    <div className="grid gap-5 lg:grid-cols-[1fr_240px]">
                      <div className="space-y-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <p className="text-xs uppercase tracking-[0.25em] text-neutral-500">
                              Заказ #{order.id}
                            </p>
                            <h3 className="mt-2 text-xl font-medium">
                              {order.customer?.username ||
                                order.customer?.email ||
                                "Пользователь удалён"}
                            </h3>
                            <p className="mt-1 text-sm text-neutral-500">
                              {order.customer?.email ||
                                "Электронная почта недоступна"}{" "}
                              · {formatAdminOrderDate(order.createdAt)}
                            </p>
                          </div>
                          <div className="text-left md:text-right">
                            <p className="text-sm text-neutral-500">Сумма</p>
                            <p className="text-2xl font-medium">
                              {order.totalAmount.toLocaleString()} ₽
                            </p>
                          </div>
                        </div>

                        <div className="grid gap-3 text-sm md:grid-cols-3">
                          <div className="rounded-2xl bg-neutral-50 px-4 py-3">
                            <p className="text-xs uppercase tracking-[0.2em] text-neutral-400">
                              Статус
                            </p>
                            <p className="mt-1 font-medium">
                              {ORDER_STATUS_LABELS[order.status] ||
                                order.status}
                            </p>
                          </div>
                          <div className="rounded-2xl bg-neutral-50 px-4 py-3">
                            <p className="text-xs uppercase tracking-[0.2em] text-neutral-400">
                              Позиции
                            </p>
                            <p className="mt-1 font-medium">
                              {order.itemsCount}
                            </p>
                          </div>
                          <div className="rounded-2xl bg-neutral-50 px-4 py-3">
                            <p className="text-xs uppercase tracking-[0.2em] text-neutral-400">
                              Доставка
                            </p>
                            <p className="mt-1 line-clamp-2 font-medium">
                              {order.shippingAddress}
                            </p>
                          </div>
                        </div>

                        <div className="space-y-3">
                          {order.items.map((item) => (
                            <div
                              key={item.id}
                              className="flex gap-3 rounded-2xl border border-neutral-100 p-3"
                            >
                              <div className="h-20 w-16 shrink-0 overflow-hidden rounded-xl bg-neutral-100">
                                {item.image ? (
                                  <img
                                    src={item.image}
                                    alt={item.productName}
                                    className="h-full w-full object-cover"
                                  />
                                ) : null}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs uppercase tracking-[0.18em] text-neutral-400">
                                  {item.brand || "Без бренда"}
                                </p>
                                <p className="mt-1 truncate font-medium">
                                  {item.productName}
                                </p>
                                <p className="mt-1 text-sm text-neutral-500">
                                  Размер: {item.size} · Кол-во: {item.quantity}{" "}
                                  · {item.lineTotal.toLocaleString()} ₽
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-[1.5rem] bg-neutral-50 p-4">
                        <label className="space-y-2 block">
                          <span className="text-sm text-neutral-600">
                            Изменить статус
                          </span>
                          <select
                            value={order.status}
                            disabled={updatingOrderId === order.id}
                            onChange={(event) =>
                              handleOrderStatusChange(
                                order.id,
                                event.target.value,
                              )
                            }
                            className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 outline-none focus:border-black disabled:opacity-60"
                          >
                            {ORDER_STATUS_OPTIONS.map((statusOption) => (
                              <option
                                key={statusOption.value}
                                value={statusOption.value}
                              >
                                {statusOption.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        {updatingOrderId === order.id ? (
                          <p className="mt-3 text-xs uppercase tracking-[0.2em] text-neutral-400">
                            Сохраняю...
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}
        {currentSection === "users" ? (
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">
                  Пользователи
                </p>
                <h2 className="mt-2 text-2xl font-light">
                  Управление пользователями
                </h2>
              </div>
              <span className="text-sm text-neutral-500">
                {isLoadingUsers
                  ? "Загрузка..."
                  : `Всего пользователей: ${adminUsers.length}`}
              </span>
            </div>

            {isLoadingUsers ? (
              <div className="rounded-3xl border border-neutral-200 bg-neutral-50 px-6 py-8 text-sm text-neutral-600">
                Загружаю пользователей...
              </div>
            ) : adminUsers.length === 0 ? (
              <div className="rounded-3xl border border-neutral-200 bg-neutral-50 px-6 py-8 text-sm text-neutral-600">
                Пользователей пока нет.
              </div>
            ) : (
              <div className="overflow-hidden rounded-[2rem] border border-neutral-200 bg-white">
                <div className="grid gap-4 border-b border-neutral-100 px-5 py-3 text-xs uppercase tracking-[0.2em] text-neutral-400 md:grid-cols-[1fr_220px_220px]">
                  <span>Пользователь</span>
                  <span>Текущая роль</span>
                  <span>Изменить роль</span>
                </div>
                <div className="divide-y divide-neutral-100">
                  {adminUsers.map((adminUser) => (
                    <article
                      key={adminUser.id}
                      className="grid gap-4 px-5 py-4 md:grid-cols-[1fr_220px_220px] md:items-center"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {adminUser.username || adminUser.email}
                        </p>
                        <p className="mt-1 truncate text-sm text-neutral-500">
                          {adminUser.email || "Электронная почта не указана"}
                        </p>
                      </div>
                      <div className="text-sm text-neutral-600">
                        {USER_ROLE_LABELS[adminUser.role] || adminUser.role}
                        {adminUser.isSuperuser ? (
                          <span className="ml-2 text-xs uppercase tracking-[0.16em] text-neutral-400">
                            суперпользователь
                          </span>
                        ) : null}
                      </div>
                      <select
                        value={adminUser.role}
                        disabled={updatingUserId === adminUser.id}
                        onChange={(event) =>
                          handleUserRoleChange(adminUser.id, event.target.value)
                        }
                        className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm outline-none focus:border-black disabled:opacity-60"
                      >
                        {USER_ROLE_OPTIONS.map((roleOption) => (
                          <option
                            key={roleOption.value}
                            value={roleOption.value}
                          >
                            {roleOption.label}
                          </option>
                        ))}
                      </select>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </section>
        ) : null}
        {currentSection === "catalog" ? (
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">
                  Каталог
                </p>
                <h2 className="mt-2 text-2xl font-light">Товары в каталоге</h2>
              </div>
              <span className="text-sm text-neutral-500">
                {isLoadingCatalog
                  ? "Загрузка..."
                  : `Всего товаров: ${filteredCatalogProducts.length}`}
              </span>
            </div>
            <div className="grid gap-4 rounded-[1.5rem] border border-neutral-200 bg-white p-4 md:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_1fr_auto]">
              <label className="space-y-2 text-xs uppercase tracking-[0.2em] text-neutral-500 md:col-span-2 lg:col-span-1">
                Поиск
                <input
                  type="text"
                  value={catalogFilters.search}
                  onChange={(event) =>
                    handleCatalogFilterChange("search", event.target.value)
                  }
                  placeholder="Название или бренд"
                  className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm normal-case tracking-normal text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-black"
                />
              </label>
              <label className="space-y-2 text-xs uppercase tracking-[0.2em] text-neutral-500">
                Категория
                <select
                  value={catalogFilters.category}
                  onChange={(event) =>
                    handleCatalogFilterChange("category", event.target.value)
                  }
                  className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm normal-case tracking-normal text-neutral-900 outline-none focus:border-black"
                >
                  <option value="">Все категории</option>
                  {rootCategories.map((category) => (
                    <option
                      key={category.id}
                      value={category.slug || category.name}
                    >
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-xs uppercase tracking-[0.2em] text-neutral-500">
                Подкатегория
                <select
                  value={catalogFilters.subcategory}
                  onChange={(event) =>
                    handleCatalogFilterChange("subcategory", event.target.value)
                  }
                  className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm normal-case tracking-normal text-neutral-900 outline-none focus:border-black"
                >
                  <option value="">Все подкатегории</option>
                  {catalogFilterSubcategories.map((category) => (
                    <option
                      key={category.id}
                      value={category.slug || category.name}
                    >
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-xs uppercase tracking-[0.2em] text-neutral-500">
                Бренд
                <select
                  value={catalogFilters.brand}
                  onChange={(event) =>
                    handleCatalogFilterChange("brand", event.target.value)
                  }
                  className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm normal-case tracking-normal text-neutral-900 outline-none focus:border-black"
                >
                  <option value="">Все бренды</option>
                  {options?.brands.map((brand) => (
                    <option key={brand} value={brand}>
                      {brand}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={resetCatalogFilters}
                className="self-end rounded-full border border-neutral-300 px-4 py-3 text-xs uppercase tracking-[0.2em] text-neutral-700 transition-colors hover:border-black hover:text-black md:col-span-2 lg:col-span-1"
              >
                Сбросить
              </button>
            </div>
            {isLoadingCatalog ? (
              <div className="rounded-3xl border border-neutral-200 bg-neutral-50 px-6 py-8 text-sm text-neutral-600">
                Загружаю товары каталога...
              </div>
            ) : filteredCatalogProducts.length === 0 ? (
              <div className="rounded-3xl border border-neutral-200 bg-neutral-50 px-6 py-8 text-sm text-neutral-600">
                В каталоге пока нет товаров.
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filteredCatalogProducts.map((product) => (
                  <article
                    key={product.id}
                    className="overflow-hidden rounded-[2rem] border border-neutral-200 bg-white"
                  >
                    <div className="aspect-[4/5] overflow-hidden bg-neutral-100">
                      {product.images[0] ? (
                        <img
                          src={product.images[0]}
                          alt={product.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm text-neutral-400">
                          Без изображения
                        </div>
                      )}
                    </div>
                    <div className="space-y-4 p-5">
                      <div className="space-y-1">
                        <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                          {product.brand || "Без бренда"}
                        </p>
                        <h3 className="text-lg font-medium leading-tight">
                          {product.name}
                        </h3>
                        <p className="text-sm text-neutral-500">
                          Цена: {product.price}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleStartEditing(product.id)}
                          className="flex-1 rounded-full bg-black px-4 py-3 text-xs uppercase tracking-[0.2em] text-white"
                        >
                          Редактировать
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteProduct(product.id)}
                          disabled={deletingProductId === product.id}
                          className="rounded-full border border-red-200 px-4 py-3 text-xs uppercase tracking-[0.2em] text-red-700 disabled:opacity-50"
                        >
                          {deletingProductId === product.id
                            ? "Удаляю..."
                            : "Удалить"}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
